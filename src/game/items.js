// Item registry. Add new items here; behaviour is driven by `type`:
//  consumable  - use() applies `effects` (see stats.applyEffects)
//  battery     - recharges a flashlight
//  flashlight  - toggled with F, drains data.charge
//  tool        - held utility (lighter)
//  throwable   - thrown with LMB (glowstick, flare, decoy)
//  weapon      - see weapons.js (data.ammo / data.dur)
//  transmitter - shows player coordinates while switched on (data.charge, data.on)
//  armor       - worn with use; absorbs damage (data.dur)
//  ammo, key, repair, part (crafting), misc

export const ITEMS = {
  cleanWater: { name: 'Clean Water', desc: 'Sealed and clear. Restores thirst and settles the nerves better than anything else down here.', type: 'consumable', stack: 4, effects: { thirst: 42, sanity: 14 }, useTime: 1.1, sound: 'drink', icon: 'bottle', color: '#9fd3ef' },
  dirtyWater: { name: 'Dirty Water', desc: 'Cloudy, with a taste of rust. Quenches thirst and calms you a little, but it sits badly. Purify it if you can.', type: 'consumable', stack: 4, effects: { thirst: 28, sanity: 5, health: -3 }, useTime: 1.1, sound: 'drink', icon: 'bottle', color: '#9a9168' },
  fireSalts: { name: 'Fire Salts', desc: 'Coarse red crystals in a foil pouch. Very filling, very salty. They burn on the way down and leave you thirsty.', type: 'consumable', stack: 4, effects: { hunger: 46, thirst: -12 }, useTime: 1.4, sound: 'eat', icon: 'salts', color: '#d9452b' },
  blueberryFireSalts: { name: 'Blueberry Fire Salts', desc: 'The rare blue batch. Sweet first, then the burn. Filling, and oddly comforting.', type: 'consumable', stack: 4, effects: { hunger: 42, thirst: -8, sanity: 8 }, useTime: 1.4, sound: 'eat', icon: 'salts', color: '#4a6fe0' },
  goanJuice: { name: 'Goan Juice', desc: 'Thick amber juice in an unlabeled bottle. Restores thirst and mends you a little.', type: 'consumable', stack: 4, effects: { thirst: 34, health: 18 }, useTime: 1.3, sound: 'drink', icon: 'bottle', color: '#e2a23a' },
  vigorTonic: { name: 'Vigor Tonic', desc: 'A Tufflandian field tonic. Restores some health, and for two minutes your stamina drains three times slower.', type: 'consumable', stack: 3, effects: { health: 12, thirst: 8, status: ['vigor', 120] }, useTime: 1.2, sound: 'drink', icon: 'tonic', color: '#62e0b8' },
  paleDraught: { name: 'Pale Draught', desc: 'A milky bottle from an office vending machine. It tastes of nothing at all. For a while, things that walk in ink seem not to notice you.', type: 'consumable', stack: 2, effects: { thirst: 10, status: ['inkward', 600] }, useTime: 1.5, sound: 'drink', icon: 'bottle', color: '#e8e4dc' },
  snackBar: { name: 'Snack Bar', desc: 'Expired years ago. Still crunchy.', type: 'consumable', stack: 6, effects: { hunger: 22 }, useTime: 1.0, sound: 'eat', icon: 'bar', color: '#c9822f' },
  cannedBeans: { name: 'Canned Beans', desc: 'Heavy, filling and almost warm.', type: 'consumable', stack: 3, effects: { hunger: 48, health: 6 }, useTime: 2.0, sound: 'eat', icon: 'can', color: '#b54a32' },
  energyDrink: { name: 'Energy Drink', desc: 'Neon green. Grants a burst of stamina regeneration.', type: 'consumable', stack: 3, effects: { thirst: 14, staminaBoost: 40 }, useTime: 1.0, sound: 'drink', icon: 'can', color: '#5bd14f' },
  bandage: { name: 'Bandage', desc: 'Stops bleeding and slowly restores health.', type: 'consumable', stack: 5, effects: { regen: 28, stopBleed: true }, useTime: 2.2, sound: 'bandage', icon: 'bandage', color: '#e8e1d3' },
  medkit: { name: 'First Aid Kit', desc: 'A proper kit. Restores a large amount of health.', type: 'consumable', stack: 2, effects: { health: 55, stopBleed: true }, useTime: 4.0, sound: 'bandage', icon: 'medkit', color: '#d33b2e' },
  painkillers: { name: 'Painkillers', desc: 'Takes the edge off. Restores sanity and a little health.', type: 'consumable', stack: 4, effects: { sanity: 32, health: 6 }, useTime: 1.2, sound: 'pills', icon: 'pills', color: '#e0e0e0' },
  adrenaline: { name: 'Adrenaline Shot', desc: 'Medical auto-injector. Use it while downed to get back on your feet.', type: 'consumable', stack: 2, effects: { revive: true, health: 30 }, useTime: 0.6, sound: 'pills', icon: 'syringe', color: '#e04a6a' },
  purifier: { name: 'Purification Tablets', desc: 'Crafting: turns dirty water into clean water.', type: 'part', stack: 8, icon: 'tablets', color: '#e8eef2' },
  battery: { name: 'Battery', desc: 'Use to recharge a flashlight or transmitter. Also a crafting part.', type: 'battery', stack: 6, icon: 'battery', color: '#d6b13a' },
  gpsBoard: { name: 'GPS Board', desc: 'A green circuit board pulled from expedition gear. Crafting part for a Location Transmitter.', type: 'part', stack: 3, icon: 'board', color: '#2f8a4a' },
  antenna: { name: 'Antenna', desc: 'A telescoping antenna with a cracked base. Crafting part for a Location Transmitter.', type: 'part', stack: 3, icon: 'antenna', color: '#b9bec4' },
  cloth: { name: 'Rags', desc: 'Torn fabric. Crafting part for bandages and armor.', type: 'part', stack: 8, icon: 'cloth', color: '#a89476' },
  scrap: { name: 'Scrap Metal', desc: 'Bent plates and brackets. Crafting part.', type: 'part', stack: 8, icon: 'scrap', color: '#8a8f94' },
  wire: { name: 'Copper Wire', desc: 'A coil of salvaged wire. Crafting part.', type: 'part', stack: 8, icon: 'wire', color: '#c8783a' },
  transmitter: { name: 'Location Transmitter', desc: 'Use to switch it on: shows your coordinates and every teammate\'s, updating every few seconds. Runs on battery.', type: 'transmitter', stack: 1, data: { charge: 100 }, icon: 'transmitter', color: '#3a4a3c' },
  vest: { name: 'Ballistic Vest', desc: 'Use to wear or remove. Absorbs 40% of damage until worn through, but slows you down and tires you faster.', type: 'armor', stack: 1, data: { dur: 100 }, armor: { absorb: 0.4, slow: 0.12, stamina: 1.25 }, icon: 'vest', color: '#4f5a3c' },
  scrapVest: { name: 'Scrap Armor', desc: 'Use to wear or remove. Rags and plates lashed together: absorbs 25% of damage, slows you a little.', type: 'armor', stack: 1, data: { dur: 100 }, armor: { absorb: 0.25, slow: 0.06, stamina: 1.1 }, icon: 'vest', color: '#7a6a52' },

  flashlight: { name: 'Flashlight', desc: 'Press F to toggle. Hold RMB (empty hands) to focus the beam — it stuns things that hate light.', type: 'flashlight', stack: 1, data: { charge: 100 }, icon: 'flashlight', color: '#3c3f44' },
  lighter: { name: 'Lighter', desc: 'A small flame. Hold it out to keep hounds at bay. Uses fuel.', type: 'tool', tool: 'lighter', stack: 1, data: { fuel: 100 }, icon: 'lighter', color: '#c0392b', hands: 'one' },
  glowstick: { name: 'Glowstick', desc: 'Crack and throw. Lights an area for two minutes.', type: 'throwable', throw: 'glowstick', stack: 8, icon: 'glowstick', color: '#5cff7a' },
  flare: { name: 'Road Flare', desc: 'Throw to light a fierce red fire for 45 seconds. Hounds will not cross it.', type: 'throwable', throw: 'flare', stack: 4, icon: 'flare', color: '#ff4a2a' },
  decoy: { name: 'Wind-up Music Box', desc: 'Throw it. It plays loudly for 15 seconds and draws things that listen.', type: 'throwable', throw: 'decoy', stack: 3, icon: 'decoy', color: '#a77bd8' },

  rifle: { name: 'Service Rifle', desc: 'Expedition-issue 5.56 carbine. Accurate and hard-hitting. Thirty rounds a magazine — and not many magazines.', type: 'weapon', weapon: 'rifle', gun: true, stack: 1, data: { ammo: 30 }, icon: 'rifle', color: '#2e3228' },
  rifleAmmo: { name: '5.56 Rounds', desc: 'For the service rifle.', type: 'ammo', stack: 60, icon: 'ammo', color: '#9aa04a' },
  pistol: { name: 'Pistol', desc: '9mm semi-automatic. Reliable.', type: 'weapon', weapon: 'pistol', gun: true, stack: 1, data: { ammo: 12 }, icon: 'pistol', color: '#2b2d30' },
  shotgun: { name: 'Pump Shotgun', desc: 'Devastating up close. Six shells.', type: 'weapon', weapon: 'shotgun', gun: true, stack: 1, data: { ammo: 6 }, icon: 'shotgun', color: '#5a3b22' },
  smg: { name: 'SMG', desc: 'Fast and hungry for 9mm.', type: 'weapon', weapon: 'smg', gun: true, stack: 1, data: { ammo: 30 }, icon: 'smg', color: '#26282a' },
  crowbar: { name: 'Crowbar', desc: 'Heavy melee. Pries open what keys cannot.', type: 'weapon', weapon: 'crowbar', stack: 1, data: { dur: 100 }, icon: 'crowbar', color: '#b33a2a' },
  knife: { name: 'Knife', desc: 'Fast, quiet melee.', type: 'weapon', weapon: 'knife', stack: 1, data: { dur: 100 }, icon: 'knife', color: '#9aa0a6' },
  ammo9: { name: '9mm Rounds', desc: 'For the pistol and SMG.', type: 'ammo', stack: 90, icon: 'ammo', color: '#c9a640' },
  shells: { name: 'Shotgun Shells', desc: '12 gauge.', type: 'ammo', stack: 30, icon: 'shells', color: '#b8342a' },
  ductTape: { name: 'Duct Tape', desc: 'Use to repair your held melee weapon.', type: 'repair', stack: 3, icon: 'tape', color: '#8c9196' },

  keycard: { name: 'Service Keycard', desc: 'A grimy maintenance keycard: "SERVICE ACCESS — TUNNEL EXIT". Opens the service door.', type: 'key', stack: 1, icon: 'keycard', color: '#e0a33a' },
  fuse: { name: 'Industrial Fuse', desc: 'A heavy ceramic fuse. Something in the stairwell needs power.', type: 'key', stack: 1, icon: 'fuse', color: '#5a8fd0' },
  level5Key: { name: 'Bridge Key', desc: 'A cold, heavy key stamped "5". Opens a Level 4 toll vault without solving its lock.', type: 'key', stack: 3, icon: 'tkey', color: '#d9d3a0' },
  drainKey: { name: 'Drain Valve Key', desc: 'A T-shaped key stamped "MAIN DRAIN". Opens the drainage grate.', type: 'key', stack: 1, icon: 'tkey', color: '#7fb8c9' },
};

