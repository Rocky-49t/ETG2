// GeoBuilder: accumulates triangles per material into merged buffers so each
// chunk renders with one draw call per material. Every vertex carries a baked
// irradiance value supplied by a bake callback.
import * as THREE from 'three';

class Bucket {
  constructor() {
    this.pos = []; this.nor = []; this.uv = []; this.baked = []; this.idx = [];
    this.count = 0;
  }
}

const _v = new THREE.Vector3(), _n = new THREE.Vector3();
const _nm = new THREE.Matrix3();

export class GeoBuilder {
  constructor() {
    this.buckets = new Map();
    this.M = new THREE.Matrix4();
    this.NM = new THREE.Matrix3();
    this.identity = true;
    // bake(x,y,z,nx,ny,nz) -> [r,g,b]
    this.bake = () => [0.1, 0.1, 0.1];
    this.anchor = null; // when set, props use anchored lighting (cheap)
  }

  bucket(mat) {
    let b = this.buckets.get(mat);
    if (!b) { b = new Bucket(); this.buckets.set(mat, b); }
    return b;
  }

  // Set a transform for subsequent primitive calls (translate + yaw [+ scale]).
  setTransform(x, y, z, ry = 0, s = 1) {
    this.M.makeRotationY(ry);
    if (s !== 1) this.M.scale(new THREE.Vector3(s, s, s));
    this.M.setPosition(x, y, z);
    this.NM.getNormalMatrix(this.M);
    this.identity = false;
  }
  setMatrix(m) { this.M.copy(m); this.NM.getNormalMatrix(m); this.identity = false; }
  resetTransform() { this.M.identity(); this.NM.identity(); this.identity = true; this.anchor = null; }

  // Cheap lighting for props: sample the bake once at an anchor point.
  setAnchor(x, y, z) {
    const l = this.bake(x, y, z, 0, 1, 0, true);
    const s = this.bake(x, y, z, 0, 0, 0, true); // omni sample
    this.anchor = [(l[0] + s[0]) * 0.5, (l[1] + s[1]) * 0.5, (l[2] + s[2]) * 0.5];
    this.anchorY = y;
  }

  _bakeVertex(x, y, z, nx, ny, nz) {
    if (this.anchor) {
      const k = 0.78 + 0.22 * ny;
      const a = this.anchor;
      // darken near the ground for contact shadow
      const ao = 0.62 + 0.38 * Math.min(1, Math.max(0, (y - this.anchorY + 0.05) / 0.6));
      return [a[0] * k * ao, a[1] * k * ao, a[2] * k * ao];
    }
    return this.bake(x, y, z, nx, ny, nz, false);
  }

  _push(b, x, y, z, nx, ny, nz, u, v) {
    if (!this.identity) {
      _v.set(x, y, z).applyMatrix4(this.M);
      _n.set(nx, ny, nz).applyMatrix3(this.NM).normalize();
      x = _v.x; y = _v.y; z = _v.z; nx = _n.x; ny = _n.y; nz = _n.z;
    }
    b.pos.push(x, y, z);
    b.nor.push(nx, ny, nz);
    b.uv.push(u, v);
    const c = this._bakeVertex(x, y, z, nx, ny, nz);
    b.baked.push(c[0], c[1], c[2]);
    return b.count++;
  }

  // Quad from 4 corners (counter-clockwise when viewed from the front).
  quad(mat, p0, p1, p2, p3, n, uv = [[0, 0], [1, 0], [1, 1], [0, 1]]) {
    const b = this.bucket(mat);
    const a = this._push(b, p0[0], p0[1], p0[2], n[0], n[1], n[2], uv[0][0], uv[0][1]);
    this._push(b, p1[0], p1[1], p1[2], n[0], n[1], n[2], uv[1][0], uv[1][1]);
    this._push(b, p2[0], p2[1], p2[2], n[0], n[1], n[2], uv[2][0], uv[2][1]);
    this._push(b, p3[0], p3[1], p3[2], n[0], n[1], n[2], uv[3][0], uv[3][1]);
    b.idx.push(a, a + 1, a + 2, a, a + 2, a + 3);
  }

  // Subdivided quad: origin o, edge vectors eu, ev, segments su x sv; uv from fn.
  grid(mat, o, eu, ev, su, sv, n, uvFn) {
    const b = this.bucket(mat);
    const start = b.count;
    for (let j = 0; j <= sv; j++) {
      for (let i = 0; i <= su; i++) {
        const fu = i / su, fv = j / sv;
        const x = o[0] + eu[0] * fu + ev[0] * fv;
        const y = o[1] + eu[1] * fu + ev[1] * fv;
        const z = o[2] + eu[2] * fu + ev[2] * fv;
        const uv = uvFn(x, y, z, fu, fv);
        this._push(b, x, y, z, n[0], n[1], n[2], uv[0], uv[1]);
      }
    }
    for (let j = 0; j < sv; j++) {
      for (let i = 0; i < su; i++) {
        const a = start + j * (su + 1) + i;
        b.idx.push(a, a + 1, a + su + 2, a, a + su + 2, a + su + 1);
      }
    }
  }

