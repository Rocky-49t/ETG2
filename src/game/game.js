// Game session. One instance per run, used identically for solo, host and
// client. The host (or solo player) runs the authoritative simulation:
// entities, director, world state and level logic. Every peer runs its own
// local player (movement, stats, inventory, weapons) and renders the world.
//
// Message flow: request(msg) -> host.hostHandle(pid, msg) -> state changes
// broadcast via hostBroadcast/hostSend -> every peer's clientHandle(msg).
// The host is also a client of itself, so all paths are shared.
import * as THREE from 'three';
import { input } from '../core/input.js';
import { settings } from '../core/settings.js';
import { bus } from '../core/events.js';
import { RNG, hash4, clamp, damp } from '../core/rng.js';
import { worldUniforms, buildDecalAtlas, DECAL_TEXTS } from '../gfx/materials.js';
import { LightManager } from '../gfx/lights.js';
import { LevelInstance } from '../world/level.js';
import { WorldRenderer } from '../world/renderer.js';
import { TILE, CHUNK, F_DARK } from '../world/chunk.js';
import { LEVELS, FIRST_LEVEL } from '../world/levels/index.js';
import { PlayerController } from './player.js';
import { Stats } from './stats.js';
import { Inventory } from './inventory.js';
import { ITEMS, makeItem } from './items.js';
import { NOTES } from './notes.js';
import { Viewmodel } from './viewmodel.js';
import { HeldController } from './weapons.js';
import { PlayerLights } from './playerlights.js';
import { WorldObjects } from './objects.js';
import { WorldState } from './worldstate.js';
import { Effects } from './effects.js';
import { SanityFX } from './sanity.js';
import { RemotePlayer } from './remote.js';
import { initModels } from './models.js';
import { normalizeSkin } from './avatar.js';
import { EntityManager } from '../ai/manager.js';
import { EntityViews } from '../ai/views.js';
import { Director } from '../ai/director.js';
import { NOISE } from '../ai/brain.js';
import { ENTITY_TYPES } from '../ai/entities/index.js';
import { audio } from '../audio/audio.js';

const SURFACES = { carpet: 'carpet', officeCarpet: 'carpet', fabric: 'carpet', poolTile: 'tile', poolTileBlue: 'tile', grate: 'metal', rustMetal: 'metal', darkMetal: 'metal' };
const SNAP_RATE = 1 / 15, SEND_RATE = 1 / 20;

export class Game {
  constructor(opts) {
    this.engine = opts.engine;
    this.lib = opts.lib;
    this.ui = opts.ui;
    this.hud = opts.ui.hud;
    this.session = opts.session;
    this.seed = opts.seed >>> 0;
    this.difficulty = opts.difficulty || 'normal';
    this.friendlyFire = !!opts.friendlyFire;
    this.profile = opts.profile;              // {name, skin}
    this.roster = opts.roster || new Map();   // id -> {name, skin}
    this.myId = this.session.myId;
    this.isHost = this.session.isHost;
    this.online = this.session.online;
    this.time = 0;
    this.paused = false;
    this.running = true;
    this.stats0 = { kills: 0, deaths: 0, notes: 0, startTime: performance.now(), levels: 0 };

    initModels(this.lib);
    const scene = this.engine.scene;
    this.levels = new Map();
    this.world = new WorldState();
    this.renderer = new WorldRenderer(scene, this.lib);
    this.renderer.radius = settings.preset.renderRadius;
    this.lightMgr = new LightManager(scene, settings.preset.dynamicLights);
    this.objects = new WorldObjects(this);
    this.renderer.onChunkBuilt = (k, m) => this.objects.onChunkBuilt(k, m);
    this.renderer.onChunkRemoved = k => this.objects.onChunkRemoved(k);
    this.effects = new Effects(scene);
    this.effects.setViewport(this.engine.height * this.engine.renderer.getPixelRatio());
    this.player = new PlayerController(this.engine.camera);
    this.stats = new Stats();
    this.inventory = Inventory.starter();
    this.viewmodel = new Viewmodel(this.engine.camera, this.lib);
    this.viewmodel.buildArms(normalizeSkin(this.profile.skin));
    this.held = new HeldController(this);
    this.lights = new PlayerLights(this);
    this.entities = new EntityManager(this);
    this.views = new EntityViews(this);
    this.director = new Director(this);
    this.sanityFx = new SanityFX(this);
    this.remotes = new Map();
    this.pstate = new Map();          // host: id -> latest player state
    this.journal = [];
    this.noises = [];                 // host: pending noise events
    this.levelId = null;
    this.hemi = new THREE.HemisphereLight(0xffffff, 0x222222, 0.2);
    scene.add(this.hemi);
    this.hidden = false; this.hiddenIn = null;
    this.downed = false; this.dead = false; this.spectating = false; this.spectateIdx = 0;
    this.bleedout = 0;
    this.reviveT = 0; this.reviveTarget = null;
    this.checkpoint = null;
    this.flashFlickerT = 0;
    this.blackoutT = 0;
    this.snapT = 0; this.sendT = 0;
    this.pendingNoise = 0;
    this.transitioning = false;
    this.rng = new RNG(this.seed ^ 0x5eed);
    this.settingsFlashing = settings.get('flashing');
    this.boss = null;     // client-side boss HUD info
    this.flags = {};      // local per-run flags (seen tutorial etc.)

    this.world.on('obj', (l, id) => { if (l === this.levelId) this.objects.refresh(id); this.onObjState?.(l, id); });
    this.world.on('dyn+', (l, d) => { if (l === this.levelId) this.objects.addDyn(d); });
    this.world.on('dyn-', (l, id) => { if (l === this.levelId) this.objects.removeDyn(id); });

    this.stats.on('damage', (a, cause) => this.onDamaged(a, cause));
    this.stats.on('zero', cause => this.onZero(cause));
    this.inventory.on('change', () => this.hud.inventoryChanged(this));
    this.onQuality = () => {
      this.renderer.radius = this.def?.renderRadius ?? settings.preset.renderRadius;
      this.lightMgr.setCount(settings.preset.dynamicLights);
    };
    settings.on('change:quality', this.onQuality);
    this.onResize = () => this.effects.setViewport(this.engine.height * this.engine.renderer.getPixelRatio());
    window.addEventListener('resize', this.onResize);
  }

  // ------------------------------------------------------------------ levels
  getLevel(id) {
    let l = this.levels.get(id);
    if (!l) {
      l = new LevelInstance(LEVELS[id], this.seed);
      l.onGenerate = c => this.onChunkGenerated(id, l, c);
      this.levels.set(id, l);
    }
    return l;
  }

  // Apply replicated state to freshly generated chunk data (doors already
  // opened, runtime terrain changes...).
  onChunkGenerated(id, level, c) {
    for (const o of c.objects) {
      if (!o.collider) continue;
      const s = this.world.get(id, o.id);
      if (s?.open || s?.unlocked) o.collider.disabled = true;
    }
    LEVELS[id].applyRuntime?.(this, level, c);
  }
  get level() { return this.getLevel(this.levelId); }
  get def() { return LEVELS[this.levelId]; }

  // Face the longest clear sightline from a spawn point, so arrivals don't stare at a wall.
  openYaw(level, sp) {
    let best = 0, bestD = -1;
    for (let k = 0; k < 16; k++) {
      const a = k / 16 * Math.PI * 2, dx = -Math.sin(a), dz = -Math.cos(a);
      const h = level.raycast(sp.x, sp.y + 1.5, sp.z, dx, 0, dz, 30);
      const d = h ? h.dist ?? h.d ?? 30 : 30;
      if (d > bestD + 0.5) { bestD = d; best = a; }
    }
    return best;
  }

