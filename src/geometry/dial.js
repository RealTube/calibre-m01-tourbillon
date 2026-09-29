import * as THREE from 'three';
import { sd, op, extrudeSDF, sdfToShapes } from './sdf2d.js';
import { canvasTexture, planarFit } from '../materials/textures.js';
import { POS } from '../movement/layout.js';

// ─────────────────────────────────────────────────────────────
// Openworked dial: a chapter ring fused with the tourbillon's
// seconds ring, a smoked-sapphire signature disc, applied indices.
// ─────────────────────────────────────────────────────────────

const [Tx, Ty] = POS.T;
export const DIAL = { rIn: 12.9, rOut: 16.15, tIn: 6.35, tOut: 7.15, half: 17 };

export function chapterRingSDF() {
  return op.subtract(
    op.smooth(0.9, sd.ring(0, 0, DIAL.rIn, DIAL.rOut), sd.ring(Tx, Ty, DIAL.tIn, DIAL.tOut)),
    sd.circle(Tx, Ty, DIAL.tIn),
  );
}

export function chapterRingGeometry(thickness) {
  return extrudeSDF(chapterRingSDF(), [-DIAL.rOut, -DIAL.rOut, DIAL.rOut, DIAL.rOut], thickness, { h: 0.05, bevel: 0.05 });
}

/** Printed minute track + tourbillon seconds track, lacquer-blue ground. */
export function dialPrintTexture() {
  const S = 4096, half = DIAL.half, k = S / (2 * half);
  const tex = canvasTexture(S, (ctx) => {
    const X = (x) => S / 2 + x * k, Y = (y) => S / 2 - y * k;
    // lacquer ground with a soft sunray tone shift
    const g = ctx.createRadialGradient(X(0), Y(0), 10 * k, X(0), Y(0), 16.5 * k);
    g.addColorStop(0, '#1d4390');
    g.addColorStop(1, '#122c63');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, S, S);
    const tg = ctx.createRadialGradient(X(Tx), Y(Ty), 6 * k, X(Tx), Y(Ty), 7.3 * k);
    tg.addColorStop(0, '#15336f');
    tg.addColorStop(1, '#1d4390');
    ctx.fillStyle = tg;
    ctx.beginPath(); ctx.arc(X(Tx), Y(Ty), 7.3 * k, 0, Math.PI * 2); ctx.fill();

    ctx.strokeStyle = '#f2efe6';
    ctx.lineCap = 'round';
    // minute track
    for (let i = 0; i < 60; i++) {
      const a = Math.PI / 2 - (i / 60) * Math.PI * 2;
      const five = i % 5 === 0;
      const r0 = five ? 15.05 : 15.35, r1 = 15.9;
      ctx.lineWidth = (five ? 0.13 : 0.07) * k;
      ctx.beginPath();
      ctx.moveTo(X(r0 * Math.cos(a)), Y(r0 * Math.sin(a)));
      ctx.lineTo(X(r1 * Math.cos(a)), Y(r1 * Math.sin(a)));
      ctx.stroke();
    }
    ctx.lineWidth = 0.035 * k;
    for (const r of [15.25, 15.98]) { ctx.beginPath(); ctx.arc(X(0), Y(0), r * k, 0, Math.PI * 2); ctx.stroke(); }
    // tourbillon seconds track (cage arm is the seconds hand)
    for (let i = 0; i < 60; i++) {
      const a = Math.PI / 2 - (i / 60) * Math.PI * 2;
      const q = i % 15 === 0, five = i % 5 === 0;
      const r0 = q ? 6.45 : five ? 6.55 : 6.7, r1 = 7.0;
      ctx.lineWidth = (q ? 0.12 : five ? 0.08 : 0.045) * k;
      ctx.beginPath();
      ctx.moveTo(X(Tx + r0 * Math.cos(a)), Y(Ty + r0 * Math.sin(a)));
      ctx.lineTo(X(Tx + r1 * Math.cos(a)), Y(Ty + r1 * Math.sin(a)));
      ctx.stroke();
    }
    ctx.lineWidth = 0.03 * k;
    ctx.beginPath(); ctx.arc(X(Tx), Y(Ty), 7.06 * k, 0, Math.PI * 2); ctx.stroke();
  });
  return planarFit(tex, half);
}