  // Axis-aligned (in local space) box with world-scaled UVs. cx,cy,cz centre.
  box(mat, cx, cy, cz, sx, sy, sz, uvScale = 1, faces = 63) {
    const hx = sx / 2, hy = sy / 2, hz = sz / 2;
    const x0 = cx - hx, x1 = cx + hx, y0 = cy - hy, y1 = cy + hy, z0 = cz - hz, z1 = cz + hz;
    const k = 1 / uvScale;
    // +x
    if (faces & 1) this.quad(mat, [x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [1, 0, 0], [[0, 0], [sz * k, 0], [sz * k, sy * k], [0, sy * k]]);
    // -x
    if (faces & 2) this.quad(mat, [x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [-1, 0, 0], [[0, 0], [sz * k, 0], [sz * k, sy * k], [0, sy * k]]);
    // +y
    if (faces & 4) this.quad(mat, [x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], [0, 1, 0], [[0, 0], [sx * k, 0], [sx * k, sz * k], [0, sz * k]]);
    // -y
    if (faces & 8) this.quad(mat, [x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], [0, -1, 0], [[0, 0], [sx * k, 0], [sx * k, sz * k], [0, sz * k]]);
    // +z
    if (faces & 16) this.quad(mat, [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [0, 0, 1], [[0, 0], [sx * k, 0], [sx * k, sy * k], [0, sy * k]]);
    // -z
    if (faces & 32) this.quad(mat, [x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [0, 0, -1], [[0, 0], [sx * k, 0], [sx * k, sy * k], [0, sy * k]]);
  }

  // Cylinder along Y (local), radius r, height h, base centre at (cx,cy,cz).
  cyl(mat, cx, cy, cz, r, h, seg = 10, caps = true, r2 = r, uvScale = 1) {
    const b = this.bucket(mat);
    const start = b.count;
    const circ = Math.PI * 2 * r;
    for (let i = 0; i <= seg; i++) {
      const a = (i / seg) * Math.PI * 2;
      const ca = Math.cos(a), sa = Math.sin(a);
      this._push(b, cx + ca * r, cy, cz + sa * r, ca, 0, sa, (i / seg) * circ / uvScale, 0);
      this._push(b, cx + ca * r2, cy + h, cz + sa * r2, ca, 0, sa, (i / seg) * circ / uvScale, h / uvScale);
    }
    for (let i = 0; i < seg; i++) {
      const a = start + i * 2;
      b.idx.push(a, a + 1, a + 3, a, a + 3, a + 2);
    }
    if (caps) {
      for (const [yy, ny, rr] of [[cy + h, 1, r2], [cy, -1, r]]) {
        const c0 = this._push(b, cx, yy, cz, 0, ny, 0, 0.5, 0.5);
        for (let i = 0; i <= seg; i++) {
          const a = (i / seg) * Math.PI * 2;
          this._push(b, cx + Math.cos(a) * rr, yy, cz + Math.sin(a) * rr, 0, ny, 0, 0.5 + Math.cos(a) * 0.5, 0.5 + Math.sin(a) * 0.5);
        }
        for (let i = 0; i < seg; i++) {
          if (ny > 0) b.idx.push(c0, c0 + 2 + i, c0 + 1 + i);
          else b.idx.push(c0, c0 + 1 + i, c0 + 2 + i);
        }
      }
    }
  }

  // Cylinder between two local points (pipes).
  tube(mat, ax, ay, az, bx, by, bz, r, seg = 8, uvScale = 1) {
    const dir = new THREE.Vector3(bx - ax, by - ay, bz - az);
    const len = dir.length();
    if (len < 1e-4) return;
    dir.divideScalar(len);
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    const m = new THREE.Matrix4().compose(new THREE.Vector3(ax, ay, az), q, new THREE.Vector3(1, 1, 1));
    const saved = this.M.clone(), savedId = this.identity;
    const combined = savedId ? m : saved.clone().multiply(m);
    this.setMatrix(combined);
    this.cyl(mat, 0, 0, 0, r, len, seg, false, r, uvScale);
    if (savedId) this.resetTransformKeepAnchor(); else this.setMatrix(saved);
  }

  resetTransformKeepAnchor() { this.M.identity(); this.NM.identity(); this.identity = true; }

  // Append an arbitrary BufferGeometry (positions/normals/uvs) with transform.
  geometry(mat, geo, matrix) {
    const b = this.bucket(mat);
    const pos = geo.attributes.position, nor = geo.attributes.normal, uv = geo.attributes.uv;
    const saved = this.M.clone(), savedId = this.identity;
    if (matrix) this.setMatrix(savedId ? matrix : saved.clone().multiply(matrix));
    const start = b.count;
    for (let i = 0; i < pos.count; i++) {
      this._push(b, pos.getX(i), pos.getY(i), pos.getZ(i), nor ? nor.getX(i) : 0, nor ? nor.getY(i) : 1, nor ? nor.getZ(i) : 0, uv ? uv.getX(i) : 0, uv ? uv.getY(i) : 0);
    }
    if (geo.index) { const ix = geo.index.array; for (let i = 0; i < ix.length; i++) b.idx.push(start + ix[i]); }
    else for (let i = 0; i < pos.count; i++) b.idx.push(start + i);
    if (matrix) { if (savedId) this.resetTransformKeepAnchor(); else this.setMatrix(saved); }
  }

  // Build meshes. getMat(name) -> THREE.Material
  build(getMat, opts = {}) {
    const group = new THREE.Group();
    for (const [name, b] of this.buckets) {
      if (!b.count) continue;
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(b.pos, 3));
      g.setAttribute('normal', new THREE.Float32BufferAttribute(b.nor, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(b.uv, 2));
      g.setAttribute('baked', new THREE.Float32BufferAttribute(b.baked, 3));
      g.setIndex(b.count > 65535 ? new THREE.Uint32BufferAttribute(b.idx, 1) : new THREE.Uint16BufferAttribute(b.idx, 1));
      g.computeBoundingSphere();
      g.computeBoundingBox();
      const mat = getMat(name);
      const mesh = new THREE.Mesh(g, mat);
      mesh.name = name;
      mesh.matrixAutoUpdate = false;
      mesh.castShadow = opts.castShadow !== false && !(mat.transparent);
      mesh.receiveShadow = true;
      if (mat.transparent) mesh.renderOrder = 2;
      group.add(mesh);
    }
    return group;
  }
}