  async enterLevel(id, opts = {}) {
    if (this.transitioning) return;
    this.transitioning = true;
    const def = LEVELS[id];
    if (!def) { this.transitioning = false; return; }
    const first = !this.levelId;
    if (!first) {
      this.ui.fade(true);
      audio.play('transition', { reverb: 0.4 });
      await sleep(700);
    }
    if (this.hidden) this.leaveHiding(true);
    this.boss = null;
    this.levelId = id;
    const level = this.getLevel(id);
    this.ui.loading(true, `${def.name.toUpperCase()} — ${def.title}`, 'Generating…');
    await this.lib.warm(def.materials, (p, n) => this.ui.loadingProgress(p * 0.8, 'Painting ' + n + '…'));
    this.applyLevelVisuals(def);
    this.renderer.setLevel(level);
    this.objects.clear();
    this.views.clear();
    this.effects.clearTransient();
    const sp = opts.spawn || level.spawnPoint();
    this.player.teleport(sp.x, sp.y, sp.z, opts.yaw ?? sp.yaw ?? this.openYaw(level, sp));
    this.player.pitch = 0;
    this.renderer.buildAll(sp.x, sp.z);
    this.ui.loadingProgress(1, 'Ready');
    const lights = this.renderer.collectLights();
    this.lightMgr.setSources(lights.lights, lights.fixtures);
    this.checkpoint = { levelId: id, x: sp.x, y: sp.y, z: sp.z };
    if (!this.online || this.isHost) { /* nothing */ }
    this.request({ t: 'lvl', l: id });
    audio.setAmbience(def.ambience);
    this.ui.loading(false);
    this.ui.fade(false);
    this.ui.titleCard(def.name, def.title, def.subtitle);
    this.hud.setObjective(def, this);
    if (!first) this.stats0.levels++;
    this.transitioning = false;
    this.levelEnterTime = this.time;
    def.onEnter?.(this);
    if (first && id === 'L0') this.scheduleTutorial();
  }

  // A few gentle, timed hints for first-time players (no tutorial level).
  scheduleTutorial() {
    const hints = [
      [4, 'Click to look around · WASD to move · Shift to sprint'],
      [11, 'F toggles your flashlight. Batteries don\'t last forever.'],
      [19, 'C to crouch. Crouching is silent — something here hunts by sound.'],
      [28, 'E to interact · Tab for inventory · J for your journal'],
      [40, 'Painted arrows on the walls point the way out.'],
    ];
    this.tutorial = hints.map(([t, text]) => ({ t: this.time + t, text }));
  }

  applyLevelVisuals(def) {
    const scene = this.engine.scene;
    if (this.sceneDef && this.sceneDef !== def) this.sceneDef.teardownScene?.(this);
    this.sceneDef = def;
    this.renderer.radius = def.renderRadius ?? settings.preset.renderRadius;
    const decals = this.lib.baked.get('decals');
    if (decals) { decals.map?.dispose(); decals.map = buildDecalAtlas(def.decalTexts || DECAL_TEXTS); }
    scene.fog = new THREE.FogExp2(def.fog.color, def.fog.density);
    scene.background = new THREE.Color(def.background ?? def.fog.color);
    this.hemi.color.set(def.hemi?.sky ?? 0x888888);
    this.hemi.groundColor.set(def.hemi?.ground ?? 0x222222);
    this.hemi.intensity = def.hemi?.intensity ?? 0.2;
    this.engine.renderer.toneMappingExposure = def.exposure ?? 1;
    this.engine.post.setGrade(def.grade || {});
    this.effects.setDustColor(def.dust?.color ?? 0xfff4d6, def.dust?.opacity ?? 0.35);
    this.lightMgr.levelGain = def.dynGain ?? 1;
    this.engine.camera.far = def.far ?? 120;
    this.engine.camera.updateProjectionMatrix();
    def.setupScene?.(this);
  }

  // ------------------------------------------------------------------ main loop
  update(dt) {
    if (!this.running) return;
    if (this.paused) { this.hud.update(this, dt); input.endFrame(); return; }
    this.time += dt;
    worldUniforms.time.value = this.time;
    const level = this.levelId ? this.level : null;
    if (!level || this.transitioning) { this.hud.update(this, dt); input.endFrame(); return; }

    this.updateLocal(dt, level);
    if (this.isHost) this.hostUpdate(dt);

    // world + visuals
    const cam = this.engine.camera;
    this.renderer.update(cam.position.x, cam.position.z);
    if (this.renderer.dirty) { const s = this.renderer.collectLights(); this.lightMgr.setSources(s.lights, s.fixtures); }
    this.lightMgr.gameTime = this.time;
    this.lightMgr.update(dt, cam, level);
    this.objects.update(dt);
    this.objects.glints(dt);
    if (this.isHost) this.views.apply(this.entities.snapshot(this.levelId), this.time);
    this.views.update(dt, this.time, this.isHost);
    for (const r of this.remotes.values()) r.update(dt, this.time);
    this.updateRemoteLights();
    this.effects.update(dt, cam.position);
    this.viewmodel.update(dt, this.player, {
      ads: this.held.ads, flashlightOn: this.lights.on, focus: this.lights.focus ? 1 : 0, flashFlicker: this.lights.flicker,
      lighterLit: this.held.lighterLit, hidden: this.hidden || this.dead || this.spectating || this.downed,
    });
    this.lights.update(dt, this.held);
    audio.updateListener(cam);
    audio.ambience?.update(dt, { sewer: this.player.pos.y < -1.5 });
    this.updateBuzz(dt);
    this.sanityFx.update(dt);
    this.updatePost(dt);
    this.def.clientUpdate?.(this, dt);
    this.hud.update(this, dt);
    this.netSend(dt);
    input.endFrame();
  }

  canAct() {
    return !this.ui.modalOpen && input.locked && !this.hidden && !this.dead && !this.downed && !this.spectating && !this.transitioning;
  }

