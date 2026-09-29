import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// ─────────────────────────────────────────────────────────────
// Horological gearing. Watch trains use cycloidal-style profiles:
// radial flanks + ogival (pointed-arch) addenda on wheels, and
// rounded leaves on pinions — not the involute teeth of machinery.
// All geometry is in millimetres; pitch radius r = m·z/2.
// ─────────────────────────────────────────────────────────────

const TAU = Math.PI * 2;
const P = (r, a) => new THREE.Vector2(r * Math.cos(a), r * Math.sin(a));

/**
 * Tooth outline. For internal gears pass internal:true — teeth then
 * point inward (tip radius < pitch radius < root radius).
 */
export function toothOutline({ z, m, addendum = 1.3, dedendum = 1.6, toothFrac = 0.46, ogive = 0.72, internal = false, tipSeg = 7, rootSeg = 5 }) {
  const r = (m * z) / 2;
  const ha = addendum * m, hf = dedendum * m;
  const rTip = internal ? r - ha : r + ha;
  const rRoot = internal ? r + hf : r - hf;
  const pitch = TAU / z;
  const tw = pitch * toothFrac;
  const gap = pitch - tw;
  const fil = Math.min(hf * 0.45, (r * gap) / 3);
  const rootFlank = internal ? rRoot - fil : rRoot + fil;
  const pts = [];
  for (let i = 0; i < z; i++) {
    const phi = i * pitch;
    // left flank (radial)
    pts.push(P(rootFlank, phi - tw / 2), P(r, phi - tw / 2));
    // ogival addendum
    for (let s = 1; s < tipSeg; s++) {
      const t = (Math.PI * s) / tipSeg;
      const lift = Math.pow(Math.sin(t), ogive);
      pts.push(P(r + (rTip - r) * lift, phi - (tw / 2) * Math.cos(t)));
    }
    // right flank
    pts.push(P(r, phi + tw / 2), P(rootFlank, phi + tw / 2));
    // rounded gap bottom
    const mid = phi + pitch / 2;
    for (let s = 1; s < rootSeg; s++) {
      const t = (Math.PI * s) / rootSeg;
      pts.push(P(rRoot + (rootFlank - rRoot) * (1 - Math.sin(t)), mid - (gap / 2) * Math.cos(t)));
    }
  }
  return { pts, r, rTip, rRoot };
}

function chaikin(points, iterations = 2) {
  let pts = points;
  for (let k = 0; k < iterations; k++) {
    const out = [];
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length];
      out.push(new THREE.Vector2(a.x * 0.75 + b.x * 0.25, a.y * 0.75 + b.y * 0.25));
      out.push(new THREE.Vector2(a.x * 0.25 + b.x * 0.75, a.y * 0.25 + b.y * 0.75));
    }
    pts = out;
  }
  return pts;
}

/** Curved "crossings" (spoke windows) typical of fine watch wheels. */
export function crossingHoles({ n = 5, hub, rim, spokeW, sweep = 0.35, phase = 0 }) {
  const holes = [];
  const steps = 14;
  const ang = (k, rho) => phase + (k * TAU) / n + sweep * Math.pow((rho - hub) / (rim - hub), 1.3);
  const half = (rho) => Math.asin(Math.min(0.99, spokeW / rho));
  for (let k = 0; k < n; k++) {
    const pts = [];
    // inner arc
    const a0 = ang(k, hub) + half(hub), a1 = ang(k + 1, hub) - half(hub);
    for (let s = 0; s <= 6; s++) pts.push(P(hub, a0 + ((a1 - a0) * s) / 6));
    // up along spoke k+1
    for (let s = 1; s <= steps; s++) {
      const rho = hub + ((rim - hub) * s) / steps;
      pts.push(P(rho, ang(k + 1, rho) - half(rho)));
    }
    // outer arc (reverse)
    const b1 = ang(k + 1, rim) - half(rim), b0 = ang(k, rim) + half(rim);
    for (let s = 1; s <= 10; s++) pts.push(P(rim, b1 + ((b0 - b1) * s) / 10));
    // down along spoke k
    for (let s = steps - 1; s >= 1; s--) {
      const rho = hub + ((rim - hub) * s) / steps;
      pts.push(P(rho, ang(k, rho) + half(rho)));
    }
    holes.push(new THREE.Path(chaikin(pts, 2)));
  }
  return holes;
}

