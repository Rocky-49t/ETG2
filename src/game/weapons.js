// Weapon definitions and the held-item controller: firing, reloading, melee,
// consuming, throwing and tool use for whatever is in the selected slot.
import * as THREE from 'three';
import { input } from '../core/input.js';
import { ITEMS, makeItem } from './items.js';
import { NOISE } from '../ai/brain.js';

export const WEAPONS = {
  pistol: { kind: 'gun', damage: 26, rate: 0.16, auto: false, mag: 12, ammo: 'ammo9', spread: 0.014, adsSpread: 0.003, range: 70, recoil: 0.035, reload: 1.35, noise: NOISE.pistol, sound: 'pistol', pellets: 1, flash: 0.45 },
  smg: { kind: 'gun', damage: 15, rate: 0.072, auto: true, mag: 30, ammo: 'ammo9', spread: 0.035, adsSpread: 0.014, range: 55, recoil: 0.02, reload: 1.9, noise: NOISE.smg, sound: 'smg', pellets: 1, flash: 0.4 },
  shotgun: { kind: 'gun', damage: 14, rate: 0.9, auto: false, mag: 6, ammo: 'shells', spread: 0.075, adsSpread: 0.055, range: 30, recoil: 0.1, reload: 0.55, perShell: true, noise: NOISE.shotgun, sound: 'shotgun', pellets: 9, flash: 0.75 },
  crowbar: { kind: 'melee', damage: 40, rate: 0.62, range: 2.2, hitAt: 0.3, durCost: 3, noise: NOISE.melee, swing: 'crowbar' },
  knife: { kind: 'melee', damage: 24, rate: 0.36, range: 1.75, hitAt: 0.1, durCost: 1.5, noise: 2, swing: 'knife', backstab: 2.5 },
};

const _v = new THREE.Vector3(), _d = new THREE.Vector3(), _m = new THREE.Vector3();

export class HeldController {
  constructor(game) {
    this.game = game;
    this.cooldown = 0;
    this.reloading = 0;
    this.useT = 0;
    this.useSlot = -1;
    this.swingT = -1;
    this.throwT = -1;
    this.lighterLit = false;
    this.ads = false;
    this.lastId = null;
  }

  get item() { return this.game.inventory.held; }

  cancel() {
    this.reloading = 0; this.useT = 0; this.useSlot = -1; this.swingT = -1; this.throwT = -1;
    this.game.viewmodel.stopUse();
  }

  update(dt) {
    const g = this.game;
    const it = this.item;
    const id = it ? it.id : null;
    if (id !== this.lastId) {
      this.cancel();
      this.lastId = id;
      g.viewmodel.equip(id);
      if (id) g.sfx('click', null, { volume: 0.5 });
      this.lighterLit = false;
    }
    this.cooldown = Math.max(0, this.cooldown - dt);
    const def = id ? ITEMS[id] : null;
    const canAct = g.canAct();
    this.ads = false;
    if (!def) {
      // empty hands: RMB focuses the flashlight beam
      g.lights.focus = canAct && input.isDown('Mouse2');
      return;
    }
    g.lights.focus = false;

    if (def.type === 'weapon') this.updateWeapon(dt, it, WEAPONS[def.weapon], canAct);
    else if (def.type === 'consumable') this.updateUse(dt, it, def, canAct);
    else if (def.type === 'battery') { if (canAct && input.pressed('Mouse0')) this.useBattery(); }
    else if (def.type === 'flashlight') {
      if (canAct && input.pressed('Mouse0')) g.lights.toggle();
      g.lights.focus = canAct && input.isDown('Mouse2');
    } else if (def.type === 'throwable') this.updateThrow(dt, it, def, canAct);
    else if (def.type === 'tool' && def.tool === 'lighter') this.updateLighter(dt, it, canAct);
    else if (def.type === 'repair') { if (canAct && input.pressed('Mouse0')) this.useRepair(); }
    else if (def.type === 'key' || def.type === 'ammo') {
      if (canAct && input.pressed('Mouse0')) g.subtitle(def.type === 'key' ? 'Use it at the right door: look at it and press E.' : 'Ammo loads automatically when you reload (R).', 2.5);
    }
  }

