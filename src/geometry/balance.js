import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { sd, op, extrudeSDF } from './sdf2d.js';
import { cylinderZ } from './details.js';

// ─────────────────────────────────────────────────────────────
// Balance & hairspring — the regulating organ.
// ─────────────────────────────────────────────────────────────

/** Two-armed balance rim with radial timing screws. Centered at z=0. */
export function balanceWheelGeometry({ rIn = 3.05, rOut = 3.4, thickness = 0.36, screws = 14 }) {
  const f = op.smooth(
    0.18,
    sd.ring(0, 0, rIn, rOut),
    sd.capsule(-rIn - 0.05, 0, rIn + 0.05, 0, 0.16),
    sd.circle(0, 0, 0.5),
  );
  const rim = extrudeSDF(f, [-rOut, -rOut, rOut, rOut], thickness, { h: 0.025, bevel: 0.03 });
  rim.translate(0, 0, -thickness / 2);

  // timing screws, two by two near the arms like a traditional screw balance
  const sParts = [];
  for (let i = 0; i < screws; i++) {
    const a = ((i + 0.5) / screws) * Math.PI * 2;
    const shank = new THREE.CylinderGeometry(0.07, 0.07, 0.25, 12);
    shank.translate(0, rOut + 0.1, 0);
    const head = new THREE.CylinderGeometry(0.13, 0.13, 0.14, 20);
    head.translate(0, rOut + 0.26, 0);
    for (const g of [shank, head]) {
      g.rotateZ(a - Math.PI / 2);
      sParts.push(g.index ? g.toNonIndexed() : g);
    }
  }
  const screwsGeo = mergeGeometries(sParts);
  return { rim, screws: screwsGeo };
}

/** Roller table + impulse jewel (ruby pin hanging down into the fork). */
export function rollerGeometry({ r = 0.55, pinR = 0.07, pinOffset = 0.42, pinLen = 0.5 }) {
  const disc = cylinderZ(r, 0.1, 40);
  const pin = cylinderZ(pinR, pinLen, 16);
  pin.translate(pinOffset, 0, -pinLen / 2 + 0.05);
  return { disc, pin };
}

/**
 * Hairspring: an Archimedean spiral ribbon. Per-vertex attribute aT runs
 * 0 → 1 from the stud (outer, fixed) to the collet (inner, turning with
 * the balance). A vertex shader rotates each vertex by θ·aT and scales
 * its radius a touch, so the coils visibly "breathe" open and closed.
 */
export function hairspringGeometry({ r0 = 0.42, r1 = 2.45, turns = 12, height = 0.14, thickness = 0.028, seg = 96 }) {
  const N = Math.floor(turns * seg);
  const pos = [], tAttr = [], idx = [];
  const pitch = (r1 - r0) / turns;
  const thetaMax = turns * Math.PI * 2;
  for (let i = 0; i <= N; i++) {
    const s = i / N;
    const th = s * thetaMax;
    const r = r0 + (pitch * th) / (Math.PI * 2);
    const c = Math.cos(th), sn = Math.sin(th);
    const rin = r - thickness / 2, rout = r + thickness / 2;
    // 4 corners of the rectangular section: in-bottom, out-bottom, out-top, in-top
    pos.push(rin * c, rin * sn, -height / 2, rout * c, rout * sn, -height / 2, rout * c, rout * sn, height / 2, rin * c, rin * sn, height / 2);
    const t = 1 - s; // collet (inner) = 1
    tAttr.push(t, t, t, t);
  }
  for (let i = 0; i < N; i++) {
    const a = i * 4, b = (i + 1) * 4;
    for (let k = 0; k < 4; k++) {
      const k2 = (k + 1) % 4;
      idx.push(a + k, b + k, b + k2, a + k, b + k2, a + k2);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aT', new THREE.Float32BufferAttribute(tAttr, 1));
  g.setIndex(idx);
  g.computeVertexNormals();
  g.userData = { r0, r1, thetaMax };
  return g;
}

/** Patch a material so hairspring vertices rotate/breathe with uniform uAngle. */
export function breathingMaterial(base) {
  const m = base.clone();
  m.userData.uniforms = { uAngle: { value: 0 }, uBreath: { value: 0.03 } };
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, m.userData.uniforms);
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
         attribute float aT;
         uniform float uAngle;
         uniform float uBreath;
         vec3 hsWarp(vec3 p) {
           float a = uAngle * aT;
           float s = 1.0 - uBreath * uAngle * sin(3.14159265 * aT);
           float c = cos(a), sn = sin(a);
           vec2 q = p.xy * s;
           return vec3(c * q.x - sn * q.y, sn * q.x + c * q.y, p.z);
         }
         vec3 hsWarpN(vec3 n) {
           float a = uAngle * aT;
           float c = cos(a), sn = sin(a);
           return vec3(c * n.x - sn * n.y, sn * n.x + c * n.y, n.z);
         }`,
      )
      .replace('#include <beginnormal_vertex>', '#include <beginnormal_vertex>\nobjectNormal = hsWarpN(objectNormal);')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\ntransformed = hsWarp(transformed);');
  };
  m.customProgramCacheKey = () => 'hairspring';
  return m;
}