  updateLocal(dt, level) {
    const P = this.player;
    if (this.dead || this.spectating) {
      this.updateSpectate(dt);
      return;
    }
    P.frozen = this.ui.modalOpen || this.hidden;
    P.frozenLook = this.ui.modalOpen;
    P.downed = this.downed;
    P.staminaOk = !this.stats.exhausted && this.stats.stamina > 0;
    P.update(dt, level, { canJump: () => this.stats.stamina > 8, onJump: () => { this.stats.stamina -= 6; this.stats.sinceSprint = 0; } });
    if (this.hidden) this.placeInLocker();

    // events -> sound + AI noise
    for (const ev of P.events) {
      const surf = this.surfaceAt(P.pos);
      if (ev.type === 'step') {
        this.sfx('step', null, { surface: ev.wet ? 'water' : surf, volume: ev.crouch ? 0.22 : ev.sprint ? 0.85 : 0.5, reverb: 0.3 });
        this.emitNoise(ev.crouch ? NOISE.crouch : ev.sprint ? NOISE.sprint : NOISE.walk);
      } else if (ev.type === 'land') {
        this.sfx('land', null, { volume: Math.min(1, ev.impact / 9) });
        this.emitNoise(NOISE.land);
        if (ev.impact > 9.5) this.stats.damage((ev.impact - 9.5) * 9, 'fall');
        P.shake = Math.min(1, P.shake + ev.impact / 14);
      } else if (ev.type === 'splash') {
        this.sfx('splash', P.pos, { volume: ev.strength });
        this.effects.burst('splash', { x: P.pos.x, y: level.waterAt(P.pos.x, P.pos.z), z: P.pos.z });
        this.emitNoise(NOISE.splash);
        this.netFx('splash', { x: P.pos.x, y: level.waterAt(P.pos.x, P.pos.z), z: P.pos.z });
      } else if (ev.type === 'swim') {
        this.sfx('swim', null, { volume: 0.5 });
        this.emitNoise(NOISE.swim);
      } else if (ev.type === 'jump') this.emitNoise(NOISE.jump);
    }

    // survival
    const flags = level.flagsAt(P.pos.x, P.pos.z);
    const ambient = this.ambientLightAt(P.pos);
    const lit = this.lights.on || this.held.lighterLit || ambient > 0.3;
    let threat = 0;
    for (const v of this.views.views.values()) {
      if (v.st.s === 'dead') continue;
      const d = Math.hypot(v.st.x - P.pos.x, v.st.z - P.pos.z);
      if (d < 14 && this.level.lineOfSight(this.engine.camera.position.x, this.engine.camera.position.y, this.engine.camera.position.z, v.st.x, v.st.y + 1.2, v.st.z)) threat = Math.max(threat, 1 - d / 14);
    }
    let teammates = false;
    for (const r of this.remotes.values()) if (r.levelId === this.levelId && Math.hypot(r.st.x - P.pos.x, r.st.z - P.pos.z) < 8) teammates = true;
    this.stats.update(dt, {
      sprinting: P.sprinting, swimming: P.swimming, swimFast: P.swimming && input.isDown('ShiftLeft'), underwater: P.underwater,
      darkness: lit ? 0 : (flags & F_DARK || ambient < 0.08 ? 1 : 0.35), nearbyThreat: threat, inBrightLight: ambient > 0.55, teammatesNear: teammates,
      sanityDrain: this.def.sanityDrain || 0,
    });
    this.threat = threat;
    audio.setUnderwater(P.underwater);
    if (P.underwater && Math.random() < dt * 0.7) this.sfx('bubbles', null, { volume: 0.5 });

    // downed: bleed out
    if (this.downed) {
      this.bleedout -= dt;
      if (this.bleedout <= 0) this.die('bled out');
    }

    // input
    if (!this.ui.modalOpen) {
      if (input.pressed('KeyF') && !this.dead && !this.downed) this.lights.toggle();
      for (let i = 0; i < 6; i++) if (input.pressed('Digit' + (i + 1))) this.inventory.select(i);
      if (input.wheel) this.inventory.select(this.inventory.selected + input.wheel);
      if (input.pressed('KeyG') && this.canAct()) this.dropSelected();
    }
    this.held.update(dt);
    this.updateInteraction(dt);
    if (this.tutorial?.length && this.time >= this.tutorial[0].t && !this.ui.modalOpen) this.subtitle(this.tutorial.shift().text, 5);
    this.def.localUpdate?.(this, dt, level);
    this.checkExits(level);
    // void fall
    if (P.pos.y < (this.def.killY ?? -60)) this.fellIntoVoid();
  }

  // ------------------------------------------------------------------ interaction
  updateInteraction(dt) {
    const cam = this.engine.camera;
    let tgt = null;
    let label = null, sub = null;
    // revive downed teammates
    let reviveCand = null;
    if (!this.downed && !this.dead && !this.hidden) {
      for (const r of this.remotes.values()) {
        if (r.levelId !== this.levelId || !r.st.downed || r.st.dead) continue;
        if (Math.hypot(r.st.x - this.player.pos.x, r.st.z - this.player.pos.z) < 1.8) reviveCand = r;
      }
    }
    if (reviveCand) {
      label = `Hold <kbd>E</kbd> to revive ${reviveCand.name}`;
      if (input.isDown('KeyE') && this.canAct()) {
        this.reviveT += dt;
        this.hud.progress(this.reviveT / 3.5, 'Reviving ' + reviveCand.name);
        if (this.reviveT >= 3.5) {
          this.reviveT = 0;
          this.hud.progress(-1);
          this.request({ t: 'revive', target: reviveCand.id });
          this.sfx('revive', null, {});
        }
      } else if (this.reviveT > 0) { this.reviveT = 0; this.hud.progress(-1); }
    } else {
      if (this.reviveT > 0) { this.reviveT = 0; this.hud.progress(-1); }
      if (this.hidden) {
        label = '<kbd>E</kbd> Leave hiding spot';
        if (input.pressed('KeyE') && !this.ui.modalOpen) this.leaveHiding();
      } else if (!this.dead && !this.ui.modalOpen) {
        tgt = this.objects.target(cam);
        if (tgt) {
          label = `<kbd>E</kbd> ${tgt.label}`;
          if (input.pressed('KeyE') && this.canAct() && !this.downed) this.interact(tgt);
        }
      }
    }
    this.interactTarget = tgt;
    this.hud.prompt(label, sub);
  }

  interact(tgt) {
    const o = tgt.o, s = tgt.state;
    const l = this.levelId;
    switch (o.kind) {
      case 'pickup':
      case 'drop':
        if (!this.inventory.canFit(o.item, o.qty || 1)) { this.subtitle('Your pockets are full.', 1.5); return; }
        this.request({ t: 'int', l, id: o.id, a: 'take' });
        break;
      case 'container':
        this.request({ t: 'int', l, id: o.id, a: 'open' });
        this.sfx('rummage', o, { volume: 0.8 });
        this.emitNoise(3);
        this.ui.openContainer(o, this);
        break;
      case 'locker':
        if (s?.occ && s.occ !== this.myId) { this.subtitle('Someone is already in there.', 1.2); return; }
        this.request({ t: 'int', l, id: o.id, a: 'enter' });
        this.enterHiding(o);
        break;
      case 'note':
        this.readNote(o.noteId);
        break;
      case 'door':
        if (o.locked && !s?.unlocked) {
          if (this.inventory.has(o.key)) { this.request({ t: 'int', l, id: o.id, a: 'unlock' }); this.sfx('unlock', o, {}); }
          else this.sfx('doorLocked', o, {});
          return;
        }
        this.request({ t: 'int', l, id: o.id, a: 'toggle' });
        break;
      default:
        // level-specific kinds
        this.def.interact?.(this, o, s, tgt);
    }
  }

  readNote(id) {
    const n = NOTES[id];
    if (!n) return;
    if (!this.journal.includes(id)) { this.journal.push(id); this.stats0.notes++; this.stats.scare(-3); }
    this.sfx('paper', null, {});
    this.ui.showNote(n);
  }

  enterHiding(o) {
    this.hidden = true;
    this.hiddenIn = o.id;
    this.hideObj = o;
    this.lights.on && this.lights.toggle(false);
    this.sfx('locker', o, {});
    this.emitNoise(NOISE.locker);
    this.ui.hideOverlay(true);
    audio.setMuffle(0.55);
    this.player.yaw = (o.ry || 0) + Math.PI;
    this.player.pitch = 0;
  }

  placeInLocker() {
    const o = this.hideObj;
    if (!o) return;
    const fx = Math.sin(o.ry || 0), fz = Math.cos(o.ry || 0);
    this.player.pos.set(o.x - fx * 0.05, o.y, o.z - fz * 0.05);
    this.player.vel.set(0, 0, 0);
    // limited look while hidden
    const base = (o.ry || 0) + Math.PI;
    let d = this.player.yaw - base;
    while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2;
    this.player.yaw = base + clamp(d, -0.5, 0.5);
    this.player.pitch = clamp(this.player.pitch, -0.35, 0.35);
    this.player.updateCamera(0, this.level);
  }

  leaveHiding(force = false, pulled = false) {
    if (!this.hidden) return;
    const o = this.hideObj;
    this.hidden = false;
    this.hiddenIn = null;
    this.ui.hideOverlay(false);
    audio.setMuffle(0);
    if (o) {
      const fx = Math.sin(o.ry || 0), fz = Math.cos(o.ry || 0);
      this.player.pos.set(o.x + fx * 0.75, o.y, o.z + fz * 0.75);
      this.request({ t: 'int', l: this.levelId, id: o.id, a: 'exit' });
      if (!force) this.sfx('locker', o, {});
    }
    this.hideObj = null;
    if (pulled) { this.player.shake = 1; this.subtitle('It drags you out!', 2, 'scare'); }
  }

