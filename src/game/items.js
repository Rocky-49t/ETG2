// Item registry. Add new items here; behaviour is driven by `type`:
//  consumable  - use() applies `effects` (see stats.applyEffects)
//  battery     - recharges a flashlight
//  flashlight  - toggled with F, drains data.charge
//  tool        - held utility (lighter)
//  throwable   - thrown with LMB (glowstick, flare, decoy)
//  weapon      - see weapons.js (data.ammo / data.dur)
//  ammo, key, repair, misc

export const ITEMS = {
  almondWater: { name: 'Almond Water', desc: 'Faintly sweet and cold no matter how long it sat. Restores thirst and steadies the mind.', type: 'consumable', stack: 4, effects: { thirst: 38, sanity: 10 }, useTime: 1.1, sound: 'drink', icon: 'bottle', color: '#e9e3c6' },
  waterBottle: { name: 'Bottled Water', desc: 'A dusty plastic bottle. The seal is intact. Probably.', type: 'consumable', stack: 4, effects: { thirst: 30 }, useTime: 1.0, sound: 'drink', icon: 'bottle', color: '#8fc6e8' },
  snackBar: { name: 'Snack Bar', desc: 'Expired years ago. Still crunchy.', type: 'consumable', stack: 6, effects: { hunger: 22 }, useTime: 1.0, sound: 'eat', icon: 'bar', color: '#c9822f' },
  cannedBeans: { name: 'Canned Beans', desc: 'Heavy, filling and almost warm.', type: 'consumable', stack: 3, effects: { hunger: 48, health: 6 }, useTime: 2.0, sound: 'eat', icon: 'can', color: '#b54a32' },
  energyDrink: { name: 'Energy Drink', desc: 'Neon green. Grants a burst of stamina regeneration.', type: 'consumable', stack: 3, effects: { thirst: 14, staminaBoost: 40 }, useTime: 1.0, sound: 'drink', icon: 'can', color: '#5bd14f' },
  bandage: { name: 'Bandage', desc: 'Stops bleeding and slowly restores health.', type: 'consumable', stack: 5, effects: { regen: 28, stopBleed: true }, useTime: 2.2, sound: 'bandage', icon: 'bandage', color: '#e8e1d3' },
  medkit: { name: 'First Aid Kit', desc: 'A proper kit. Restores a large amount of health.', type: 'consumable', stack: 2, effects: { health: 55, stopBleed: true }, useTime: 4.0, sound: 'bandage', icon: 'medkit', color: '#d33b2e' },
  painkillers: { name: 'Painkillers', desc: 'Takes the edge off. Restores sanity and a little health.', type: 'consumable', stack: 4, effects: { sanity: 26, health: 6 }, useTime: 1.2, sound: 'pills', icon: 'pills', color: '#e0e0e0' },
  battery: { name: 'Battery', desc: 'Use to recharge your flashlight.', type: 'battery', stack: 6, icon: 'battery', color: '#d6b13a' },

  flashlight: { name: 'Flashlight', desc: 'Press F to toggle. Hold RMB (empty hands) to focus the beam — it stuns things that hate light.', type: 'flashlight', stack: 1, data: { charge: 100 }, icon: 'flashlight', color: '#3c3f44' },
  lighter: { name: 'Lighter', desc: 'A small flame. Hold it out to keep hounds at bay. Uses fuel.', type: 'tool', tool: 'lighter', stack: 1, data: { fuel: 100 }, icon: 'lighter', color: '#c0392b', hands: 'one' },
  glowstick: { name: 'Glowstick', desc: 'Crack and throw. Lights an area for two minutes.', type: 'throwable', throw: 'glowstick', stack: 8, icon: 'glowstick', color: '#5cff7a' },
  flare: { name: 'Road Flare', desc: 'Throw to light a fierce red fire for 45 seconds. Hounds will not cross it.', type: 'throwable', throw: 'flare', stack: 4, icon: 'flare', color: '#ff4a2a' },
  decoy: { name: 'Wind-up Music Box', desc: 'Throw it. It plays loudly for 15 seconds and draws things that listen.', type: 'throwable', throw: 'decoy', stack: 3, icon: 'decoy', color: '#a77bd8' },

  pistol: { name: 'Pistol', desc: '9mm semi-automatic. Reliable.', type: 'weapon', weapon: 'pistol', stack: 1, data: { ammo: 12 }, icon: 'pistol', color: '#2b2d30' },
  shotgun: { name: 'Pump Shotgun', desc: 'Devastating up close. Six shells.', type: 'weapon', weapon: 'shotgun', stack: 1, data: { ammo: 6 }, icon: 'shotgun', color: '#5a3b22' },
  smg: { name: 'SMG', desc: 'Fast and hungry for 9mm.', type: 'weapon', weapon: 'smg', stack: 1, data: { ammo: 30 }, icon: 'smg', color: '#26282a' },
  crowbar: { name: 'Crowbar', desc: 'Heavy melee. Pries open what keys cannot.', type: 'weapon', weapon: 'crowbar', stack: 1, data: { dur: 100 }, icon: 'crowbar', color: '#b33a2a' },
  knife: { name: 'Knife', desc: 'Fast, quiet melee.', type: 'weapon', weapon: 'knife', stack: 1, data: { dur: 100 }, icon: 'knife', color: '#9aa0a6' },
  ammo9: { name: '9mm Rounds', desc: 'For the pistol and SMG.', type: 'ammo', stack: 90, icon: 'ammo', color: '#c9a640' },
  shells: { name: 'Shotgun Shells', desc: '12 gauge.', type: 'ammo', stack: 30, icon: 'shells', color: '#b8342a' },
  ductTape: { name: 'Duct Tape', desc: 'Use to repair your held melee weapon.', type: 'repair', stack: 3, icon: 'tape', color: '#8c9196' },

  keycard: { name: 'Service Keycard', desc: 'A grimy maintenance keycard: "SERVICE ACCESS — TUNNEL EXIT". Opens the service door.', type: 'key', stack: 1, icon: 'keycard', color: '#e0a33a' },
  fuse: { name: 'Industrial Fuse', desc: 'A heavy ceramic fuse. Something in the stairwell needs power.', type: 'key', stack: 1, icon: 'fuse', color: '#5a8fd0' },
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
    default:
      g.fillStyle = col; g.fillRect(16, 16, 32, 32);
  }
  g.restore();
}
