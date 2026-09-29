import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// ─────────────────────────────────────────────────────────────
// Jewels, chatons, screws, arbors — the small things that make a
// movement read as real. Geometry is cached and shared.
// ─────────────────────────────────────────────────────────────

const cache = new Map();
const cached = (key, fn) => {
  if (!cache.has(key)) cache.set(key, fn());
  return cache.get(key);
};

/** Olive-domed pierced jewel with an oil sink, sitting on z=0 facing +z. */
export function jewelGeometry(R = 0.42) {
  return cached('jewel' + R, () => {
    const hole = 0.06;
    const prof = [
      [hole, 0], [R * 0.98, 0], [R, 0.03], [R, 0.1], [R * 0.9, 0.15], [R * 0.7, 0.18],
      [R * 0.42, 0.19], [R * 0.3, 0.17], [hole * 1.6, 0.13], [hole, 0.11], [hole, 0],
    ].map(([r, z]) => new THREE.Vector2(r, z));
    const g = new THREE.LatheGeometry(prof, 40);
    g.rotateX(Math.PI / 2);
    return g;
  });
}

/** Polished gold chaton ring that holds a jewel. */
export function chatonGeometry(R = 0.42) {
  return cached('chaton' + R, () => {
    const o = R + 0.26;
    const prof = [
      [R, 0.0], [o, 0.0], [o, 0.16], [o - 0.07, 0.22], [R + 0.03, 0.2], [R, 0.14], [R, 0.0],
    ].map(([r, z]) => new THREE.Vector2(r, z));
    const g = new THREE.LatheGeometry(prof, 48);
    g.rotateX(Math.PI / 2);
    return g;
  });
}

/** Slotted cheese-head screw: domed polished head, slot along local X. */
export function screwGeometry(R = 0.36, H = 0.26, slot = 0.07) {
  return cached(`screw${R}:${H}`, () => {
    const parts = [];
    const base = new THREE.CylinderGeometry(R, R, H * 0.45, 32);
    base.rotateX(Math.PI / 2);
    base.translate(0, 0, H * 0.225);
    parts.push(base.index ? base.toNonIndexed() : base);
    for (const sgn of [1, -1]) {
      const s = new THREE.Shape();
      const a0 = Math.asin(slot / 2 / R);
      s.moveTo(R * Math.cos(a0), slot / 2);
      s.absarc(0, 0, R, a0, Math.PI - a0, false);
      s.lineTo(-R * Math.cos(a0), slot / 2);
      const g = new THREE.ExtrudeGeometry(s, {
        depth: H * 0.4, bevelEnabled: true, bevelThickness: H * 0.12, bevelSize: R * 0.18, bevelOffset: -R * 0.18, bevelSegments: 3, curveSegments: 16,
      });
      g.translate(0, 0, H * 0.45);
      if (sgn < 0) g.rotateZ(Math.PI);
      parts.push(g.index ? g.toNonIndexed() : g);
    }
    const stripped = parts.map((g) => {
      const out = new THREE.BufferGeometry();
      out.setAttribute('position', g.getAttribute('position'));
      out.setAttribute('normal', g.getAttribute('normal'));
      return out;
    });
    return mergeGeometries(stripped);
  });
}

export function cylinderZ(r, len, seg = 24, r2 = r) {
  const g = new THREE.CylinderGeometry(r2, r, len, seg);
  g.rotateX(Math.PI / 2);
  return g;
}

/** Arbor with conical pivots at each end, from z0 to z1. */
export function arborGeometry(r, z0, z1) {
  return cached(`arbor${r}:${z0}:${z1}`, () => {
    const len = z1 - z0;
    const pr = Math.max(0.035, r * 0.35);
    const prof = [
      [0, 0], [pr, 0], [pr, 0.12], [r, 0.22], [r, len - 0.22], [pr, len - 0.12], [pr, len], [0, len],
    ].map(([a, b]) => new THREE.Vector2(a, b));
    const g = new THREE.LatheGeometry(prof, 20);
    g.rotateX(Math.PI / 2);
    g.translate(0, 0, z0);
    return g;
  });
}

/** Polished pillar with collar rings. */
export function pillarGeometry(r, len) {
  return cached(`pillar${r}:${len}`, () => {
    const c = Math.min(0.12, len * 0.1);
    const prof = [
      [0, 0], [r * 1.25, 0], [r * 1.25, c], [r, c * 1.8], [r, len - c * 1.8], [r * 1.25, len - c], [r * 1.25, len], [0, len],
    ].map(([a, b]) => new THREE.Vector2(a, b));
    const g = new THREE.LatheGeometry(prof, 24);
    g.rotateX(Math.PI / 2);
    return g;
  });
}

/** Round off every corner of a (r, z) profile polyline so lathe normals read as polished radii. */
export function roundedProfile(points, radius = 0.25, segs = 4) {
  const out = [];
  const n = points.length;
  for (let i = 0; i < n; i++) {
    const p = new THREE.Vector2(...points[i]);
    if (i === 0 || i === n - 1) { out.push(p); continue; }
    const a = new THREE.Vector2(...points[i - 1]), b = new THREE.Vector2(...points[i + 1]);
    const da = a.clone().sub(p), db = b.clone().sub(p);
    const r = Math.min(radius, da.length() * 0.45, db.length() * 0.45);
    da.normalize(); db.normalize();
    const p0 = p.clone().addScaledVector(da, r), p1 = p.clone().addScaledVector(db, r);
    for (let s = 0; s <= segs; s++) {
      const t = s / segs;
      // quadratic bezier p0 → p → p1
      const u = 1 - t;
      out.push(new THREE.Vector2(
        u * u * p0.x + 2 * u * t * p.x + t * t * p1.x,
        u * u * p0.y + 2 * u * t * p.y + t * t * p1.y,
      ));
    }
  }
  return out;
}
