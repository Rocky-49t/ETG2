// Local first-person controller: walking, sprinting, crouching, jumping,
// stairs, swimming and diving, with camera bob/sway. Emits footstep and
// landing events that the game turns into sounds and AI noise.
import * as THREE from 'three';
import { input } from '../core/input.js';
import { settings } from '../core/settings.js';
import { clamp, damp } from '../core/rng.js';

const STAND_H = 1.72, CROUCH_H = 1.12, EYE_OFF = 0.12;

export class PlayerController {
  constructor(camera) {
    this.camera = camera;
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.yaw = 0;
    this.pitch = 0;
    this.body = { x: 0, y: 0, z: 0, r: 0.3, h: STAND_H, step: 0.45 };
    this.height = STAND_H;
    this.grounded = false;
    this.crouching = false;
    this.sprinting = false;
    this.swimming = false;
    this.underwater = false;
    this.moving = false;
    this.speed = 0;
    this.bobT = 0;
    this.bobAmt = 0;
    this.stepDist = 0;
    this.fallStartY = 0;
    this.airTime = 0;
    this.lastGround = 0;
    this.recoilPitch = 0;
    this.recoilYaw = 0;
    this.shake = 0;
    this.fovKick = 0;
    this.frozen = false;      // hidden in locker, menus
    this.downed = false;
    this.noclip = false;
    this.events = [];         // {type:'step'|'land'|'splash'|'jump', ...}
    this.eye = new THREE.Vector3();
    this.forward = new THREE.Vector3();
    this.staminaOk = true;
    this.speedMul = 1;
  }

  teleport(x, y, z, yaw) {
    this.pos.set(x, y, z);
    this.vel.set(0, 0, 0);
    if (yaw !== undefined) this.yaw = yaw;
    this.fallStartY = y;
  }

