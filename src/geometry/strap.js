import * as THREE from 'three';
import { sd, op, extrudeSDF } from './sdf2d.js';

// ─────────────────────────────────────────────────────────────
// Leather strap: a swept superellipse section along a curve that
// runs straight off the lugs, then bends around an imaginary wrist.
// ─────────────────────────────────────────────────────────────

const SECTION = 36;

/** Centerline frames along the strap. dir = +1 (12 o'clock) or −1 (6 o'clock). */
function centerline(dir, L, { y0 = 22.2, z0 = -1.35, straight = 5, ramp = 9, R = 27 } = {}) {
  const frames = [];
  const step = 0.4;
  let y = y0, z = z0, phi = 0;
  for (let l = 0; l <= L + 1e-6; l += step) {
    const t = Math.min(1, Math.max(0, (l - straight) / ramp));
    const kappa = (t * t * (3 - 2 * t)) / R;
    frames.push({
      l,
      p: new THREE.Vector3(0, dir * y, z),
      t: new THREE.Vector3(0, dir * Math.cos(phi), -Math.sin(phi)),
      n: new THREE.Vector3(0, dir * Math.sin(phi), Math.cos(phi)),
    });
    y += Math.cos(phi) * step;
    z -= Math.sin(phi) * step;
    phi += kappa * step;
  }
  return frames;
}

function sectionPoint(t, w, h, dome) {
  const c = Math.cos(t), s = Math.sin(t);
  const e = 2 / 7;
  const a = (w / 2) * Math.sign(c) * Math.pow(Math.abs(c), e);
  let b = (h / 2) * Math.sign(s) * Math.pow(Math.abs(s), e);
  if (s > 0) b += dome * (1 - (a / (w / 2)) ** 2);
  return [a, b];
}

export function strapGeometry(dir, L, { w0 = 22, w1 = 18, h0 = 3.5, h1 = 2.4, tip = 'point' } = {}) {
  const frames = centerline(dir, L);
  const pos = [], uv = [], idx = [];
  const widthAt = (l) => {
    let w = w0 + (w1 - w0) * (l / L);
    if (tip === 'point' && l > L - 9) {
      const u = (l - (L - 9)) / 9;
      w *= Math.sqrt(Math.max(0.02, 1 - u * u * u));
    }
    return w;
  };
  const heightAt = (l) => h0 + (h1 - h0) * Math.min(1, l / (L * 0.6));
  frames.forEach((f, i) => {
    const w = widthAt(f.l), h = heightAt(f.l);
    for (let j = 0; j < SECTION; j++) {
      const t = (j / SECTION) * Math.PI * 2;
      const [a, b] = sectionPoint(t, w, h, h * 0.1);
      pos.push(f.p.x + a, f.p.y + f.n.y * b, f.p.z + f.n.z * b);
      uv.push(a, f.l);
    }
    if (i > 0) {
      const A = (i - 1) * SECTION, Bi = i * SECTION;
      for (let j = 0; j < SECTION; j++) {
        const j2 = (j + 1) % SECTION;
        if (dir > 0) idx.push(A + j, Bi + j, Bi + j2, A + j, Bi + j2, A + j2);
        else idx.push(A + j, Bi + j2, Bi + j, A + j, A + j2, Bi + j2);
      }
    }
  });
  // end caps
  const capStart = pos.length / 3;
  pos.push(frames[0].p.x, frames[0].p.y, frames[0].p.z); uv.push(0, 0);
  const last = frames[frames.length - 1];
  const capEnd = capStart + 1;
  pos.push(last.p.x, last.p.y, last.p.z); uv.push(0, L);
  const lastRing = (frames.length - 1) * SECTION;
  for (let j = 0; j < SECTION; j++) {
    const j2 = (j + 1) % SECTION;
    if (dir > 0) {
      idx.push(capStart, j, j2);
      idx.push(capEnd, lastRing + j2, lastRing + j);
    } else {
      idx.push(capStart, j2, j);
      idx.push(capEnd, lastRing + j, lastRing + j2);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return { geometry: g, frames, widthAt, heightAt };
}

/** Saddle stitching along both edges as one InstancedMesh. */
export function stitchInstances(strap, material, { inset = 1.25, pitch = 1.3, from = 1.2, to = 3 } = {}) {
  const { frames, widthAt, heightAt } = strap;
  const L = frames[frames.length - 1].l;
  const geo = new THREE.CapsuleGeometry(0.15, 0.62, 3, 8);
  const list = [];
  const frameAt = (l) => frames[Math.min(frames.length - 1, Math.round(l / 0.4))];
  for (let l = from; l < L - to; l += pitch) {
    const f = frameAt(l);
    const w = widthAt(l), h = heightAt(l);
    if (w / 2 - inset < 2) continue;
    for (const sgn of [1, -1]) {
      const a = sgn * (w / 2 - inset);
      const b = h / 2 + h * 0.1 * (1 - (a / (w / 2)) ** 2) + 0.02;
      list.push({ p: f.p.clone().add(new THREE.Vector3(a, 0, 0)).addScaledVector(f.n, b), t: f.t, n: f.n });
    }
  }
  const mesh = new THREE.InstancedMesh(geo, material, list.length);
  const m = new THREE.Matrix4();
  const X = new THREE.Vector3();
  list.forEach((s, i) => {
    // capsule axis (Y) → strap tangent; Z → surface normal (right-handed basis)
    X.crossVectors(s.t, s.n);
    m.makeBasis(X, s.t, s.n.clone().multiplyScalar(0.55));
    m.setPosition(s.p);
    mesh.setMatrixAt(i, m);
  });
  mesh.instanceMatrix.needsUpdate = true;
  return mesh;
}

/** Pin holes along the long strap. */
export function strapHoles(strap, count = 6) {
  const { frames, heightAt } = strap;
  const L = frames[frames.length - 1].l;
  const out = [];
  for (let i = 0; i < count; i++) {
    const l = L - 15 - i * 3.2;
    const f = frames[Math.round(l / 0.4)];
    out.push({ p: f.p.clone().addScaledVector(f.n, heightAt(l) / 2 + 0.2), n: f.n.clone(), t: f.t.clone() });
  }
  return out;
}

/** Tang buckle in the local frame (x across, y along the strap, z normal). */
export function buckleGeometry(width = 21) {
  const hw = width / 2;
  const frame = op.subtract(
    sd.box(0, 3.4, hw, 3.4, 0, 1.6),
    sd.box(0, 3.4, hw - 1.35, 2.1, 0, 0.6),
  );
  const body = extrudeSDF(frame, [-hw - 0.5, -0.5, hw + 0.5, 7.4], 1.7, { h: 0.06, bevel: 0.3 });
  body.translate(0, 0, -0.85);
  const tang = new THREE.CapsuleGeometry(0.42, 6.2, 4, 12);
  tang.translate(0, 4.0, 0);
  tang.rotateX(-0.12);
  tang.translate(0, 0, 0.55);
  return { body, tang };
}