  dropSelected() {
    const idx = this.inventory.selected;
    const it = this.inventory.slots[idx];
    if (!it) return;
    const qty = input.isDown('ShiftLeft') ? it.qty : 1;
    this.dropItem(this.inventory.takeFrom(idx, qty));
  }

  dropItem(item) {
    if (!item) return;
    const P = this.player;
    const fx = -Math.sin(P.yaw), fz = -Math.cos(P.yaw);
    let x = P.pos.x + fx * 0.7, z = P.pos.z + fz * 0.7;
    if (this.level.isSolidW(x, z)) { x = P.pos.x; z = P.pos.z; }
    let y = this.level.groundAt({ x, y: P.pos.y + 0.5, z, r: 0.1, step: 1 });
    if (!isFinite(y)) y = P.pos.y;
    this.request({ t: 'drop', l: this.levelId, item, x, y: y + 0.02, z });
    this.sfx('thud', { x, y, z }, { volume: 0.4 });
  }

  // ------------------------------------------------------------------ exits
  checkExits(level) {
    const P = this.player;
    const cx = Math.floor(P.pos.x / CHUNK), cz = Math.floor(P.pos.z / CHUNK);
    const c = level.chunk(cx, cz);
    for (const o of c.objects) {
      if (o.kind !== 'exit') continue;
      if (Math.hypot(o.x - P.pos.x, o.z - P.pos.z) < o.r && P.pos.y < o.y) {
        if (o.requires && !this.world.flag(this.levelId, o.requires)) continue;
        this.useExit(o.to);
        return;
      }
    }
  }

  useExit(to) {
    if (this.transitioning) return;
    this.sfx('fallWhoosh', null, {});
    if (to === 'victory') { this.request({ t: 'victory' }); return; }
    this.request({ t: 'exitUsed', from: this.levelId, to });
    this.enterLevel(to);
  }

  fellIntoVoid() {
    if (this.transitioning || this.voidFalling) return;
    this.voidFalling = true;
    this.ui.fade(true);
    this.sfx('fallWhoosh', null, {});
    setTimeout(() => {
      const cp = this.checkpoint;
      this.player.teleport(cp.x, cp.y + 0.1, cp.z);
      this.stats.damage(25, 'void', true);
      this.stats.scare(20);
      this.subtitle('You fall for a long time. Then you are standing where you were before. Almost.', 3.5);
      this.ui.fade(false);
      this.voidFalling = false;
    }, 1400);
  }

  // ------------------------------------------------------------------ damage / death
  onDamaged(amount, cause) {
    this.hud.damageFlash(Math.min(1, amount / 30));
    this.player.shake = Math.min(1, this.player.shake + amount / 40);
    if (amount > 6) this.sfx('hurt', null, { volume: 0.8 });
  }

  // host -> this client: an entity (or hazard) hurt us
  hurtLocal(m) {
    if (this.dead) return;
    if (this.hidden && m.pull) this.leaveHiding(true, true);
    if (this.downed) {
      // finishing blows while downed
      this.bleedout -= m.a * 0.3;
      return;
    }
    this.stats.damage(m.a, m.type || 'hit');
    if (m.scare) this.stats.scare(m.scare);
    if (m.bleed && Math.random() < m.bleed) { this.stats.bleeding = Math.max(this.stats.bleeding, 1.2); this.subtitle('You\'re bleeding. Use a bandage.', 2, 'warn'); }
    if (m.fx !== undefined) {
      const ang = Math.atan2(m.fx - this.player.pos.x, m.fz - this.player.pos.z) - (this.player.yaw + Math.PI);
      this.hud.damageDir(ang);
    }
    if (m.push) { this.player.vel.x += m.push.x; this.player.vel.z += m.push.z; this.player.vel.y += m.push.y || 0; }
  }

  onZero(cause) {
    if (this.dead || this.downed) return;
    const teammatesAlive = [...this.remotes.values()].some(r => !r.st.dead && !r.st.downed);
    if (this.online && teammatesAlive) {
      this.downed = true;
      this.bleedout = 45;
      this.stats.health = 1;
      this.lights.on = false;
      this.sfx('downed', null, {});
      this.subtitle('You\'re down. Crawl to safety — a teammate can revive you.', 4, 'warn');
      if (this.hidden) this.leaveHiding(true);
      return;
    }
    this.die(cause);
  }

  die(cause) {
    if (this.dead) return;
    this.dead = true;
    this.downed = false;
    this.stats.dead = true;
    this.stats0.deaths++;
    if (this.hidden) this.leaveHiding(true);
    this.lights.on = false;
    this.sfx('stinger', null, { intensity: 1.3 });
    const solo = !this.online || ![...this.remotes.values()].some(r => !r.st.dead);
    this.ui.showDeath(cause, solo, this);
  }

  respawn(atLevel) {
    this.dead = false; this.downed = false; this.spectating = false;
    this.stats.reset(true);
    this.ui.hideDeath();
    if (atLevel && atLevel !== this.levelId) { this.enterLevel(atLevel); return; }
    const cp = this.checkpoint;
    this.player.teleport(cp.x, cp.y + 0.05, cp.z);
    this.subtitle('You wake up, gasping, somewhere you have been before.', 3);
  }

  startSpectate() {
    this.spectating = true;
    this.ui.hideDeath();
    this.ui.spectate(true);
  }

  updateSpectate(dt) {
    if (!this.spectating) return;
    const list = [...this.remotes.values()].filter(r => r.levelId === this.levelId && !r.st.dead);
    if (!list.length) { this.ui.spectateName('—'); return; }
    if (input.pressed('Mouse0')) this.spectateIdx++;
    const r = list[this.spectateIdx % list.length];
    this.ui.spectateName(r.name);
    const cam = this.engine.camera;
    const yaw = r.st.yaw;
    const tx = r.st.x + Math.sin(yaw) * 2.6, tz = r.st.z + Math.cos(yaw) * 2.6;
    cam.position.x = damp(cam.position.x, tx, 6, dt);
    cam.position.z = damp(cam.position.z, tz, 6, dt);
    cam.position.y = damp(cam.position.y, r.st.y + 2.0, 6, dt);
    cam.lookAt(r.st.x, r.st.y + 1.4, r.st.z);
    this.player.pos.set(r.st.x, r.st.y, r.st.z);
  }

  // ------------------------------------------------------------------ helpers
  surfaceAt(p) {
    const lvl = this.level;
    if (!lvl) return 'concrete';
    const w = lvl.waterAt(p.x, p.z);
    if (w > p.y + 0.05) return 'water';
    const tx = Math.floor(p.x / TILE), tz = Math.floor(p.z / TILE);
    const [c, i] = lvl.tile(tx, tz);
    const mat = lvl.def.palette.floor[c.fmat[i]]?.mat;
    return SURFACES[mat] || lvl.def.surface || 'concrete';
  }

