// Escape the Goanrooms II — entry point. Boots the engine, runs the attract
// mode behind the main menu, and starts solo / hosted / joined games.
import * as THREE from 'three';
import { Engine } from './core/engine.js';
import { input } from './core/input.js';
import { settings } from './core/settings.js';
import { hashString } from './core/rng.js';
import { MaterialLib, buildDecalAtlas, patchBaked } from './gfx/materials.js';
import { LightManager } from './gfx/lights.js';
import { LevelInstance } from './world/level.js';
import { WorldRenderer } from './world/renderer.js';
import { LEVELS, FIRST_LEVEL } from './world/levels/index.js';
import { Game } from './game/game.js';
import { Session } from './net/session.js';
import { UI } from './ui/ui.js';
import { buildSettings, Customizer } from './ui/menus.js';
import { CheatConsole } from './ui/console.js';
import { Lobby, randomSeedWord } from './ui/lobby.js';
import { normalizeSkin, randomSkin } from './game/avatar.js';
import { audio } from './audio/audio.js';

const $ = id => document.getElementById(id);

// dev: ?quality=low|medium|high overrides the saved preset for this session
{
  const q = new URLSearchParams(location.search).get('quality');
  if (q && ['low', 'medium', 'high'].includes(q)) settings.data.quality = q;
}

class App {
  constructor() {
    this.engine = new Engine($('stage'));
    input.attach(this.engine.canvas);
    this.lib = new MaterialLib(this.engine);
    this.ui = new UI();
    this.game = null;
    this.lobby = new Lobby(this);
    this.customizer = new Customizer(skin => this.onSkinSaved(skin));
    this.console = new CheatConsole(this.ui);
    this.attract = null;
    this.screenStack = [];
    if (!settings.get('skin')) settings.set('skin', normalizeSkin(randomSkin()));
    if (!settings.get('playerName')) settings.set('playerName', 'Wanderer-' + Math.floor(Math.random() * 900 + 100));
    this.params = new URLSearchParams(location.search);
    this.bindMenu();
    this.bindKeys();
    this.engine.onQualityChange = () => { if (this.lib.texSize !== this._texSize) { /* textures regenerate lazily on next level */ } };
    input.onLockChange = locked => this.onLockChange(locked);
  }

  async boot() {
    this.ui.loading(true, 'ESCAPE THE GOANROOMS II', 'Painting wallpaper…');
    const decal = new THREE.MeshStandardMaterial({ map: buildDecalAtlas(), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, roughness: 0.95, alphaTest: 0.02 });
    this.lib.register('decals', patchBaked(decal, { variation: 0 }));
    await this.lib.warm(LEVELS[FIRST_LEVEL].materials, p => this.ui.loadingProgress(p * 0.9, 'Painting wallpaper…'));
    this.startAttract();
    this.ui.loadingProgress(1, 'Ready');
    this.ui.loading(false);
    this.engine.start(dt => this.update(dt));
    // dev shortcuts: ?solo=1&level=L1&seed=X
    if (this.params.get('solo')) this.startSolo(this.params.get('seed') || undefined, this.params.get('level') || undefined);
    else this.showScreen('menu');
  }

  // ------------------------------------------------------------------ menu
  bindMenu() {
    $('btnSolo').onclick = () => { audio.init(); this.startSolo(); };
    $('btnHost').onclick = () => { audio.init(); this.lobby.openHost(); };
    $('btnJoin').onclick = () => { audio.init(); this.lobby.openJoin(); };
    $('btnCustomize').onclick = () => { audio.init(); this.showScreen('customize'); this.customizer.open(); };
    $('btnCustomDone').onclick = () => { this.customizer.close(); this.showScreen('menu'); };
    $('btnSettings').onclick = () => this.openSettings();
    $('btnSettingsDone').onclick = () => this.closeSettings();
    $('btnHelp').onclick = () => this.showScreen('help');
    $('btnHelpDone').onclick = () => (this.game ? (this.ui.screen('help', false), this.ui.open.delete('help'), this.ui.pause(this.game)) : this.showScreen('menu'));
    this.ui.onSettings = () => { this.ui.closeModal('pause', false); this.openSettings(true); };
    this.ui.onHelp = () => { this.ui.closeModal('pause', false); this.ui.open.add('help'); this.ui.screen('help', true); };
    this.ui.onQuit = () => this.quitToMenu();
    document.addEventListener('click', () => audio.init(), { once: true });
  }