export function itemDef(id) { return ITEMS[id]; }

export function makeItem(id, qty = 1) {
  const d = ITEMS[id];
  if (!d) return null;
  return { id, qty, data: d.data ? { ...d.data } : undefined };
}

// ---------------------------------------------------------------------------
// Procedural icons (cached canvases).
const iconCache = new Map();

export function itemIcon(id, size = 64) {
  const key = id + '@' + size;
  if (iconCache.has(key)) return iconCache.get(key);
  const d = ITEMS[id];
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  g.scale(size / 64, size / 64);
  g.lineJoin = 'round'; g.lineCap = 'round';
  drawIcon(g, d ? d.icon : '?', d ? d.color : '#888');
  iconCache.set(key, c);
  return c;
}

export function iconInto(el, id, size = 46) {
  el.innerHTML = '';
  if (!id) return;
  const src = itemIcon(id, 64);
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  c.getContext('2d').drawImage(src, 0, 0);
  c.style.width = c.style.height = size + 'px';
  el.appendChild(c);
}

function shade(hex, k) {
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  r = Math.max(0, Math.min(255, r * k)); g = Math.max(0, Math.min(255, g * k)); b = Math.max(0, Math.min(255, b * k));
  return `rgb(${r | 0},${g | 0},${b | 0})`;
}