  // How lit a point is (0..1): nearby working fixtures with line of sight,
  // thrown light sources, scaled down during blackouts. Cached briefly.
  ambientLightAt(p) {
    const now = this.time;
    if (this._amb && now - this._amb.t < 0.25 && Math.abs(this._amb.x - p.x) + Math.abs(this._amb.z - p.z) < 1) return this._amb.v;
    const lvl = this.level;
    let sum = 0;
    const cx = Math.floor(p.x / CHUNK), cz = Math.floor(p.z / CHUNK);
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      const ch = lvl.chunks.get((cx + dx) + ',' + (cz + dz));
      if (!ch) continue;
      for (const l of ch.lights) {
        const d2 = (l.x - p.x) ** 2 + (l.z - p.z) ** 2;
        const R = l.range || 8;
        if (d2 > R * R) continue;
        const fv = l.broken ? (l._fv ?? 0) : l.flicker ? (l._fv ?? 0.8) : 1;
        if (fv <= 0.05) continue;
        if (d2 > 4 && !lvl.tileLOS(p.x, p.z, l.x, l.z)) continue;
        sum += l.intensity * fv * (1 - d2 / (R * R)) / (1 + d2 * 0.12);
      }
    }
    for (const t of this.objects.thrown) if (t.light) { const d2 = t.pos.distanceToSquared(p); if (d2 < 40) sum += t.light.intensity / (1 + d2); }
    sum *= 1 - this.lightMgr.blackout * 0.9;
    const v = Math.min(1, sum * 0.12 + (this.def.ambientLit ?? 0));
    this._amb = { t: now, x: p.x, z: p.z, v };
    return v;
  }

  sfx(name, pos, opts = {}) {
    if (!audio.ready) return null;
    const o = { ...opts };
    if (pos) {
      o.pos = { x: pos.x, y: pos.y ?? this.engine.camera.position.y, z: pos.z };
      const cam = this.engine.camera.position;
      if (this.level && Math.hypot(o.pos.x - cam.x, o.pos.z - cam.z) > 3 && !this.level.tileLOS(cam.x, cam.z, o.pos.x, o.pos.z)) o.occluded = true;
    }
    return audio.play(name, o);
  }
  loopSfx(name, pos, opts = {}) { return audio.loop(name, { pos, ...opts }); }

  subtitle(text, dur = 2.5, cls = '') { this.hud.subtitle(text, dur, cls); }

  skinOf(pid) {
    if (!pid || pid === this.myId) return this.profile.skin;
    return this.roster.get(pid)?.skin || this.remotes.get(pid)?.skin || this.profile.skin;
  }

  hostTime() { return this.isHost ? this.time : (this.time + (this.hostTimeOffset || 0)); }

  emitNoise(r, pos) {
    if (!r) return;
    const p = pos || this.player.pos;
    if (this.isHost) this.noises.push({ x: p.x, y: p.y, z: p.z, r, l: this.levelId, pid: this.myId });
    else this.pendingNoise = Math.max(this.pendingNoise, r);
  }

  // Combined world + entity ray test for weapons.
  shootRay(o, d, maxD, opts = {}) {
    const wh = this.level.raycast(o.x, o.y, o.z, d.x, d.y, d.z, maxD);
    const wd = wh ? wh.dist : maxD;
    const eh = this.views.hitTest(o, d, wd + (opts.meleePad || 0));
    if (eh && eh.dist <= wd + (opts.meleePad || 0)) return { dist: eh.dist, point: eh.point, entity: eh };
    if (wh) {
      // impact visuals for bullets
      if (!opts.meleePad) {
        const p = new THREE.Vector3(wh.x, wh.y, wh.z);
        this.effects.burst('impact', p, { x: wh.nx, y: wh.ny, z: wh.nz }, 0.7);
        if (wh.what !== 'prop' || true) this.effects.bulletHole(p, { x: wh.nx, y: wh.ny, z: wh.nz });
        if (Math.random() < 0.3) this.sfx('ricochet', p, { volume: 0.5 });
        else this.sfx('hitWall', p, { volume: 0.4 });
      }
      return { dist: wh.dist, point: new THREE.Vector3(wh.x, wh.y, wh.z), normal: { x: wh.nx, y: wh.ny, z: wh.nz } };
    }
    return { dist: maxD, point: new THREE.Vector3(o.x + d.x * maxD, o.y + d.y * maxD, o.z + d.z * maxD) };
  }

  requestHit(eid, dmg, dtype, part, point) {
    const v = this.views.views.get(eid);
    const blood = v?.def.blood || 'blood';
    this.effects.burst(blood, point, { x: 0, y: 0.5, z: 0 }, 0.8);
    this.sfx(blood === 'bone' ? 'hitBone' : 'hitFlesh', point, { volume: 0.7 });
    this.request({ t: 'hit', e: eid, d: dmg, dt: dtype, pt: part });
  }

  throwItem(type, pos, vel) {
    this.request({ t: 'throw', l: this.levelId, type, x: pos.x, y: pos.y, z: pos.z, vx: vel.x, vy: vel.y, vz: vel.z });
    this.emitNoise(NOISE.throw);
  }

  netFx(k, data) {
    if (!this.online) return;
    this.request({ t: 'fx', k, l: this.levelId, ...data });
  }

  // ------------------------------------------------------------------ visuals
  updatePost(dt) {
    const u = this.engine.post.u;
    u.underwater.value = damp(u.underwater.value, this.player.underwater ? 1 : 0, 6, dt);
    u.downed.value = damp(u.downed.value, this.downed ? 1 : 0, 3, dt);
    u.damage.value = Math.max(0, u.damage.value - dt * 1.6);
    if (this.stats.health < 25 && !this.dead) u.damage.value = Math.max(u.damage.value, (25 - this.stats.health) / 60 * (0.6 + 0.4 * Math.sin(this.time * 4)));
    u.flash.value = Math.max(0, u.flash.value - dt * 3);
    // blackout fades
    if (this.blackoutT > 0) { this.blackoutT -= dt; this.lightMgr.blackout = damp(this.lightMgr.blackout, 1, 6, dt); }
    else this.lightMgr.blackout = damp(this.lightMgr.blackout, 0, 1.2, dt);
    if (this.flashFlickerT > 0) this.flashFlickerT -= dt;
    audio.setTension(Math.max(this.threat || 0, this.boss ? 0.7 : 0, this.sanityFx.level * 0.4), dt);
    const water = this.engine.scene.fog;
    if (water && this.def.fog) {
      const target = this.player.underwater ? (this.def.waterFog || 0.14) : this.def.fog.density * (1 + this.lightMgr.blackout * 0.6);
      water.density = damp(water.density, target, 4, dt);
      if (this.player.underwater) water.color.set(this.def.waterFogColor || 0x0d3a40);
      else water.color.set(this.def.fog.color);
    }
  }

  updateBuzz(dt) {
    const nf = this.lightMgr.nearestFlicker(this.engine.camera.position, 9);
    if (nf && nf.value > 0.1) {
      if (!this.buzz) this.buzz = audio.loop('lightBuzz', { pos: nf.light, volume: 1, ref: 2 });
      if (this.buzz) { this.buzz.setPos(nf.light); this.buzz.set('level', nf.value * (1 - nf.dist / 9)); }
    } else if (this.buzz) { this.buzz.set('level', 0); }
  }

  updateRemoteLights() {
    // remote flashlights only use fake volumetric beams (cheap)
  }

  // ------------------------------------------------------------------ host simulation
  playerTargets() {
    const out = [];
    const P = this.player;
    const cam = this.engine.camera;
    if (this.levelId && !this.transitioning) {
      const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion);
      out.push({
        id: this.myId, levelId: this.levelId, x: P.pos.x, y: P.pos.y, z: P.pos.z, crouch: P.crouching, sprint: P.sprinting,
        hidden: this.hidden, downed: this.downed, dead: this.dead || this.spectating || this.downed, light: this.lights.on, focus: this.lights.focus,
        dir: { x: dir.x, y: dir.y, z: dir.z }, lighter: this.held.lighterLit, sanity: this.stats.sanity, swim: P.swimming,
        inWater: this.level.waterAt(P.pos.x, P.pos.z) > P.pos.y + 0.4, ambientLight: this.ambientLightAt(P.pos),
      });
    }
    for (const [id, s] of this.pstate) {
      if (id === this.myId || !s.lvl) continue;
      const cp = Math.cos(s.pt), dir = { x: -Math.sin(s.yw) * cp, y: Math.sin(s.pt), z: -Math.cos(s.yw) * cp };
      out.push({
        id, levelId: s.lvl, x: s.x, y: s.y, z: s.z, crouch: s.cr, sprint: s.sp, hidden: s.hd, downed: s.dn, dead: s.dd || s.dn,
        light: s.fl, focus: s.fo, dir, lighter: s.lt, sanity: s.sn, swim: s.sw, inWater: s.iw, ambientLight: 0.3,
      });
    }
    return out;
  }
  playerTargetById(id) { return this.playerTargets().find(p => p.id === id); }

  hostUpdate(dt) {
    const targets = this.playerTargets();
    const perLevel = new Map();
    for (const p of targets) {
      let ctx = perLevel.get(p.levelId);
      if (!ctx) {
        ctx = {
          level: this.getLevel(p.levelId), levelId: p.levelId, players: [], noises: [], time: this.entities.time, rng: Math.random,
          difficulty: this.difficulty, hurt: (pid, a, o = {}) => this.hostHurt(pid, a, o), remove: id => this.entities.remove(id),
          game: this,
        };
        perLevel.set(p.levelId, ctx);
      }
      ctx.players.push(p);
    }
    for (const n of this.noises) perLevel.get(n.l)?.noises.push(n);
    // thrown decoys keep making noise; flares burn
    this.hostThrown(dt, perLevel);
    // keep host collision data loaded around remote players (cheap: chunk() is cached)
    for (const p of targets) if (p.levelId !== this.levelId) this.getLevel(p.levelId).chunk(Math.floor(p.x / CHUNK), Math.floor(p.z / CHUNK));
    this.entities.update(dt, perLevel);
    this.director.update(dt, perLevel);
    for (const [lid, ctx] of perLevel) LEVELS[lid].hostUpdate?.(this, ctx, dt);
    this.noises.length = 0;
    this.lastPerLevel = perLevel;

    // snapshots to clients
    this.snapT -= dt;
    if (this.snapT <= 0 && this.online) {
      this.snapT = SNAP_RATE;
      const players = this.playerStatesForSnap();
      const byLevel = new Map();
      for (const [id] of this.session.peers) {
        const s = this.pstate.get(id);
        const lvl = s?.lvl;
        if (!byLevel.has(lvl)) byLevel.set(lvl, lvl ? this.entities.snapshot(lvl) : []);
        this.session.sendTo(id, { t: 'snap', ht: this.time, l: lvl, e: byLevel.get(lvl), p: players, b: lvl ? LEVELS[lvl].bossSnap?.(this, lvl) : undefined });
      }
    }
  }

  hostThrown(dt, perLevel) {
    for (const [l, m] of this.world.dyn) {
      for (const d of m.values()) {
        if (d.kind !== 'thrown') continue;
        const age = this.time - d.t0;
        if (age > (d.life || 60)) { this.world.removeDyn(l, d.id); this.hostBroadcast({ t: 'dyn-', l, id: d.id }, true); continue; }
        // host follows the same physics as clients via objects (approximate by stored rest pos)
        const sim = this.objects.thrown.find(t => t.d.id === d.id);
        const pos = sim ? sim.pos : { x: d.x, y: d.y, z: d.z };
        d.px = pos.x; d.py = pos.y; d.pz = pos.z;
        if (d.type === 'decoy') {
          d.noiseT = (d.noiseT || 0) - dt;
          if (d.noiseT <= 0) { d.noiseT = 0.8; perLevel.get(l)?.noises.push({ x: pos.x, y: pos.y, z: pos.z, r: NOISE.decoy, l, decoy: true }); }
        }
      }
    }
  }

  // Fire zones from burning flares (used by hounds etc.)
  fireZones(levelId) {
    const out = [];
    for (const d of this.world.dynList(levelId)) {
      if (d.kind === 'thrown' && d.type === 'flare' && this.time - d.t0 < (d.life || 45) - 2) out.push({ x: d.px ?? d.x, z: d.pz ?? d.z, r: 4.5 });
    }
    return out;
  }
  lightZones(levelId) {
    const out = [];
    for (const d of this.world.dynList(levelId)) {
      if (d.kind === 'thrown' && (d.type === 'flare' || d.type === 'glowstick') && this.time - d.t0 < (d.life || 60)) out.push({ x: d.px ?? d.x, y: d.py ?? d.y, z: d.pz ?? d.z, r: d.type === 'flare' ? 6 : 3.5, type: d.type });
    }
    return out;
  }

  hostHurt(pid, amount, o = {}) {
    const k = this.difficulty === 'easy' ? 0.7 : this.difficulty === 'hard' ? 1.25 : 1;
    const msg = { t: 'dmg', a: amount * k, scare: o.scare, bleed: o.bleed, type: o.type, pull: o.pull, push: o.push };
    if (o.from) { msg.fx = o.from.x; msg.fz = o.from.z; }
    this.hostSend(pid, msg);
  }

  hostEvent(levelId, evt) { this.hostBroadcast({ t: 'evt', l: levelId, ...evt }); }

  playerStatesForSnap() {
    const out = [];
    for (const [id, s] of this.pstate) out.push({ id, ...s });
    // include host itself
    if (!this.pstate.has(this.myId)) out.push({ id: this.myId, ...this.localState() });
    return out;
  }

  // ------------------------------------------------------------------ networking
  localState() {
    const P = this.player;
    const it = this.inventory.held;
    return {
      x: +P.pos.x.toFixed(2), y: +P.pos.y.toFixed(2), z: +P.pos.z.toFixed(2), yw: +P.yaw.toFixed(3), pt: +P.pitch.toFixed(3),
      lvl: this.levelId, cr: P.crouching, sp: P.sprinting, sw: P.swimming, dn: this.downed, dd: this.dead || this.spectating, hd: this.hidden,
      hi: it ? it.id : null, fl: this.lights.on, fo: this.lights.focus, lt: this.held.lighterLit, hp: Math.round(this.stats.health),
      sn: Math.round(this.stats.sanity), iw: this.level ? this.level.waterAt(P.pos.x, P.pos.z) > P.pos.y + 0.4 : false,
    };
  }

  netSend(dt) {
    if (!this.online) return;
    this.sendT -= dt;
    if (this.sendT > 0) return;
    this.sendT = SEND_RATE;
    const st = this.localState();
    if (this.isHost) {
      this.pstate.set(this.myId, st);
    } else {
      this.session.sendToHost({ t: 'p', ...st });
      if (this.pendingNoise > 0) {
        this.session.sendToHost({ t: 'noise', x: this.player.pos.x, y: this.player.pos.y, z: this.player.pos.z, r: this.pendingNoise, l: this.levelId });
        this.pendingNoise = 0;
      }
    }
  }

  // Route a request to the host (or handle directly if we are the host).
  request(msg) {
    if (this.isHost) this.hostHandle(this.myId, msg);
    else this.session.sendToHost(msg);
  }

  // Send to one player (local apply if it's us).
  hostSend(pid, msg) {
    if (pid === this.myId) this.clientHandle(msg);
    else this.session.sendTo(pid, msg);
  }

  // Broadcast to everyone (including local).
  hostBroadcast(msg, includeSelf = true, except) {
    if (includeSelf && except !== this.myId) this.clientHandle(msg);
    if (this.online) this.session.broadcast(msg, except);
  }

  onNet(from, msg) {
    if (this.isHost) this.hostHandle(from, msg);
    else this.clientHandle(msg);
  }

  // ---------------------------------------------------------------- host handlers
  hostHandle(pid, m) {
    switch (m.t) {
      case 'p': {
        const prev = this.pstate.get(pid);
        delete m.t;
        this.pstate.set(pid, m);
        if (prev && prev.lvl !== m.lvl) this.onPlayerLevel(pid, m.lvl);
        if (pid !== this.myId) {
          let r = this.remotes.get(pid);
          if (!r) { r = new RemotePlayer(this, pid, { ...(this.roster.get(pid) || { name: 'Wanderer' }), lvl: m.lvl }); this.remotes.set(pid, r); }
          r.push(m, this.time);
        }
        break;
      }
      case 'hello': this.hostWelcome(pid, m); break;
      case 'noise': this.noises.push({ x: m.x, y: m.y, z: m.z, r: Math.min(60, m.r), l: m.l, pid }); break;
      case 'lvl': {
        const s = this.pstate.get(pid);
        if (s) s.lvl = m.l;
        else this.pstate.set(pid, { lvl: m.l, x: 0, y: 0, z: 0, yw: 0, pt: 0 });
        this.onPlayerLevel(pid, m.l);
        break;
      }
      case 'hit': {
        const e = this.entities.list.get(m.e);
        if (!e) break;
        const res = this.entities.damage(m.e, Math.min(400, m.d), m.dt, pid, m.pt);
        if (res?.killed) {
          this.hostSend(pid, { t: 'kill', e: m.e, type: e.type });
          const name = ENTITY_TYPES[e.type]?.name;
          if (e.def.announceKill) this.hostBroadcast({ t: 'sys', text: `${this.nameOf(pid)} brought down ${name}.` });
        }
        break;
      }
      case 'int': this.hostInteract(pid, m); break;
      case 'drop': {
        const id = 'd' + hash4(this.time * 1000 | 0, Math.random() * 1e9 | 0).toString(36);
        const d = { id, kind: 'drop', item: m.item.id, qty: m.item.qty, data: m.item.data, x: m.x, y: m.y, z: m.z, ry: Math.random() * 6 };
        this.hostBroadcast({ t: 'dyn+', l: m.l, d });
        break;
      }
      case 'throw': {
        const id = 't' + hash4(this.time * 1000 | 0, Math.random() * 1e9 | 0).toString(36);
        const life = m.type === 'flare' ? 45 : m.type === 'glowstick' ? 120 : 15;
        const d = { id, kind: 'thrown', type: m.type, x: m.x, y: m.y, z: m.z, vx: m.vx, vy: m.vy, vz: m.vz, t0: this.time, life, owner: pid };
        this.hostBroadcast({ t: 'dyn+', l: m.l, d });
        break;
      }
      case 'fx': {
        // relay cosmetic effects to others in that level
        for (const [id] of this.session.peers) if (id !== pid && this.pstate.get(id)?.lvl === m.l) this.session.sendTo(id, m);
        if (pid !== this.myId && this.levelId === m.l) this.clientHandle(m);
        // gunshots are noise for AI too
        if (m.k === 'shot') this.noises.push({ x: m.x, y: m.y, z: m.z, r: NOISE[m.w] || 40, l: m.l, pid });
        break;
      }
      case 'chat': {
        const text = String(m.text || '').slice(0, 200);
        if (text) this.hostBroadcast({ t: 'chat', from: pid, name: this.nameOf(pid), text });
        break;
      }
      case 'revive': this.hostSend(m.target, { t: 'revived', by: this.nameOf(pid) }); break;
      case 'exitUsed': {
        // first one through an exit brings dead teammates along
        for (const [id, s] of this.pstate) if (id !== pid && s.dd) this.hostSend(id, { t: 'respawn', lvl: m.to });
        if (pid !== this.myId && this.dead) this.clientHandle({ t: 'respawn', lvl: m.to });
        this.hostBroadcast({ t: 'sys', text: `${this.nameOf(pid)} went deeper — ${LEVELS[m.to]?.name || ''}.` }, true);
        break;
      }
      case 'victory': this.hostBroadcast({ t: 'victory', by: this.nameOf(pid) }); break;
      case 'skin': {
        const r = this.roster.get(pid);
        if (r) { r.skin = normalizeSkin(m.skin); this.hostBroadcast({ t: 'pinfo', id: pid, name: r.name, skin: r.skin }); }
        break;
      }
      default:
        LEVELS[m.l || this.pstate.get(pid)?.lvl]?.hostMessage?.(this, pid, m);
    }
  }

  onPlayerLevel(pid, lvl) {
    // team wipe check etc. could go here
  }

  nameOf(pid) { return pid === this.myId ? this.profile.name : (this.roster.get(pid)?.name || 'Wanderer'); }

  hostWelcome(pid, m) {
    const name = String(m.name || 'Wanderer').slice(0, 20);
    this.roster.set(pid, { name, skin: normalizeSkin(m.skin) });
    const hostState = this.localState();
    this.session.sendTo(pid, {
      t: 'welcome', id: pid, seed: this.seed, difficulty: this.difficulty, friendlyFire: this.friendlyFire,
      world: this.world.serialize(), roster: [...this.roster.entries()], hostId: this.myId, hostName: this.profile.name, hostSkin: this.profile.skin,
      level: this.levelId, spawn: { x: hostState.x, y: hostState.y, z: hostState.z }, ht: this.time,
    });
    this.hostBroadcast({ t: 'pinfo', id: pid, name, skin: normalizeSkin(m.skin) }, true, pid);
    this.hostBroadcast({ t: 'sys', text: `${name} noclipped into the run.` });
  }

  hostPeerLeft(pid) {
    const name = this.nameOf(pid);
    this.pstate.delete(pid);
    // free lockers they were in
    for (const [l, m] of this.world.objs) for (const [id, s] of m) if (s.occ === pid) this.hostBroadcast({ t: 'os', l, id, s: { ...s, occ: null, swing: false } });
    this.hostBroadcast({ t: 'leave', id: pid });
    this.hostBroadcast({ t: 'sys', text: `${name} disconnected.` });
  }

  findObject(l, id) {
    if (id.startsWith('d') || id.startsWith('t')) return this.world.getDyn(l, id);
    const [ck] = id.split(':');
    const [cx, cz] = ck.split(',').map(Number);
    const c = this.getLevel(l).chunk(cx, cz);
    return c.objects.find(o => o.id === id);
  }

  hostInteract(pid, m) {
    const o = this.findObject(m.l, m.id);
    if (!o) return;
    const s = this.world.get(m.l, m.id) || {};
    const set = ns => this.hostBroadcast({ t: 'os', l: m.l, id: m.id, s: ns });
    switch (o.kind) {
      case 'pickup':
        if (s.taken) return;
        set({ taken: true });
        this.hostSend(pid, { t: 'give', item: { id: o.item, qty: o.qty || 1 } });
        break;
      case 'drop':
        if (!this.world.getDyn(m.l, m.id)) return;
        this.hostBroadcast({ t: 'dyn-', l: m.l, id: m.id });
        this.hostSend(pid, { t: 'give', item: { id: o.item, qty: o.qty || 1, data: o.data } });
        break;
      case 'container': {
        const loot = s.opened ? [...(s.loot || [])] : o.loot.map(x => ({ ...x, data: ITEMS[x.item]?.data ? { ...ITEMS[x.item].data } : undefined }));
        if (m.a === 'open') set({ opened: true, loot });
        else if (m.a === 'take') {
          const it = loot[m.i];
          if (!it) return;
          loot.splice(m.i, 1);
          set({ opened: true, loot });
          this.hostSend(pid, { t: 'give', item: { id: it.item, qty: it.qty, data: it.data } });
        } else if (m.a === 'put' && m.item) {
          loot.push({ item: m.item.id, qty: m.item.qty, data: m.item.data });
          set({ opened: true, loot });
        }
        break;
      }
      case 'locker':
        if (m.a === 'enter') {
          if (s.occ && s.occ !== pid) return;
          set({ occ: pid, swing: true });
          setTimeout(() => this.hostBroadcast({ t: 'os', l: m.l, id: m.id, s: { occ: pid, swing: false } }), 450);
        } else if (m.a === 'exit') {
          set({ occ: null, swing: true });
          setTimeout(() => { const cur = this.world.get(m.l, m.id); if (!cur?.occ) this.hostBroadcast({ t: 'os', l: m.l, id: m.id, s: { occ: null, swing: false } }); }, 450);
        }
        break;
      case 'door':
        if (m.a === 'unlock') { set({ ...s, unlocked: true, open: true }); this.syncDoorCollider(m.l, o, true); }
        else if (m.a === 'toggle' && (!o.locked || s.unlocked)) { set({ ...s, open: !s.open }); this.syncDoorCollider(m.l, o, !s.open); }
        break;
      default:
        LEVELS[m.l]?.hostInteract?.(this, pid, o, s, m);
    }
  }

  syncDoorCollider(l, o, open) {
    if (o.collider) o.collider.disabled = open;
  }

  // ---------------------------------------------------------------- client handlers
  clientHandle(m) {
    switch (m.t) {
      case 'snap': {
        if (m.ht !== undefined) this.hostTimeOffset = m.ht - this.time;
        if (m.l === this.levelId) this.views.apply(m.e, this.time);
        for (const s of m.p) {
          if (s.id === this.myId) continue;
          let r = this.remotes.get(s.id);
          if (!r) {
            const info = this.roster.get(s.id) || { name: 'Wanderer' };
            r = new RemotePlayer(this, s.id, { ...info, lvl: s.lvl });
            this.remotes.set(s.id, r);
          }
          r.push(s, this.time);
        }
        if (m.b !== undefined) this.boss = m.b;
        break;
      }
      case 'os':
        this.world.set(m.l, m.id, m.s);
        if (m.s?.occ === undefined && false) break;
        // door colliders on clients
        if (m.s && 'open' in m.s) { const o = this.findObject(m.l, m.id); if (o?.collider) o.collider.disabled = !!m.s.open; }
        if (m.l === this.levelId && m.s?.open !== undefined) {
          const o = this.findObject(m.l, m.id);
          if (o) this.sfx(m.s.open ? 'doorOpen' : 'doorClose', o, { volume: 0.8 });
        }
        if (m.s?.swing) { const o = this.findObject(m.l, m.id); if (o && m.l === this.levelId) this.sfx('locker', o, { volume: 0.7 }); }
        this.ui.containerRefresh(m.id, this);
        break;
      case 'dyn+': this.world.addDyn(m.l, m.d); break;
      case 'dyn-': this.world.removeDyn(m.l, m.id); break;
      case 'flag': this.world.setFlag(m.l, m.k, m.v); this.def?.onFlag?.(this, m.l, m.k, m.v); break;
      case 'give': {
        const left = this.inventory.add(m.item);
        this.sfx('pickup', null, {});
        const def = ITEMS[m.item.id];
        this.hud.pickupToast(def?.name || m.item.id, m.item.qty);
        if (left > 0) this.dropItem({ id: m.item.id, qty: left, data: m.item.data });
        this.onPickup?.(m.item.id);
        break;
      }
      case 'dmg': this.hurtLocal(m); break;
      case 'kill': this.stats0.kills++; this.hud.hitmarker(true); break;
      case 'evt': this.clientEvent(m); break;
      case 'fx': this.clientFx(m); break;
      case 'chat': this.hud.chat(m.name, m.text, this.skinOf(m.from)?.shirtColor); this.sfx('ui', null, { freq: 880 }); break;
      case 'sys': this.hud.chat(null, m.text); break;
      case 'pinfo':
        this.roster.set(m.id, { name: m.name, skin: m.skin });
        this.remotes.get(m.id)?.setInfo(m);
        break;
      case 'leave': {
        const r = this.remotes.get(m.id);
        if (r) { r.dispose(); this.remotes.delete(m.id); }
        this.roster.delete(m.id);
        break;
      }
      case 'revived':
        if (this.downed) {
          this.downed = false;
          this.stats.health = 35;
          this.stats.bleeding = 0;
          this.subtitle(`${m.by} pulls you back up.`, 2.5);
          this.sfx('revive', null, {});
        }
        break;
      case 'respawn':
        if (this.dead || this.spectating) this.respawn(m.lvl);
        break;
      case 'victory': this.victory(m.by); break;
      case 'kicked': case 'hostLeft': this.ui.disconnected(m.t === 'kicked' ? 'You were removed from the room.' : 'The host left the game.'); break;
      default:
        this.def?.clientMessage?.(this, m);
    }
  }

  clientEvent(m) {
    if (m.l !== this.levelId) return;
    if (m.k === 'blackout') {
      this.blackoutT = m.dur;
      this.sfx('distantThud', null, { volume: 0.6 });
      this.subtitle(this.rng.pick(['The lights die all at once.', 'Darkness. The hum stops.', 'Every light goes out.']), 2.5, 'scare');
      this.stats.scare(6);
    } else if (m.k === 'flicker') {
      this.flashFlickerT = m.dur;
      this.lightMgr.blackout = 0.6;
    } else if (m.k === 'sound') {
      this.sfx(m.name, { x: m.x, y: m.y, z: m.z }, { volume: m.volume ?? 0.8, ref: 4 });
    } else if (m.k === 'subtitle') {
      this.subtitle(m.text, m.dur || 3, m.cls || '');
    } else if (m.k === 'shake') {
      this.player.shake = Math.min(1, this.player.shake + (m.a || 0.5));
    } else this.def?.clientEvent?.(this, m);
  }

  clientFx(m) {
    if (m.l !== this.levelId) return;
    if (m.k === 'shot') {
      const p = { x: m.x, y: m.y, z: m.z };
      this.sfx(m.w, p, { volume: 1, ref: 6 });
      this.effects.flash(p, 0.4, 0.05);
      this.lights.muzzle(new THREE.Vector3(m.x, m.y, m.z));
    } else if (m.k === 'splash') {
      this.effects.burst('splash', m);
      this.sfx('splash', m, { volume: 0.6 });
    }
  }

  victory(by) {
    if (this.won) return;
    this.won = true;
    this.sfx('victory', null, {});
    const mins = Math.round((performance.now() - this.stats0.startTime) / 60000);
    this.ui.showVictory({ time: mins + ' min', kills: this.stats0.kills, deaths: this.stats0.deaths, notes: this.journal.length + ' / ' + Object.keys(NOTES).length, seed: this.seedLabel || this.seed });
  }

  dispose() {
    this.running = false;
    this.sceneDef?.teardownScene?.(this);
    settings.off('change:quality', this.onQuality);
    window.removeEventListener('resize', this.onResize);
    for (const r of this.remotes.values()) r.dispose();
    this.remotes.clear();
    this.renderer.clear();
    this.objects.clear();
    this.views.clear();
    this.effects.clearTransient();
    this.sanityFx.removeFigure();
    const scene = this.engine.scene;
    scene.remove(this.renderer.root, this.objects.root, this.views.root, this.hemi, this.lightMgr.group, this.effects.points, this.effects.apoints, this.effects.dust);
    scene.remove(this.lights.spot, this.lights.spot.target, this.lights.fill, this.lights.muzzleLight, this.lights.lighter, ...this.lights.pool);
    this.engine.camera.remove(this.viewmodel.root);
    this.buzz?.stop();
    audio.stopAll();
    worldUniforms.bakedScale.value = 1;
  }
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