  // ---------------------------------------------------------------- guns
  updateWeapon(dt, it, W, canAct) {
    const g = this.game;
    if (!W) return;
    if (W.kind === 'melee') return this.updateMelee(dt, it, W, canAct);
    this.ads = canAct && input.isDown('Mouse2') && this.reloading <= 0;
    g.player.zoom = this.ads ? -12 : 0;
    // reloading
    if (this.reloading > 0) {
      this.reloading -= dt;
      if (W.perShell) {
        if (this.reloading <= 0) {
          if (it.data.ammo < W.mag && g.inventory.consume(W.ammo, 1)) {
            it.data.ammo++;
            g.sfx('shellIn', null, { volume: 0.7 });
            g.inventory.changed();
            if (it.data.ammo < W.mag && g.inventory.has(W.ammo)) { this.reloading = W.reload; g.viewmodel.startReload(W.reload, 'shell'); }
            else { g.viewmodel.pump(); g.sfx('pump', null, {}); }
          }
        }
        // allow interrupting shell reload by firing
        if (canAct && input.pressed('Mouse0') && it.data.ammo > 0) this.reloading = 0;
        else return;
      } else {
        if (this.reloading <= 0) {
          const need = W.mag - it.data.ammo;
          const got = g.inventory.consume(W.ammo, need);
          it.data.ammo += got;
          g.inventory.changed();
        }
        return;
      }
    }
    if (!canAct) return;
    if (input.pressed('KeyR') && it.data.ammo < W.mag) {
      if (g.inventory.has(W.ammo)) {
        this.reloading = W.reload;
        g.viewmodel.startReload(W.reload, W.perShell ? 'shell' : 'mag');
        if (!W.perShell) g.sfx('reload', null, { steps: W.reload > 1.6 ? [0.1, 0.7, 1.4] : [0.1, 0.55, 1.05] });
        g.emitNoise(NOISE.reload);
      } else g.subtitle(`No ${ITEMS[W.ammo].name.toLowerCase()} left.`, 1.6);
      return;
    }
    const trigger = W.auto ? input.isDown('Mouse0') : input.pressed('Mouse0');
    if (trigger && this.cooldown <= 0) {
      if (it.data.ammo <= 0) {
        if (input.pressed('Mouse0')) { g.sfx('dryfire', null, {}); this.cooldown = 0.25; }
        return;
      }
      it.data.ammo--;
      this.cooldown = W.rate;
      this.fire(W);
      g.inventory.changed();
      if (W.perShell) setTimeout(() => { if (this.item === it) { g.viewmodel.pump(); g.sfx('pump', null, { volume: 0.8 }); } }, 280);
    }
  }

  fire(W) {
    const g = this.game;
    const cam = g.engine.camera;
    const origin = cam.position;
    const fwd = _d.set(0, 0, -1).applyQuaternion(cam.quaternion);
    const muzzle = g.viewmodel.muzzleWorldPos(_m.clone());
    const moving = g.player.speed > 1 ? 1.6 : 1;
    const spread = (this.ads ? W.adsSpread : W.spread) * moving * (g.player.crouching ? 0.75 : 1);
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(cam.quaternion);
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(cam.quaternion);
    let hitAny = false, killed = false;
    for (let i = 0; i < W.pellets; i++) {
      const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * spread;
      const dir = fwd.clone().addScaledVector(right, Math.cos(a) * r).addScaledVector(up, Math.sin(a) * r).normalize();
      const res = g.shootRay(origin, dir, W.range);
      if (res.entity) {
        hitAny = true;
        const falloff = W.pellets > 1 ? Math.max(0.35, 1 - res.dist / W.range) : 1;
        g.requestHit(res.entity.view.id, W.damage * falloff, 'bullet', res.entity.part, res.point);
      }
      if (i < 3 || W.pellets === 1) g.effects.tracer(muzzle, res.point);
    }
    g.viewmodel.kick(W.recoil * 1.6);
    g.player.addRecoil(W.recoil * (this.ads ? 0.6 : 1), (Math.random() - 0.5) * W.recoil * 0.6);
    g.player.shake = Math.min(1, g.player.shake + W.recoil * 3);
    g.effects.flash(muzzle, W.flash * 0.5, 0.05);
    g.effects.burst('muzzleSmoke', muzzle, fwd);
    g.lights.muzzle(muzzle);
    g.sfx(W.sound, null, { volume: 1 });
    g.emitNoise(W.noise);
    g.netFx('shot', { w: W.sound, x: muzzle.x, y: muzzle.y, z: muzzle.z });
    if (hitAny) g.hud.hitmarker(killed);
  }

