// First-person viewmodel: procedural arms (matching the avatar's sleeves and
// skin) holding the selected item, with bob, sway, recoil, reload, melee,
// use and throw animations. Rendered at half scale close to the camera so it
// rarely clips into walls.
import * as THREE from 'three';
import { itemModel } from './models.js';
import { ITEMS } from './items.js';
import { damp } from '../core/rng.js';

const SCALE = 0.5;

// Per-item hold poses: pos/rot of the holder, grip point for the right hand,
// optional left-hand support point (two-handed) and ADS position.
const POSES = {
  pistol: { pos: [0.13, -0.125, -0.34], rot: [0, 0.05, 0], grip: [0, -0.04, 0.02], ads: [0, -0.06, -0.3], one: true },
  smg: { pos: [0.13, -0.14, -0.34], rot: [0, 0.04, 0], grip: [0, -0.05, 0.03], left: [-0.0, -0.06, -0.24], ads: [0, -0.07, -0.26] },
  rifle: { pos: [0.13, -0.15, -0.33], rot: [0, 0.04, 0], grip: [0, -0.05, 0.04], left: [0, -0.0, -0.3], ads: [0, -0.088, -0.24] },
  shotgun: { pos: [0.14, -0.15, -0.32], rot: [0, 0.05, 0], grip: [0, -0.05, 0.09], left: [0, -0.01, -0.3], ads: [0, -0.085, -0.22] },
  crowbar: { pos: [0.2, -0.24, -0.38], rot: [-0.3, -0.2, 0.25], grip: [0, -0.12, 0], one: true },
  knife: { pos: [0.18, -0.2, -0.34], rot: [0.1, -0.15, 0.1], grip: [0, 0.01, 0.06], one: true, bladeUp: true },
  flashlight: { pos: [0.17, -0.2, -0.42], rot: [0.02, 0.06, 0], grip: [0, -0.02, 0.03], one: true },
  lighter: { pos: [0.15, -0.17, -0.32], rot: [0, -0.2, 0], grip: [0, -0.03, 0], one: true },
  default: { pos: [0.16, -0.19, -0.34], rot: [0.2, -0.3, 0], grip: [0, -0.02, 0], one: true },
};

export class Viewmodel {
  constructor(camera, lib) {
    this.camera = camera;
    this.lib = lib;
    this.root = new THREE.Group();
    this.root.scale.setScalar(SCALE);
    this.root.renderOrder = 10;
    camera.add(this.root);
    this.holder = new THREE.Group();
    this.root.add(this.holder);
    this.leftHolder = new THREE.Group();
    this.root.add(this.leftHolder);
    this.itemId = null;
    this.model = null;
    this.flashModel = itemModel('flashlight');
    this.flashModel.visible = false;
    this.leftHolder.add(this.flashModel);
    this.anim = { equip: 1, recoil: 0, recoilRot: 0, reload: 0, reloadT: 0, swing: -1, swingKind: '', use: 0, throw: -1, sprint: 0, ads: 0, bobT: 0, inspect: 0 };
    this.sway = new THREE.Vector2();
    this.lastYaw = 0; this.lastPitch = 0;
    this.skin = null;
    this.buildArms({ skinTone: '#e5b994', shirtColor: '#4fc3f7', shirt: 'hoodie' });
  }