  update(dt, level, stats) {
    this.events.length = 0;
    // ---- look
    if (input.locked && !this.frozenLook) {
      const [mx, my] = input.consumeMouse();
      this.yaw -= mx;
      this.pitch = clamp(this.pitch - my, -1.5, 1.5);
    } else input.consumeMouse();
    // recoil recovery
    this.pitch = clamp(this.pitch + this.recoilPitch * dt * 12, -1.5, 1.5);
    this.yaw += this.recoilYaw * dt * 12;
    this.recoilPitch = damp(this.recoilPitch, 0, 14, dt);
    this.recoilYaw = damp(this.recoilYaw, 0, 14, dt);

    if (this.frozen) { this.updateCamera(dt, level); return; }

    // ---- intent
    const fwd = (input.act('forward') ? 1 : 0) - (input.act('back') ? 1 : 0);
    const str = (input.act('right') ? 1 : 0) - (input.act('left') ? 1 : 0);
    const wantCrouch = input.act('crouch') || this.downed;
    const wantSprint = input.act('sprint') && fwd > 0 && !wantCrouch && !this.downed && this.staminaOk;

    // crouch height (blocked by low ceiling when standing up)
    const head = level.headAt(this.body);
    const canStand = head - this.pos.y >= STAND_H + 0.02;
    this.crouching = !this.fly && (wantCrouch || (!canStand && !this.swimming));
    const targetH = this.downed ? 0.6 : this.seated ? 1.25 : this.crouching ? CROUCH_H : STAND_H;
    this.height = damp(this.height, targetH, 12, dt);

    // water
    const water = level.waterAt(this.pos.x, this.pos.z);
    const depth = water - this.pos.y;
    this.swimming = depth > 1.05;
    const eyeY = this.pos.y + this.height - EYE_OFF;
    this.underwater = water > eyeY + 0.02;
    const wading = depth > 0.25 && !this.swimming;

    let speed = this.downed ? 0.9 : this.swimming ? 2.3 : this.crouching ? 1.7 : wantSprint ? 5.7 : 3.3;
    if (wading) speed *= 0.65;
    if (this.staggerT > 0) { this.staggerT -= dt; speed *= 0.45; }
    speed *= this.speedMul * (this.fly ? 2.2 : 1) * (this.classSpeed || 1) * (this.armorSlow || 1);
    this.sprinting = wantSprint && !this.swimming && (fwd !== 0 || str !== 0);

    const sin = Math.sin(this.yaw), cos = Math.cos(this.yaw);
    let mx = -sin * fwd + cos * str, mz = -cos * fwd - sin * str;
    const ml = Math.hypot(mx, mz);
    if (ml > 0) { mx /= ml; mz /= ml; }
    this.moving = ml > 0;

    const accel = this.grounded || this.swimming ? 14 : 2.5;
    this.vel.x = damp(this.vel.x, mx * speed, accel, dt);
    this.vel.z = damp(this.vel.z, mz * speed, accel, dt);

    if (this.noclip) {
      const up = (input.act('jump') ? 1 : 0) - (input.act('crouch') ? 1 : 0);
      const cp = Math.cos(this.pitch);
      this.pos.x += (-sin * fwd * cp + cos * str) * 12 * dt;
      this.pos.z += (-cos * fwd * cp - sin * str) * 12 * dt;
      this.pos.y += (Math.sin(this.pitch) * fwd + up) * 12 * dt;
      this.fallStartY = this.pos.y;
      this.updateCamera(dt, level);
      return;
    }

    // ---- vertical
    if (this.fly) {
      const up = (input.act('jump') ? 1 : 0) - (input.act('crouch') ? 1 : 0);
      this.vel.y = damp(this.vel.y, up * 6, 8, dt);
      this.grounded = false;
      this.fallStartY = this.pos.y;
    } else if (this.swimming) {
      const up = (input.act('jump') ? 1 : 0) - (wantCrouch ? 1 : 0);
      // look-direction diving when moving forward
      const dive = fwd > 0 ? Math.sin(this.pitch) * 2.0 : 0;
      const buoy = depth > 1.35 ? 0.6 : 0; // gently float up toward the surface
      this.vel.y = damp(this.vel.y, up * 2.6 + dive + buoy, 4, dt);
      // keep head at surface when idle
      if (up === 0 && Math.abs(dive) < 0.1 && depth < 1.6 && depth > 1.2) this.vel.y = damp(this.vel.y, 0, 6, dt);
      this.grounded = false;
    } else {
      if (this.grounded && input.actPressed('jump') && !this.crouching && !this.downed && stats?.canJump?.() !== false) {
        this.vel.y = 4.6;
        this.grounded = false;
        this.events.push({ type: 'jump' });
        stats?.onJump?.();
      }
      this.vel.y -= 19 * dt;
      if (wading) this.vel.y = Math.max(this.vel.y, -6);
    }

    // ---- integrate horizontal with collision
    this.body.x = this.pos.x; this.body.y = this.pos.y; this.body.z = this.pos.z;
    this.body.h = this.height;
    this.body.step = this.grounded || this.swimming ? 0.5 : 0.18;
    if (this.swimming) this.body.step = Math.max(0.5, water - this.pos.y - 0.6 + 0.5);
    level.move(this.body, this.vel.x * dt, this.vel.z * dt);
    const moved = Math.hypot(this.body.x - this.pos.x, this.body.z - this.pos.z);
    this.pos.x = this.body.x; this.pos.z = this.body.z;

    // ---- vertical integration + ground
    let ground = level.groundAt(this.body);
    const prevY = this.pos.y;
    this.pos.y += this.vel.y * dt;
    if (ground === -Infinity) ground = -1e6;
    if (this.grounded && ground < this.pos.y && this.pos.y - ground < 0.55 && this.vel.y <= 0) {
      // step down stairs / slopes
      this.pos.y = ground;
    }
    if (this.pos.y <= ground) {
      if (!this.grounded && !this.swimming) {
        const fall = this.fallStartY - ground;
        const impact = -this.vel.y;
        if (impact > 3) this.events.push({ type: 'land', impact, fall });
      }
      this.pos.y = ground;
      this.vel.y = Math.max(0, this.vel.y);
      this.grounded = true;
      this.fallStartY = this.pos.y;
    } else if (this.pos.y > ground + 0.05) {
      if (this.grounded) this.fallStartY = this.pos.y;
      this.grounded = false;
    }
    // ceiling bump
    const ceil = level.headAt(this.body);
    if (this.pos.y + this.height > ceil && ceil > this.pos.y) {
      this.pos.y = Math.max(ground, ceil - this.height);
      if (this.vel.y > 0) this.vel.y = 0;
    }
    if (this.swimming && !this.underwater && prevY < water - 1.1 && this.vel.y > 0) {
      // clamp at surface
      this.pos.y = Math.min(this.pos.y, water - 1.12);
    }
    this.body.y = this.pos.y;

    // splash on entering water
    const nowWater = level.waterAt(this.pos.x, this.pos.z);
    if (nowWater - this.pos.y > 0.2 && !(water - prevY > 0.2)) this.events.push({ type: 'splash', strength: Math.min(1, Math.abs(this.vel.y) / 6 + 0.3) });

    // ---- footsteps
    this.speed = moved / Math.max(dt, 1e-4);
    if ((this.grounded || wading) && this.speed > 0.4) {
      this.stepDist += moved;
      const stride = this.sprinting ? 2.2 : this.crouching ? 1.2 : 1.7;
      if (this.stepDist > stride) {
        this.stepDist = 0;
        this.events.push({ type: 'step', sprint: this.sprinting, crouch: this.crouching, wet: wading });
      }
    } else if (this.swimming && this.speed > 0.5) {
      this.stepDist += moved;
      if (this.stepDist > 1.6) { this.stepDist = 0; this.events.push({ type: 'swim' }); }
    }

    this.updateCamera(dt, level);
  }