  showScreen(id) {
    for (const s of ['menu', 'customize', 'lobby', 'settings', 'help']) this.ui.screen(s, s === id);
    if (id === 'menu') audio.ready && !this.game && audio.setAmbience('menu');
  }

  openSettings(inGame = false) {
    buildSettings($('settingsFields'));
    this.settingsInGame = inGame;
    if (inGame) { this.ui.open.add('settings'); this.ui.screen('settings', true); }
    else this.showScreen('settings');
  }
  closeSettings() {
    if (this.settingsInGame) { this.ui.open.delete('settings'); this.ui.screen('settings', false); this.ui.pause(this.game); }
    else this.showScreen('menu');
  }

  onSkinSaved(skin) {
    if (this.lobby.session) {
      const p = this.lobby.players.get(this.lobby.session.myId);
      if (p) p.skin = skin;
      if (this.lobby.isHost) this.lobby.pushState(); else this.lobby.session.sendToHost({ t: 'skin', skin });
    }
  }

  // ------------------------------------------------------------------ attract mode
  startAttract() {
    const def = LEVELS.L0;
    const level = new LevelInstance(def, (Math.random() * 1e9) >>> 0);
    const wr = new WorldRenderer(this.engine.scene, this.lib);
    wr.radius = 1;
    wr.setLevel(level);
    const lm = new LightManager(this.engine.scene, Math.min(6, settings.preset.dynamicLights));
    const sp = level.spawnPoint();
    const cam = this.engine.camera;
    cam.position.set(sp.x, 1.6, sp.z);
    wr.buildAll(sp.x, sp.z);
    const s = wr.collectLights();
    lm.setSources(s.lights, s.fixtures);
    this.engine.scene.fog = new THREE.FogExp2(def.fog.color, def.fog.density);
    this.engine.scene.background = new THREE.Color(def.background);
    const hemi = new THREE.HemisphereLight(def.hemi.sky, def.hemi.ground, def.hemi.intensity);
    this.engine.scene.add(hemi);
    this.engine.post.setGrade(def.grade);
    this.attract = { level, wr, lm, hemi, t: Math.random() * 100, base: { x: sp.x, z: sp.z } };
  }

  stopAttract() {
    const a = this.attract;
    if (!a) return;
    a.wr.clear();
    this.engine.scene.remove(a.wr.root, a.lm.group, a.hemi);
    this.attract = null;
  }

  updateAttract(dt) {
    const a = this.attract;
    a.t += dt;
    const cam = this.engine.camera;
    cam.position.set(a.base.x + Math.sin(a.t * 0.05) * 0.6, 1.62 + Math.sin(a.t * 0.7) * 0.01, a.base.z + Math.cos(a.t * 0.04) * 0.6);
    cam.rotation.set(Math.sin(a.t * 0.11) * 0.06, a.t * 0.045, 0);
    a.lm.update(dt, cam, a.level);
  }

  // ------------------------------------------------------------------ game start
  makeGame(session, seedStr, opts = {}) {
    this.stopAttract();
    this.ui.resetGameScreens();
    const seed = typeof seedStr === 'number' ? seedStr : hashString(String(seedStr));
    const profile = { name: settings.get('playerName') || 'Wanderer', skin: normalizeSkin(settings.get('skin')) };
    const game = new Game({ engine: this.engine, lib: this.lib, ui: this.ui, session, seed, difficulty: opts.difficulty, friendlyFire: opts.friendlyFire, profile, roster: opts.roster });
    game.seedLabel = typeof seedStr === 'number' ? seedStr : seedStr;
    this.game = game;
    this.ui.game = game;
    for (const s of ['menu', 'customize', 'lobby', 'settings', 'help']) this.ui.screen(s, false);
    this.ui.hud.show(true);
    this.ui.hud.inventoryChanged(game);
    return game;
  }

  async startSolo(seedStr = randomSeedWord(), level = FIRST_LEVEL) {
    audio.init();
    const session = new Session();
    const game = this.makeGame(session, seedStr, { difficulty: this.params.get('difficulty') || 'normal' });
    const prologue = settings.get('prologue') && level === FIRST_LEVEL && !this.params.get('level') && !this.params.get('class');
    await game.enterLevel(prologue ? 'P0' : LEVELS[level] ? level : FIRST_LEVEL);
    if (this.params.get('god')) { game.cheatGod = true; }
    if (this.params.get('class')) game.chooseRole(this.params.get('class'));
    else if (!prologue) game.promptRole();
    else this.ui.hud.toast('Prologue — press Esc to skip', 4);
    this.relock();
  }

