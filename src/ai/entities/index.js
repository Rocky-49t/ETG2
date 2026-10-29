// Entity type registry. To add an entity: create a module exporting the type
// definition (think/build/animate/...) and register it here.
import hush from './hush.js';
import lookalike from './lookalike.js';

export const ENTITY_TYPES = {
  [hush.type]: hush,
  [lookalike.type]: lookalike,
};

export function registerEntity(def) { ENTITY_TYPES[def.type] = def; }