  updateCamera(dt, level) {
    const moving = this.grounded && this.speed > 0.3 && !this.frozen;
    const bobTarget = moving ? Math.min(1, this.speed / 5.5) : 0;
    this.bobAmt = damp(this.bobAmt, bobTarget, 8, dt);
    this.bobT += dt * (this.sprinting ? 13 : this.crouching ? 7 : 9.5) * (moving ? 1 : 0.3);
    const bobOn = settings.get('headBob') ? 1 : 0.25;
    const bobY = Math.abs(Math.sin(this.bobT)) * 0.055 * this.bobAmt * bobOn;
    const bobX = Math.cos(this.bobT) * 0.03 * this.bobAmt * bobOn;
    const swimBob = this.swimming ? Math.sin(performance.now() * 0.002) * 0.04 : 0;

    this.shake = Math.max(0, this.shake - dt * 2.5);
    const sh = this.shake * this.shake;
    const t = performance.now() * 0.001;
    const shx = (Math.sin(t * 47) + Math.sin(t * 31)) * 0.02 * sh;
    const shy = (Math.sin(t * 53) + Math.sin(t * 29)) * 0.02 * sh;

    const eyeH = this.height - EYE_OFF;
    const sin = Math.sin(this.yaw), cos = Math.cos(this.yaw);
    this.eye.set(this.pos.x + cos * bobX, this.pos.y + eyeH - bobY + swimBob, this.pos.z - sin * bobX);
    this.camera.position.copy(this.eye);
    this.camera.rotation.set(this.pitch + shy, this.yaw + shx, (this.downed ? 0.25 : 0) + Math.cos(this.bobT) * 0.004 * this.bobAmt * bobOn);
    const fovBase = settings.get('fov');
    this.fovKick = damp(this.fovKick, this.sprinting ? 6 : 0, 5, dt);
    const fov = fovBase + this.fovKick + (this.zoom || 0);
    if (Math.abs(this.camera.fov - fov) > 0.01) { this.camera.fov = fov; this.camera.updateProjectionMatrix(); }
    this.forward.set(0, 0, -1).applyEuler(this.camera.rotation);
  }

  addRecoil(pitch, yaw) { this.recoilPitch += pitch; this.recoilYaw += yaw; }
}