/** Applied bar indices (hour positions except 6, where the tourbillon lives). */
export function indexGeometry(double = false) {
  const f = double
    ? op.union(sd.box(-0.42, 0, 0.26, 0.95, 0, 0.1), sd.box(0.42, 0, 0.26, 0.95, 0, 0.1))
    : sd.box(0, 0, 0.3, 0.95, 0, 0.12);
  const lume = double
    ? op.union(sd.box(-0.42, -0.05, 0.11, 0.72, 0, 0.08), sd.box(0.42, -0.05, 0.11, 0.72, 0, 0.08))
    : sd.box(0, -0.05, 0.13, 0.72, 0, 0.1);
  const body = extrudeSDF(f, [-1, -1.1, 1, 1.1], 0.32, { h: 0.02, bevel: 0.06 });
  const insert = extrudeSDF(lume, [-1, -1.1, 1, 1.1], 0.06, { h: 0.02, bevel: 0.0 });
  insert.translate(0, 0, 0.3);
  return { body, insert };
}

/** Smoked sapphire disc under the hands (with the tourbillon aperture). */
export function sapphireDiscShapes() {
  const f = op.subtract(sd.circle(0, 0, DIAL.rIn + 0.05), sd.circle(Tx, Ty, DIAL.tOut - 0.05), sd.circle(0, 0, 0.75));
  return sdfToShapes(f, [-13.1, -13.1, 13.1, 13.1], 0.06);
}

export function sapphirePrintTexture() {
  const S = 2048, half = 13.2, k = S / (2 * half);
  const tex = canvasTexture(S, (ctx) => {
    ctx.clearRect(0, 0, S, S);
    const X = (x) => S / 2 + x * k, Y = (y) => S / 2 - y * k;
    ctx.fillStyle = '#f5f1e8';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const spaced = (text, x, y, mm, weight, tracking, family = '"Cormorant Garamond", Georgia, serif') => {
      ctx.font = `${weight} ${mm * k}px ${family}`;
      if ('letterSpacing' in ctx) ctx.letterSpacing = `${tracking * k}px`;
      ctx.fillText(text, X(x), Y(y));
      if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
    };
    spaced('ATELIER', 0, 8.9, 1.05, 600, 0.32);
    spaced('MERIDIAN', 0, 7.55, 1.05, 600, 0.32);
    ctx.fillRect(X(-1.4), Y(6.62), 2.8 * k, 0.035 * k);
    spaced('GENÈVE', 0, 5.95, 0.5, 500, 0.22, '"Jost", "Futura", Helvetica, sans-serif');
    spaced('TOURBILLON VOLANT', 0, -0.95, 0.5, 500, 0.18, '"Jost", "Futura", Helvetica, sans-serif');
  });
  return planarFit(tex, half);
}

/** Skeletonised leaf hand pointing +Y. Returns body (with window) + lume insert. */
export function handGeometry({ length, width, tail = 2.6, hub = 0.85, thickness = 0.12 }) {
  const tipY = length, belly = length * 0.62;
  const leaf = op.smooth(
    0.25,
    sd.taper(0, hub * 0.6, 0, belly, 0.22, width / 2),
    sd.taper(0, belly, 0, tipY, width / 2, 0.02),
    sd.circle(0, 0, hub),
    sd.taper(0, 0, 0, -tail, 0.28, 0.42),
    sd.circle(0, -tail, 0.55),
  );
  const blade = op.smooth(0.25, sd.taper(0, hub * 0.6, 0, belly, 0.22, width / 2), sd.taper(0, belly, 0, tipY, width / 2, 0.02));
  const window = op.intersect(op.offset(blade, -0.2), (x, y) => (hub + 1.1) - y);
  const bounds = [-width, -tail - 1, width, tipY + 0.5];
  const body = extrudeSDF(op.subtract(leaf, window, sd.circle(0, 0, 0.3)), bounds, thickness, { h: 0.02, bevel: 0.03 });
  const lume = extrudeSDF(op.offset(window, 0.015), bounds, thickness * 0.7, { h: 0.02, bevel: 0 });
  lume.translate(0, 0, thickness * 0.1);
  return { body, lume };
}

export const dialFeet = [45, 135, 225, 315].map((deg) => {
  const a = (deg * Math.PI) / 180;
  return [14.6 * Math.cos(a), 14.6 * Math.sin(a)];
});

export { THREE };
