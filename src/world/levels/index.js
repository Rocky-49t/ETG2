// Level registry. Progression order is defined by each level's `next`.
import level0 from './level0.js';

export const LEVELS = {
  [level0.id]: level0,
};

export const LEVEL_ORDER = ['L0'];
export const FIRST_LEVEL = 'L0';