  // ---------------------------------------------------------------- melee
  updateMelee(dt, it, W, canAct) {
    const g = this.game;
    if (this.swingT >= 0) {
      const prev = this.swingT;
      this.swingT += dt;
      if (prev < W.hitAt && this.swingT >= W.hitAt) this.meleeHit(it, W);
      if (this.swingT > W.rate) this.swingT = -1;
      return;
    }
    if (canAct && input.isDown('Mouse0') && this.cooldown <= 0 && g.stats.stamina > 5) {
      this.swingT = 0;
      this.cooldown = W.rate;
      g.viewmodel.swing(W.swing);
      g.sfx('swing', null, { volume: 0.8 });
      g.stats.stamina = Math.max(0, g.stats.stamina - (W.swing === 'crowbar' ? 8 : 4));
      g.stats.sinceSprint = 0;
    }
  }

  meleeHit(it, W) {
    const g = this.game;
    const cam = g.engine.camera;
    const fwd = _d.set(0, 0, -1).applyQuaternion(cam.quaternion);
    let res = g.shootRay(cam.position, fwd, W.range, { meleePad: 0.25 });
    if (!res.entity) {
      // generous cone for melee: try slight offsets
      for (const off of [-0.12, 0.12]) {
        const dir = fwd.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), off);
        const r2 = g.shootRay(cam.position, dir, W.range, { meleePad: 0.25 });
        if (r2.entity) { res = r2; break; }
      }
    }
    if (res.entity) {
      let dmg = W.damage;
      // backstab bonus for the knife
      if (W.backstab) {
        const st = res.entity.view.st;
        const toPlayer = Math.atan2(cam.position.x - st.x, cam.position.z - st.z);
        let diff = Math.abs(((toPlayer - st.r + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
        if (diff > 2.2) { dmg *= W.backstab; g.subtitle('Backstab.', 0.8); }
      }
      g.requestHit(res.entity.view.id, dmg, 'melee', res.entity.part, res.point);
      g.player.shake = Math.min(1, g.player.shake + 0.25);
      g.hud.hitmarker(false);
      this.wear(it, W.durCost);
    } else if (res.dist < W.range) {
      g.sfx('hitWall', res.point, { volume: 0.7 });
      g.effects.burst('impact', res.point, res.normal || { x: 0, y: 1, z: 0 }, 0.5);
      g.player.shake = Math.min(1, g.player.shake + 0.15);
      this.wear(it, W.durCost * 0.5);
    }
    g.emitNoise(W.noise);
  }

  wear(it, amount) {
    if (!it.data) return;
    it.data.dur = Math.max(0, (it.data.dur ?? 100) - amount);
    if (it.data.dur <= 0) {
      const idx = this.game.inventory.slots.indexOf(it);
      if (idx >= 0) this.game.inventory.takeFrom(idx, 1);
      this.game.subtitle(`Your ${ITEMS[it.id].name.toLowerCase()} breaks.`, 2);
      this.game.sfx('hitBone', null, {});
    }
    this.game.inventory.changed();
  }

  // ---------------------------------------------------------------- consumables
  updateUse(dt, it, def, canAct) {
    const g = this.game;
    if (canAct && input.isDown('Mouse0')) {
      if (this.useT === 0) {
        if (!this.canConsume(def)) { if (input.pressed('Mouse0')) g.subtitle('You don\'t need that right now.', 1.4); return; }
        this.useSlot = g.inventory.selected;
        g.viewmodel.startUse();
        g.sfx(def.sound || 'pickup', null, {});
      }
      this.useT += dt;
      g.hud.progress(this.useT / def.useTime, def.name);
      if (this.useT >= def.useTime) {
        g.stats.applyEffects(def.effects);
        g.inventory.takeFrom(g.inventory.selected, 1);
        g.onConsumed?.(def);
        this.useT = 0;
        g.viewmodel.stopUse();
        g.hud.progress(-1);
      }
    } else if (this.useT > 0) {
      this.useT = 0;
      g.viewmodel.stopUse();
      g.hud.progress(-1);
    }
  }

  canConsume(def) {
    const s = this.game.stats, fx = def.effects;
    if (fx.health || fx.regen) return s.health < 100 || s.bleeding > 0;
    if (fx.thirst && !fx.sanity) return s.thirst < 98;
    if (fx.hunger && !fx.health) return s.hunger < 98;
    return true;
  }

  useBattery() {
    const g = this.game;
    const inv = g.inventory;
    let best = -1, low = 101;
    inv.slots.forEach((s, i) => { if (s && s.id === 'flashlight' && s.data.charge < low) { low = s.data.charge; best = i; } });
    if (best < 0) { g.subtitle('You have nothing to put it in.', 1.5); return; }
    if (low > 95) { g.subtitle('Your flashlight is already full.', 1.5); return; }
    inv.slots[best].data.charge = 100;
    inv.takeFrom(inv.selected, 1);
    g.sfx('battery', null, {});
    g.subtitle('Fresh battery. The beam steadies.', 1.6);
  }

  useRepair() {
    const g = this.game;
    const inv = g.inventory;
    let best = -1, low = 101;
    inv.slots.forEach((s, i) => { if (s && ITEMS[s.id].type === 'weapon' && WEAPONS[ITEMS[s.id].weapon]?.kind === 'melee' && s.data.dur < low) { low = s.data.dur; best = i; } });
    if (best < 0 || low > 90) { g.subtitle('Nothing needs tape right now.', 1.5); return; }
    inv.slots[best].data.dur = Math.min(100, low + 55);
    inv.takeFrom(inv.selected, 1);
    g.sfx('bandage', null, {});
    g.subtitle(`You tape up the ${ITEMS[inv.slots[best]?.id]?.name.toLowerCase() || 'handle'}.`, 1.6);
  }

  // ---------------------------------------------------------------- throwables
  updateThrow(dt, it, def, canAct) {
    const g = this.game;
    if (this.throwT >= 0) {
      const prev = this.throwT;
      this.throwT += dt;
      if (prev < 0.22 && this.throwT >= 0.22) {
        const cam = g.engine.camera;
        const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion);
        const pos = cam.position.clone().addScaledVector(fwd, 0.4).add(new THREE.Vector3(0, -0.1, 0));
        const vel = fwd.clone().multiplyScalar(def.throw === 'decoy' ? 9 : 11).add(new THREE.Vector3(0, 2.2, 0));
        vel.x += g.player.vel.x * 0.5; vel.z += g.player.vel.z * 0.5;
        g.throwItem(def.throw, pos, vel);
        g.inventory.takeFrom(g.inventory.selected, 1);
        g.sfx(def.throw === 'glowstick' ? 'glowCrack' : 'throw', null, {});
        if (def.throw === 'flare') g.sfx('lighterFlick', null, {});
      }
      if (this.throwT > 0.5) this.throwT = -1;
      return;
    }
    if (canAct && input.pressed('Mouse0')) {
      this.throwT = 0;
      g.viewmodel.startThrow();
    }
  }

  // ---------------------------------------------------------------- lighter
  updateLighter(dt, it, canAct) {
    const g = this.game;
    if (canAct && input.pressed('Mouse0')) {
      if (it.data.fuel <= 0) { g.subtitle('The lighter is out of fuel.', 1.5); this.lighterLit = false; }
      else { this.lighterLit = !this.lighterLit; g.sfx('lighterFlick', null, {}); }
    }
    if (this.lighterLit) {
      it.data.fuel = Math.max(0, it.data.fuel - dt * 0.55);
      if (it.data.fuel <= 0) { this.lighterLit = false; g.subtitle('The flame gutters out.', 1.5); }
      if (Math.random() < dt * 2) g.inventory.changed();
    }
  }
}
