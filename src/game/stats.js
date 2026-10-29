// Survival needs for the local player: health, stamina, hunger, thirst,
// sanity and oxygen. Kept deliberately readable — few numbers, clear effects.
import { clamp } from '../core/rng.js';
import { Emitter } from '../core/events.js';

export class Stats extends Emitter {
  constructor() {
    super();
    this.reset();
  }

  reset(partial = false) {
    this.health = partial ? 60 : 100;
    this.stamina = 100;
    this.hunger = partial ? Math.max(this.hunger ?? 100, 60) : 100;
    this.thirst = partial ? Math.max(this.thirst ?? 100, 60) : 100;
    this.sanity = partial ? Math.max(this.sanity ?? 100, 65) : 100;
    this.oxygen = 100;
    this.regen = 0;          // pending heal-over-time pool
    this.staminaBoost = 0;   // seconds of boosted stamina regen
    this.bleeding = 0;       // hp/s
    this.staminaLock = 0;    // exhausted: can't sprint until recovered
    this.sinceSprint = 10;
    this.dead = false;
    this.lastDamage = 0;
    this.time = 0;
  }

  get exhausted() { return this.staminaLock > 0; }

  // env: {sprinting, swimming, underwater, darkness 0..1, nearbyThreat 0..1, teammatesNear, inBrightLight}
  update(dt, env) {
    if (this.dead) return;
    this.time += dt;
    // hunger / thirst
    this.thirst = clamp(this.thirst - dt * (env.sprinting ? 0.16 : 0.085), 0, 100);
    this.hunger = clamp(this.hunger - dt * (env.sprinting ? 0.09 : 0.055), 0, 100);
    if (this.thirst <= 0) this.damage(dt * 0.6, 'thirst', true);
    if (this.hunger <= 0) this.damage(dt * 0.4, 'hunger', true);

    // stamina
    if (env.sprinting || env.swimFast) {
      this.stamina -= dt * (env.swimming ? 9 : 17);
      this.sinceSprint = 0;
      if (this.stamina <= 0) { this.stamina = 0; this.staminaLock = 1; this.emit('exhausted'); }
    } else {
      this.sinceSprint += dt;
      if (this.sinceSprint > 0.9) {
        let rate = 16;
        if (this.hunger < 15 || this.thirst < 15) rate *= 0.5;
        if (this.staminaBoost > 0) rate *= 2.2;
        this.stamina = Math.min(100, this.stamina + rate * dt);
      }
    }
    if (this.staminaLock > 0 && this.stamina > 35) this.staminaLock = 0;
    this.staminaBoost = Math.max(0, this.staminaBoost - dt);

    // oxygen
    if (env.underwater) {
      this.oxygen -= dt * 7.5;
      if (this.oxygen <= 0) { this.oxygen = 0; this.damage(dt * 9, 'drown', true); }
    } else this.oxygen = Math.min(100, this.oxygen + dt * 30);

    // healing over time
    if (this.regen > 0) {
      const h = Math.min(this.regen, dt * 6);
      this.regen -= h;
      this.health = Math.min(100, this.health + h);
    }
    if (this.bleeding > 0) {
      this.damage(this.bleeding * dt, 'bleed', true);
      this.bleeding = Math.max(0, this.bleeding - dt * 0.05);
    }
    // slow natural regen when well fed
    if (this.hunger > 60 && this.thirst > 60 && this.time - this.lastDamage > 12 && this.health < 100) this.health = Math.min(100, this.health + dt * 0.35);

    // sanity
    let ds = 0;
    ds -= env.darkness * 0.55;
    ds -= env.nearbyThreat * 2.2;
    if (env.inBrightLight) ds += 0.25;
    if (env.teammatesNear) ds += 0.2;
    if (env.sanityDrain) ds -= env.sanityDrain;
    if (ds > 0 && this.sanity >= 75) ds = 0; // light alone can't fully restore
    this.sanity = clamp(this.sanity + ds * dt, 0, 100);
  }

  damage(amount, cause = 'hit', silent = false) {
    if (this.dead || amount <= 0) return;
    this.health -= amount;
    this.lastDamage = this.time;
    if (!silent) this.emit('damage', amount, cause);
    if (this.health <= 0) {
      this.health = 0;
      this.emit('zero', cause);
    }
  }

  applyEffects(fx) {
    if (fx.thirst) this.thirst = clamp(this.thirst + fx.thirst, 0, 100);
    if (fx.hunger) this.hunger = clamp(this.hunger + fx.hunger, 0, 100);
    if (fx.health) this.health = clamp(this.health + fx.health, 0, 100);
    if (fx.sanity) this.sanity = clamp(this.sanity + fx.sanity, 0, 100);
    if (fx.regen) this.regen += fx.regen;
    if (fx.stopBleed) this.bleeding = 0;
    if (fx.staminaBoost) { this.staminaBoost += fx.staminaBoost; this.stamina = Math.min(100, this.stamina + 30); }
  }

  scare(amount) { this.sanity = clamp(this.sanity - amount, 0, 100); }

  serialize() {
    return { health: this.health, hunger: this.hunger, thirst: this.thirst, sanity: this.sanity, stamina: this.stamina };
  }
}
