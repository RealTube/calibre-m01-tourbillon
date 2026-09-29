import { sd, op } from './sdf2d.js';
import { POS, PADS, CAGE, D } from '../movement/layout.js';

// ─────────────────────────────────────────────────────────────
// Skeletonised plate & bridges, designed as smooth SDF unions so
// every junction flows into the next with a hand-filed fillet.
// ─────────────────────────────────────────────────────────────

const [Tx, Ty] = POS.T, [Bx, By] = POS.B, [Hx, Hy] = POS.Th, [Cx, Cy] = POS.CW;
const polar = (r, deg, c = [0, 0]) => [c[0] + r * Math.cos((deg * Math.PI) / 180), c[1] + r * Math.sin((deg * Math.PI) / 180)];

export const CLICK_PIVOT = polar(4.75, 70, POS.B);

export function mainplateSDF() {
  const allPads = [...PADS.barrel, ...PADS.train, ...PADS.tourbillon];
  const body = op.smooth(
    0.9,
    sd.ring(0, 0, 14.5, 16.0),
    sd.circle(0, 0, 2.55),
    sd.curve([[0, 2.2], [-1.2, 8.5], [0.4, 14.8]], 0.78),
    sd.curve([[-2.2, -0.4], [-8, 1.8], [-14.8, 0.6]], 0.72),
    sd.curve([[2.2, -0.6], [7, -3.6], [14.6, -4.8]], 0.7),
    sd.ring(Tx, Ty, 6.25, 7.25),
    sd.circle(Hx, Hy, 1.05),
    sd.capsule(Hx, Hy, -0.6, -1.5, 0.62),
    sd.circle(Bx, By, 1.35),
    sd.curve([[Bx, By], [7.2, 8.6], [11.2, 10.4]], 0.62),
    sd.circle(Cx, Cy, 1.05),
    sd.capsule(Cx, Cy, 14.7, 1.2, 0.72),
    ...allPads.map(([x, y]) => sd.circle(x, y, 1.05)),
  );
  return op.subtract(body, sd.circle(Tx, Ty, 6.25), sd.circle(0, 0, 0.42));
}

export function barrelBridgeSDF() {
  const [p1, p2] = PADS.barrel;
  const [kx, ky] = CLICK_PIVOT;
  return op.subtract(
    op.smooth(
      0.75,
      sd.ring(Bx, By, 2.55, 4.05),
      sd.circle(Bx, By, 1.3),
      ...[40, 160, 280].map((a) => {
        const [x, y] = polar(3.2, a, POS.B);
        return sd.capsule(Bx, By, x, y, 0.42);
      }),
      sd.capsule(Bx, By, Cx, Cy, 0.95),
      sd.circle(Cx, Cy, 1.4),
      sd.curve([polar(3.6, 20, POS.B), [11.5, 6.4], p1], 1.05),
      sd.curve([polar(3.6, 105, POS.B), [1.2, 11.6], p2], 1.05),
      sd.circle(kx, ky, 0.62),
      sd.circle(p1[0], p1[1], 1.05),
      sd.circle(p2[0], p2[1], 1.05),
    ),
    sd.circle(Bx, By, 0.32),
  );
}

export function trainBridgeSDF() {
  const [p1, p2] = PADS.train;
  return op.smooth(
    0.8,
    sd.curve([p2, [-8.5, -6.4], [Hx, Hy]], 1.1),
    sd.curve([[Hx, Hy], [-1.6, -2.2], [0, 0]], 1.0),
    sd.curve([[0, 0], [-2.6, 6.6], p1], 1.05),
    sd.circle(Hx, Hy, 1.1),
    sd.circle(0, 0, 1.15),
    sd.circle(p1[0], p1[1], 1.05),
    sd.circle(p2[0], p2[1], 1.05),
  );
}

