// Entity type registry. To add an entity: create a module exporting the type
// definition (think/build/animate/...) and register it here.
import hush from './hush.js';
import lookalike from './lookalike.js';
import marrowhound from './marrowhound.js';
import inkwalker from './inkwalker.js';
import undertow from './undertow.js';
import goaner from './goaner.js';
import scuttler from './scuttler.js';

export const ENTITY_TYPES = {};
for (const d of [hush, lookalike, marrowhound, inkwalker, undertow, goaner, scuttler]) ENTITY_TYPES[d.type] = d;

export function registerEntity(def) { ENTITY_TYPES[def.type] = def; }
