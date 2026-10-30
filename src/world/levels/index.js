// Level registry. Progression order is defined by each level's `next`.
// To add a level: create a module exporting a level definition (see
// level0.js for the full shape) and register it here.
import level0 from './level0.js';
import level1 from './level1.js';
import level2 from './level2.js';
import level3 from './level3.js';
import level5 from './level5.js';
import prologue from './prologue.js';

export const LEVELS = {};
for (const l of [prologue, level0, level1, level2, level3, level5]) LEVELS[l.id] = l;

export const LEVEL_ORDER = ['L0', 'L1', 'L2', 'L3', 'L5'];
export const FIRST_LEVEL = 'L0';