export function tourbillonBridgeSDF() {
  const [p1, p2] = PADS.tourbillon;
  return op.smooth(
    0.8,
    sd.circle(Tx, Ty, 1.45),
    sd.curve([p1, [-6.2, -8.4], [Tx, Ty]], 1.1),
    sd.curve([[Tx, Ty], [6.2, -8.4], p2], 1.1),
    sd.circle(p1[0], p1[1], 1.05),
    sd.circle(p2[0], p2[1], 1.05),
  );
}

// ── tourbillon cage frames (cage-local coordinates) ──────────
export const CAGE_PTS = (() => {
  const E = [D.escapeOrbit, 0];
  const dEF = CAGE.escapeTip / Math.cos(Math.PI / 6);
  const F = [E[0] - dEF, 0];
  const pillars = [60, 180, 300].map((a) => polar(CAGE.pillarR, a));
  return { E, F, dEF, dFB: F[0], pillars };
})();

export function cageLowerSDF() {
  const { E, F, pillars } = CAGE_PTS;
  return op.subtract(
    op.smooth(
      0.45,
      sd.ring(0, 0, 5.2, CAGE.radius),
      sd.capsule(0, 0, 5.6, 0, 0.5),
      sd.circle(0, 0, 0.85),
      sd.circle(E[0], E[1], 0.72),
      sd.circle(F[0], F[1], 0.55),
      sd.curve([[0, 0], polar(2.9, 150), polar(5.5, 120)], 0.36),
      sd.curve([[0, 0], polar(2.9, 270), polar(5.5, 240)], 0.36),
      ...pillars.map(([x, y]) => sd.circle(x, y, 0.55)),
    ),
    sd.circle(0, 0, 0.12),
  );
}

export function cageUpperSDF() {
  const { E, F, pillars } = CAGE_PTS;
  // arrow-tipped seconds pointer at local +90°
  const pointer = op.smooth(
    0.2,
    sd.taper(0, 5.4, 0, 6.55, 0.34, 0.1),
    sd.polygon([[-0.3, 6.35], [0.3, 6.35], [0, 7.0]]),
  );
  return op.subtract(
    op.smooth(
      0.4,
      sd.ring(0, 0, 5.3, CAGE.radius - 0.05),
      sd.capsule(0, 0, 5.6, 0, 0.46),
      sd.circle(0, 0, 0.95),
      sd.circle(E[0], E[1], 0.7),
      sd.circle(F[0], F[1], 0.55),
      // lyre arms
      sd.curve([[0, 0], polar(3.0, 165), polar(5.55, 128)], (t) => 0.42 - 0.12 * Math.sin(Math.PI * t)),
      sd.curve([[0, 0], polar(3.0, 255), polar(5.55, 232)], (t) => 0.42 - 0.12 * Math.sin(Math.PI * t)),
      ...pillars.map(([x, y]) => sd.circle(x, y, 0.55)),
      pointer,
    ),
    sd.circle(0, 0, 0.12),
  );
}

export function fixedRingEarsSDF() {
  return op.subtract(
    op.smooth(0.3, ...[30, 150, 270].map((a) => {
      const [x0, y0] = polar(4.25, a), [x1, y1] = polar(6.55, a);
      return sd.taper(x0, y0, x1, y1, 0.75, 0.5);
    })),
    sd.circle(0, 0, 4.33),
  );
}

export function clickSDF() {
  // pawl pivoting at the origin, tip reaching toward the ratchet
  const [kx, ky] = CLICK_PIVOT;
  const toB = Math.atan2(POS.B[1] - ky, POS.B[0] - kx);
  const tipDist = 4.75 - 3.72;
  const side = toB - 1.25;
  const tip = [Math.cos(toB) * tipDist + Math.cos(side) * 0.9, Math.sin(toB) * tipDist + Math.sin(side) * 0.9];
  const spring = sd.arc(0, 0, 1.25, toB + 1.2, toB + 3.5, 0.07);
  return {
    pawl: op.subtract(op.smooth(0.2, sd.circle(0, 0, 0.5), sd.taper(0, 0, tip[0], tip[1], 0.36, 0.1)), sd.circle(0, 0, 0.14)),
    spring,
    tip,
  };
}