  async startCoop(session, m, lateJoin) {
    audio.init();
    const roster = new Map(m.roster || []);
    const game = this.makeGame(session, m.seed, { difficulty: m.difficulty, friendlyFire: m.friendlyFire, roster });
    if (lateJoin) {
      game.world.load(m.world);
      roster.set(m.hostId, { name: m.hostName, skin: m.hostSkin });
      game.hostTimeOffset = m.ht;
      const lvl = m.level || FIRST_LEVEL;
      const level = game.getLevel(lvl);
      const sp = m.spawn ? { x: m.spawn.x + 0.8, y: m.spawn.y, z: m.spawn.z } : level.spawnPoint();
      if (!isFinite(level.floorAt(sp.x, sp.z))) Object.assign(sp, level.spawnPoint());
      await game.enterLevel(lvl, { spawn: sp });
      if (lvl !== 'P0') game.promptRole();
    } else {
      await game.enterLevel(m.prologue ? 'P0' : FIRST_LEVEL);
      if (!m.prologue) game.promptRole();
    }
    this.relock();
  }

  relock() {
    // pointer lock needs a user gesture; prompt with a click overlay if needed
    if (!input.locked) this.ui.hud.toast('Click to look around', 3);
  }

  quitToMenu() {
    if (this.console.isOpen) this.console.close();
    if (this.game) { this.game.dispose(); this.game = null; }
    this.lobby.reset();
    this.ui.resetGameScreens();
    this.ui.hud.show(false);
    input.unlock();
    this.startAttract();
    this.showScreen('menu');
  }

  // ------------------------------------------------------------------ input
  bindKeys() {
    window.addEventListener('keydown', e => {
      const g = this.game;
      if (!g || input.isTyping(e)) return;
      const is = a => input.matches(a, e.code);
      if (is('console')) {
        e.preventDefault();
        if (!this.ui.open.has('pause') && !g.won) this.console.toggle(g);
        return;
      }
      if (e.code === 'Escape') {
        if (this.ui.open.has('chat')) { this.ui.closeChat(); return; }
        if (this.ui.open.has('settings')) { this.closeSettings(); return; }
        if (this.ui.open.has('help')) { this.ui.open.delete('help'); this.ui.screen('help', false); this.ui.pause(g); return; }
        if (this.ui.open.has('pause')) { if (performance.now() - (this.pausedAt || 0) > 350) this.ui.resume(); return; }
        if (this.ui.modalOpen) { for (const n of [...this.ui.open]) this.ui.closeModal(n); return; }
        if (!g.dead && !g.won && !g.transitioning) this.ui.pause(g);
      } else if (is('inventory') && !g.dead) {
        e.preventDefault();
        if (g.transitioning || this.ui.open.has('pause') || this.ui.open.has('note') || this.ui.open.has('journal') || this.ui.open.has('computer')) return;
        this.ui.toggleInventory(g);
      } else if (is('interact') && !e.repeat && this.ui.open.has('inventory')) {
        // E closes the inventory / container screen (never opens it)
        this.ui.toggleInventory(g);
      } else if (is('journal') && !this.ui.open.has('pause') && !g.transitioning) {
        if (this.ui.open.has('journal')) this.ui.closeModal('journal');
        else if (!this.ui.modalOpen) this.ui.openJournal(g);
      } else if (is('chat') && !this.ui.modalOpen) {
        e.preventDefault();
        this.ui.openChat(g);
      } else if (is('interact') && this.ui.open.has('note')) {
        this.ui.closeModal('note');
      }
    });
    this.engine.canvas.addEventListener('click', () => {
      audio.init();
      if (this.game && !this.ui.modalOpen && !this.game.won && (!this.game.dead || this.game.spectating)) input.lock();
    });
  }

  onLockChange(locked) {
    const g = this.game;
    // losing pointer lock (e.g. browser Esc) pauses the game menu
    if (!locked && g && !this.ui.modalOpen && !g.dead && !g.won && !g.transitioning) { this.pausedAt = performance.now(); this.ui.pause(g); }
  }

  update(dt) {
    if (this.game) this.game.update(dt);
    else if (this.attract) this.updateAttract(dt);
    if (this.attract && !this.game) {
      this.attract.wr.update(this.engine.camera.position.x, this.engine.camera.position.z);
    }
  }
}

const app = new App();
window.__app = app;
app.boot().catch(err => {
  console.error(err);
  document.getElementById('loadSub').textContent = 'Failed to start: ' + err.message;
});