function extrude(shape, thickness, bevel) {
  const b = Math.min(bevel, thickness * 0.3);
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: Math.max(0.001, thickness - 2 * b),
    bevelEnabled: b > 0,
    bevelThickness: b,
    bevelSize: b,
    bevelOffset: -b,
    bevelSegments: 2,
    curveSegments: 12,
  });
  geo.translate(0, 0, -thickness / 2 + b);
  return geo;
}

/** A finished wheel: teeth, curved crossings, polished hub. Centered at z=0. */
export function wheelGeometry({ z, m, thickness = 0.2, crossings = 5, sweep = 0.4, hubR, rimW, spokeW, bevel = 0.025 }) {
  const { pts, r, rRoot } = toothOutline({ z, m });
  const shape = new THREE.Shape(pts);
  if (crossings > 0) {
    const rim = rRoot - (rimW ?? Math.max(0.28, r * 0.12));
    const hub = hubR ?? Math.max(0.45, r * 0.17);
    shape.holes.push(...crossingHoles({ n: crossings, hub, rim, spokeW: spokeW ?? Math.max(0.1, r * 0.045), sweep }));
  }
  const geo = extrude(shape, thickness, bevel);
  geo.userData = { r, z };
  return geo;
}

/** A pinion: long, deep rounded leaves. Centered at z=0 along its length. */
export function pinionGeometry({ z, m, length = 0.6, bevel = 0.02 }) {
  const { pts, r } = toothOutline({ z, m, addendum: 0.95, dedendum: 1.75, toothFrac: 0.4, ogive: 1.0, tipSeg: 8, rootSeg: 6 });
  const geo = extrude(new THREE.Shape(pts), length, bevel);
  geo.userData = { r, z };
  return geo;
}

/** Fixed internal-toothed ring (the tourbillon's stationary fourth wheel). */
export function internalRingGeometry({ z, m, outerR, thickness = 0.2, bevel = 0.02 }) {
  const { pts, r } = toothOutline({ z, m, internal: true, addendum: 1.2, dedendum: 1.5, toothFrac: 0.5 });
  const shape = new THREE.Shape();
  const N = 160;
  for (let i = 0; i <= N; i++) {
    const a = (i / N) * TAU;
    const v = P(outerR, a);
    if (i === 0) shape.moveTo(v.x, v.y); else shape.lineTo(v.x, v.y);
  }
  shape.holes.push(new THREE.Path(pts));
  const geo = extrude(shape, thickness, bevel);
  geo.userData = { r, z };
  return geo;
}

/**
 * Swiss-lever escape wheel with 15 "club" teeth, leaning in the
 * direction of rotation (+angle). Locking face at the leading edge,
 * inclined impulse plane on the club.
 */
