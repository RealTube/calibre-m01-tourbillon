// ─────────────────────────────────────────────────────────────
// Calibre M-01 layout. Units: millimetres. +Z faces the dial side.
// Wheel centers are solved from exact center distances
// d = m·(z₁ + z₂)/2 so every pair genuinely meshes.
// ─────────────────────────────────────────────────────────────

export const TEETH = {
  barrel: 80, centerPinion: 10,
  centerWheel: 72, thirdPinion: 10,
  thirdWheel: 75, cagePinion: 9,
  fixedRing: 96, escapePinion: 8,
  escapeWheel: 15,
  cannonPinion: 12, minuteWheel: 36, minutePinion: 10, hourWheel: 40,
  ratchet: 76, crownWheel: 36, contrate: 20, windingPinion: 12,
};

export const MODULE = {
  train: 0.11,
  tourbillon: 0.08,
  motion: 0.08,
  keyless: 0.1,
};
// hour wheel / minute pinion share the minute-wheel center distance
MODULE.hour = (MODULE.motion * (TEETH.cannonPinion + TEETH.minuteWheel)) / (TEETH.minutePinion + TEETH.hourWheel);

const dist = (m, a, b) => (m * (a + b)) / 2;

function circleIntersect(p0, r0, p1, r1, side = 1) {
  const dx = p1[0] - p0[0], dy = p1[1] - p0[1];
  const d = Math.hypot(dx, dy);
  const a = (r0 * r0 - r1 * r1 + d * d) / (2 * d);
  const h = Math.sqrt(Math.max(0, r0 * r0 - a * a));
  const mx = p0[0] + (a * dx) / d, my = p0[1] + (a * dy) / d;
  return [mx - (side * h * dy) / d, my + (side * h * dx) / d];
}

export const D = {
  barrelCenter: dist(MODULE.train, TEETH.barrel, TEETH.centerPinion),
  centerThird: dist(MODULE.train, TEETH.centerWheel, TEETH.thirdPinion),
  thirdCage: dist(MODULE.train, TEETH.thirdWheel, TEETH.cagePinion),
  escapeOrbit: (MODULE.tourbillon * (TEETH.fixedRing - TEETH.escapePinion)) / 2,
  cannonMinute: dist(MODULE.motion, TEETH.cannonPinion, TEETH.minuteWheel),
  ratchetCrown: dist(MODULE.keyless, TEETH.ratchet, TEETH.crownWheel),
};

const C = [0, 0];
const T = [0, -9.0];
const B = [D.barrelCenter * Math.cos(Math.PI / 4), D.barrelCenter * Math.sin(Math.PI / 4)];
const Th = circleIntersect(C, D.centerThird, T, D.thirdCage, -1);
// crown wheel sits on the stem axis (y = 0), meshing the ratchet
const CW = [B[0] + Math.sqrt(D.ratchetCrown ** 2 - B[1] ** 2), 0];
const MW = [D.cannonMinute * Math.cos((3 * Math.PI) / 4), D.cannonMinute * Math.sin((3 * Math.PI) / 4)];

export const POS = { C, T, B, Th, CW, MW };

export const Z = {
  crystalLow: 3.85,
  minuteHand: 3.56,
  hourHand: 3.32,
  secondsTrack: 1.6,
  dial: 1.6, dialT: 0.3,
  sapphireDial: 1.96,
  hourWheel: 0.78,
  motion: 0.36,
  plateTop: 0, plateBottom: -0.9,
  centerWheel: -1.35,
  level2: -2.15,
  barrelTop: -1.7, barrelBottom: -3.55,
  bridgeBottom: -3.7, bridgeTop: -4.15,
  ratchet: -4.3,
  stem: -1.28,
  backCrystal: -4.75,
};

export const CAGE = {
  radius: 5.95,
  lower: [-0.55, -0.25],
  upper: [2.75, 3.05],
  escape: 0.45,
  fork: 0.45,
  roller: 0.85,
  balance: 1.35,
  hairspring: 2.25,
  fixedRing: -0.72,
  pillarR: 5.55,
  escapeTip: 1.8,
};

export const MOVEMENT_R = 16.0;

// pillar / screw pads on the movement rim
const pad = (deg) => [14.95 * Math.cos((deg * Math.PI) / 180), 14.95 * Math.sin((deg * Math.PI) / 180)];
export const PADS = {
  barrel: [pad(28), pad(98)],
  train: [pad(122), pad(200)],
  tourbillon: [pad(236), pad(304)],
};

// derived angles (radians) for mesh phasing
export const LINE = {
  CB: Math.atan2(B[1] - C[1], B[0] - C[0]),
  CTh: Math.atan2(Th[1] - C[1], Th[0] - C[0]),
  ThT: Math.atan2(T[1] - Th[1], T[0] - Th[0]),
  CMW: Math.atan2(MW[1], MW[0]),
  CWB: Math.atan2(B[1] - CW[1], B[0] - CW[0]),
};
