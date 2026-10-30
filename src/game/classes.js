// Expedition roles. Each has a starting kit, passive modifiers and perks that
// hook into other systems (holster slots, armor, crafting, revives, sanity).
// Picked in the prologue's equipment bay, or on a role screen when the
// prologue is skipped.
import { makeItem, ITEMS } from './items.js';
import { HOTBAR, HOLSTER0 } from './inventory.js';

export const CLASSES = {
  soldier: {
    name: 'Soldier', role: 'Expedition security', color: '#8a9a52', icon: '⛨',
    blurb: 'Issued a carbine and a sidearm for a scouting run — enough ammunition for a level or two, not a war.',
    perks: ['Service rifle + pistol in two gun-only holster slots', 'Ballistic vest: absorbs 40% of damage', 'Vest slows you and tires you faster', 'Least food and medicine'],
    holsters: 2, armor: 'vest',
    kit: [['rifle', 1], ['pistol', 1], ['rifleAmmo', 60], ['ammo9', 24], ['flashlight', 1], ['cleanWater', 1], ['snackBar', 1], ['bandage', 1]],
    mods: { stamina: 1, sanity: 1, heal: 1 }, speed: 1,
  },
  medic: {
    name: 'Field Medic', role: 'Corpsman', color: '#d9534f', icon: '✚',
    blurb: 'Keeps the team breathing. Healing goes further in your hands.',
    perks: ['Healing items 50% stronger', 'Revives teammates twice as fast', 'Adrenaline shots: get yourself up when downed', 'Purification tablets for dirty water'],
    kit: [['flashlight', 1], ['medkit', 2], ['bandage', 4], ['painkillers', 2], ['adrenaline', 2], ['purifier', 3], ['cleanWater', 2], ['snackBar', 1]],
    mods: { stamina: 1, sanity: 1, heal: 1.5 }, speed: 1, reviveMul: 2,
  },
  scout: {
    name: 'Scout', role: 'Pathfinder', color: '#5bc0de', icon: '➶',
    blurb: 'First in, fastest out. Carries the team\'s location transmitters.',
    perks: ['Two ready-made Location Transmitters (share one)', '10% faster, stamina lasts 25% longer', 'Quieter footsteps', 'Knife and glowsticks, no gun'],
    kit: [['flashlight', 1], ['transmitter', 2], ['battery', 2], ['knife', 1], ['glowstick', 4], ['cleanWater', 1], ['snackBar', 2]],
    mods: { stamina: 0.75, sanity: 1, heal: 1 }, speed: 1.1, stepNoise: 0.55,
  },
  engineer: {
    name: 'Engineer', role: 'Machine technician', color: '#e3a33a', icon: '⚙',
    blurb: 'Kept the Goaning Machine running. Now keeps everything else running.',
    perks: ['Crowbar: pries hatches and doors in one go', 'Starts with an antenna and parts — a transmitter is one GPS board away', 'Flashlight batteries last 50% longer', 'Duct tape repairs fully'],
    kit: [['flashlight', 1], ['crowbar', 1], ['ductTape', 2], ['battery', 3], ['antenna', 1], ['wire', 2], ['scrap', 2], ['lighter', 1], ['cleanWater', 1], ['snackBar', 1]],
    mods: { stamina: 1, sanity: 1, heal: 1 }, speed: 1, batteryMul: 0.67, repairFull: true,
  },
  researcher: {
    name: 'Researcher', role: 'Dimensional analyst', color: '#a77bd8', icon: '◎',
    blurb: 'Studied the Goanrooms on paper for years. Reality bends less around a trained mind.',
    perks: ['Sanity drains 40% slower', 'Hears exits and key items from much farther', 'Notes restore more sanity', 'Can decrypt corrupted computer files'],
    kit: [['flashlight', 1], ['painkillers', 2], ['glowstick', 3], ['decoy', 1], ['battery', 2], ['purifier', 2], ['cleanWater', 2], ['snackBar', 1]],
    mods: { stamina: 1, sanity: 0.6, heal: 1 }, speed: 1, senseMul: 1.6, notesBonus: true,
  },
};
export const CLASS_ORDER = ['soldier', 'medic', 'scout', 'engineer', 'researcher'];

// Equip a role: fresh kit, holsters, modifiers, armor.
export function applyClass(game, id) {
  const C = CLASSES[id];
  if (!C) return;
  game.classId = id;
  const inv = game.inventory;
  inv.slots.fill(null);
  inv.setHolsters(C.holsters || 0);
  // tools, weapons and supplies go on the hotbar; parts, ammo and spares in the pack
  const PACK = new Set(['part', 'ammo', 'battery', 'repair', 'key']);
  for (const [item, qty] of C.kit) {
    const it = makeItem(item, qty);
    if (PACK.has(ITEMS[item].type)) {
      const i = inv.slots.findIndex((s, k) => !s && k >= HOTBAR && k < HOLSTER0);
      if (i >= 0) { inv.slots[i] = it; continue; }
    }
    inv.add(it);
  }
  inv.selected = 0;
  inv.changed();
  game.stats.mods = { ...C.mods };
  game.player.classSpeed = C.speed || 1;
  game.armor = C.armor ? makeItem(C.armor) : null;
  game.hud.armorChanged?.(game);
  game.held?.cancel();
}

export function classPerk(game, key, def) { return CLASSES[game.classId]?.[key] ?? def; }