export function escapeWheelGeometry({ teeth = 15, rTip = 1.8, rRoot = 1.3, thickness = 0.16, spokes = 5, bevel = 0.015 }) {
  const pitch = TAU / teeth;
  const h = rTip - rRoot;
  const pts = [];
  for (let i = 0; i < teeth; i++) {
    const phi = i * pitch;
    const q = (rf, af) => P(rRoot + h * rf, phi + pitch * af);
    pts.push(
      q(0.0, -0.38),
      q(0.28, -0.16), q(0.55, -0.02), q(0.78, 0.07), q(0.9, 0.12), // concave back
      q(0.94, 0.16),                                              // heel of the club
      q(0.985, 0.25), q(1.0, 0.285),                              // impulse plane → toe
      q(0.9, 0.275), q(0.62, 0.24), q(0.3, 0.2), q(0.0, 0.17),    // locking face, leaning forward
    );
    for (let s = 1; s <= 4; s++) {
      const t = s / 5;
      const a = 0.17 + (0.62 - 0.17) * t;
      pts.push(P(rRoot - 0.04 * Math.sin(Math.PI * t), phi + pitch * a));
    }
  }
  const shape = new THREE.Shape(pts);
  // light, straight spokes
  const hub = 0.32, rim = rRoot - 0.22, sw = 0.065;
  for (let k = 0; k < spokes; k++) {
    const a0 = (k * TAU) / spokes, a1 = ((k + 1) * TAU) / spokes;
    const hp = [];
    const hh = (rho) => Math.asin(Math.min(0.99, sw / rho));
    for (let s = 0; s <= 6; s++) hp.push(P(hub, a0 + hh(hub) + ((a1 - hh(hub) - a0 - hh(hub)) * s) / 6));
    for (let s = 0; s <= 10; s++) hp.push(P(rim, a1 - hh(rim) - ((a1 - hh(rim) - a0 - hh(rim)) * s) / 10));
    shape.holes.push(new THREE.Path(chaikin(hp, 2)));
  }
  const geo = extrude(shape, thickness, bevel);
  geo.userData = { r: rTip, z: teeth };
  return geo;
}

/** Ratchet wheel with saw teeth (the click locks on the steep faces). */
export function ratchetGeometry({ z = 60, rTip, depth = 0.28, thickness = 0.3, bevel = 0.03, crossings = 0 }) {
  const pitch = TAU / z;
  const rRoot = rTip - depth;
  const pts = [];
  for (let i = 0; i < z; i++) {
    const phi = i * pitch;
    pts.push(P(rRoot, phi), P(rTip - depth * 0.08, phi + pitch * 0.02), P(rTip, phi + pitch * 0.07));
    for (let s = 1; s <= 5; s++) {
      const t = s / 6;
      pts.push(P(rTip - depth * Math.pow(t, 0.85), phi + pitch * (0.07 + 0.93 * t)));
    }
  }
  const shape = new THREE.Shape(pts);
  if (crossings) {
    shape.holes.push(...crossingHoles({ n: crossings, hub: rTip * 0.3, rim: rRoot - 0.45, spokeW: 0.22, sweep: -0.5 }));
  }
  const geo = extrude(shape, thickness, bevel);
  geo.userData = { r: rTip, z };
  return geo;
}

/** Contrate (crown-toothed) wheel: teeth stand up out of the wheel face. */
export function contrateGeometry({ z = 20, r = 1.0, toothH = 0.28, thickness = 0.16 }) {
  const parts = [];
  const disc = new THREE.CylinderGeometry(r, r, thickness, 48);
  disc.rotateX(Math.PI / 2);
  parts.push(disc);
  const tw = ((TAU * r) / z) * 0.45;
  for (let i = 0; i < z; i++) {
    const a = (i / z) * TAU;
    const tooth = new THREE.BoxGeometry(0.16, tw, toothH);
    tooth.translate(r - 0.08, 0, thickness / 2 + toothH / 2);
    tooth.rotateZ(a);
    parts.push(tooth);
  }
  return mergeGeometries(parts.map((g) => (g.index ? g.toNonIndexed() : g)));
}

/**
 * Mesh phasing. Given driver angle a (tooth 0 at local angle 0), returns the
 * driven angle so that a tooth of A sits in a gap of B on the line of centers.
 * lineAngle = direction from A's center to B's center.
 */
export function meshAngle(a, zA, zB, lineAngle) {
  return lineAngle + Math.PI + Math.PI / zB - (zA / zB) * (a - lineAngle);
}

/** Internal mesh: planet B rolling inside ring A. lineAngle = ring center → planet. */
export function meshAngleInternal(a, zA, zB, lineAngle) {
  return lineAngle + Math.PI / zB + (zA / zB) * (a - lineAngle);
}