function drawIcon(g, icon, col) {
  const out = 'rgba(0,0,0,0.85)';
  const fillStroke = (fill) => { g.fillStyle = fill; g.fill(); g.lineWidth = 2.5; g.strokeStyle = out; g.stroke(); };
  const rr = (x, y, w, h, r) => { g.beginPath(); g.roundRect(x, y, w, h, r); };
  g.save();
  switch (icon) {
    case 'bottle':
      rr(24, 6, 16, 8, 2); fillStroke('#ddd');
      g.beginPath(); g.moveTo(26, 14); g.lineTo(38, 14); g.lineTo(44, 24); g.lineTo(44, 56); g.quadraticCurveTo(44, 60, 40, 60); g.lineTo(24, 60); g.quadraticCurveTo(20, 60, 20, 56); g.lineTo(20, 24); g.closePath();
      fillStroke(col);
      rr(20, 32, 24, 12, 1); g.fillStyle = 'rgba(255,255,255,0.5)'; g.fill();
      g.fillStyle = 'rgba(255,255,255,0.35)'; g.fillRect(24, 20, 3, 34);
      break;
    case 'bar':
      g.translate(32, 32); g.rotate(-0.5);
      rr(-24, -10, 48, 20, 3); fillStroke(col);
      g.fillStyle = 'rgba(255,255,255,0.75)'; g.font = 'bold 9px sans-serif'; g.textAlign = 'center'; g.fillText('SNAK', 0, 3);
      g.fillStyle = shade(col, 0.6); g.fillRect(-24, -10, 6, 20); g.fillRect(18, -10, 6, 20);
      break;
    case 'can':
      rr(16, 12, 32, 44, 4); fillStroke(col);
      g.fillStyle = '#bbb'; rr(16, 10, 32, 6, 3); g.fill(); g.stroke();
      g.fillStyle = 'rgba(255,255,255,0.8)'; g.fillRect(16, 26, 32, 14);
      g.fillStyle = shade(col, 0.7); g.beginPath(); g.arc(32, 33, 5, 0, 7); g.fill();
      break;
    case 'bandage':
      g.translate(32, 32); g.rotate(-0.6);
      rr(-26, -9, 52, 18, 8); fillStroke(col);
      rr(-8, -9, 16, 18, 2); g.fillStyle = '#c8b8a0'; g.fill();
      g.fillStyle = 'rgba(0,0,0,0.2)'; for (let i = -6; i <= 6; i += 4) for (let j = -6; j <= 6; j += 4) g.fillRect(i, j, 1.5, 1.5);
      break;
    case 'medkit':
      rr(10, 18, 44, 34, 4); fillStroke(col);
      rr(24, 12, 16, 8, 2); g.lineWidth = 3; g.strokeStyle = out; g.stroke();
      g.fillStyle = '#fff'; g.fillRect(28, 25, 8, 20); g.fillRect(22, 31, 20, 8);
      break;
    case 'pills':
      rr(20, 18, 24, 40, 4); fillStroke('#e9a23b');
      rr(18, 10, 28, 10, 2); fillStroke('#fff');
      g.fillStyle = '#fff'; g.fillRect(20, 30, 24, 14);
      g.fillStyle = '#c33'; g.fillRect(26, 34, 12, 3); g.fillRect(30.5, 30, 3, 12);
      break;
    case 'battery':
      rr(14, 20, 36, 24, 3); fillStroke(col);
      rr(50, 27, 5, 10, 1); fillStroke('#999');
      g.fillStyle = '#222'; g.fillRect(14, 20, 12, 24);
      g.fillStyle = '#fff'; g.font = 'bold 12px sans-serif'; g.fillText('+', 33, 37);
      break;
    case 'flashlight':
      g.translate(32, 32); g.rotate(-0.6);
      rr(-26, -6, 34, 12, 3); fillStroke(col);
      g.beginPath(); g.moveTo(8, -6); g.lineTo(18, -11); g.lineTo(18, 11); g.lineTo(8, 6); g.closePath(); fillStroke(shade(col, 1.3));
      g.fillStyle = '#ffe9a0'; g.fillRect(18, -10, 4, 20); g.strokeRect(18, -10, 4, 20);
      g.fillStyle = '#c33'; g.fillRect(-10, -7, 5, 3);
      break;
    case 'lighter':
      rr(20, 26, 24, 32, 4); fillStroke(col);
      rr(22, 16, 20, 12, 2); fillStroke('#aaa');
      g.beginPath(); g.moveTo(32, 2); g.quadraticCurveTo(40, 10, 34, 16); g.quadraticCurveTo(26, 14, 32, 2); g.fillStyle = '#ffb030'; g.fill();
      break;
    case 'glowstick':
      g.translate(32, 32); g.rotate(0.7);
      rr(-6, -26, 12, 52, 6); g.fillStyle = col; g.shadowColor = col; g.shadowBlur = 10; g.fill(); g.shadowBlur = 0; g.lineWidth = 2.5; g.strokeStyle = out; g.stroke();
      g.fillStyle = 'rgba(255,255,255,0.6)'; g.fillRect(-3, -22, 2, 40);
      break;
    case 'flare':
      g.translate(32, 32); g.rotate(0.7);
      rr(-6, -24, 12, 46, 3); fillStroke(col);
      g.fillStyle = '#eee'; g.fillRect(-6, -10, 12, 8);
      rr(-5, -30, 10, 7, 2); fillStroke('#333');
      break;
    case 'decoy':
      rr(12, 24, 40, 28, 4); fillStroke(col);
      g.fillStyle = shade(col, 1.25); g.fillRect(12, 24, 40, 6);
      g.lineWidth = 3; g.strokeStyle = '#d4b04a'; g.beginPath(); g.arc(54, 38, 6, 0, Math.PI * 2); g.stroke();
      g.fillStyle = '#fff'; g.font = 'bold 14px serif'; g.fillText('♪', 26, 46);
      break;
    case 'pistol':
      g.beginPath(); g.moveTo(8, 20); g.lineTo(54, 20); g.lineTo(54, 30); g.lineTo(30, 30); g.lineTo(26, 52); g.lineTo(14, 52); g.lineTo(18, 30); g.lineTo(8, 30); g.closePath(); fillStroke(col);
      g.fillStyle = '#555'; g.fillRect(10, 22, 42, 3);
      g.lineWidth = 2.5; g.beginPath(); g.arc(30, 34, 5, 0, Math.PI); g.stroke();
      break;
    case 'shotgun':
      g.translate(32, 32); g.rotate(-0.3);
      g.beginPath(); g.moveTo(-30, -2); g.lineTo(30, -6); g.lineTo(30, 0); g.lineTo(-6, 3); g.lineTo(-14, 12); g.lineTo(-30, 10); g.closePath(); fillStroke(col);
      rr(-2, 1, 22, 5, 2); fillStroke('#3a3a3a');
      g.fillStyle = '#333'; g.fillRect(-4, -5, 34, 2);
      break;
    case 'smg':
      g.beginPath(); g.moveTo(6, 22); g.lineTo(58, 22); g.lineTo(58, 30); g.lineTo(40, 30); g.lineTo(38, 52); g.lineTo(30, 52); g.lineTo(30, 30); g.lineTo(22, 30); g.lineTo(18, 44); g.lineTo(10, 44); g.lineTo(12, 30); g.lineTo(6, 30); g.closePath(); fillStroke(col);
      g.fillStyle = '#4a4a4a'; g.fillRect(8, 24, 48, 2);
      break;
    case 'crowbar':
      g.lineWidth = 9; g.strokeStyle = out; g.beginPath(); g.moveTo(14, 56); g.lineTo(46, 12); g.quadraticCurveTo(50, 6, 56, 10); g.stroke();
      g.lineWidth = 5; g.strokeStyle = col; g.beginPath(); g.moveTo(14, 56); g.lineTo(46, 12); g.quadraticCurveTo(50, 6, 56, 10); g.stroke();
      g.lineWidth = 5; g.strokeStyle = col; g.beginPath(); g.moveTo(14, 56); g.lineTo(9, 52); g.stroke();
      break;
    case 'knife':
      g.translate(32, 32); g.rotate(-0.8);
      g.beginPath(); g.moveTo(-4, -4); g.lineTo(26, -4); g.quadraticCurveTo(24, 4, -4, 5); g.closePath(); fillStroke('#cfd4d8');
      rr(-26, -5, 22, 10, 3); fillStroke('#2a2a2a');
      g.fillStyle = '#777'; g.fillRect(-6, -7, 3, 14);
      break;
    case 'ammo':
      for (let i = 0; i < 3; i++) {
        const x = 16 + i * 12;
        rr(x, 24, 9, 30, 1); fillStroke(col);
        g.beginPath(); g.moveTo(x, 24); g.quadraticCurveTo(x + 4.5, 10, x + 9, 24); fillStroke('#b07a3a');
      }
      break;
    case 'shells':
      for (let i = 0; i < 2; i++) {
        const x = 18 + i * 16;
        rr(x, 14, 12, 32, 2); fillStroke(col);
        rr(x, 44, 12, 8, 1); fillStroke('#c9a640');
      }
      break;
    case 'tape':
      g.beginPath(); g.arc(32, 32, 22, 0, Math.PI * 2); fillStroke(col);
      g.beginPath(); g.arc(32, 32, 10, 0, Math.PI * 2); g.fillStyle = '#d8c8a0'; g.fill(); g.stroke();
      g.fillStyle = col; g.fillRect(40, 48, 18, 8);
      break;
    case 'keycard':
      rr(10, 16, 44, 30, 4); fillStroke(col);
      g.fillStyle = '#222'; g.fillRect(10, 22, 44, 6);
      g.fillStyle = '#fff'; g.fillRect(16, 34, 18, 3); g.fillRect(16, 39, 12, 3);
      g.fillStyle = '#d4b04a'; g.fillRect(40, 34, 8, 7);
      break;
    case 'fuse':
      rr(20, 12, 24, 40, 6); fillStroke('#eee');
      g.fillStyle = col; g.fillRect(20, 26, 24, 12);
      rr(26, 4, 12, 10, 2); fillStroke('#c9a640'); rr(26, 50, 12, 10, 2); fillStroke('#c9a640');
      break;
    case 'tkey':
      g.lineWidth = 8; g.strokeStyle = out; g.beginPath(); g.moveTo(14, 14); g.lineTo(50, 14); g.moveTo(32, 14); g.lineTo(32, 56); g.stroke();
      g.lineWidth = 4.5; g.strokeStyle = col; g.beginPath(); g.moveTo(14, 14); g.lineTo(50, 14); g.moveTo(32, 14); g.lineTo(32, 56); g.stroke();
      break;
    case 'salts':
      g.beginPath(); g.moveTo(14, 18); g.lineTo(50, 18); g.lineTo(46, 56); g.lineTo(18, 56); g.closePath(); fillStroke('#c8c2b0');
      g.fillStyle = col; for (let i = 0; i < 14; i++) { const x = 20 + (i * 37 % 24), y = 28 + (i * 23 % 24); g.fillRect(x, y, 4, 4); }
      rr(14, 12, 36, 8, 2); fillStroke(shade(col, 0.8));
      g.fillStyle = '#fff'; g.font = 'bold 8px sans-serif'; g.textAlign = 'center'; g.fillText('FIRE', 32, 26);
      break;
    case 'tonic':
      rr(26, 6, 12, 8, 2); fillStroke('#444');
      g.beginPath(); g.moveTo(28, 14); g.lineTo(36, 14); g.lineTo(36, 22); g.lineTo(46, 34); g.lineTo(46, 56); g.lineTo(18, 56); g.lineTo(18, 34); g.lineTo(28, 22); g.closePath(); fillStroke(col);
      g.fillStyle = 'rgba(255,255,255,0.75)'; g.fillRect(20, 38, 24, 9);
      g.fillStyle = '#1b6b55'; g.font = 'bold 7px sans-serif'; g.textAlign = 'center'; g.fillText('VIGOR', 32, 45);
      break;
    case 'syringe':
      g.translate(32, 32); g.rotate(-0.7);
      rr(-18, -6, 30, 12, 3); fillStroke(col);
      g.fillStyle = 'rgba(255,255,255,0.6)'; g.fillRect(-14, -3, 20, 3);
      rr(12, -3, 10, 6, 1); fillStroke('#ccc');
      g.lineWidth = 2; g.strokeStyle = '#ddd'; g.beginPath(); g.moveTo(22, 0); g.lineTo(30, 0); g.stroke();
      rr(-26, -8, 8, 16, 2); fillStroke('#666');
      break;
    case 'tablets':
      rr(14, 14, 36, 36, 5); fillStroke('#6aa7c8');
      g.fillStyle = col; for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) { g.beginPath(); g.arc(22 + i * 10, 22 + j * 10, 3.6, 0, 7); g.fill(); }
      break;
    case 'board':
      rr(10, 14, 44, 36, 3); fillStroke(col);
      g.fillStyle = '#222'; g.fillRect(22, 24, 14, 14);
      g.fillStyle = '#d4b04a'; for (let i = 0; i < 6; i++) { g.fillRect(12 + i * 7, 46, 3, 4); g.fillRect(40, 18 + i * 4, 10, 1.5); }
      g.strokeStyle = '#9fd38a'; g.lineWidth = 1.2; g.beginPath(); g.moveTo(14, 20); g.lineTo(22, 28); g.moveTo(36, 31); g.lineTo(48, 31); g.stroke();
      g.fillStyle = '#e33'; g.beginPath(); g.arc(48, 20, 2.2, 0, 7); g.fill();
      break;
    case 'antenna':
      g.lineWidth = 6; g.strokeStyle = out; g.beginPath(); g.moveTo(32, 54); g.lineTo(40, 8); g.stroke();
      g.lineWidth = 3.2; g.strokeStyle = col; g.beginPath(); g.moveTo(32, 54); g.lineTo(40, 8); g.stroke();
      g.beginPath(); g.arc(40, 8, 3, 0, 7); fillStroke('#ddd');
      rr(22, 50, 20, 8, 2); fillStroke('#333');
      break;
    case 'cloth':
      g.beginPath(); g.moveTo(12, 20); g.quadraticCurveTo(30, 10, 52, 18); g.lineTo(48, 50); g.quadraticCurveTo(30, 58, 14, 48); g.closePath(); fillStroke(col);
      g.strokeStyle = shade(col, 0.7); g.lineWidth = 1.5; for (let i = 0; i < 4; i++) { g.beginPath(); g.moveTo(16, 24 + i * 7); g.lineTo(48, 22 + i * 7); g.stroke(); }
      break;
    case 'scrap':
      g.beginPath(); g.moveTo(10, 30); g.lineTo(30, 14); g.lineTo(54, 22); g.lineTo(46, 40); g.lineTo(24, 52); g.closePath(); fillStroke(col);
      g.fillStyle = '#5a5f63'; g.beginPath(); g.arc(28, 32, 3, 0, 7); g.arc(42, 28, 3, 0, 7); g.fill();
      g.fillStyle = '#a0522d'; g.fillRect(34, 40, 8, 4);
      break;
    case 'wire':
      g.lineWidth = 3; g.strokeStyle = out;
      for (let i = 0; i < 5; i++) { g.beginPath(); g.ellipse(32, 32, 20 - i * 2, 14 - i * 1.5, 0.4, 0, 7); g.stroke(); }
      g.lineWidth = 2; g.strokeStyle = col;
      for (let i = 0; i < 5; i++) { g.beginPath(); g.ellipse(32, 32, 20 - i * 2, 14 - i * 1.5, 0.4, 0, 7); g.stroke(); }
      break;
    case 'transmitter':
      rr(16, 16, 32, 42, 4); fillStroke(col);
      g.fillStyle = '#7dffa0'; g.fillRect(21, 22, 22, 14);
      g.fillStyle = '#123'; g.font = 'bold 6px monospace'; g.fillText('X 12', 23, 28); g.fillText('Z -4', 23, 34);
      g.fillStyle = '#222'; for (let i = 0; i < 3; i++) { g.beginPath(); g.arc(24 + i * 8, 46, 2.5, 0, 7); g.fill(); }
      g.lineWidth = 4; g.strokeStyle = out; g.beginPath(); g.moveTo(42, 16); g.lineTo(46, 2); g.stroke();
      g.lineWidth = 2; g.strokeStyle = '#ccc'; g.beginPath(); g.moveTo(42, 16); g.lineTo(46, 2); g.stroke();
      break;
    case 'vest':
      g.beginPath(); g.moveTo(18, 10); g.lineTo(26, 10); g.quadraticCurveTo(32, 18, 38, 10); g.lineTo(46, 10); g.lineTo(52, 22); g.lineTo(48, 56); g.lineTo(16, 56); g.lineTo(12, 22); g.closePath(); fillStroke(col);
      g.fillStyle = shade(col, 0.75); g.fillRect(18, 30, 12, 10); g.fillRect(34, 30, 12, 10);
      g.strokeStyle = shade(col, 0.6); g.lineWidth = 2; g.beginPath(); g.moveTo(32, 20); g.lineTo(32, 56); g.stroke();
      break;
    case 'rifle':
      g.translate(32, 32); g.rotate(-0.25);
      g.beginPath(); g.moveTo(-30, -4); g.lineTo(18, -4); g.lineTo(18, 2); g.lineTo(-2, 2); g.lineTo(-6, 12); g.lineTo(-12, 12); g.lineTo(-12, 4); g.lineTo(-30, 6); g.closePath(); fillStroke(col);
      rr(-2, 2, 6, 12, 1); fillStroke('#222');
      g.fillStyle = '#222'; g.fillRect(18, -3, 12, 3); g.fillRect(-6, -9, 12, 4);
      break;
    default:
      g.fillStyle = col; g.fillRect(16, 16, 32, 32);
  }
  g.restore();
}
