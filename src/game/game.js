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
import { LEVELS, FIRST_LEVEL, LEVEL_ORDER } from '../world/levels/index.js';
import { PlayerController } from './player.js';
import { Stats } from './stats.js';
import { Inventory, EXTRA as EXTRA_SLOTS } from './inventory.js';
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
import { escapeHtml } from './remote.js';
import { CLASSES, applyClass, applyClassMods, classPerk } from './classes.js';
import { SAVE_MAGIC, SAVE_VERSION, sanitizeSave, sanitizeChar, sanitizeItem, randomHex, randomId, isToken, isRunId, tokenEq, getToken, setToken, writeSlot } from './save.js';
import { EntityManager } from '../ai/manager.js';
import { EntityViews } from '../ai/views.js';
import { Director } from '../ai/director.js';
import { NOISE } from '../ai/brain.js';
import { ENTITY_TYPES } from '../ai/entities/index.js';
import { radioSources, basesNear, baseLayout, baseById, baseAtChunk } from '../world/bases/index.js';
import { NPC_ARMS } from '../ai/entities/npc.js';
import { imageURL, IMAGE_CAPTIONS, didystaniName, radioChatter, basePasswords } from '../world/bases/objects.js';
import { WEAPONS } from './weapons.js';
import { audio } from '../audio/audio.js';

const SURFACES = { carpet: 'carpet', officeCarpet: 'carpet', fabric: 'carpet', poolTile: 'tile', poolTileBlue: 'tile', grate: 'metal', rustMetal: 'metal', darkMetal: 'metal' };
const SNAP_RATE = 1 / 15, SEND_RATE = 1 / 20;

