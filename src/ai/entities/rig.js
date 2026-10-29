// Small helpers for building procedural creature rigs.
import * as THREE from 'three';

export function limb(mat, len, r0, r1 = r0, seg = 7) {
  // a cylinder whose top sits at the pivot and extends down -Y
  const g = new THREE.CylinderGeometry(r0, r1, len, seg);
  g.translate(0, -len / 2, 0);
  const m = new THREE.Mesh(g, mat);
  m.castShadow = true;
  return m;
}

export function joint(parent, x, y, z) {
  const j = new THREE.Group();
  j.position.set(x, y, z);
  parent.add(j);
  return j;
}

export function ball(mat, r, sx = 1, sy = 1, sz = 1, seg = 10) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(r, seg, Math.max(6, seg - 2)), mat);
  m.scale.set(sx, sy, sz);
  m.castShadow = true;
  return m;
}

export function boxm(mat, w, h, d) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.castShadow = true;
  return m;
}

// Two-segment leg (hip -> knee -> foot) returning joints for animation.
export function leg(parent, mat, x, y, z, upper, lower, r = 0.05) {
  const hip = joint(parent, x, y, z);
  hip.add(limb(mat, upper, r, r * 0.8));
  const knee = joint(hip, 0, -upper, 0);
  knee.add(limb(mat, lower, r * 0.8, r * 0.55));
  const foot = joint(knee, 0, -lower, 0);
  return { hip, knee, foot };
}

export const glowMat = (color, intensity = 3) => new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(intensity) });