  buildArms(skin) {
    this.skin = skin;
    if (this.rArm) this.rArm.removeFromParent();
    if (this.lArm) this.lArm.removeFromParent();
    const sleeve = new THREE.MeshStandardMaterial({ color: skin.shirt === 'tee' || skin.shirt === 'vest' ? skin.skinTone : skin.shirtColor, roughness: 0.85 });
    const hand = new THREE.MeshStandardMaterial({ color: skin.skinTone, roughness: 0.6 });
    const mk = side => {
      const arm = new THREE.Group();
      const palm = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.075, 0.085), hand);
      palm.position.set(0, -0.02, 0);
      arm.add(palm);
      for (let i = 0; i < 4; i++) {
        const f = new THREE.Mesh(new THREE.BoxGeometry(0.013, 0.016, 0.055), hand);
        f.position.set(side * 0.034, -0.035 + i * 0.0, -0.03 + i * 0.018);
        f.rotation.y = side * 0.4;
        arm.add(f);
      }
      const thumb = new THREE.Mesh(new THREE.BoxGeometry(0.016, 0.016, 0.05), hand);
      thumb.position.set(-side * 0.03, 0.01, -0.03);
      thumb.rotation.y = -side * 0.5;
      arm.add(thumb);
      const fore = new THREE.Mesh(new THREE.CylinderGeometry(0.036, 0.045, 0.42, 9), sleeve);
      fore.rotation.x = Math.PI / 2;
      fore.position.set(side * 0.03, -0.04, 0.23);
      arm.add(fore);
      const cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.03, 9), hand);
      cuff.rotation.x = Math.PI / 2;
      cuff.position.set(side * 0.005, -0.03, 0.04);
      arm.add(cuff);
      arm.traverse(o => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = false; } });
      return arm;
    };
    this.rArm = mk(1);
    this.lArm = mk(-1);
    this.holder.add(this.rArm);
    this.leftHolder.add(this.lArm);
  }

  equip(id) {
    if (id === this.itemId) return;
    this.itemId = id;
    if (this.model) this.holder.remove(this.model);
    this.model = null;
    if (id) {
      this.model = itemModel(id);
      this.model.traverse(o => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = false; } });
      // consumables etc. are modelled upright; tilt them into the hand
      const def = ITEMS[id];
      if (def && def.type !== 'weapon' && id !== 'flashlight' && id !== 'lighter') {
        this.model.rotation.set(0.3, 0, -0.2);
        this.model.position.set(0, 0.0, 0);
      }
      if (id === 'crowbar') { this.model.rotation.set(-0.2, 0, 0); this.model.position.set(0, 0.05, 0); }
      if (id === 'knife') { this.model.rotation.set(-0.2, 0, 0); }
      this.holder.add(this.model);
    }
    const P = POSES[id] || POSES.default;
    this.pose = P;
    this.rArm.position.set(...P.grip);
    this.rArm.rotation.set(0, 0, 0);
    this.rArm.visible = true;
    this.anim.equip = 0;
    this.anim.reload = 0; this.anim.swing = -1; this.anim.use = 0; this.anim.throw = -1;
  }

  kick(amount) { this.anim.recoil += amount; this.anim.recoilRot += amount * 2.2; }
  startReload(dur, kind) { this.anim.reload = dur; this.anim.reloadT = dur; this.anim.reloadKind = kind; }
  swing(kind = 'crowbar') { this.anim.swing = 0; this.anim.swingKind = kind; }
  startUse() { this.anim.use = 0.0001; }
  stopUse() { this.anim.use = 0; }
  startThrow() { this.anim.throw = 0; }
  pump() { this.anim.pumpT = 0.45; }

  update(dt, player, opts) {
    const A = this.anim;
    const P = this.pose || POSES.default;
    A.equip = Math.min(1, A.equip + dt * 3.2);
    A.recoil = damp(A.recoil, 0, 14, dt);
    A.recoilRot = damp(A.recoilRot, 0, 11, dt);
    A.sprint = damp(A.sprint, player.sprinting && !opts.ads && A.reload <= 0 ? 1 : 0, 8, dt);
    A.ads = damp(A.ads, opts.ads ? 1 : 0, 14, dt);
    // look sway (lagging behind the camera)
    const dyaw = player.yaw - this.lastYaw, dp = player.pitch - this.lastPitch;
    this.lastYaw = player.yaw; this.lastPitch = player.pitch;
    this.sway.x = damp(this.sway.x + dyaw * 0.6, 0, 7, dt);
    this.sway.y = damp(this.sway.y + dp * 0.6, 0, 7, dt);
    // bob synced to the player's step cycle
    const bob = player.bobAmt * (1 - A.ads * 0.85);
    const bt = player.bobT;
    const t = performance.now() * 0.001;

    let px = P.pos[0], py = P.pos[1], pz = P.pos[2];
    let rx = P.rot[0], ry = P.rot[1], rz = P.rot[2];
    if (P.ads && A.ads > 0.001) {
      px += (P.ads[0] - px) * A.ads; py += (P.ads[1] - py) * A.ads; pz += (P.ads[2] - pz) * A.ads;
      ry *= 1 - A.ads; rx *= 1 - A.ads;
    }
    px += Math.cos(bt) * 0.012 * bob + this.sway.x * 0.08;
    py += -Math.abs(Math.sin(bt)) * 0.016 * bob + Math.sin(t * 1.6) * 0.003 * (1 - A.ads) - this.sway.y * 0.05;
    rz += this.sway.x * 0.5;
    // sprint pose
    px += A.sprint * 0.04; py -= A.sprint * 0.06; ry += A.sprint * 0.7; rx -= A.sprint * 0.25;
    // equip raise
    py -= (1 - A.equip) * 0.3; rx -= (1 - A.equip) * 0.6;
    // recoil
    pz += A.recoil * 0.08; rx += A.recoilRot * 0.3;
    // reload
    if (A.reload > 0) {
      A.reload -= dt;
      const k = Math.sin(Math.min(1, 1 - A.reload / A.reloadT) * Math.PI);
      py -= k * 0.08; rz += k * 0.7; rx += k * 0.2;
      if (this.model?.userData.mag) this.model.userData.mag.position.y = -0.06 - (k > 0.3 && k < 0.95 ? 0.15 * k : 0);
    } else if (this.model?.userData.mag) this.model.userData.mag.position.y = -0.06;
    // shotgun pump
    if (A.pumpT > 0) {
      A.pumpT -= dt;
      const k = Math.sin(Math.max(0, A.pumpT / 0.45) * Math.PI);
      if (this.model?.userData.pump) this.model.userData.pump.position.z = -0.3 + k * 0.07;
      rx += k * 0.05;
    }
    // melee swing
    if (A.swing >= 0) {
      A.swing += dt;
      const dur = A.swingKind === 'knife' ? 0.32 : 0.55;
      const u = A.swing / dur;
      if (A.swingKind === 'knife') {
        const k = u < 0.3 ? u / 0.3 : Math.max(0, 1 - (u - 0.3) / 0.7);
        pz -= k * 0.18; px -= k * 0.06; rx -= k * 0.3;
      } else {
        // wind up then sweep across
        if (u < 0.35) { const k = u / 0.35; rz += k * 0.9; rx += k * 0.5; px += k * 0.08; py += k * 0.08; }
        else { const k = Math.min(1, (u - 0.35) / 0.3); rz += 0.9 - k * 2.2; rx += 0.5 - k * 1.3; px += 0.08 - k * 0.3; py += 0.08 - k * 0.1; pz -= k * 0.08; }
      }
      if (u >= 1) A.swing = -1;
    }
    // consumable use: raise toward the mouth
    if (A.use > 0) {
      A.use = Math.min(1, A.use + dt * 3);
      px -= A.use * 0.12; py += A.use * 0.08; pz += A.use * 0.12; rx += A.use * 0.9;
    }
    // throw
    if (A.throw >= 0) {
      A.throw += dt;
      const u = A.throw / 0.45;
      if (u < 0.45) { const k = u / 0.45; py += k * 0.12; pz += k * 0.12; rx += k * 0.9; }
      else { const k = Math.min(1, (u - 0.45) / 0.25); py += 0.12 - k * 0.2; pz += 0.12 - k * 0.35; rx += 0.9 - k * 1.6; }
      if (u >= 1) A.throw = -1;
    }
    this.holder.position.set(px, py, pz);
    this.holder.rotation.set(rx, ry, rz);
    this.holder.visible = !!this.itemId || opts.showEmptyHand;
    if (this.model) this.model.visible = !!this.itemId && !(A.throw > 0.25 && A.throw < 0.8);

    // left hand: flashlight (one-handed or empty) or gun support
    const flashOn = opts.flashlightOn;
    const support = P.left && this.itemId;
    this.flashModel.visible = !!flashOn && !support && this.itemId !== 'flashlight';
    this.lArm.visible = this.flashModel.visible || !!support;
    if (support) {
      // follow the holder so it stays on the fore-end
      const lp = new THREE.Vector3(...P.left).applyEuler(this.holder.rotation).add(this.holder.position);
      this.leftHolder.position.copy(lp);
      this.leftHolder.rotation.copy(this.holder.rotation);
      this.lArm.position.set(0, -0.035, 0);
      this.lArm.rotation.set(0, 0, 0.3);
    } else if (flashOn) {
      let lx = -0.18 - this.sway.x * 0.06, ly = -0.2 - Math.abs(Math.sin(bt + 1.3)) * 0.014 * bob - A.sprint * 0.05, lz = -0.42;
      lx -= A.ads * 0.02; ly -= A.ads * 0.03;
      this.leftHolder.position.set(lx, ly, lz);
      this.leftHolder.rotation.set(-this.sway.y * 0.3 + opts.focus * 0.05, 0.04 + this.sway.x * 0.3, -0.05);
      this.lArm.position.set(0, -0.02, 0.03);
      this.lArm.rotation.set(0, 0, 0);
    }
    // flashlight lens glow follows focus
    const lens = this.flashModel.userData.lens;
    if (lens) lens.material.emissiveIntensity = flashOn ? (opts.focus ? 4 : 2.2) * (opts.flashFlicker ?? 1) : 0;
    const flame = this.model?.userData.flame;
    if (flame) { flame.visible = !!opts.lighterLit; flame.scale.set(1, 0.85 + Math.random() * 0.3, 1); }
    this.root.visible = !opts.hidden;
  }

  // world position of the flashlight lens (for the spotlight origin)
  flashWorldPos(out) {
    const m = this.itemId === 'flashlight' && this.model ? this.model : this.flashModel;
    m.updateWorldMatrix(true, false);
    return out.set(0, 0, -0.11).applyMatrix4(m.matrixWorld);
  }
  muzzleWorldPos(out) {
    if (!this.model) return out.copy(this.camera.position);
    this.model.updateWorldMatrix(true, false);
    const m = this.model.userData.muzzle || new THREE.Vector3(0, 0, -0.2);
    return out.copy(m).applyMatrix4(this.model.matrixWorld);
  }
}
