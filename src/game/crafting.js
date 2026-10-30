// Crafting: recipes combine scavenged parts into items. The inventory screen
// lists every recipe with what you have / need, so players always know what
// to look for.
import { ITEMS, makeItem } from './items.js';

export const RECIPES = [
  { out: ['transmitter', 1], in: [['gpsBoard', 1], ['antenna', 1], ['battery', 1]], note: 'Shows your coordinates and every teammate\'s.' },
  { out: ['cleanWater', 1], in: [['dirtyWater', 1], ['purifier', 1]], note: 'Purify cloudy water.' },
  { out: ['bandage', 1], in: [['cloth', 2]], note: 'Stops bleeding.' },
  { out: ['medkit', 1], in: [['bandage', 2], ['painkillers', 1]], note: 'A proper kit.' },
  { out: ['knife', 1], in: [['scrap', 1], ['ductTape', 1]], note: 'A sharpened plate with a taped grip.' },
  { out: ['decoy', 1], in: [['scrap', 1], ['wire', 1], ['battery', 1]], note: 'A buzzing noisemaker that draws things that listen.' },
  { out: ['glowstick', 2], in: [['wire', 1], ['battery', 1]], note: 'Two improvised chem lights.' },
  { out: ['scrapVest', 1], in: [['cloth', 3], ['scrap', 3], ['ductTape', 1]], note: 'Light armor: absorbs 25% of damage.' },
  { out: ['ductTape', 1], in: [['cloth', 2], ['wire', 1]], note: 'Not real tape, but it holds.' },
];

export function canCraft(inv, r) { return r.in.every(([id, n]) => inv.count(id) >= n); }

export function craft(game, r) {
  const inv = game.inventory;
  if (!canCraft(inv, r)) return false;
  if (!inv.canFit(r.out[0], r.out[1]) && !r.in.some(([id]) => inv.count(id) <= 1)) { game.subtitle('No room for that.', 1.4); return false; }
  for (const [id, n] of r.in) inv.consume(id, n);
  const left = inv.add(makeItem(r.out[0], r.out[1]));
  if (left > 0) game.dropItem({ id: r.out[0], qty: left, data: ITEMS[r.out[0]].data ? { ...ITEMS[r.out[0]].data } : undefined });
  game.sfx('rummage', null, { volume: 0.7 });
  game.sfx('pickup', null, {});
  game.hud.pickupToast('Crafted ' + ITEMS[r.out[0]].name, r.out[1]);
  game.onCrafted?.(r.out[0]);
  return true;
}
