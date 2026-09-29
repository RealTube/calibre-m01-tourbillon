import * as THREE from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { roundedProfile } from './details.js';
import { canvasTexture, curvedText } from '../materials/textures.js';

// ─────────────────────────────────────────────────────────────
// 42 mm case. Lathe-turned bodies (like the real thing), extruded
// lugs, a fluted crown and a domed sapphire crystal.
// ─────────────────────────────────────────────────────────────

const SEG = 160;

function lathe(points, radius = 0.22, seg = SEG) {
  const prof = roundedProfile(points, radius, 4);
  const g = new THREE.LatheGeometry(prof, seg);
  g.rotateX(Math.PI / 2); // lathe axis Y → watch axis Z
  return g;
}

export function midcaseGeometry() {
  return lathe([
    [17.3, -4.55], [19.3, -4.55], [20.35, -4.05], [20.8, -3.0], [20.85, 2.1], [20.55, 3.0], [19.95, 3.36], [17.3, 3.36], [17.3, -4.55],
  ], 0.28);
}

export function bezelGeometry() {
  return lathe([
    [17.05, 3.3], [19.95, 3.3], [20.28, 3.58], [20.02, 4.2], [18.65, 4.84], [17.55, 4.97], [17.05, 4.97], [17.05, 3.3],
  ], 0.18);
}

export function casebackGeometry() {
  return lathe([
    [15.25, -5.76], [18.2, -5.76], [18.85, -5.55], [19.3, -4.95], [19.3, -4.5], [15.25, -4.5], [15.25, -5.76],
  ], 0.16);
}

export function crystalGeometry({ R = 17.4, zLow = 3.85, dome = 0.55, top = 5.02 } = {}) {
  const pts = [];
  const N = 40;
  for (let i = 0; i <= N; i++) {
    const r = (i / N) * R;
    pts.push(new THREE.Vector2(r, zLow + dome * (1 - (r / R) ** 2)));
  }
  pts.push(new THREE.Vector2(R, zLow + 0.28));
  for (let i = N; i >= 0; i--) {
    const r = (i / N) * R;
    pts.push(new THREE.Vector2(r, zLow + 0.28 + (top - zLow - 0.28) * (1 - (r / R) ** 2)));
  }
  const g = new THREE.LatheGeometry(pts, 128);
  g.rotateX(Math.PI / 2);
  return g;
}

export function backCrystalGeometry() {
  const pts = [[0, -5.3], [15.5, -5.3], [15.5, -4.75], [0, -4.75]].map(([r, z]) => new THREE.Vector2(r, z));
  const g = new THREE.LatheGeometry(pts, 96);
  g.rotateX(Math.PI / 2);
  return g;
}

/**
 * One lug horn. Drawn as a side profile in (y, z), extruded across its width
 * along x. Caps (the lug's flat sides) and flanks get separate material groups.
 */
export function lugGeometry() {
  const s = new THREE.Shape();
  const P = [
    [16.8, 3.0], [19.8, 2.75], [22.4, 1.95], [24.4, 0.55], [25.35, -0.9], [25.2, -2.1], [24.4, -2.85],
    [22.6, -3.35], [20.6, -3.9], [18.4, -4.3], [16.8, -4.3],
  ];
  s.moveTo(P[0][0], P[0][1]);
  s.splineThru(P.slice(1, 8).map(([a, b]) => new THREE.Vector2(a, b)));
  for (const [a, b] of P.slice(8)) s.lineTo(a, b);
  s.closePath();
  const width = 2.55;
  const bevel = 0.42;
  const g = new THREE.ExtrudeGeometry(s, {
    depth: width - bevel * 2, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelOffset: -bevel, bevelSegments: 5, curveSegments: 48,
  });
  g.translate(0, 0, bevel - width / 2);
  // cyclic basis change (det +1): shape u → world y, shape v → world z, extrusion → world x
  g.applyMatrix4(new THREE.Matrix4().set(
    0, 0, 1, 0,
    1, 0, 0, 0,
    0, 1, 0, 0,
    0, 0, 0, 1,
  ));
  return g;
}

/** Fluted onion-free crown, axis along +X starting at the case flank. */
export function crownGeometry({ x0 = 20.3 } = {}) {
  const prof = roundedProfile([
    [0, 1.05], [2.55, 1.05], [2.9, 1.4], [2.95, 3.4], [2.72, 3.9], [1.7, 4.02], [0, 4.02],
  ], 0.22).map((v) => new THREE.Vector2(v.x, v.y));
  let g = new THREE.LatheGeometry(prof, 144);
  const p = g.getAttribute('position');
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const r = Math.hypot(x, z);
    if (y > 1.35 && y < 3.55 && r > 2.5) {
      const th = Math.atan2(z, x);
      const blend = Math.min(1, (y - 1.35) / 0.25, (3.55 - y) / 0.25);
      const f = 1 - 0.055 * blend * Math.pow(0.5 + 0.5 * Math.cos(th * 30), 3);
      p.setX(i, x * f);
      p.setZ(i, z * f);
    }
  }
  g.deleteAttribute('uv');
  g.deleteAttribute('normal');
  g = mergeVertices(g, 1e-4);
  g.computeVertexNormals();
  g.rotateZ(-Math.PI / 2); // axis Y → +X
  g.translate(x0, 0, 0);
  const tube = new THREE.CylinderGeometry(1.25, 1.25, 1.4, 48);
  tube.rotateZ(-Math.PI / 2);
  tube.translate(x0 + 0.5, 0, 0);
  return { crown: g, tube };
}

export function crownCapTexture(accent = '#8a5a44') {
  return canvasTexture(256, (ctx, s) => {
    ctx.clearRect(0, 0, s, s);
    ctx.strokeStyle = accent;
    ctx.lineWidth = s * 0.03;
    ctx.beginPath();
    ctx.arc(s / 2, s / 2, s * 0.4, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = accent;
    ctx.font = `600 ${s * 0.42}px "Cormorant Garamond", Georgia, serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('M', s / 2, s / 2 + s * 0.02);
  });
}

/** Engraving on the caseback's flat face (planar UV over the ring's outer radius). */
export function casebackEngraving(R = 18.2, jewels = 25) {
  const tex = canvasTexture(2048, (ctx, s) => {
    ctx.clearRect(0, 0, s, s);
    const k = s / (2 * R);
    const cx = s / 2, cy = s / 2;
    const col = 'rgba(40,24,18,0.85)';
    const font = (mm, w = 500) => `${w} ${mm * k}px "Cormorant Garamond", Georgia, serif`;
    curvedText(ctx, 'ATELIER MERIDIAN  ·  CALIBRE M-01  ·  TOURBILLON VOLANT', cx, cy, 16.35 * k, -Math.PI / 2, { font: font(0.62, 600), color: col, spacing: 0.22 * k });
    curvedText(ctx, `Nº 001 / 088  ·  ${jewels} JEWELS  ·  21 600 A/H  ·  72 H`, cx, cy, 16.35 * k, Math.PI / 2, { font: font(0.55), color: col, spacing: 0.2 * k, inward: true });
    ctx.strokeStyle = col;
    ctx.lineWidth = 0.05 * k;
    for (const r of [15.65, 17.05]) {
      ctx.beginPath();
      ctx.arc(cx, cy, r * k, 0, Math.PI * 2);
      ctx.stroke();
    }
  });
  tex.repeat.set(1, 1);
  return tex;
}
