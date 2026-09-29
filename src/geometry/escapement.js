import * as THREE from 'three';
import { sd, op, extrudeSDF } from './sdf2d.js';
import { cylinderZ } from './details.js';

// ─────────────────────────────────────────────────────────────
// Swiss lever pallet fork. Local frame: pivot at origin, escape
// wheel center at (+dEF, 0), balance axis at (−dFB, 0).
// Pallet stones straddle 2.5 escape teeth (±30° from the line of
// centers), their inner faces sitting on the tip circle at rest.
// ─────────────────────────────────────────────────────────────

export function palletForkGeometry({ rTip, dFB, thickness = 0.14, stoneLen = 0.5, stoneW = 0.17, stoneH = 0.3, pinR = 0.42 }) {
  const dEF = rTip / Math.cos(Math.PI / 6);
  const E = new THREE.Vector2(dEF, 0);
  const stones = [];
  for (const sgn of [1, -1]) {
    const a = Math.PI - sgn * (Math.PI / 6);
    const S = new THREE.Vector2(E.x + rTip * Math.cos(a), E.y + rTip * Math.sin(a));
    const u = S.clone().sub(E).normalize();
    const C = S.clone().addScaledVector(u, stoneLen / 2);
    stones.push({ S, C, angle: Math.atan2(u.y, u.x), side: sgn });
  }
  const pinX = -dFB + pinR; // impulse pin rest position in fork frame
  const hornX = pinX + 0.2;
  const f = op.subtract(
    op.smooth(
      0.12,
      sd.circle(0, 0, 0.3),
      sd.taper(0, 0, stones[0].C.x, stones[0].C.y, 0.17, 0.12),
      sd.taper(0, 0, stones[1].C.x, stones[1].C.y, 0.17, 0.12),
      sd.taper(0, 0, hornX, 0, 0.13, 0.09),
      sd.taper(hornX, 0, pinX - 0.1, 0.2, 0.08, 0.055),
      sd.taper(hornX, 0, pinX - 0.1, -0.2, 0.08, 0.055),
      sd.circle(0.35, 0, 0.16), // counterpoise
    ),
    sd.circle(pinX, 0, 0.095),
    sd.circle(0, 0, 0.07),
  );
  const body = extrudeSDF(f, [pinX - 0.4, -1.2, dEF, 1.2], thickness, { h: 0.012, bevel: 0.015 });
  body.translate(0, 0, -thickness / 2);

  const stoneGeos = stones.map((s) => {
    const g = new THREE.BoxGeometry(stoneLen, stoneW, stoneH);
    // angled impulse face on the inner end
    const p = g.getAttribute('position');
    for (let i = 0; i < p.count; i++) {
      if (p.getX(i) < 0) p.setX(i, p.getX(i) + (p.getY(i) * s.side > 0 ? 0.06 : -0.02));
    }
    g.computeVertexNormals();
    g.rotateZ(s.angle);
    g.translate(s.C.x, s.C.y, 0);
    return g;
  });

  const dart = cylinderZ(0.035, 0.34, 10);
  dart.translate(hornX + 0.1, 0, thickness / 2 + 0.12);

  return { body, stones: stoneGeos, dart, dEF, pinX };
}