const KEY_ITEMS = new Set(['keycard', 'fuse', 'drainKey', 'level5Key', 'gpsBoard', 'antenna']);
export const ARMOR_SLOTS = ['head', 'body', 'legs', 'feet'];
export const GEAR_SLOTS = [...ARMOR_SLOTS, 'pack'];
const ENV_CAUSES = new Set(['thirst', 'hunger', 'bleed', 'drown', 'fall', 'void', 'steam']);

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
    this.gear = { head: null, body: null, legs: null, feet: null, pack: null };
    this.snapT = 0; this.sendT = 0;
    this.pendingNoise = 0;
    this.transitioning = false;
    this.rng = new RNG(this.seed ^ 0x5eed);
    this.settingsFlashing = settings.get('flashing');
    this.boss = null;     // client-side boss HUD info
    this.flags = {};      // local per-run flags (seen tutorial etc.)
    this.cheats = { on: false, granted: new Set() };
    this._lootPlayers = Math.max(1, this.roster.size || 1);   // co-op cheat permissions (host-owned)
    this.cheatGod = false; this.notarget = false;
    // saves: this run's id, co-op character tokens (host), characters waiting to be reclaimed
    this.runId = isRunId(opts.runId) ? opts.runId : randomId();
    this.saveTokens = new Map();
    this.savedPlayers = [];
    this.claimTried = new Set();
    this.autoSaveT = 300;

    this.world.on('obj', (l, id) => { if (l === this.levelId) this.objects.refresh(id); this.onObjState?.(l, id); });
    this.world.on('dyn+', (l, d) => { if (l === this.levelId) this.objects.addDyn(d); });
    this.world.on('dyn-', (l, id) => { if (l === this.levelId) this.objects.removeDyn(id); });

    const baseDamage = this.stats.damage.bind(this.stats);
    this.stats.damage = (amount, cause, silent) => {
      if (this.cheatGod) return;
      // worn armor soaks up blows (not hunger, thirst, bleeding, drowning or falls)
      const worn = ARMOR_SLOTS.map(k => this.gear[k]).filter(Boolean);
      if (worn.length && amount > 0 && !ENV_CAUSES.has(cause)) {
        let pass = 1;
        for (const it of worn) pass *= 1 - ITEMS[it.id].armor.absorb;
        const total = Math.min(0.75, 1 - pass);
        for (const k of ARMOR_SLOTS) {
          const it = this.gear[k];
          if (!it) continue;
          it.data.dur -= amount * ITEMS[it.id].armor.absorb * 1.6;
          if (it.data.dur <= 0) { this.subtitle(`Your ${ITEMS[it.id].name.toLowerCase()} falls apart.`, 2.2, 'warn'); this.gear[k] = null; this.applyArmorMods(); }
        }
        amount *= 1 - total;
        this.hud.armorChanged(this);
      }
      baseDamage(amount, cause, silent);
    };
    this.stats.on('damage', (a, cause) => this.onDamaged(a, cause));
    this.stats.on('zero', cause => this.onZero(cause));
    this.inventory.on('change', () => {
      this.hud.inventoryChanged(this);
      if (this.ui.open.has('inventory') && !this._invRendering) { this._invRendering = true; try { this.ui.renderInventory(); } finally { this._invRendering = false; } }
    });
    this.onQuality = () => {
      this.renderer.radius = this.def?.renderRadius ?? settings.preset.renderRadius;
      this.lightMgr.setCount(settings.preset.dynamicLights);
    };
    settings.on('change:quality', this.onQuality);
    this.onBrightness = () => this.applyExposure();
    settings.on('change:brightness', this.onBrightness);
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
      if (s && 'open' in s) o.collider.disabled = !!s.open;
      else if (s?.unlocked) o.collider.disabled = true;
    }
    LEVELS[id].applyRuntime?.(this, level, c);
  }
  get level() { return this.getLevel(this.levelId); }
  // most players this session has had at once (loot never shrinks when someone leaves)
  get lootPlayers() { return this._lootPlayers; }
  noteLootPlayers() {
    const n = new Set([this.myId, ...this.roster.keys(), ...this.remotes.keys()]).size;
    if (n > this._lootPlayers) { this._lootPlayers = n; this.objects?.refreshAll(); }
  }
  get def() { return LEVELS[this.levelId]; }
  get armor() { return this.gear.body; }

  applyExposure() {
    this.engine.renderer.toneMappingExposure = (this.sceneDef?.exposure ?? 1) * settings.get('brightness');
  }

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
    this.waterFogNow = this.waterFogColorNow = undefined;
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
    let sp = opts.spawn || level.spawnPoint();
    if (opts.arrival && def.arrivalSpawn) {
      const ids = [...new Set([this.myId, ...this.roster.keys()])].sort();
      const a = def.arrivalSpawn(level, Math.max(0, ids.indexOf(this.myId)));
      if (a) { sp = a; opts.yaw = a.yaw; }
    }
    if (opts.spawn) {
      let f = level.floorAt(sp.x, sp.z);
      if (!isFinite(f)) { const p = level.randomWalkableNear(sp.x, sp.z, 6); if (p) sp = { x: p.x, y: level.floorAt(p.x, p.z), z: p.z }; }
      else sp = { x: sp.x, y: (sp.y !== undefined && Math.abs(sp.y - f) < 2.5) ? Math.max(f, sp.y) : f, z: sp.z };
    }
    this.player.teleport(sp.x, sp.y, sp.z, opts.yaw ?? sp.yaw ?? (opts.spawn ? undefined : def.spawnYaw) ?? this.openYaw(level, sp));
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
    if (!first) { this.stats0.levels++; if (this.isHost) this.autoSaveT = Math.min(this.autoSaveT, 4); }
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
    if (decals) { decals.map?.dispose(); decals.map = buildDecalAtlas(def.decalTexts || DECAL_TEXTS, def.exitStyle || 'spray', def.decalLabels || {}); }
    scene.fog = new THREE.FogExp2(def.fog.color, def.fog.density);
    scene.background = new THREE.Color(def.background ?? def.fog.color);
    this.hemi.color.set(def.hemi?.sky ?? 0x888888);
    this.hemi.groundColor.set(def.hemi?.ground ?? 0x222222);
    this.hemi.intensity = def.hemi?.intensity ?? 0.2;
    this.applyExposure();
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
    if (this.isHost && (this.autoSaveT -= dt) <= 0) { this.autoSaveT = 300; this.autoSave(); }

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
      lighterLit: this.held.lighterLit, hidden: this.hidden || this.dead || this.downed,
    });
    this.lights.update(dt, this.held);
    audio.updateListener(cam);
    audio.ambience?.update(dt, { sewer: this.player.pos.y < -1.5 });
    this.updateBuzz(dt);
    this.updateExitSense(dt);
    this.updateProbe(dt);
    this.sanityFx.update(dt);
    this.updatePost(dt);
    this.def.clientUpdate?.(this, dt);
    this.hud.update(this, dt);
    this.netSend(dt);
    input.endFrame();
  }

  canAct() {
    return !this.ui.modalOpen && input.locked && !this.hidden && !this.dead && !this.downed && !this.transitioning;
  }

  updateLocal(dt, level) {
    const P = this.player;
    if (this.dead) return;
    P.frozen = this.ui.modalOpen || this.hidden;
    P.frozenLook = this.ui.modalOpen;
    P.downed = this.downed;
    P.staminaOk = !this.stats.exhausted && this.stats.stamina > 0;
    P.update(dt, level, { canJump: () => this.stats.stamina > 8, onJump: () => { this.stats.stamina -= 6; this.stats.sinceSprint = 0; } });
    if (this.hidden) this.placeInLocker();
    else if (!P.noclip) this.pushOutOfEntities(level);

    // events -> sound + AI noise
    for (const ev of P.events) {
      const surf = this.surfaceAt(P.pos);
      if (ev.type === 'step') {
        this.sfx('step', null, { surface: ev.wet ? 'water' : surf, volume: ev.crouch ? 0.22 : ev.sprint ? 0.85 : 0.5, reverb: 0.3 });
        this.emitNoise((ev.crouch ? NOISE.crouch : ev.sprint ? NOISE.sprint : NOISE.walk) * classPerk(this, 'stepNoise', 1) * (this.armorQuiet || 1));
      } else if (ev.type === 'land') {
        this.sfx('land', null, { volume: Math.min(1, ev.impact / 9) });
        this.emitNoise(NOISE.land);
        if (ev.impact > 10.5) this.stats.damage((ev.impact - 10.5) * 9 * (this.armorFall || 1), 'fall');
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
      sprinting: P.sprinting, swimming: P.swimming, swimFast: P.swimming && input.act('sprint'), underwater: P.underwater,
      darkness: lit ? 0 : (flags & F_DARK || ambient < 0.08 ? 1 : 0.35), nearbyThreat: threat, inBrightLight: ambient > 0.55, teammatesNear: teammates,
      sanityDrain: this.def.sanityDrain || 0, charm: this.inventory.held?.id === 'didhCharm', armorStamina: this.armorStamina || 1,
    });
    this.threat = threat;
    audio.setUnderwater(P.underwater);
    if (P.underwater && Math.random() < dt * 0.7) this.sfx('bubbles', null, { volume: 0.5 });

    // downed: bleed out, or hold the give-up key to respawn at the checkpoint
    if (this.downed) {
      this.bleedout -= dt;
      const held = this.inventory.held;
      if (held && ITEMS[held.id].effects?.revive && input.actPressed('use') && !this.ui.modalOpen) { this.consumeNow(ITEMS[held.id], this.inventory.selected); return; }
      if (input.act('respawn') && !this.ui.modalOpen) {
        this.giveUpT = (this.giveUpT || 0) + dt;
        this.hud.progress(this.giveUpT / 1.5, 'Giving up…');
        if (this.giveUpT >= 1.5) { this.giveUpT = 0; this.hud.progress(-1); this.die('gave up'); this.respawn(); return; }
      } else if (this.giveUpT) { this.giveUpT = 0; this.hud.progress(-1); }
      this.hud.prompt(`Downed — ${Math.ceil(this.bleedout)}s · hold <kbd>${input.label('respawn')}</kbd> to give up and respawn`, null);
      if (this.bleedout <= 0) this.die('bled out');
    }

    // input
    if (!this.ui.modalOpen) {
      if (input.actPressed('flashlight') && !this.dead && !this.downed) this.lights.toggle();
      for (let i = 0; i < this.inventory.hotbarSize; i++) if (input.actPressed('hotbar' + (i + 1))) this.inventory.select(i);
      if (input.wheel) this.inventory.select(this.inventory.selected + input.wheel);
      if (input.actPressed('drop') && this.canAct()) this.dropSelected();
    }
    this.held.update(dt);
    this.updateInteraction(dt);
    if (this.tutorial?.length && this.time >= this.tutorial[0].t && !this.ui.modalOpen) this.subtitle(this.tutorial.shift().text, 5);
    this.def.localUpdate?.(this, dt, level);
    this.checkExits(level);
    // void fall
    if (P.pos.y < (this.def.killY ?? -60)) this.fellIntoVoid();
  }

  // Players can't walk through creatures: slide around their bodies.
  pushOutOfEntities(level) {
    const P = this.player;
    for (const v of this.views.views.values()) {
      const st = v.st;
      if (st.s === 'dead' || st.s === 'gone' || st.s === 'collapsed' || v.def.flying || v.def.noPush) continue;
      if (Math.abs(st.y - P.pos.y) > 1.7) continue;
      const r = (v.def.radius ?? 0.4) + 0.34;
      const dx = P.pos.x - st.x, dz = P.pos.z - st.z, d = Math.hypot(dx, dz);
      if (d >= r) continue;
      const nx = d > 1e-3 ? dx / d : 1, nz = d > 1e-3 ? dz / d : 0;
      const b = P.body;
      b.x = P.pos.x; b.y = P.pos.y; b.z = P.pos.z;
      level.move(b, nx * (r - d), nz * (r - d));
      P.pos.x = b.x; P.pos.z = b.z;
      // kill velocity into the creature
      const into = P.vel.x * -nx + P.vel.z * -nz;
      if (into > 0) { P.vel.x += nx * into; P.vel.z += nz * into; }
    }
  }

  // ------------------------------------------------------------------ interaction
  updateInteraction(dt) {
    if (this.downed) { this.interactTarget = null; return; }
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
      label = `Hold <kbd>${input.label('interact')}</kbd> to revive ${reviveCand.name}`;
      if (input.act('interact') && this.canAct()) {
        this.reviveT += dt;
        const need = 3.5 / classPerk(this, 'reviveMul', 1);
        this.hud.progress(this.reviveT / need, 'Reviving ' + reviveCand.name);
        if (this.reviveT >= need) {
          this.reviveT = 0;
          this.hud.progress(-1);
          this.request({ t: 'revive', target: reviveCand.id });
          this.sfx('revive', null, {});
        }
      } else if (this.reviveT > 0) { this.reviveT = 0; this.hud.progress(-1); }
    } else {
      if (this.reviveT > 0) { this.reviveT = 0; this.hud.progress(-1); }
      if (this.hidden) {
        label = `<kbd>${input.label('interact')}</kbd> Leave hiding spot`;
        if (input.actPressed('interact') && !this.ui.modalOpen) this.leaveHiding();
      } else if (!this.dead && !this.ui.modalOpen) {
        tgt = this.objects.target(cam);
        if (tgt) {
          label = `<kbd>${input.label('interact')}</kbd> ${tgt.label}`;
          if (input.actPressed('interact') && this.canAct() && !this.downed) this.interact(tgt);
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
      case 'levelDoor':
        this.sfx('doorOpen', o, { volume: 0.9 });
        this.subtitle(`You step through the door marked ${o.label}.`, 2);
        this.useExit(o.to);
        break;
      case 'hatch':
        if (s?.open) { this.useExit(o.to); return; }
        {
          const bar = this.inventory.has('crowbar');
          this.request({ t: 'int', l, id: o.id, a: 'force', bar });
          this.sfx(bar ? 'metalGroan' : 'hitWall', o, { volume: 1 });
          this.emitNoise(bar ? 14 : 24);
          if (!bar && !s?.prog) this.subtitle('Rusted shut. A few more heaves — or something to pry with.', 2.5);
        }
        break;
      case 'vendor':
        if ((s?.stock ?? o.stock) <= 0) { this.sfx('doorLocked', o, { volume: 0.5 }); this.subtitle('Sold out. The coil turns and turns on nothing.', 2); return; }
        this.request({ t: 'int', l, id: o.id, a: 'buy' });
        this.sfx('vend', { x: o.x, y: o.y + 1, z: o.z }, {});
        this.emitNoise(5);
        break;
      case 'ladder':
        this.climbLadder(o);
        break;
      case 'phone':
        this.ui.phone.open(this, o);
        break;
      case 'computer':
        this.useComputer(o);
        break;
      case 'image': {
        const fig = o.img.startsWith('didFigure:');
        const [title, body] = fig ? [didystaniName(+o.img.slice(10)), 'A Didystani officer, painted in oils. The frame is scorched along one side. Whoever hung it here did not get to take it down.'] : (IMAGE_CAPTIONS[o.img === 'didh' && this.stats.sanity < 30 ? 'didhDark' : o.img] || ['Picture', '']);
        this.ui.showImage(imageURL(o.img === 'didh' && this.stats.sanity < 30 && Math.random() < 0.5 ? 'didhDark' : o.img), title, body);
        if (o.img === 'didh') this.stats.scare(-4);
        break;
      }
      case 'gate': {
        if (s?.open || o.broken0) return;
        const it = this.inventory.held, d = it && ITEMS[it.id];
        const W = d?.type === 'weapon' ? WEAPONS[d.weapon] : null;
        const dmg = W?.kind === 'melee' ? W.damage * (it.id === 'crowbar' ? 1.6 : 1.1) : 9;
        if (this.stats.stamina < 6) { this.subtitle('You\'re too winded to swing.', 1.2); return; }
        this.stats.stamina = Math.max(0, this.stats.stamina - 9); this.stats.sinceSprint = 0;
        this.viewmodel.swing(W?.swing || 'crowbar');
        this.sfx('hitWall', o, { volume: 1 }); this.sfx('metalGroan', o, { volume: 0.5 });
        this.emitNoise(16);
        this.request({ t: 'int', l, id: o.id, a: 'bash', d: dmg });
        if (!W) this.subtitle('Bare hands won\'t do much. A crowbar, a blade — or a grenade.', 2);
        break;
      }
      case 'baseVault':
        if (s?.open) return;
        if (this.inventory.has('vaultKey')) { this.inventory.consume('vaultKey', 1); this.request({ t: 'int', l, id: o.id, a: 'unlock' }); this.sfx('unlock', o, {}); this.sfx('metalDoor', o, { volume: 0.8 }); }
        else { this.sfx('doorLocked', o, {}); this.subtitle('A vault door with a heavy brass lock. The base commander would carry the key.', 2.5); }
        break;
      case 'trader':
        this.ui.openTrade(o, s, this);
        break;
      case 'rqComputer': {
        const b = baseById(this.level, o.base);
        if (b) b._posts = baseLayout(this.level, b).posts.length;
        const P = this.player;
        if (o.seat) { this.preSeat = { x: P.pos.x, y: P.pos.y, z: P.pos.z }; P.teleport(o.seat.x, P.pos.y, o.seat.z, o.seat.yaw); P.pitch = -0.12; P.height = 1.3; }
        this.ui.ruckyos.open(this, o, b);
        break;
      }
      case 'paper':
        this.sfx('paper', null, {});
        this.ui.showNote({ title: o.title || 'Note', body: o.text || '' });
        break;
      case 'radioSet': {
        const [t, b] = radioChatter(hash4(o.x * 10 | 0, o.z * 10 | 0, (this.time / 30) | 0));
        this.sfx('radioStatic', o, { volume: 0.8 });
        this.subtitle(`${t}. ${b}`, 6);
        break;
      }
      default:
        // level-specific kinds
        this.def.interact?.(this, o, s, tgt);
    }
  }

  // Climb to the other end of a ladder (a short fade hides the teleport).
  climbLadder(o) {
    if (this.transitioning || this.climbing) return;
    this.climbing = true;
    this.sfx('ladder', null, { volume: 0.9 });
    this.emitNoise(6);
    this.ui.fade(true);
    setTimeout(() => {
      this.climbing = false;
      if (this.levelId !== o.level && o.level) return;
      this.player.teleport(o.dest.x, o.dest.y + 0.05, o.dest.z, o.dest.yaw);
      this.ui.fade(false);
    }, 650);
  }

  // Sit down at a desk computer: snap into the chair facing the screen.
  useComputer(o) {
    const P = this.player;
    if (o.seat) {
      this.preSeat = { x: P.pos.x, y: P.pos.y, z: P.pos.z };
      P.teleport(o.seat.x, P.pos.y, o.seat.z, o.seat.yaw);
      P.pitch = -0.12;
      P.height = 1.3;
    }
    this.sfx('click', o, {});
    this.ui.computer.open(this, o);
  }
  standUp() {
    // step back out of the chair to where we stood
    if (this.preSeat) { const p = this.preSeat; this.preSeat = null; this.player.teleport(p.x, p.y, p.z); }
  }

  readNote(id) {
    const n = NOTES[id];
    if (!n) return;
    if (!this.journal.includes(id)) { this.journal.push(id); this.stats0.notes++; this.stats.scare(classPerk(this, 'notesBonus', false) ? -9 : -3); }
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
    // look out through the vents: the locker's own door would fill the view
    const door = this.objects.all.get(o.id)?.mesh?.userData.door;
    if (door) door.visible = false;
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
    const door = o && this.objects.all.get(o.id)?.mesh?.userData.door;
    if (door) door.visible = true;
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
    const qty = input.act('sprint') ? it.qty : 1;
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

  // Teleport anywhere: same level moves you, another level loads it first.
  travelTo(levelId, pos) {
    if (levelId === this.levelId && pos) {
      const L = this.level;
      let f = L.floorAt(pos.x, pos.z);
      let x = pos.x, z = pos.z;
      if (!isFinite(f)) { const p = L.randomWalkableNear(pos.x, pos.z, 6); if (p) { x = p.x; z = p.z; f = L.floorAt(x, z); } }
      if (!isFinite(f)) f = pos.y ?? 0;
      this.player.teleport(x, f + 0.05, z);
      return;
    }
    if (levelId === this.levelId && !pos) { const sp = this.level.spawnPoint(); this.player.teleport(sp.x, sp.y + 0.05, sp.z); return; }
    this.request({ t: 'exitUsed', from: this.levelId, to: levelId, tp: true });
    this.enterLevel(levelId, pos ? { spawn: pos } : {});
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
    if (amount > 6) this.sfx('hurt', null, { volume: 0.9, big: amount > 25 });
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
      // the blow jerks your view toward the attacker and shoves you back
      const toward = Math.atan2(-(m.fx - this.player.pos.x), -(m.fz - this.player.pos.z));
      let dy = toward - this.player.yaw; while (dy > Math.PI) dy -= Math.PI * 2; while (dy < -Math.PI) dy += Math.PI * 2;
      const k = Math.min(1, m.a / 30);
      this.player.addRecoil(0.06 * k, dy * 0.12 * k);
      if (!m.push) {
        const d = Math.hypot(this.player.pos.x - m.fx, this.player.pos.z - m.fz) || 1;
        this.player.vel.x += (this.player.pos.x - m.fx) / d * 3 * k; this.player.vel.z += (this.player.pos.z - m.fz) / d * 3 * k;
      }
      this.player.staggerT = 0.35 * k;
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
    this.ui.showDeath(cause, true, this);
  }

  respawn(atLevel) {
    if (!this.dead && !this.downed) return;
    this.dead = false; this.downed = false; this.spectating = false;
    this.stats.dead = false;
    this.stats.reset(true);
    this.ui.hideDeath();
    if (atLevel && atLevel !== this.levelId) { this.enterLevel(atLevel); return; }
    const cp = this.checkpoint;
    this.player.teleport(cp.x, cp.y + 0.05, cp.z);
    this.subtitle(this.online ? 'You wake up, gasping, back where you entered this level. Your team is somewhere ahead.' : 'You wake up, gasping, somewhere you have been before.', 3.5);
    if (this.online) this.request({ t: 'respawned' });
  }

  // Solo player or host skips the rest of the prologue: everyone jumps now.
  skipPrologue() {
    if (this.levelId !== 'P0' || !this.isHost) return;
    this.skippedPrologue = true;
    LEVELS.P0.skip(this);
  }

  // Pick a role (if none yet) through the role screen.
  chooseRole(id) {
    applyClass(this, id);
    this.applyArmorMods();
    this.subtitle(`${CLASSES[id].name}: ${CLASSES[id].perks[0]}.`, 3.5);
    if (this.online) this.request({ t: 'role', c: id });
  }
  promptRole() {
    if (this.classId) return;
    this.ui.openRolePicker(this, id => { this.chooseRole(id); input.lock(); });
  }

  // ------------------------------------------------------------------ items: consume, armor, transmitter
  consumeNow(def, idx) {
    this.stats.applyEffects(def.effects);
    if (def.effects.revive && this.downed) this.selfRevive();
    this.inventory.takeFrom(idx, 1);
    this.sfx(def.sound || 'pickup', null, {});
    if (def.effects.status) this.subtitle({ inkward: 'It tastes of nothing. The air feels thinner around you.', goo: 'It tastes of pennies and wet cement. Your heart hammers — you could run forever.' }[def.effects.status[0]] || 'A clean, cold rush. Your legs feel tireless.', 2.5);
  }

  selfRevive() {
    if (!this.downed) return;
    this.downed = false;
    this.stats.health = Math.max(this.stats.health, 30);
    this.stats.bleeding = 0;
    this.subtitle('The adrenaline hits. You drag yourself up.', 2.5);
    this.sfx('revive', null, {});
  }

  // Put on a piece of armor or a pack from an inventory slot (swapping out what's there).
  equipGear(idx) {
    const it = this.inventory.slots[idx];
    const def = it && ITEMS[it.id];
    if (!def || (def.type !== 'armor' && def.type !== 'pack')) return;
    const slot = def.type === 'pack' ? 'pack' : def.armor.slot;
    const old = this.gear[slot];
    if (slot === 'pack') {
      // the pockets of the old pack must fit in the new one
      if (!this.inventory.setExtra(Math.max(def.pack.slots, this.inventory.extra)) || (def.pack.slots < this.inventory.extra && this.inventory.extraUsed(def.pack.slots))) {
        this.subtitle('Empty the pockets of your current pack first.', 2); return;
      }
    }
    const taken = this.inventory.takeFrom(idx, 1);
    this.gear[slot] = taken;
    if (slot === 'pack') this.inventory.setExtra(def.pack.slots);
    if (old) { const left = this.inventory.add(old); if (left > 0) this.dropItem(old); }
    this.applyArmorMods();
    this.sfx('rummage', null, { volume: 0.7 });
    this.subtitle(slot === 'pack' ? `You shoulder the ${def.name}.` : `You put on the ${def.name}.`, 1.6);
  }
  wearArmor(idx) { this.equipGear(idx); }

  unequipGear(slot) {
    const it = this.gear[slot];
    if (!it) return false;
    if (slot === 'pack') {
      if (this.inventory.extraUsed()) { this.subtitle('Take everything out of the pack\'s pockets first.', 2); return false; }
      this.inventory.setExtra(0);
    }
    this.gear[slot] = null;
    const left = this.inventory.add(it);
    if (left > 0) this.dropItem(it);
    this.applyArmorMods();
    return true;
  }
  removeArmor() { this.unequipGear('body'); }

  // Speed, stamina, fall and noise modifiers from everything worn.
  applyArmorMods() {
    let slow = 0, stamina = 1, fall = 1, quiet = 1;
    for (const k of GEAR_SLOTS) {
      const it = this.gear[k];
      if (!it) continue;
      const d = ITEMS[it.id];
      const A = d.armor || d.pack || {};
      slow += A.slow || 0; stamina *= A.stamina || 1; fall *= A.fall || 1; quiet *= A.quiet || 1;
    }
    this.player.armorSlow = Math.max(0.6, 1 - slow);
    this.armorStamina = stamina;
    this.armorFall = fall;
    this.armorQuiet = quiet;
    this.hud.armorChanged(this);
  }
  armorProtection() {
    let pass = 1;
    for (const k of ARMOR_SLOTS) if (this.gear[k]) pass *= 1 - ITEMS[this.gear[k].id].armor.absorb;
    return Math.min(0.75, 1 - pass);
  }
  gearIds() { return GEAR_SLOTS.map(k => this.gear[k]?.id || 0); }

  activeTransmitter() {
    for (const s of this.inventory.slots) if (s && s.id === 'transmitter' && s.data.on && s.data.charge > 0) return s;
    return null;
  }

  toggleTransmitter(it) {
    if (!it) return;
    if (!it.data.on && it.data.charge <= 0) { this.subtitle('The transmitter is dead. Use a battery on it.', 2); this.sfx('click', null, {}); return; }
    // only one runs at a time
    for (const s of this.inventory.slots) if (s && s.id === 'transmitter' && s !== it) s.data.on = false;
    it.data.on = !it.data.on;
    this.sfx('click', null, {});
    if (it.data.on) { this.sfx('keyChirp', null, {}); this.transT = 0; }
    this.inventory.changed();
  }

  // Radio scanner: leave it running and it slowly fixes the rough position of
  // any transmitter (bases with a communications room) on this level.
  toggleScanner(it) {
    if (!it) return;
    if (!it.data.on && it.data.charge <= 0) { this.subtitle('The scanner is dead. Use a battery on it.', 2); this.sfx('click', null, {}); return; }
    for (const s of this.inventory.slots) if (s && s.id === 'radioScanner' && s !== it) s.data.on = false;
    it.data.on = !it.data.on;
    this.sfx('click', null, {});
    if (it.data.on) { this.sfx('scanStatic', null, {}); this.scanT = 0; if (it.data.lvl !== this.levelId) { it.data.lvl = this.levelId; it.data.scan = 0; it.data.found = null; } }
    this.inventory.changed();
  }
  // the base siren: the nearest wailing alarm on this level
  updateSiren(dt) {
    this.sirenT = (this.sirenT || 0) - dt;
    if (this.sirenT > 0) return;
    this.sirenT = 0.5;
    let best = null, bd = 70;
    for (const e of this.objects.all.values()) {
      if (e.o.kind !== 'alarm') continue;
      const t = this.world.flag(this.levelId, 'alarm:' + e.o.base);
      if (!t || this.time - t > 32) continue;
      const d = Math.hypot(e.o.x - this.player.pos.x, e.o.z - this.player.pos.z);
      if (d < bd) { bd = d; best = e.o; }
    }
    if (best && !this.siren) this.siren = this.loopSfx('siren', { x: best.x, y: 2.4, z: best.z }, { volume: 1, ref: 8, rolloff: 0.8 });
    if (best && this.siren) this.siren.setPos({ x: best.x, y: 2.4, z: best.z });
    if (!best && this.siren) { this.siren.stop(1.2); this.siren = null; }
  }

  updateScannerHud(dt) {
    const el = this._scEl || (this._scEl = document.getElementById('scannerPanel'));
    let sc = null;
    for (const s of this.inventory.slots) if (s && s.id === 'radioScanner' && s.data.on && s.data.charge > 0) sc = s;
    if (!sc || !this.levelId || this.dead) { if (el && !el.classList.contains('hidden')) el.classList.add('hidden'); return; }
    el.classList.remove('hidden');
    const D = sc.data;
    if (D.lvl !== this.levelId) { D.lvl = this.levelId; D.scan = 0; D.found = null; }
    D.charge = Math.max(0, D.charge - dt * 0.12);
    if (D.charge <= 0) { D.on = false; this.subtitle('The scanner\'s screen fades out. Battery dead.', 2); this.inventory.changed(); return; }
    // a full sweep takes a while (it depends on the level's interference)
    const need = 50 + (hash4(this.def.id.charCodeAt(1) || 0, this.seed | 0) % 40);
    D.scan = Math.min(need, (D.scan || 0) + dt);
    this.scanT = (this.scanT || 0) - dt;
    if (this.scanT > 0) return;
    this.scanT = 2;
    if (Math.random() < 0.5) this.sfx('scanStatic', null, { volume: 0.5 });
    const P = this.player.pos, yaw = this.player.yaw;
    const fmt = v => (v >= 0 ? ' ' : '') + Math.round(v);
    let rows;
    if (D.scan < need) {
      const pct = Math.floor(D.scan / need * 100);
      rows = `<div class="tp-row"><span>Sweeping frequencies… ${pct}%</span></div><div class="sc-bar"><div style="width:${pct}%"></div></div><div class="tp-row far"><span>Keep it switched on.</span></div>`;
    } else {
      const was = D.found?.length || 0;
      D.found = radioSources(this.level, P.x, P.z, 480).map(s => ({ x: s.x, z: s.z, faction: s.faction, strength: s.strength }));
      if (D.found.length > was) { this.sfx('scanPing', null, {}); this.subtitle(D.found.length === 1 ? 'The scanner locks onto a transmission.' : 'The scanner picks out several transmissions.', 2.2); }
      const arrows = ['↑', '↗', '→', '↘', '↓', '↙', '←', '↖'];
      rows = D.found.length ? D.found.map(f => {
        const dx = f.x - P.x, dz = f.z - P.z, d = Math.hypot(dx, dz);
        let a = Math.atan2(-dx, -dz) - yaw; a = ((a % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
        return `<div class="tp-row"><span>${f.strength > 0.6 ? 'Strong' : 'Faint'} signal <span class="arr">${arrows[Math.round((Math.PI * 2 - a) / (Math.PI / 4)) % 8]}</span>~${Math.round(d / 10) * 10}m</span><span>X≈${fmt(f.x)}</span><span>Z≈${fmt(f.z)}</span></div>`;
      }).join('') : '<div class="tp-row far"><span>No transmissions within range.</span></div>';
    }
    el.innerHTML = `<div class="tp-h"><span>📡 RADIO SCANNER</span><span>${Math.round(D.charge)}%</span></div>${rows}`;
  }

  // HUD panel: your coordinates and every teammate's, refreshed every 3 s
  updateTransmitterHud(dt) {
    const el = this._tpEl || (this._tpEl = document.getElementById('transmitterPanel'));
    const tr = this.levelId && !this.dead ? this.activeTransmitter() : null;
    if (!tr) { if (!el.classList.contains('hidden')) el.classList.add('hidden'); return; }
    el.classList.remove('hidden');
    tr.data.charge = Math.max(0, tr.data.charge - dt * 0.05);
    if (tr.data.charge <= 0) { tr.data.on = false; this.subtitle('The transmitter beeps once and dies.', 2); this.inventory.changed(); return; }
    this.transT = (this.transT || 0) - dt;
    if (this.transT > 0) return;
    this.transT = 3;
    const P = this.player.pos, yaw = this.player.yaw;
    const fmt = v => (v >= 0 ? ' ' : '') + Math.round(v);
    const rows = [`<div class="tp-row me"><span>You (${LEVELS[this.levelId].name})</span><span>X${fmt(P.x)}</span><span>Z${fmt(P.z)}</span></div>`];
    const arrows = ['↑', '↗', '→', '↘', '↓', '↙', '←', '↖'];
    for (const r of this.remotes.values()) {
      const b = r.buf[r.buf.length - 1]?.s;
      if (!b) continue;
      const same = r.levelId === this.levelId;
      let extra = '';
      if (same) {
        const dx = b.x - P.x, dz = b.z - P.z, d = Math.hypot(dx, dz);
        let a = Math.atan2(-dx, -dz) - yaw; a = ((a % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
        extra = ` <span class="arr">${arrows[Math.round((Math.PI * 2 - a) / (Math.PI / 4)) % 8]}</span>${Math.round(d)}m`;
      }
      rows.push(`<div class="tp-row ${same ? '' : 'far'}"><span>${escapeHtml(r.name)} (${LEVELS[r.levelId]?.name || '?'})${extra}</span><span>X${fmt(b.x)}</span><span>Z${fmt(b.z)}</span></div>`);
    }
    if (!this.online) rows.push('<div class="tp-row far"><span>No other signals.</span></div>');
    el.innerHTML = `<div class="tp-h"><span>◉ LOCATION TRANSMITTER</span><span>${Math.round(tr.data.charge)}%</span></div>${rows.join('')}`;
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
      const target = this.player.underwater ? (this.waterFogNow ?? this.def.waterFog ?? 0.14) : this.def.fog.density * (1 + this.lightMgr.blackout * 0.6);
      water.density = damp(water.density, target, 4, dt);
      if (this.player.underwater) water.color.set(this.waterFogColorNow ?? this.def.waterFogColor ?? 0x0d3a40);
      else water.color.set(this.def.fog.color);
    }
  }

  updateProbe(dt) {
    const v = this.ambientLightAt(this.player.pos) * (worldUniforms.bakedScale.value);
    const k = (this.def?.probeGain ?? 0.16) * v;
    const tint = this.def?.probeTint || [1, 0.94, 0.82];
    const pr = worldUniforms.dynProbe.value;
    const a = Math.min(1, dt * 3);
    pr.r += (tint[0] * k - pr.r) * a; pr.g += (tint[1] * k - pr.g) * a; pr.b += (tint[2] * k - pr.b) * a;
  }

  // Exits breathe: a spatial draft sound leads players the last stretch, and a
  // one-off hint fires the first time they come close.
  updateExitSense(dt) {
    this.exitScanT = (this.exitScanT || 0) - dt;
    if (this.exitScanT <= 0) {
      this.exitScanT = 0.5;
      const P = this.player.pos, level = this.level;
      const sense = classPerk(this, 'senseMul', 1);
      let best = null, bd = 42 * sense;
      if (level && !this.transitioning) {
        const cx = Math.floor(P.x / CHUNK), cz = Math.floor(P.z / CHUNK);
        for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
          if (!level.hasChunk(cx + dx, cz + dz)) continue;
          for (const o of level.chunk(cx + dx, cz + dz).objects) {
            if (o.kind !== 'exit' && o.kind !== 'hatch') continue;
            if (o.kind === 'exit' && (o.to === 'victory' || o.requires)) continue;
            const d = Math.hypot(o.x - P.x, o.z - P.z);
            if (d < bd) { bd = d; best = o; }
          }
        }
      }
      this.exitNear = best ? { o: best, d: bd } : null;
      // objective items chirp softly when close, so a searched room isn't missed
      this.chirpT = (this.chirpT || 0) - 0.5;
      if (this.chirpT <= 0 && level && !this.transitioning) {
        const cx = Math.floor(P.x / CHUNK), cz = Math.floor(P.z / CHUNK);
        outer: for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
          if (!level.hasChunk(cx + dx, cz + dz)) continue;
          for (const o of level.chunk(cx + dx, cz + dz).objects) {
            if (o.kind !== 'pickup' || !KEY_ITEMS.has(o.item) || this.world.get(this.levelId, o.id)?.taken) continue;
            if (Math.hypot(o.x - P.x, o.z - P.z) > 22 * sense) continue;
            this.sfx('keyChirp', { x: o.x, y: (o.y || 0) + 0.5, z: o.z }, { ref: 3 });
            this.chirpT = 2.5;
            break outer;
          }
        }
      }
      if (best && bd < 14 && !this.flags['draft:' + this.levelId]) {
        this.flags['draft:' + this.levelId] = true;
        this.subtitle(best.kind === 'hatch' ? 'Cold air seeps up around a hatch in the floor nearby.' : 'A cold draft rises from somewhere close. The floor gives way near here.', 3.5);
      }
    }
    const n = this.exitNear;
    if (n) {
      const pos = { x: n.o.x, y: (n.o.kind === 'hatch' ? 0.2 : 0), z: n.o.z };
      if (!this.draft) this.draft = audio.loop('draftLoop', { pos, volume: 1, ref: 3, rolloff: 1.1 });
      if (this.draft) { this.draft.setPos(pos); this.draft.set('level', Math.min(1, (1 - n.d / (42 * classPerk(this, 'senseMul', 1))) * 1.4)); }
    } else if (this.draft) { this.draft.set('level', 0); }
  }

  updateBuzz(dt) {
    const nf = this.lightMgr.nearestFlicker(this.engine.camera.position, 9);
    if (nf && nf.value > 0.1) {
      if (!this.buzz) this.buzz = audio.loop('lightBuzz', { pos: nf.light, volume: 1, ref: 2 });
      if (this.buzz) { this.buzz.setPos(nf.light); this.buzz.set('level', nf.value * (1 - nf.dist / 9)); }
    } else if (this.buzz) { this.buzz.set('level', 0); }
  }

  updateRemoteLights() {
    this.lights.updateRemote(this.remotes.values(), this.levelId, this.engine.camera.position);
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
        hidden: this.hidden || this.notarget, downed: this.downed, dead: this.dead || this.downed, light: this.lights.on, focus: this.lights.focus,
        dir: { x: dir.x, y: dir.y, z: dir.z }, lighter: this.held.lighterLit, sanity: this.stats.sanity, swim: P.swimming,
        inWater: this.level.waterAt(P.pos.x, P.pos.z) > P.pos.y + 0.4, ambientLight: this.ambientLightAt(P.pos), ward: this.stats.hasStatus('inkward'),
      });
    }
    for (const [id, s] of this.pstate) {
      if (id === this.myId || !s.lvl) continue;
      const cp = Math.cos(s.pt), dir = { x: -Math.sin(s.yw) * cp, y: Math.sin(s.pt), z: -Math.cos(s.yw) * cp };
      out.push({
        id, levelId: s.lvl, x: s.x, y: s.y, z: s.z, crouch: s.cr, sprint: s.sp, hidden: s.hd || s.nt, downed: s.dn, dead: s.dd || s.dn,
        light: s.fl, focus: s.fo, dir, lighter: s.lt, sanity: s.sn, swim: s.sw, inWater: s.iw, ambientLight: 0.3, ward: !!s.wd,
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
    this.entitiesOpenDoors(perLevel);
    this.hostBases(perLevel, dt);
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

  // Creatures shoulder ordinary (unlocked) doors open as they pass.
  entitiesOpenDoors(perLevel) {
    for (const [lid, ctx] of perLevel) {
      for (const e of this.entities.byLevel(lid)) {
        if (e.state === 'dead' || (e.speedNow || 0) < 0.3 || e.def.noDoors) continue;
        const ch = ctx.level.chunk(Math.floor(e.x / CHUNK), Math.floor(e.z / CHUNK));
        for (const o of ch.objects) {
          if (o.kind !== 'door' || Math.abs(o.x - e.x) > 1.6 || Math.abs(o.z - e.z) > 1.6) continue;
          const s = this.world.get(lid, o.id);
          if (s?.open || (o.locked && !s?.unlocked)) continue;
          this.hostBroadcast({ t: 'os', l: lid, id: o.id, s: { ...(s || {}), open: true } });
          if (o.collider) o.collider.disabled = true;
        }
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
      lvl: this.levelId, cr: P.crouching, sp: P.sprinting, sw: P.swimming, dn: this.downed, dd: this.dead, hd: this.hidden, nt: this.notarget || undefined,
      hi: it ? it.id : null, fl: this.lights.on, fo: this.lights.focus, lt: this.held.lighterLit, hp: Math.round(this.stats.health),
      sn: Math.round(this.stats.sanity), iw: this.level ? this.level.waterAt(P.pos.x, P.pos.z) > P.pos.y + 0.4 : false,
      us: this.held.useT > 0 ? useAnim(it) : undefined, cl: this.classId || undefined, gr: this.gearIds(), wd: this.stats.hasStatus('inkward') || undefined,
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
        const it = sanitizeItem(m.item);
        if (!it || !LEVELS[m.l] || ![m.x, m.y, m.z].every(Number.isFinite)) break;
        const id = 'd' + hash4(this.time * 1000 | 0, Math.random() * 1e9 | 0).toString(36);
        const d = { id, kind: 'drop', item: it.id, qty: it.qty, data: it.data, x: m.x, y: m.y, z: m.z, ry: Math.random() * 6 };
        this.hostBroadcast({ t: 'dyn+', l: m.l, d });
        break;
      }
      case 'throw': {
        if (!LEVELS[m.l] || ![m.x, m.y, m.z, m.vx, m.vy, m.vz].every(Number.isFinite)) break;
        const id = 't' + hash4(this.time * 1000 | 0, Math.random() * 1e9 | 0).toString(36);
        const nade = m.type === 'grenade' || m.type === 'rqGrenade';
        const life = m.type === 'flare' ? 45 : m.type === 'glowstick' ? 120 : nade ? 3.1 : 15;
        const d = { id, kind: 'thrown', type: m.type, x: m.x, y: m.y, z: m.z, vx: m.vx, vy: m.vy, vz: m.vz, t0: this.time, life, owner: pid };
        this.hostBroadcast({ t: 'dyn+', l: m.l, d });
        if (nade) this.hostGrenade(m.l, d, pid);
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
      case 'cheat': this.hostCheat(pid, m); break;
      case 'call': this.hostCall(pid, m); break;
      case 'baseCmd': this.hostBaseCmd(pid, m); break;
      case 'claim': this.hostClaim(pid, m); break;
      case 'saveData': {
        const q = this._saveReq;
        if (!q || m.sid !== q.sid || !q.peers.has(pid) || q.got.has(pid)) break;
        q.got.set(pid, m.char ? sanitizeChar(m.char) : null);
        if (q.got.size >= q.peers.size) q.done();
        break;
      }
      case 'chat': {
        const text = String(m.text || '').slice(0, 200);
        if (text) this.hostBroadcast({ t: 'chat', from: pid, name: this.nameOf(pid), text });
        break;
      }
      case 'revive': this.hostSend(m.target, { t: 'revived', by: this.nameOf(pid) }); break;
      case 'role': {
        const r = this.roster.get(pid);
        if (r && typeof m.c === 'string' && Object.hasOwn(CLASSES, m.c)) { r.classId = m.c; if (!m.quiet) this.hostBroadcast({ t: 'sys', text: `${this.nameOf(pid)} is the team's ${CLASSES[m.c].name.toLowerCase()}.` }, true); }
        break;
      }
      case 'respawned': this.hostBroadcast({ t: 'sys', text: `${this.nameOf(pid)} respawned at the level entrance.` }, true, pid); break;
      case 'exitUsed': {
        LEVELS[m.to]?.hostArrive?.(this, pid, m.from);
        if (!m.tp) this.hostBroadcast({ t: 'sys', text: `${this.nameOf(pid)} went ${LEVEL_ORDER.indexOf(m.to) < LEVEL_ORDER.indexOf(m.from) ? 'back up' : 'deeper'} — ${LEVELS[m.to]?.name || ''}.` }, true);
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

  // Cheat console permission: always in solo; in co-op the host enables cheats
  // and may grant them to other players.
  canCheat(pid = this.myId) {
    if (!this.online) return true;
    if (!this.cheats.on) return false;
    return (this.isHost && pid === this.myId) || this.cheats.granted.has(pid);
  }

  hostSyncCheats(text) {
    this.hostBroadcast({ t: 'cheatPerm', on: this.cheats.on, ids: [...this.cheats.granted] }, false);
    if (text) this.hostBroadcast({ t: 'sys', text });
  }

  hostCheat(pid, m) {
    if (!this.canCheat(pid)) return;
    if (m.c === 'spawn' && ENTITY_TYPES[m.type]) {
      for (let i = 0; i < Math.min(8, m.n || 1); i++) this.entities.spawn(m.type, m.l, m.x + (Math.random() - 0.5) * 2, m.z + (Math.random() - 0.5) * 2);
    } else if (m.c === 'killall') {
      for (const e of this.entities.byLevel(m.l)) {
        if (e.state === 'dead') continue;
        const r = this.entities.damage(e.id, 1e9, 'cheat', pid);
        if (!r?.killed) { e.hp = 0; e.state = 'dead'; e.stateT = 0; e.stateChanged = true; }
      }
    } else if (m.c === 'tpPlayer' && m.to && LEVELS[m.to.l]) {
      this.hostSend(m.target, { t: 'tpTo', to: m.to, by: this.nameOf(pid) });
    } else if (m.c === 'flag' && typeof m.k === 'string') {
      this.hostBroadcast({ t: 'flag', l: m.l, k: m.k.slice(0, 32), v: !!m.v });
    }
  }

  nameOf(pid) { return pid === this.myId ? this.profile.name : (this.roster.get(pid)?.name || 'Wanderer'); }

  hostWelcome(pid, m) {
    const name = String(m.name || 'Wanderer').slice(0, 20);
    this.roster.set(pid, { name, skin: normalizeSkin(m.skin) });
    this.noteLootPlayers();
    const hostState = this.localState();
    this.session.sendTo(pid, {
      t: 'welcome', id: pid, seed: this.seed, difficulty: this.difficulty, friendlyFire: this.friendlyFire,
      world: this.world.serialize(), roster: [...this.roster.entries()], hostId: this.myId, hostName: this.profile.name, hostSkin: this.profile.skin,
      level: this.levelId, spawn: { x: hostState.x, y: hostState.y, z: hostState.z }, ht: this.time, run: this.runId,
    });
    this.hostBroadcast({ t: 'pinfo', id: pid, name, skin: normalizeSkin(m.skin) }, true, pid);
    if (this.cheats.on) this.hostSend(pid, { t: 'cheatPerm', on: true, ids: [...this.cheats.granted] });
    this.hostBroadcast({ t: 'sys', text: `${name} came through the machine.` });
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
        if (s.taken || o.mp > this.lootPlayers) return;
        set({ taken: true });
        this.hostSend(pid, { t: 'give', item: { id: o.item, qty: o.qty || 1 } });
        break;
      case 'drop':
        if (!this.world.getDyn(m.l, m.id)) return;
        this.hostBroadcast({ t: 'dyn-', l: m.l, id: m.id });
        this.hostSend(pid, { t: 'give', item: { id: o.item, qty: o.qty || 1, data: o.data } });
        break;
      case 'container': {
        const base = s.opened ? null : [...o.loot, ...(o.lootMp || []).filter(x => x.mp <= this.lootPlayers)];
        const loot = s.opened ? [...(s.loot || [])] : base.map(x => ({ item: x.item, qty: x.qty, data: ITEMS[x.item]?.data ? { ...ITEMS[x.item].data } : undefined }));
        if (m.a === 'open') set({ opened: true, loot });
        else if (m.a === 'take') {
          const it = loot[m.i];
          if (!it) return;
          loot.splice(m.i, 1);
          set({ opened: true, loot });
          this.hostSend(pid, { t: 'give', item: { id: it.item, qty: it.qty, data: it.data } });
        } else if (m.a === 'put' && m.item) {
          const it = sanitizeItem(m.item);
          if (!it || loot.length >= 48) return;
          loot.push({ item: it.id, qty: it.qty, data: it.data });
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
      case 'hatch':
        if (m.a === 'force' && !s.open) {
          const prog = Math.min(1, (s.prog || 0) + (m.bar ? 1 : 0.34));
          set({ prog, open: prog >= 1 });
          if (prog >= 1) this.hostEvent(m.l, { k: 'sound', name: 'metalDoor', x: o.x, y: 0.5, z: o.z, volume: 1 });
        }
        break;
      case 'gate': {
        if (m.a !== 'bash' || s.open || o.broken0) return;
        const hp = (s.hp ?? o.hp) - Math.max(0, Math.min(80, +m.d || 0));
        this.hostDamageGate(m.l, o, hp, pid);
        break;
      }
      case 'trader': {
        if (m.a !== 'trade') return;
        const offer = o.offers[m.i | 0];
        const dead = (this.world.flag(m.l, 'bk:' + o.base) || []).includes(o.post);
        if (!offer || s.traded || dead || this.world.flag(m.l, 'hostile:' + o.base)) { if (offer) this.hostSend(pid, { t: 'give', item: { id: offer[0], qty: offer[1] } }); return; }
        set({ traded: true });
        const def = ITEMS[offer[2]];
        this.hostSend(pid, { t: 'give', item: { id: offer[2], qty: offer[3], data: def?.data ? { ...def.data } : undefined } });
        this.hostEvent(m.l, { k: 'subtitle', text: ['"Did\'h smiles on fair trades."', '"Walk soft, stranger."', '"May you always find the warm places."'][hash4(o.post, 7) % 3], dur: 2.5 });
        break;
      }
      case 'baseVault':
        if (m.a === 'unlock' && !s.open) { set({ open: true }); if (o.collider) o.collider.disabled = true; this.hostEvent(m.l, { k: 'subtitle', text: 'The vault wheel spins and the door swings out.', dur: 2.5 }); }
        break;
      case 'vendor': {
        const sold = s.sold || 0;
        if (m.a !== 'buy' || sold >= o.stock) return;
        set({ sold: sold + 1, stock: o.stock - sold - 1 });
        const item = o.goods[sold] || 'snackBar';
        setTimeout(() => this.hostSend(pid, { t: 'give', item: { id: item, qty: 1, data: ITEMS[item]?.data ? { ...ITEMS[item].data } : undefined } }), 1000);
        break;
      }
      default:
        LEVELS[m.l]?.hostInteract?.(this, pid, o, s, m);
    }
  }

  // ------------------------------------------------------------------ base NPCs
  // Bring a base's garrison to life when a player comes near; put it away when
  // everyone has left. The dead stay dead (a per-base list in the world flags).
  hostBases(perLevel, dt) {
    this.baseNpcs ??= new Map();
    this.basesT = (this.basesT || 0) - dt;
    if (this.basesT > 0) return;
    this.basesT = 1;
    const live = new Set();
    for (const [lid, ctx] of perLevel) {
      const level = ctx.level;
      const cfg = level.def.bases;
      if (!cfg || cfg.faction === 'dd') continue;
      for (const p of ctx.players) for (const b of basesNear(level, p.x, p.z, 80)) {
        live.add(b.id);
        if (!this.baseNpcs.has(b.id)) this.spawnBaseNpcs(lid, b);
      }
    }
    for (const [id, rec] of this.baseNpcs) {
      if (live.has(id)) continue;
      const ctx = perLevel.get(rec.l);
      const L = rec.L;
      if (ctx && ctx.players.some(p => Math.hypot(p.x - L.cx, p.z - L.cz) < 150)) continue;
      for (const eid of rec.ids) { const e = this.entities.list.get(eid); if (e && e.state !== 'dead') this.entities.remove(eid); }
      this.baseNpcs.delete(id);
    }
  }

  spawnBaseNpcs(l, b) {
    const L = baseLayout(this.getLevel(l), b);
    const killed = this.world.flag(l, 'bk:' + b.id) || [];
    const ids = [];
    const rq = b.faction === 'rq';
    const hostile = !!this.world.flag(l, 'hostile:' + b.id);
    L.posts.forEach((post, k) => {
      if (killed.includes(k)) return;
      const [x, y, z, yaw, role, ri] = post;
      const r = new RNG(hash4(b.seed, k, 404));
      let weapon, gear = [0, 0, 0, 0, 0], nades = 0;
      if (rq) {
        weapon = role === 'sniper' ? 'rqSniper' : role === 'officer' || role === 'radio' ? 'rqPistol' : role === 'guard' ? (r.chance(0.75) ? 'rqRifle' : 'rqShotgun')
          : r.weighted([['rqRifle', 45], ['rqSmg', 20], ['rqPistol', 15], ['rqMachete', 12], ['rqBaton', 8]]);
        gear = [role === 'officer' ? 0 : r.chance(role === 'sniper' ? 1 : 0.5) ? 'ririqianHelmet' : 0, r.chance(role === 'officer' ? 1 : 0.35) ? 'ririqianVest' : 0, r.chance(0.15) ? 'ririqianGreaves' : 0, r.chance(0.6) ? 'ririqianBoots' : 0, 0];
        nades = role !== 'sniper' && r.chance(0.3) ? 1 : 0;
      } else weapon = r.weighted([['pistol', 35], ['knife', 35], ['shotgun', 15], ['crowbar', 15]]);
      const room = L.rooms[ri];
      const ey = role === 'sniper' && room?.role === 'watch' ? L.Y + 1.2 : y;
      const e = this.entities.spawn(rq ? 'ririqian' : 'didh', l, x, z, {
        y: ey, yaw, hpMul: role === 'officer' ? 1.3 : 1,
        npc: { base: b.id, post: k, role, weapon, gear, faction: b.faction, nades, skin: hash4(b.seed, k, 7) % 100000, home: { x, z, yaw } },
      });
      if (!e) return;
      if (hostile) e.hostile = true;
      ids.push(e.id);
    });
    this.baseNpcs.set(b.id, { l, L, ids, b });
  }

  baseMates(e, R = 45) {
    const rec = this.baseNpcs?.get(e.npc.base);
    if (!rec) return [];
    return rec.ids.map(id => this.entities.list.get(id)).filter(o => o && o.state !== 'dead' && o !== e && (rec.L.alarmed || Math.hypot(o.x - e.x, o.z - e.z) < R));
  }

  // One soldier sees you: he opens up, and everyone nearby joins in. Big bases sound the alarm.
  hostNpcAlert(e, p) {
    e.target = p.id; e.lastSeen = { x: p.x, z: p.z, t: this.time };
    setStateNpc(e, 'combat');
    for (const o of this.baseMates(e)) {
      if (o.state === 'combat' || o.state === 'aim' || o.state === 'strike') continue;
      if (o.npc.faction === 'didh' && !o.hostile) continue;
      o.target = p.id; o.lastSeen = { x: p.x, z: p.z, t: this.time };
      setStateNpc(o, Math.hypot(o.x - p.x, o.z - p.z) < 30 ? 'combat' : 'search');
    }
    const rec = this.baseNpcs.get(e.npc.base);
    if (rec?.L.alarmed && !this.world.flag(e.levelId, 'seized:' + e.npc.base)) {
      const t = this.world.flag(e.levelId, 'alarm:' + e.npc.base);
      if (!t || this.time - t > 45) {
        this.hostBroadcast({ t: 'flag', l: e.levelId, k: 'alarm:' + e.npc.base, v: this.time });
        this.hostEvent(e.levelId, { k: 'subtitle', text: 'A siren starts to wail.', dur: 2.5, cls: 'scare' });
      }
    }
  }

  // RuckyOS admin commands: the passphrase is checked here, on the host.
  hostBaseCmd(pid, m) {
    const lvl = LEVELS[m.l] && this.getLevel(m.l);
    const b = lvl && baseById(lvl, m.base);
    if (!b || b.faction !== 'rq' || typeof m.pw !== 'string' || m.pw !== basePasswords(b.seed).admin) return;
    if (m.cmd === 'alarmOff') this.hostBroadcast({ t: 'flag', l: m.l, k: 'alarm:' + b.id, v: 0 });
    else if (m.cmd === 'alarmOn') {
      this.hostBroadcast({ t: 'flag', l: m.l, k: 'alarm:' + b.id, v: this.time });
      // the garrison comes to see who pressed it
      const p = this.playerTargetById(pid);
      const rec = this.baseNpcs?.get(b.id);
      if (p && rec) for (const id of rec.ids) { const e = this.entities.list.get(id); if (e && e.state !== 'dead' && e.state !== 'combat') { e.lastSeen = { x: p.x, z: p.z, t: this.time }; setStateNpc(e, 'search'); } }
    } else if (m.cmd === 'vault' && typeof m.vault === 'string') {
      const o = this.findObject(m.l, m.vault);
      if (!o || o.kind !== 'baseVault' || o.base !== b.id) return;
      const s = this.world.get(m.l, o.id) || {};
      if (s.open) return;
      this.hostBroadcast({ t: 'os', l: m.l, id: o.id, s: { open: true } });
      if (o.collider) o.collider.disabled = true;
      this.hostEvent(m.l, { k: 'sound', name: 'metalDoor', x: o.x, y: 1, z: o.z, volume: 1 });
    }
  }

  hostNpcHurt(e, from) {
    if (e.npc.faction === 'didh' && !e.hostile) {
      // strike one Wanderer and the whole camp remembers
      this.hostBroadcast({ t: 'flag', l: e.levelId, k: 'hostile:' + e.npc.base, v: true });
      e.hostile = true;
      for (const o of this.baseMates(e, 999)) o.hostile = true;
      this.hostEvent(e.levelId, { k: 'subtitle', text: 'The Wanderers draw their weapons.', dur: 2.5, cls: 'scare' });
    }
    const p = this.playerTargetById(from);
    if (p && (e.npc.faction === 'rq' || e.hostile)) this.hostNpcAlert(e, p);
  }

  // A shot from an NPC: roll to hit against range, movement and stance.
  hostNpcShoot(e, p, G) {
    const lvl = this.getLevel(e.levelId);
    const fx = Math.sin(e.yaw), fz = Math.cos(e.yaw);
    const mx = e.x + fx * 0.5, my = e.y + 1.42, mz = e.z + fz * 0.5;
    const tx = p.x, ty = p.y + (p.crouch ? 0.9 : 1.25), tz = p.z;
    const d = Math.hypot(tx - mx, tz - mz);
    const diff = this.difficulty === 'easy' ? 0.75 : this.difficulty === 'hard' ? 1.2 : 1;
    let acc = G.acc * diff - (d / G.range) * 0.35 - (p.sprint ? 0.15 : 0) - (p.crouch ? 0.08 : 0);
    acc = Math.max(0.06, Math.min(0.92, acc));
    const clear = lvl.lineOfSight(mx, my, mz, tx, ty, tz);
    const hit = clear && Math.random() < acc;
    let ix = tx, iy = ty, iz = tz, n = null;
    if (!hit) {
      // a miss: past the target into whatever is behind
      const ox = (Math.random() - 0.5) * 2.4, oy = (Math.random() - 0.3) * 1.2;
      const dx = tx + Math.cos(e.yaw) * ox - mx, dy = ty + oy - my, dz = tz - Math.sin(e.yaw) * ox - mz;
      const len = Math.hypot(dx, dy, dz) || 1;
      const r = lvl.raycast(mx, my, mz, dx / len, dy / len, dz / len, G.range * 1.4);
      if (r) { ix = r.x; iy = r.y; iz = r.z; n = [+r.nx.toFixed(2), +r.ny.toFixed(2), +r.nz.toFixed(2)]; }
      else { ix = mx + dx / len * 40; iy = my + dy / len * 40; iz = mz + dz / len * 40; }
    } else this.hostHurt(p.id, G.dmg * (G.burst > 1 ? 1 : 1), { from: e, type: e.npc.faction === 'rq' ? 'rq' : 'didh', scare: 4 });
    this.noises.push({ x: e.x, y: e.y, z: e.z, r: 30, l: e.levelId, pid: 'npc' });
    this.hostEvent(e.levelId, { k: 'npcShot', w: G.sound, x: +mx.toFixed(2), y: +my.toFixed(2), z: +mz.toFixed(2), tx: +ix.toFixed(2), ty: +iy.toFixed(2), tz: +iz.toFixed(2), n, h: hit ? 1 : 0, id: p.id });
  }

  hostNpcGrenade(e, at) {
    const dx = at.x - e.x, dz = at.z - e.z, d = Math.hypot(dx, dz) || 1;
    const sp = Math.min(13, 4 + d * 0.55);
    const id = 't' + hash4(this.time * 1000 | 0, e.id).toString(36);
    const dd = { id, kind: 'thrown', type: 'rqGrenade', x: e.x, y: e.y + 1.5, z: e.z, vx: dx / d * sp, vy: 3.2, vz: dz / d * sp, t0: this.time, life: 3.1, owner: 'npc' };
    this.hostBroadcast({ t: 'dyn+', l: e.levelId, d: dd });
    this.hostGrenade(e.levelId, dd, 'npc');
    this.hostEvent(e.levelId, { k: 'subtitle', text: 'Something clatters across the floor toward you.', dur: 1.8, cls: 'scare' });
  }

  // A garrison member dies: drop their gear, remember the death, maybe seize the base.
  hostNpcKilled(e) {
    const N = e.npc, l = e.levelId;
    const killed = [...(this.world.flag(l, 'bk:' + N.base) || [])];
    if (!killed.includes(N.post)) killed.push(N.post);
    this.hostBroadcast({ t: 'flag', l, k: 'bk:' + N.base, v: killed });
    const drop = (item, qty, data) => { const a = Math.random() * 6.28; this.hostDropItemData(l, item, qty, e.x + Math.cos(a) * 0.5, e.z + Math.sin(a) * 0.5, data); };
    if (N.weapon) drop(N.weapon, 1, ITEMS[N.weapon]?.data ? { ...ITEMS[N.weapon].data, ...(NPC_ARMS[N.weapon]?.mag ? { ammo: Math.max(0, Math.min(ITEMS[N.weapon].data.ammo ?? 0, e.mag)) } : {}) } : undefined);
    const ammo = ITEMS[N.weapon]?.weapon && !NPC_ARMS[N.weapon]?.melee ? ({ rqRifle: 'rifleAmmo', rqSmg: 'ammo9', rqPistol: 'ammo9', rqShotgun: 'shells', rqSniper: 'sniperAmmo', pistol: 'ammo9', shotgun: 'shells' })[N.weapon] : null;
    if (ammo && Math.random() < 0.7) drop(ammo, ammo === 'sniperAmmo' ? 3 : ammo === 'shells' ? 4 : 10 + (Math.random() * 10 | 0));
    for (const g of N.gear || []) if (g && Math.random() < 0.35) drop(g, 1, { dur: 40 + Math.random() * 40 | 0 });
    if (N.role === 'officer') { const rec = this.baseNpcs.get(N.base); if (rec?.L.rooms.some(r => r.role === 'vault')) drop('vaultKey', 1); if (Math.random() < 0.5) drop('goldBar', 1 + (Math.random() * 2 | 0)); }
    if (e.nades > 0) drop('rqGrenade', e.nades);
    if (N.faction === 'didh' && Math.random() < 0.4) drop('didhCharm', 1);
    // every post dead: the base is yours
    const rec = this.baseNpcs.get(N.base);
    if (rec && rec.L.posts.every((p, k) => killed.includes(k)) && !this.world.flag(l, 'seized:' + N.base)) {
      this.hostBroadcast({ t: 'flag', l, k: 'seized:' + N.base, v: true });
      this.hostBroadcast({ t: 'flag', l, k: 'alarm:' + N.base, v: 0 });
      const lp = this.lastPerLevel?.get(l)?.players.find(p => p.id === e.lastHitBy);
      this.hostBroadcast({ t: 'sys', text: N.faction === 'rq' ? `The Ririqian ${rec.b.size === 'city' ? 'stronghold' : rec.b.size === 'large' ? 'base' : 'outpost'} falls silent. ${lp ? this.nameOf(e.lastHitBy) : 'Someone'} has seized it.` : 'The Wanderer camp is empty now.' });
    }
  }

  hostDropItemData(l, item, qty, x, z, data) {
    const lvl = this.getLevel(l);
    let y = lvl.floorAt(x, z);
    if (!isFinite(y)) y = lvl.floorAt(Math.round(x), Math.round(z));
    if (!isFinite(y)) return;
    const id = 'd' + hash4(this.time * 1000 | 0, Math.random() * 1e9 | 0).toString(36);
    this.hostBroadcast({ t: 'dyn+', l, d: { id, kind: 'drop', item, qty, data, x, y: y + 0.02, z, ry: Math.random() * 6 } });
  }

  // Host: work out where a thrown grenade will be when its fuse runs out (the
  // same physics every client runs), then blow it up there.
  hostGrenade(l, d, pid, fuse = 3) {
    const t = { d: { ...d, l }, pos: new THREE.Vector3(d.x, d.y, d.z), vel: new THREE.Vector3(d.vx, d.vy, d.vz), rest: false, spin: new THREE.Vector3() };
    for (let k = 0; k < fuse / 0.02; k++) this.objects._physics(t, 0.02);
    setTimeout(() => {
      this.hostBroadcast({ t: 'dyn-', l, id: d.id });
      this.hostExplode(l, { x: t.pos.x, y: t.pos.y + 0.15, z: t.pos.z }, pid);
    }, fuse * 1000);
  }

  hostDamageGate(l, o, hp, pid) {
    if (hp <= 0) {
      this.hostBroadcast({ t: 'os', l, id: o.id, s: { open: true, hp: 0 } });
      if (o.collider) o.collider.disabled = true;
      this.hostEvent(l, { k: 'sound', name: 'crumble', x: o.x, y: 1, z: o.z, volume: 1.2 });
      this.hostEvent(l, { k: 'subtitle', text: 'The gate tears loose and crashes down.', dur: 2.5 });
      this.noises.push({ x: o.x, y: 1, z: o.z, r: 40, l, pid });
    } else this.hostBroadcast({ t: 'os', l, id: o.id, s: { hp, hitT: performance.now() } });
    // the garrison hears the gate being battered
    const rec = this.baseNpcs?.get(o.base);
    if (rec) for (const id of rec.ids) {
      const e = this.entities.list.get(id);
      if (!e || e.state === 'dead' || e.state === 'combat' || Math.hypot(e.x - o.x, e.z - o.z) > 40) continue;
      if (e.npc.faction === 'didh') continue;
      e.lastSeen = { x: o.x, z: o.z, t: this.time }; setStateNpc(e, 'search');
    }
  }

  // Host: an explosion. Damage falls off with distance and walls stop it.
  hostExplode(l, p, pid, R = 7.5, D = 150) {
    const lvl = this.getLevel(l);
    this.hostEvent(l, { k: 'explode', x: +p.x.toFixed(2), y: +p.y.toFixed(2), z: +p.z.toFixed(2), r: R });
    this.noises.push({ x: p.x, y: p.y, z: p.z, r: NOISE.grenade, l, pid });
    for (const e of this.entities.byLevel(l)) {
      if (e.state === 'dead') continue;
      const dist = Math.hypot(e.x - p.x, e.y + 0.8 - p.y, e.z - p.z);
      if (dist > R || !lvl.lineOfSight(p.x, p.y, p.z, e.x, e.y + 0.8, e.z)) continue;
      const res = this.entities.damage(e.id, D * Math.pow(1 - dist / R, 1.3) + 12, 'explosive', pid);
      if (res?.killed && (this.roster.has(pid) || pid === this.myId)) {
        this.hostSend(pid, { t: 'kill', e: e.id, type: e.type });
        if (e.def.announceKill) this.hostBroadcast({ t: 'sys', text: `${this.nameOf(pid)} blew up ${ENTITY_TYPES[e.type]?.name}.` });
      }
    }
    // gates in the blast
    for (let cz = Math.floor((p.z - R) / CHUNK); cz <= Math.floor((p.z + R) / CHUNK); cz++) for (let cx = Math.floor((p.x - R) / CHUNK); cx <= Math.floor((p.x + R) / CHUNK); cx++) {
      if (!lvl.hasChunk(cx, cz)) continue;
      for (const o of lvl.chunk(cx, cz).objects) {
        if (o.kind !== 'gate' || o.broken0) continue;
        const s = this.world.get(l, o.id) || {};
        const dist = Math.hypot(o.x - p.x, o.z - p.z);
        if (s.open || dist > R) continue;
        this.hostDamageGate(l, o, (s.hp ?? o.hp) - 260 * (1 - dist / R), pid);
      }
    }
    for (const q of this.playerTargets()) {
      if (q.levelId !== l || (q.dead && !q.downed)) continue;
      const dist = Math.hypot(q.x - p.x, q.y + 0.9 - p.y, q.z - p.z);
      if (dist > R || !lvl.lineOfSight(p.x, p.y, p.z, q.x, q.y + 1.0, q.z)) continue;
      const k = 6 * (1 - dist / R) / Math.max(0.5, Math.hypot(q.x - p.x, q.z - p.z));
      this.hostHurt(q.id, (D * Math.pow(1 - dist / R, 1.3) + 8) * 0.8, { from: { x: p.x, z: p.z }, type: 'blast', scare: 25, push: { x: (q.x - p.x) * k, z: (q.z - p.z) * k, y: 2 * (1 - dist / R) } });
    }
  }

  // Host: put an item on the floor (entity drops).
  hostDropItem(l, item, qty, x, z) {
    const lvl = this.getLevel(l);
    const y = lvl.floorAt(x, z);
    if (!isFinite(y)) return;
    const id = 'd' + hash4(this.time * 1000 | 0, Math.random() * 1e9 | 0).toString(36);
    this.hostBroadcast({ t: 'dyn+', l, d: { id, kind: 'drop', item, qty, x, y: y + 0.02, z, ry: Math.random() * 6 } });
  }

  // Someone dialled a phone. Only one number answers — and it comes to you.
  hostCall(pid, m) {
    if (m.n !== '1143141967' || !LEVELS[m.l]) return;
    if (this.entities.byLevel(m.l).some(e => e.type === 'deedee' && e.state !== 'dead')) return;
    const ctx = this.lastPerLevel?.get(m.l);
    const target = ctx?.players.find(p => p.id === pid) || { x: m.x, z: m.z };
    let pos = ctx && this.director.findSpawn(ctx, 14, 24, null, target, false);
    if (!pos) pos = this.getLevel(m.l).randomWalkableNear(m.x, m.z, 16);
    if (!pos) return;
    const e = this.entities.spawn('deedee', m.l, pos.x, pos.z);
    if (e) e.caller = pid;
    setTimeout(() => this.hostEvent(m.l, { k: 'sound', name: 'paleVanish', x: pos.x, y: 1, z: pos.z, volume: 0.6 }), 200);
  }

  syncDoorCollider(l, o, open) {
    if (o.collider) o.collider.disabled = open;
  }

  // ---------------------------------------------------------------- client handlers
  clientHandle(m) {
    switch (m.t) {
      case 'saveReq':
        if (typeof m.sid === 'string' && m.sid.length <= 32) this.request({ t: 'saveData', sid: m.sid, char: this.levelId && this.levelId !== 'P0' ? this.captureChar() : null });
        break;
      case 'saveTok': if (m.run === this.runId) setToken(this.runId, m.tok); break;
      case 'restore': this.clientRestore(m); break;
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
            this.noteLootPlayers();
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
      case 'flag': this.world.setFlag(m.l, m.k, m.v); LEVELS[m.l]?.onFlag?.(this, m.l, m.k, m.v); break;
      case 'cheatPerm':
        if (!this.isHost) {
          const had = this.canCheat();
          this.cheats.on = !!m.on; this.cheats.granted = new Set(m.ids || []);
          if (had !== this.canCheat()) this.subtitle(this.canCheat() ? 'The host granted you the cheat console ( ` ).' : 'Your cheat console access was revoked.', 3);
          if (!this.canCheat()) { this.cheatGod = false; this.notarget = false; this.player.fly = false; this.player.noclip = false; this.player.speedMul = 1; }
        }
        break;
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
        this.noteLootPlayers();
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
        if (this.dead) this.respawn(m.lvl);
        break;
      case 'victory': this.victory(m.by); break;
      case 'tpTo':
        if (this.dead) this.respawn();
        this.subtitle(`${m.by} moved you.`, 2);
        this.travelTo(m.to.l, m.to.x !== undefined ? { x: m.to.x + 0.8, y: m.to.y, z: m.to.z + 0.8 } : null);
        break;
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
    } else if (m.k === 'npcShot') {
      const a = new THREE.Vector3(m.x, m.y, m.z), b = new THREE.Vector3(m.tx, m.ty, m.tz);
      this.sfx(m.w, a, { volume: 1, ref: 6, maxDist: 140 });
      this.effects.tracer(a, b);
      this.effects.flash(a, 0.5, 0.05);
      this.lights.muzzle?.(a);
      if (m.n) this.effects.bulletHole(b, { x: m.n[0], y: m.n[1], z: m.n[2] });
      // rounds cracking past you
      if (!m.h && m.id === this.myId) {
        const cam = this.engine.camera.position, ab = b.clone().sub(a), t = Math.max(0, Math.min(1, cam.clone().sub(a).dot(ab) / ab.lengthSq()));
        if (a.clone().addScaledVector(ab, t).distanceTo(cam) < 2.5) { this.sfx('whizz', null, { volume: 0.8 }); this.player.shake = Math.min(1, this.player.shake + 0.15); this.stats.scare(1.5); }
      }
    } else if (m.k === 'explode') {
      const p = new THREE.Vector3(m.x, m.y, m.z);
      const d = this.player.pos.distanceTo(p);
      this.sfx('explosion', p, { volume: 1.4, ref: 10, maxDist: 160 });
      this.effects.flash(p, 6, 0.25);
      for (let i = 0; i < 18; i++) this.effects.burst(i % 3 ? 'smoke' : 'ember', { x: m.x + (Math.random() - 0.5) * 1.5, y: m.y + Math.random() * 1.5, z: m.z + (Math.random() - 0.5) * 1.5 });
      this.lights.muzzle?.(p);
      this.player.shake = Math.min(1, this.player.shake + Math.max(0, 1.2 - d / 20));
      if (d < 12) audio.setMuffle(0.7), setTimeout(() => audio.setMuffle(this.hidden ? 0.55 : 0), 1800);
      const f = this.level.floorAt(m.x, m.z);
      if (isFinite(f) && m.y - f < 1.2) this.effects.scorch({ x: m.x, y: f, z: m.z });
    } else if (m.k === 'shake') {
      this.player.shake = Math.min(1, this.player.shake + (m.a || 0.5));
    } else this.def?.clientEvent?.(this, m);
  }

  clientFx(m) {
    if (m.l !== this.levelId) return;
    if (m.k === 'shot') {
      const p = new THREE.Vector3(m.x, m.y, m.z);
      this.sfx(m.w, p, { volume: 1, ref: 6 });
      this.effects.flash(p, (m.fl || 0.4) * 0.5, 0.05);
      this.lights.muzzle(p);
      if (m.fx !== undefined) this.effects.burst('muzzleSmoke', p, { x: m.fx, y: m.fy, z: m.fz });
      for (const im of m.im || []) {
        const ip = new THREE.Vector3(im[0], im[1], im[2]);
        this.effects.tracer(p, ip);
        if (im[3] === 'e') this.effects.burst(im[4] || 'blood', ip, { x: 0, y: 0.5, z: 0 }, 0.6);
        else if (im.length >= 6) {
          const n = { x: im[3], y: im[4], z: im[5] };
          this.effects.burst('impact', ip, n, 0.7);
          this.effects.bulletHole(ip, n);
          if (Math.random() < 0.3) this.sfx('ricochet', ip, { volume: 0.4 });
        }
      }
    } else if (m.k === 'melee') {
      const ip = { x: m.x, y: m.y, z: m.z };
      this.effects.burst(m.b || 'impact', ip, { x: 0, y: 0.5, z: 0 }, 0.5);
      this.sfx(m.b === 'bone' ? 'hitBone' : m.b ? 'hitFlesh' : 'hitWall', ip, { volume: 0.6 });
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

  // ---------------------------------------------------------------- saves
  // Why the game can't be saved right now (or null).
  saveBlocked() {
    if (this.online && !this.isHost) return 'Only the host can save a co-op game.';
    if (!this.levelId || this.levelId === 'P0') return 'You can\'t save during the prologue.';
    if (this.transitioning) return 'Wait until you arrive.';
    if (this.won) return 'The run is over.';
    if (this.dead || this.downed) return 'You can\'t save while you\'re down.';
    if (this.hidden) return 'Get out of hiding first.';
    return null;
  }

  // The local player's character, ready for a save.
  captureChar() {
    const P = this.player, S = this.stats;
    const copy = it => (it ? { id: it.id, qty: it.qty, data: it.data ? { ...it.data } : undefined } : null);
    return {
      classId: this.classId || null,
      inv: this.inventory.serialize(),
      gear: Object.fromEntries(GEAR_SLOTS.map(k => [k, copy(this.gear[k])])),
      stats: { ...S.serialize(), status: { ...S.status }, bleeding: S.bleeding, regen: S.regen, staminaBoost: S.staminaBoost },
      journal: [...this.journal],
      level: this.levelId,
      pos: { x: P.pos.x, y: P.pos.y, z: P.pos.z }, yaw: P.yaw,
      stats0: { kills: this.stats0.kills, deaths: this.stats0.deaths, notes: this.stats0.notes, levels: this.stats0.levels, playMs: performance.now() - this.stats0.startTime },
    };
  }

  // Apply a (sanitized) character to the local player.
  applyChar(c) {
    applyClassMods(this, c.classId);
    const inv = this.inventory;
    inv.load(c.inv);
    inv.holsters = c.classId ? Math.min(c.inv.holsters, CLASSES[c.classId].holsters || 0) : 0;
    for (const k of GEAR_SLOTS) this.gear[k] = c.gear[k] ? { ...c.gear[k], data: c.gear[k].data ? { ...c.gear[k].data } : undefined } : null;
    inv.extra = this.gear.pack ? Math.min(EXTRA_SLOTS, ITEMS[this.gear.pack.id].pack?.slots || 0) : 0;
    // anything sitting where it may not (a gun-only holster, a pack slot that no longer exists) is re-added
    const loose = [];
    for (let i = 0; i < inv.slots.length; i++) { const it = inv.slots[i]; if (it && !inv.canPlace(i, it.id)) { loose.push(it); inv.slots[i] = null; } }
    for (const it of loose) inv.add(it);
    if (!inv.isHot(inv.selected)) inv.selected = 0;
    const S = this.stats, st = c.stats;
    S.health = st.health; S.hunger = st.hunger; S.thirst = st.thirst; S.sanity = st.sanity; S.stamina = st.stamina;
    S.bleeding = st.bleeding; S.regen = st.regen; S.staminaBoost = st.staminaBoost; S.status = { ...st.status };
    this.journal = [...c.journal];
    Object.assign(this.stats0, { kills: c.stats0.kills, deaths: c.stats0.deaths, notes: c.stats0.notes, levels: c.stats0.levels, startTime: performance.now() - c.stats0.playMs });
    this.applyArmorMods();
    this.held?.cancel();
    inv.changed();
    this.hud.armorChanged?.(this);
    if (this.online && c.classId) this.request({ t: 'role', c: c.classId, quiet: true });
  }

  // Host / solo: restore a whole (sanitized) save before entering its level.
  applySave(save) {
    this.runId = save.id;
    this.saveName = save.name;
    this.time = save.time;
    this.world.load(save.world);
    this.savedPlayers = save.players.map(p => ({ ...p, claimed: null }));
    this.applyChar(save.host);
  }

  // Host: this client's character token (made and sent privately on first use).
  tokenFor(pid) {
    let t = this.saveTokens.get(pid);
    if (!t) {
      t = randomHex(16);
      this.saveTokens.set(pid, t);
      this.hostSend(pid, { t: 'saveTok', run: this.runId, tok: t });
    }
    return t;
  }

  // Host: ask every client for its character; resolves after all answer or 3 s.
  collectChars() {
    const peers = [...this.session.peers.keys()].filter(pid => pid !== this.myId);
    if (!this.online || !peers.length) return Promise.resolve(new Map());
    const sid = randomHex(8), got = new Map();
    return new Promise(res => {
      const done = () => { if (this._saveReq?.sid === sid) { this._saveReq = null; res(got); } };
      this._saveReq = { sid, peers: new Set(peers), got, done };
      for (const pid of peers) this.hostSend(pid, { t: 'saveReq', sid });
      setTimeout(done, 3000);
    });
  }

  async buildSave(name) {
    const why = this.saveBlocked();
    if (why) return { error: why };
    const players = [];
    if (this.online) {
      const chars = await this.collectChars();
      for (const [pid, char] of chars) if (char) players.push({ token: this.tokenFor(pid), name: this.nameOf(pid), char });
    }
    // characters from the loaded save whose owners aren't here right now (kept even in solo)
    for (const p of this.savedPlayers) {
      if (players.some(q => q.token === p.token)) continue;
      if (p.claimed && this.session.peers.has(p.claimed)) continue;
      players.push({ token: p.token, name: p.name, char: p.char });
    }
    const level = this.def;
    const raw = {
      magic: SAVE_MAGIC, v: SAVE_VERSION, id: this.runId, mode: this.online || players.length ? 'coop' : 'solo',
      name: name || `${level?.name || ''} · ${new Date().toLocaleDateString()}`, saved: Date.now(),
      seed: this.seed, seedLabel: String(this.seedLabel ?? ''), difficulty: this.difficulty, friendlyFire: this.friendlyFire,
      time: this.time, hostName: this.profile.name, host: this.captureChar(), players, world: this.world.serialize(),
    };
    // the same validation every load goes through
    const save = sanitizeSave(JSON.parse(JSON.stringify(raw)));
    return save ? { save } : { error: 'Could not build the save.' };
  }

  async saveToSlot(slot, name) {
    const r = await this.buildSave(name);
    if (r.error) return r.error;
    return writeSlot(slot, r.save);
  }

  autoSave() {
    if (!settings.get('autosave') || this.saveBlocked() || this._autoSaving) return;
    this._autoSaving = true;
    this.saveToSlot(this.online ? 'auto-coop' : 'auto', 'Autosave').then(err => {
      this._autoSaving = false;
      if (!err) this.hud.toast('Game saved', 1.5);
    });
  }

  // Host: a client presents its token to reclaim its saved character (one try per connection).
  hostClaim(pid, m) {
    if (pid === this.myId || this.claimTried.has(pid)) return;
    this.claimTried.add(pid);
    const p = isToken(m.tok) && this.savedPlayers.find(q => !q.claimed && tokenEq(q.token, m.tok));
    if (!p) { this.hostSend(pid, { t: 'restore', none: true }); return; }
    p.claimed = pid;
    this.saveTokens.set(pid, p.token);
    this.hostSend(pid, { t: 'restore', char: p.char });
    this.hostBroadcast({ t: 'sys', text: `${this.nameOf(pid)} picks up where they left off.` });
  }

  // Client: after joining, try to reclaim my character for this run.
  clientClaim() {
    const tok = getToken(this.runId);
    if (tok) { this.awaitingRestore = true; this.request({ t: 'claim', tok }); setTimeout(() => { if (this.awaitingRestore && this.running) { this.awaitingRestore = false; if (this.levelId !== 'P0') this.promptRole(); } }, 8000); }
    else if (this.levelId !== 'P0') this.promptRole();
  }

  clientRestore(m) {
    if (!this.awaitingRestore) return;
    this.awaitingRestore = false;
    if (!m.char) { if (this.levelId !== 'P0') this.promptRole(); return; }
    const c = sanitizeChar(m.char);
    this.applyChar(c);
    this.subtitle('You pick up where you left off.', 3);
    if (c.level && c.pos) this.travelTo(c.level, c.pos);
    if (!c.classId) this.promptRole();
  }

  dispose() {
    this.running = false;
    this.sceneDef?.teardownScene?.(this);
    settings.off('change:quality', this.onQuality);
    settings.off('change:brightness', this.onBrightness);
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
    for (const l of this.lights.remote) scene.remove(l, l.target);
    this.engine.camera.remove(this.viewmodel.root);
    this.buzz?.stop();
    this.draft?.stop();
    audio.stopAll();
    worldUniforms.bakedScale.value = 1;
  }
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function useAnim(it) {
  const snd = it && ITEMS[it.id]?.sound;
  return snd === 'drink' ? 'drink' : snd === 'bandage' ? 'bandage' : 'eat';
}

function setStateNpc(e, s) { if (e.state !== s) { e.state = s; e.stateT = 0; e.stateChanged = true; } }
