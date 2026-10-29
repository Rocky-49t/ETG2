// Chunk data: a 16x16 grid of 2 m tiles plus lists of props, colliders,
// lights, decals and interactive objects. Pure data — no Three.js — so the
// host can generate chunks for AI/collision in levels it isn't rendering.

export const TILE = 2;
export const CS = 16;              // tiles per chunk side
export const CHUNK = TILE * CS;    // metres per chunk side
export const N_TILES = CS * CS;

export const T_SOLID = 0;
export const T_FLOOR = 1;
export const T_VOID = 2;

// tile flag bits
export const F_ROOM = 1;        // part of a room (vs corridor)
export const F_DARK = 2;        // lights intentionally absent
export const F_RESERVED = 4;    // keep clear of props (paths, landmarks)
export const F_NAVBLOCK = 8;    // blocked for AI by a prop
export const F_NOCEIL = 16;     // open to the sky
export const F_LANDMARK = 32;   // exit / key room
export const F_NOWALLDECOR = 64;

export const NO_WATER = -1e9;
export const OPEN_SKY = 1e9;

export class ChunkData {
  constructor(cx, cz) {
    this.cx = cx;
    this.cz = cz;
    this.key = cx + ',' + cz;
    this.type = new Uint8Array(N_TILES);            // all solid by default
    this.floor = new Float32Array(N_TILES);
    this.ceil = new Float32Array(N_TILES).fill(3);
    this.water = new Float32Array(N_TILES).fill(NO_WATER);
    this.fmat = new Uint8Array(N_TILES);
    this.wmat = new Uint8Array(N_TILES);
    this.cmat = new Uint8Array(N_TILES);
    this.ramp = new Int8Array(N_TILES).fill(-1);  // direction the ramp rises: 0:+x 1:+z 2:-x 3:-z
    this.rampH = new Float32Array(N_TILES);
    this.flags = new Uint8Array(N_TILES);
    this.colliders = [];  // {x0,y0,z0,x1,y1,z1}
    this.props = [];      // {kind, x, y, z, ry, ...}
    this.lights = [];     // {x,y,z,color:[r,g,b],intensity,range,flicker,kind,w,d,id}
    this.decals = [];     // {name,x,y,z,nx,ny,nz,size,rot}
    this.objects = [];    // interactive objects {id, kind, x,y,z, ry, ...}
    this.spawns = [];     // entity hints {type,x,z}
    this.meta = {};
    this.x0 = cx * CHUNK;
    this.z0 = cz * CHUNK;
  }

  static idx(lx, lz) { return lz * CS + lx; }
  inBounds(lx, lz) { return lx >= 0 && lz >= 0 && lx < CS && lz < CS; }

  // world-space centre of a local tile
  tx(lx) { return this.x0 + (lx + 0.5) * TILE; }
  tz(lz) { return this.z0 + (lz + 0.5) * TILE; }

  // Adds an AABB collider; marks tiles whose centre it covers as nav-blocked.
  addCollider(x0, y0, z0, x1, y1, z1, navBlock = true) {
    const c = { x0: Math.min(x0, x1), y0: Math.min(y0, y1), z0: Math.min(z0, z1), x1: Math.max(x0, x1), y1: Math.max(y0, y1), z1: Math.max(z0, z1) };
    this.colliders.push(c);
    if (navBlock && c.y1 - c.y0 > 0.5) {
      for (let lz = 0; lz < CS; lz++) {
        const zc = this.tz(lz);
        if (zc < c.z0 || zc > c.z1) continue;
        for (let lx = 0; lx < CS; lx++) {
          const xc = this.tx(lx);
          if (xc >= c.x0 && xc <= c.x1) this.flags[lz * CS + lx] |= F_NAVBLOCK;
        }
      }
    }
    return c;
  }
}
