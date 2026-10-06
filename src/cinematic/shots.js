import * as THREE from 'three';

// ─────────────────────────────────────────────────────────────
// The film, as data. Tempo is locked to the movement: 90 BPM is
// 21,600 vph ÷ 240, so one musical beat is four escapement beats
// (⅔ s) and every cut and hit falls on that grid.
//
// Shots are pure functions of time (so the film can be scrubbed);
// tracks are keyframed lighting, speed and explode curves; cues are
// sounds scheduled ahead on the audio clock; events are one-shots
// (titles, sparks, flashes, callouts).
//
// Units: millimetres and seconds. Write times as b(n) = beat n.
// Coordinates: the dial faces +Z, 12 o'clock is +Y, the crown is +X.
// Retiming checklist and a full editing guide: docs/CINEMATIC.md.
// ─────────────────────────────────────────────────────────────

export const BEAT = 2 / 3;
const b = (n) => n * BEAT;
const DEG = Math.PI / 180;

export const clamp01 = (x) => Math.min(1, Math.max(0, x));
export const lerp = (a, c, t) => a + (c - a) * t;
const expLerp = (a, c, t) => a * Math.pow(c / a, t);
export const E = {
  linear: (t) => t,
  inOut: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  inOutSine: (t) => -(Math.cos(Math.PI * t) - 1) / 2,
  inOutQuart: (t) => (t < 0.5 ? 8 * t ** 4 : 1 - Math.pow(-2 * t + 2, 4) / 2),
  out: (t) => 1 - Math.pow(1 - t, 3),
  outQuart: (t) => 1 - Math.pow(1 - t, 4),
  outExpo: (t) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t)),
  in: (t) => t * t * t,
};
const smooth = (a, c, x) => { const t = clamp01((x - a) / (c - a)); return t * t * (3 - 2 * t); };

/**
 * Step-and-ramp track. `seq(v0, [t, v], [t, v, dur, ease])`: from time t the
 * value becomes v, either at once or by ramping over `dur` seconds.
 */
export function seq(v0, ...changes) {
  const k = [[-1e9, v0, 'linear']];
  let prev = v0;
  for (const [t, v, dur = 0, ease = 'inOutSine'] of changes) {
    k.push([t, prev, 'linear']);
    k.push([t + dur, v, ease]);
    prev = v;
  }
  return (t) => {
    let i = k.length - 1;
    while (i > 0 && k[i][0] > t) i--;
    const a = k[i], c = k[i + 1];
    if (!c || c[0] <= a[0]) return a[1];
    return lerp(a[1], c[1], E[c[2]]((t - a[0]) / (c[0] - a[0])));
  };
}

/**
 * Camera on a sphere around `target`. az is measured in the dial plane from
 * +X (3 o'clock) toward +Y (12): −90 looks from the 6 o'clock side. el is the
 * height above the dial plane: 90 is straight in front of the dial, 0 edge-on,
 * negative behind the caseback. The camera's up is world +Y, so a camera low on
 * the −Y side sees the watch lying flat with the dial facing up (the table-top
 * look). Avoid looking straight along ±Y (az ±90 with el near 0): lookAt degenerates.
 */
export function orbit(out, target, r, azDeg, elDeg) {
  const az = azDeg * DEG, el = elDeg * DEG;
  return out.set(Math.cos(el) * Math.cos(az), Math.cos(el) * Math.sin(az), Math.sin(el)).multiplyScalar(r).add(target);
}
function toOrbit(target, pos) {
  const d = new THREE.Vector3().subVectors(pos, target);
  const r = d.length();
  return { r, az: Math.atan2(d.y, d.x) / DEG, el: Math.asin(d.z / r) / DEG };
}

export function buildFilm(app) {
  const { watch, kin, stats } = app;
  const A = watch.anim;
  const byName = (n) => watch.root.getObjectByName(n);
  const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
  const at = (o, x = 0, y = 0, z = 0, out = V()) => { o.updateWorldMatrix(true, false); return o.localToWorld(out.set(x, y, z)); };
  const O = {
    crystal: byName('crystal'), dial: byName('dial'), mainplate: byName('mainplate'),
    trainBridge: byName('trainBridge'), cageUpper: byName('cageUpper'),
  };

  const [heroPos, heroTarget] = app.pose('hero'); // where the app's own camera rests
  const hero = toOrbit(heroTarget, heroPos);
  const TB = V(0, -9, 1.6); // tourbillon, assembled
  const HERO_T = V(0, -1.5, -1);
  const ESC_LOCAL = V(2.2, 0, 0.6); // between the fork and the escape wheel, in the cage frame
  const v1 = V(), v2 = V();

  // ── shots ──────────────────────────────────────────────
  // { t0, t1, cam(u, o, s) }: u ∈ [0,1] across the shot, s = seconds into it.
  // cam() writes into o: pos, target (Vector3), fov (degrees), roll (degrees),
  // dof (0 = sharp … 1 = full depth of field, focused on target) and ap
  // (aperture multiplier). Shots must tile the timeline without gaps; a hard
  // cut is simply the next shot starting. Handheld drift and impact shake are
  // added on top by the director.
  const shots = [
    { // 1 · darkness: only the lume, a grazing push across the dial toward 12
      t0: 0, t1: b(8),
      cam(u, o) {
        const e = E.inOutSine(u);
        o.target.set(lerp(3, 0.5, e), lerp(9, 11.2, e), 2.3);
        orbit(o.pos, o.target, lerp(46, 33, e), -101 + 9 * e, lerp(24, 18, e));
        o.fov = 26; o.roll = lerp(-7, -2, e);
        o.dof = 1; o.ap = 1.1;
      },
    },
    { // 2 · first light: low three-quarter, the strip light sweeps the bezel
      t0: b(8), t1: b(14),
      cam(u, o) {
        const e = E.inOutSine(u);
        o.target.set(1, -2, 0.5);
        orbit(o.pos, o.target, lerp(112, 98, e), lerp(-62, -76, e), lerp(22, 27, e));
        o.fov = 30; o.roll = lerp(3, 0, e);
        o.dof = 0.3; o.ap = 1;
      },
    },
    { // 3 · ignition and reveal: whip from edge-on profile round to the face
      t0: b(14), t1: b(22),
      cam(u, o) {
        o.target.copy(HERO_T);
        orbit(o.pos, o.target, lerp(74, 140, E.out(u)), lerp(-178, -60, E.outExpo(u)), lerp(6, 48, E.out(u)));
        o.fov = lerp(34, 28, E.out(u)); o.roll = lerp(16, 0, E.out(u));
        o.dof = 0;
      },
    },
    { // 4 · crown macro, rack focus to the dial
      t0: b(22), t1: b(28),
      cam(u, o) {
        const e = E.inOutSine(u);
        o.target.lerpVectors(v1.set(22.4, 0, -1.2), v2.set(9, -5, 1.6), E.inOut(smooth(0.3, 0.85, u)));
        o.pos.set(lerp(51, 47, e), lerp(-21, -31, e), lerp(13, 19, e));
        o.fov = 26; o.roll = -4;
        o.dof = 1; o.ap = 1.4;
      },
    },
    { // 5 · I · the heart: spiral dive into the tourbillon
      t0: b(28), t1: b(36),
      cam(u, o) {
        const e = E.inOut(u);
        o.target.copy(TB);
        orbit(o.pos, TB, expLerp(118, 30, E.inOutQuart(u)), -90 + 150 * e, lerp(78, 48, e));
        o.fov = lerp(30, 26, e); o.roll = 9 * Math.sin(Math.PI * u);
        o.dof = smooth(0.25, 0.8, u); o.ap = 1.3;
      },
    },
    { // 6 · escapement macro, riding with the cage, in slow motion
      t0: b(36), t1: b(44),
      cam(u, o) {
        const e = E.inOutSine(u);
        at(A.cage, ESC_LOCAL.x, ESC_LOCAL.y, ESC_LOCAL.z, o.target);
        at(A.cage, ESC_LOCAL.x + lerp(6, 3.5, e), lerp(-17, -14, e), lerp(15, 12, e), o.pos);
        o.fov = 32; o.roll = lerp(-3, 2, e);
        o.dof = 1; o.ap = 1.1;
      },
    },
    { // 7 · time-lapse: pull back from the cage to the whole dial while time accelerates
      t0: b(44), t1: b(54),
      cam(u, o, s) {
        const e = E.inOut(clamp01(s / 3.8));
        o.target.lerpVectors(TB, v1.set(0, -1, 0.5), e);
        orbit(o.pos, o.target, expLerp(26, 152, e), lerp(-52, -90, e) + 3 * Math.sin(s * 0.5) * e, lerp(56, 86, e));
        o.fov = lerp(38, 27, e); o.roll = 0;
        o.dof = 1 - smooth(0.2, 0.7, e); o.ap = 1.2;
      },
    },
    { // 8+9 · II · anatomy: silhouette, tension, then the explosion pulls the camera back
      t0: b(54), t1: b(68),
      cam(u, o, s) {
        const t = b(54) + s;
        if (t < b(60)) {
          const e = E.inOutSine((t - b(54)) / (b(60) - b(54)));
          o.target.set(0, -1, -1);
          orbit(o.pos, o.target, lerp(132, 112, e), lerp(-132, -124, e), lerp(12, 16, e));
          o.fov = 30; o.roll = lerp(-2, -4, e);
        } else {
          const k = t - b(60);
          const e = E.outQuart(clamp01(k / 3.2));
          o.target.lerpVectors(v1.set(0, -1, -1), v2.set(0, 2, 4), e);
          orbit(o.pos, o.target, lerp(112, 255, e), lerp(-124, -58, E.out(clamp01(k / 5.3))), lerp(16, 30, e));
          o.fov = lerp(30, 33, e); o.roll = lerp(-4, 2, e);
        }
        o.dof = 0;
      },
    },
    { // 10 · flythrough along the exploded stack
      t0: b(68), t1: b(82),
      cam(u, o) {
        const z = flyZ(u);
        const ph = (-70 - 95 * E.inOutSine(u)) * DEG;
        o.pos.set(46 * Math.cos(ph), 46 * Math.sin(ph), z);
        o.target.set(0, 0, z - 24);
        o.fov = 32; o.roll = lerp(-8, 10, E.inOutSine(u));
        o.dof = 0;
      },
    },
    { // 11a · blueprint: the balance
      t0: b(82), t1: b(85),
      cam(u, o) {
        at(A.balance, 0, 0, 1.35, o.target);
        orbit(o.pos, o.target, lerp(31, 27, u), lerp(-62, -44, u), 40);
        o.fov = 28; o.roll = 0; o.dof = 0;
      },
    },
    { // 11b · blueprint: the Swiss lever
      t0: b(85), t1: b(88),
      cam(u, o) {
        at(A.fork, 0, 0, 0.1, o.target);
        orbit(o.pos, o.target, lerp(23, 19, u), lerp(148, 168, u), 46);
        o.fov = 28; o.roll = 0; o.dof = 0;
      },
    },
    { // 11c · blueprint: barrel and mainspring, from behind
      t0: b(88), t1: b(91),
      cam(u, o) {
        at(A.barrel, 0, 0, -2.6, o.target);
        orbit(o.pos, o.target, lerp(40, 35, u), lerp(32, 52, u), -40);
        o.fov = 28; o.roll = 0; o.dof = 0;
      },
    },
    { // 12 · III · power: reassembly, swinging round to the caseback
      t0: b(91), t1: b(98),
      cam(u, o) {
        const e = E.inOut(u);
        o.target.set(0, 0, lerp(2, -2, e));
        orbit(o.pos, o.target, lerp(300, 150, e), lerp(-40, 24, e), lerp(32, -58, e));
        o.fov = lerp(31, 28, e); o.roll = 0; o.dof = 0;
      },
    },
    { // 13 · winding through the sapphire back
      t0: b(98), t1: b(105),
      cam(u, o) {
        const e = E.inOutSine(u);
        o.target.set(lerp(9.5, 11.5, e), 1.5, -4.6);
        o.pos.set(lerp(15, 21, e), lerp(-15, -10, e), lerp(-45, -39, e));
        o.fov = 28; o.roll = lerp(2, -2, e);
        o.dof = 0.5; o.ap = 0.8;
      },
    },
    { // 14a · IV · metal: platinum
      t0: b(105), t1: b(107),
      cam(u, o) { o.target.copy(HERO_T); orbit(o.pos, o.target, lerp(124, 112, u), lerp(-24, -38, u), 36); o.fov = 28; o.roll = 0; o.dof = 0; },
    },
    { // 14b · black DLC
      t0: b(107), t1: b(109),
      cam(u, o) { o.target.copy(HERO_T); orbit(o.pos, o.target, lerp(104, 114, u), lerp(-150, -138, u), 22); o.fov = 28; o.roll = 5; o.dof = 0; },
    },
    { // 14c · 5N rose gold
      t0: b(109), t1: b(111),
      cam(u, o) { o.target.copy(HERO_T); orbit(o.pos, o.target, lerp(142, 128, u), lerp(-72, -60, u), 70); o.fov = 28; o.roll = 0; o.dof = 0; },
    },
    { // 15 · finale: rise from low and close to exactly the app's hero pose
      t0: b(111), t1: b(123) + 0.001,
      cam(u, o, s) {
        const e = E.inOut(clamp01(s / 7.4));
        o.target.lerpVectors(HERO_T, heroTarget, e);
        orbit(o.pos, o.target, expLerp(92, hero.r, e), lerp(-112, hero.az, e), lerp(9, hero.el, e));
        o.fov = 28; o.roll = lerp(-6, 0, e); o.dof = 0;
      },
    },
  ];
  const duration = b(123); // 82 s

  // flythrough: z of the camera along the exploded axis (it looks 24 mm further down)
  function flyZ(u) { return lerp(92, -26, lerp(u, E.inOutSine(u), 0.35)); }
  const flyT = (z) => { // time at which the camera looks at a layer z (bisection)
    let lo = 0, hi = 1;
    for (let i = 0; i < 30; i++) { const m = (lo + hi) / 2; if (flyZ(m) - 24 > z) lo = m; else hi = m; }
    return b(68) + lo * (b(82) - b(68));
  };

  // ── tracks ─────────────────────────────────────────────
  // fade        black over the picture (1 = black)
  // env / bg    scene.environmentIntensity / backgroundIntensity (app: 1 / 1)
  // key         the shadow-casting key light that rides with the camera (app: 1.7)
  // exposure    tone-mapping exposure (app: 1.05)
  // lume        lume emissive intensity (night mode in the app reaches 3.4)
  // bloom*      UnrealBloom strength / threshold (HDR) / radius; bloom is off at 0
  // rim / top   the film's rim spots and top spot (fx.js), intensity
  // beam / dust the opening light cone and the motes inside it, 0…1
  // vignette, grain, contrast, ca   the final grade (CinemaShader)
  // handheld    camera drift amplitude, degrees
  // wind        crown turns per second (kin.windRate)
  // Everything must reach the app's own values by the end, so the hand-back is invisible.
  const END = 77, ENDD = 4.4; // the look converges on the app's own studio by 81.4 s
  const tracks = {
    fade: seq(1, [0.1, 0, 2.4, 'out']),
    env: seq(0.012, [b(8), 0.05], [b(14), 1], [b(54), 0.07], [b(60), 0.95], [b(82), 0.7], [b(91), 0.95], [b(111), 0.85], [END, 1, ENDD]),
    bg: seq(0, [b(14), 0.14], [b(54), 0], [b(60), 0.12], [b(82), 0], [b(91), 0.12], [END, 1, ENDD]),
    key: seq(0, [b(14), 1.4], [b(54), 0.12], [b(60), 1.6], [b(82), 1.6], [b(91), 1.6], [b(111), 1.3], [END, 1.7, ENDD]),
    exposure: seq(1.15, [b(14), 1.05], [b(22), 0.82], [b(28), 1.05]),
    lume: seq(2.2, [b(8), 1.2, 3.2], [b(14), 0]),
    bloom: seq(0.6, [b(8), 0.4, 1], [b(14), 0.22], [END, 0, ENDD]),
    bloomThreshold: seq(0.8, [b(8), 2.2, 1], [b(14), 5]),
    bloomRadius: seq(0.06, [b(14), 0.3]),
    rim: seq(0, [b(8), 0.5, 0.6], [b(14), 1.5], [b(28), 1.0], [b(54), 3.2], [b(60), 1.5], [b(82), 0.8], [b(91), 1.5], [b(111), 1.6], [END, 0, ENDD]),
    top: seq(0, [b(8), 1.6, 0.06], [b(14), 0, 2.5]),
    beam: seq(0, [b(8), 1, 0.12], [b(14), 0, 2.2]),
    dust: seq(0.55, [b(8), 1, 0.3], [b(14), 0.5], [b(22), 0]),
    vignette: seq(0.6, [b(14), 0.4], [END, 0, ENDD]),
    grain: seq(0.045, [END, 0, ENDD]),
    contrast: seq(0.14, [END, 0, ENDD]),
    ca: seq(0.28, [END, 0, ENDD]),
    handheld: seq(0.24, [b(28), 0.12], [b(54), 0.24], [END, 0, ENDD]),
    wind: seq(0, [b(98) + 0.4, 4.2, 0.3], [b(105) - 0.4, 0, 0.3]),
  };

  // kinematic speed: slow motion, then a time-lapse that brakes hard
  function speedAt(t) {
    if (t < b(31)) return 1;
    if (t < b(33)) return expLerp(1, 0.05, E.inOutSine((t - b(31)) / b(2)));
    if (t < b(44)) return 0.05;
    if (t < b(46)) return expLerp(0.05, 1, E.inOutSine((t - b(44)) / b(2)));
    if (t < b(48)) return expLerp(1, 60, E.in((t - b(46)) / b(2)) ** 0.5);
    if (t < b(50)) return expLerp(60, 3600, (t - b(48)) / b(2));
    if (t < b(53.2)) return 3600;
    if (t < b(53.9)) return 3600 * (1 - E.out((t - b(53.2)) / b(0.7)));
    if (t < b(54)) return 0;
    return 1;
  }
  // case metal ('rose' | 'platinum' | 'dlc', see materials/library.js FINISHES)
  const finishAt = (t) => (t >= b(105) && t < b(107) ? 'platinum' : t >= b(107) && t < b(109) ? 'dlc' : 'rose');
  // blueprint isolate: [from, to, part ids kept real]; every other part turns into the x-ray ghost
  const FOCUS = [
    [b(82), b(85), ['balance', 'hairspring']],
    [b(85), b(88), ['escapeWheel', 'palletFork']],
    [b(88), b(91), ['barrel', 'mainspring']],
  ];
  const focusAt = (t) => FOCUS.find(([a, c]) => t >= a && t < c)?.[2] ?? null;

  // ── explode drive: tremble, burst, float, then reassemble inner-first ──
  // Returns each explode node's progress (0 assembled, 1 fully exploded) at time t.
  // n.delay is 0 for the outermost parts and 1 for the innermost (calibre.js).
  const T_TREM = b(56), T_BURST = b(60), T_ASM = b(91);
  const ASM_SPREAD = 2.9, ASM_TRAVEL = 1.0;
  const asmStart = (n) => T_ASM + 0.3 + (1 - n.delay) * ASM_SPREAD;
  function explode(t, n, i) {
    if (t < T_TREM) return 0;
    if (t < T_BURST) {
      const k = (t - T_TREM) / (T_BURST - T_TREM);
      return 0.01 * k * k * Math.sin(t * 57 + i * 7.3);
    }
    const local = clamp01((t - T_BURST - n.delay * 0.12) / 1.6);
    const floatK = 1 + 0.02 * Math.sin((t - T_BURST) * 1.1 + i) * smooth(0, 1, local);
    const out = E.outExpo(local) * floatK;
    if (t < T_ASM) return out;
    const a = clamp01((t - asmStart(n)) / ASM_TRAVEL);
    return (1 - E.in(a)) * floatK;
  }
  // every node that actually travels seats with a click; merge near-simultaneous ones
  const landings = [];
  for (const n of watch.nodes) {
    if (n.offset.length() < 1) continue;
    const tl = asmStart(n) + ASM_TRAVEL;
    const near = landings.find((x) => Math.abs(x.t - tl) < 0.045);
    if (near) near.w++; else landings.push({ t: tl, w: 1 });
  }
  landings.sort((x, y) => x.t - y.t);
  const lastLanding = landings.at(-1).t;

  // light sweeps (the moving strip softbox): [t0, t1, peak intensity, height above
  // the target (× dist, camera-up), distance in front of the target, from, to]. from/to
  // are the start and end across the frame in camera-right units of dist (−1.2 → 1.2
  // crosses the whole picture). Only one sweep can be active at a time.
  const sweeps = [
    [b(9), b(13.6), 11, 0.32, 70, -1.25, 1.25],
    [b(15), b(19), 6, 0.4, 80, 1.2, -1.2],
    [b(23), b(27.4), 2.5, 0.5, 60, -1.2, 1.2],
    [b(105) + 0.05, b(107) - 0.05, 4.5, 0.36, 75, -1.3, 1.3],
    [b(107) + 0.05, b(109) - 0.05, 6, 0.36, 75, 1.3, -1.3],
    [b(109) + 0.05, b(111) - 0.05, 4.5, 0.36, 75, -1.3, 1.3],
    [b(112), b(117.5), 5, 0.4, 85, -1.3, 1.3],
  ];

  // the arpeggio the escapement plays: [from, to, four MIDI notes]. Outside these
  // windows the beats sound as plain ticks. The note order per beat is ARPEGGIO in director.js.
  const CHORDS = [
    [b(28), b(36), [64, 67, 71, 76]],         // E minor
    [b(36), b(47), [60, 64, 67, 71]],         // C major 7
    [b(68), b(75), [60, 64, 67, 72]],         // C
    [b(75), b(82), [62, 66, 69, 74]],         // D
    [b(111), 81.6, [64, 68, 71, 76]],         // E major: home
  ];
  const chordAt = (t) => CHORDS.find(([a, c]) => t >= a && t < c)?.[2] ?? null;

  // ── sound cues ─────────────────────────────────────────
  // [film time, (S, at) => …]: S is the score (score.js), `at` the exact
  // AudioContext time to play at. Cues are scheduled 150 ms ahead, so they
  // stay sample-accurate even on a slow frame. Sustained voices (drone, pad)
  // return handles kept in `vo` so a later cue can release() or level() them.
  const vo = {};
  const cues = [
    [0, (S, at) => { vo.drone = S.drone(at, { note: 28, level: 0.1 }); }],
    [0.4, (S, at) => S.shimmer(at, { n: 7, spread: 3, level: 0.012 })],
    [b(8), (S, at) => { S.clunk(at); S.riser(at, b(14) - b(8), 0.13); }],
    [b(9), (S, at) => S.whoosh(at, { dur: 3.0, level: 0.08, from: -0.8, to: 0.8 })],
    [b(14) - 0.8, (S, at) => S.reverseSwell(at, 0.8, 0.22)],
    [b(14), (S, at) => { S.hit(at, 1.1); S.shimmer(at, { n: 26, spread: 2.2, level: 0.035 }); vo.pa = S.pad(at, [40, 47, 52, 54, 55], { level: 0.028 }); }],
    [b(22) - 0.35, (S, at) => S.whoosh(at, { dur: 0.75, level: 0.15, from: 0.6, to: -0.6 })],
    [b(28) - 0.6, (S, at) => S.reverseSwell(at, 0.6, 0.14)],
    [b(28), (S, at) => { S.hit(at, 0.55); vo.pa?.release(at, 1.5); vo.pb = S.pad(at, [36, 43, 47, 52, 55], { level: 0.024, cutoff: 700 }); }],
    [b(36) - 0.3, (S, at) => S.whoosh(at, { dur: 0.6, level: 0.1, from: -0.5, to: 0.5 })],
    [b(45), (S, at) => { vo.pb?.release(at, 3); S.shepard(at, b(53.9) - b(45), { level: 0.05, period: 2.1 }); }],
    [b(47), (S, at) => S.riser(at, b(53.9) - b(47), 0.11)],
    [b(53.2), (S, at) => S.sub(at, { f0: 260, f1: 34, drop: 0.45, dur: 0.6, level: 0.32 })],
    [b(54), (S, at) => { S.hit(at, 0.8); vo.drone?.level(at, 0.055, 1.5); }],
    [b(55), (S, at) => S.heartbeat(at, 0.5)],
    [b(56), (S, at) => S.riser(at, b(60) - b(56), 0.18)],
    [b(57), (S, at) => S.heartbeat(at, 0.58)],
    [b(59), (S, at) => { S.heartbeat(at, 0.66); S.reverseSwell(at, b(1), 0.3); }],
    [b(60), (S, at) => {
      S.hit(at, 1.25);
      S.sub(at, { f0: 64, f1: 26, drop: 2.2, dur: 4.2, level: 0.45 });
      S.shimmer(at, { n: 36, spread: 2.8, level: 0.045 });
      vo.drone?.level(at, 0.09);
      vo.pc = S.pad(at, [36, 43, 48, 52, 55, 60], { level: 0.027, attack: 0.5 });
    }],
    [b(68) - 0.2, (S, at) => S.whoosh(at, { dur: 1.5, level: 0.1, from: -0.6, to: 0.6 })],
    [b(75), (S, at) => { vo.pc?.release(at, 2); vo.pd = S.pad(at, [38, 45, 50, 54, 57], { level: 0.026 }); }],
    [b(82), (S, at) => { S.hit(at, 0.85); vo.pd?.release(at, 1.2); vo.pe = S.pad(at, [33, 40, 45, 48, 52], { level: 0.024, cutoff: 600 }); }],
    [b(85), (S, at) => S.hit(at, 0.8)],
    [b(88), (S, at) => S.hit(at, 0.85)],
    [b(91), (S, at) => { vo.pe?.release(at, 2.5); S.whoosh(at, { dur: 2.2, level: 0.08, from: 0.5, to: -0.5 }); }],
    ...landings.map((l) => [l.t, (S, at) => S.seat(at, Math.min(0.42, 0.2 + 0.05 * l.w))]),
    [lastLanding, (S, at) => S.hit(at, 0.7)],
    [b(98), (S, at) => { vo.pf = S.pad(at, [38, 45, 50, 54, 57, 62], { level: 0.024 }); }],
    [b(104.2), (S, at) => S.reverseSwell(at, b(0.8), 0.2)],
    [b(105), (S, at) => { S.hit(at, 0.8); vo.pf?.release(at, 1); }],
    [b(107), (S, at) => S.hit(at, 0.8)],
    [b(109), (S, at) => S.hit(at, 0.85)],
    [b(110), (S, at) => S.reverseSwell(at, b(1), 0.28)],
    [b(111), (S, at) => {
      S.hit(at, 1.15);
      S.shimmer(at, { n: 30, spread: 3, level: 0.04 });
      vo.pg = S.pad(at, [40, 47, 52, 56, 59, 64], { level: 0.033, attack: 0.8, cutoff: 1100 });
      vo.drone?.level(at, 0.11);
    }],
    [79.6, (S, at) => { vo.pg?.release(at, 5.5); vo.drone?.release(at, 5.5); }],
  ].sort((x, y) => x[0] - y[0]);

  // ── visual events ──────────────────────────────────────
  // [film time, (C) => …] fired on the first frame at or after that time, after the
  // camera has been placed. C (director.js) = { fx, ui, kin, app, live, kick(), toCam(), blip() }.
  //
  // callouts: labels pinned to a 3D point. { id, t0, t1 (or z: the exploded layer the
  // flythrough passes, which derives t0/t1), title, sub, side (1 label right, −1 left),
  // dx / dy (label offset in px from the anchor), anchor() → world-space Vector3 }
  const fmtSpeed = (s) => (s <= 0.001 ? '0×' : s < 0.98 ? `1/${Math.round(1 / s)}×` : `${Math.round(s).toLocaleString('en-US')}×`);
  const callouts = [
    // escapement, slow motion
    { id: 'bal', t0: b(36) + 0.6, t1: b(44) - 0.6, side: -1, dx: 170, dy: 90, title: 'Screw balance', sub: '±280° · 3 Hz', anchor: () => at(A.balance, -3.1, 0.8, 1.35, V()) },
    { id: 'fork', t0: b(36) + 1.6, t1: b(44) - 0.6, side: 1, dx: 150, dy: 120, title: 'Pallet fork', sub: '±8° between banking pins', anchor: () => at(A.fork, 0.6, 0, 0.12, V()) },
    { id: 'esc', t0: b(36) + 2.6, t1: b(44) - 0.6, side: 1, dx: 130, dy: -70, title: 'Escape wheel', sub: '15 club teeth', anchor: () => at(A.escape, 1.6, 0, 0.45, V()) },
    // the exploded stack, as the camera passes each layer
    { id: 'cry', z: 67, side: 1, dx: 160, dy: 80, title: 'Sapphire crystal', sub: 'Mohs 9 · double-domed', anchor: () => at(O.crystal, 8, 10, 4.6, V()) },
    { id: 'dial', z: 25, side: -1, dx: 160, dy: 70, title: 'Chapter ring', sub: 'Clous de Paris guilloché', anchor: () => at(O.dial, -14.5, -4, 0.3, V()) },
    { id: 'cage', z: 15, side: 1, dx: 170, dy: 60, title: 'Tourbillon cage', sub: 'Titanium · 1 rev / min', anchor: () => at(O.cageUpper, -3, 3, 0.3, V()) },
    { id: 'plate', z: -1, side: -1, dx: 170, dy: 80, title: 'Main plate', sub: 'Perlage, skeletonised', anchor: () => at(O.mainplate, -12, 5, 0.9, V()) },
    { id: 'bridge', z: -24, side: 1, dx: 160, dy: 70, title: 'Bridges', sub: 'Côtes de Genève · polished bevels', anchor: () => at(O.trainBridge, -9, 7, 0, V()) },
    { id: 'ratchet', z: -31, side: -1, dx: 150, dy: 60, title: 'Ratchet & click', sub: '76 saw teeth', anchor: () => at(A.ratchet, -2.2, 2.6, -4.4, V()) },
  ];
  for (const c of callouts) {
    if (c.z === undefined) continue;
    const tc = flyT(c.z);
    c.t0 = Math.max(b(68) + 0.3, tc - 0.7);
    c.t1 = Math.max(c.t0 + 1.5, tc + 1.3);
  }

  const events = [
    [0.9, (C) => C.ui.title({ text: 'Atelier Meridian presents', kind: 'kicker-only', hold: 3.4 })],
    [b(14), (C) => {
      // ignition: sparks thrown from behind the case toward the lens, and a ring in the dial plane
      C.fx.burst({ origin: V(0, 0, -7), dir: C.toCam(), spread: 1.05, count: 650, speed: [40, 140], life: [0.8, 2.4], size: [0.1, 0.24] });
      C.fx.burst({ origin: V(0, 0, 0), count: 320, speed: [50, 120], life: [0.6, 1.8], size: [0.08, 0.2], flatten: V(0, 0, 1) });
      C.kick({ flash: 0.55, trauma: 0.7, ca: 1.1, flare: 1.3 });
      C.fx.flashGlints(9, 1.3);
    }],
    [b(14) + 0.75, (C) => C.ui.title({ kicker: 'Tourbillon Volant', text: 'Calibre M-01', kind: 'hero', hold: 3.9 })],
    [b(22) + 0.7, (C) => C.ui.lower({ text: 'Ø 42 mm · 10.8 mm', sub: '5N rose gold case, domed sapphire crystal, sapphire exhibition back', hold: 3.1 })],
    [b(28), (C) => { C.ui.chapter('I · The Heart'); C.kick({ flash: 0.12, trauma: 0.25 }); }],
    [b(28) + 0.8, (C) => C.ui.lower({ text: 'Flying tourbillon', sub: 'The whole escapement turns once a minute to cancel out gravity. Breguet, 1801.', hold: 4.6 })],
    [b(31), (C) => { C.live = () => ({ label: 'Simulation speed', value: fmtSpeed(kin.speed), note: kin.speed < 0.9 ? 'real time is 6 beats a second' : kin.speed > 2500 ? 'one hour every second' : '' }); }],
    [b(48) + 0.4, (C) => C.ui.lower({ text: 'Every wheel at its true ratio', sub: 'Barrel 80 → 10 · centre 72 → 10 · third 75 → 9 · fixed ring 96 ↺ 8', hold: 3.6 })],
    [b(54), (C) => {
      C.live = null;
      kin.syncToNow(); // the hands snap back to your local time under the cut
      C.ui.chapter('II · Anatomy');
      C.kick({ flash: 0.25, trauma: 0.4, ca: 0.6 });
    }],
    [b(55), (C) => C.ui.title({ text: `${stats.components} components`, kind: 'big', count: true, hold: 3.4 })],
    [b(60), (C) => {
      C.fx.burst({ origin: V(0, 0, 0), count: 900, speed: [60, 200], life: [0.9, 2.6], size: [0.16, 0.34] });
      C.fx.burst({ origin: V(0, 0, 2), dir: V(0, 0, 1), spread: 0.45, count: 220, speed: [80, 220], life: [0.8, 2.0], size: [0.14, 0.3] });
      C.fx.burst({ origin: V(0, 0, -2), dir: V(0, 0, -1), spread: 0.45, count: 220, speed: [80, 220], life: [0.8, 2.0], size: [0.14, 0.3] });
      C.kick({ flash: 0.85, trauma: 1, ca: 1.8, flare: 1.7 });
      C.fx.flashGlints(12, 1.5);
    }],
    [b(62.4), (C) => C.ui.title({ text: 'No models. No textures.', sub: 'Every part generated in code.', kind: 'mid', hold: 3.2 })],
    [b(82), (C) => { C.ui.lower({ text: 'Screw balance', sub: '±280° at 3 Hz · 21,600 vibrations an hour', hold: 1.85 }); C.kick({ flash: 0.18, trauma: 0.35, ca: 0.5 }); }],
    [b(85), (C) => { C.ui.lower({ text: 'Swiss lever escapement', sub: 'Lock · impulse · drop, six times a second', hold: 1.85 }); C.kick({ flash: 0.18, trauma: 0.35, ca: 0.5 }); }],
    [b(88), (C) => { C.ui.lower({ text: 'Mainspring', sub: '72 hours of stored energy', hold: 1.85 }); C.kick({ flash: 0.18, trauma: 0.35, ca: 0.5 }); }],
    [b(91), (C) => C.ui.chapter('III · Power')],
    [lastLanding, (C) => { C.kick({ flash: 0.16, trauma: 0.4 }); C.fx.flashGlints(6, 1); }],
    [b(98), (C) => {
      kin.power = 38;
      C.live = () => ({ label: 'Power reserve', value: `${kin.power.toFixed(1)} h`, note: 'of 72 hours' });
    }],
    [b(98) + 0.6, (C) => C.ui.lower({ text: '72-hour power reserve', sub: 'Wound through a working crown, ratchet and click', hold: 3.9 })],
    [b(105), (C) => { C.live = null; C.ui.chapter('IV · Metal'); C.ui.title({ text: 'Platinum', kind: 'big', hold: 1.05 }); C.kick({ flash: 0.3, trauma: 0.35 }); }],
    [b(107), (C) => { C.ui.title({ text: 'Black DLC', kind: 'big', hold: 1.05 }); C.kick({ flash: 0.3, trauma: 0.35 }); }],
    [b(109), (C) => { C.ui.title({ text: '5N Rose Gold', kind: 'big', hold: 1.05 }); C.kick({ flash: 0.3, trauma: 0.35 }); }],
    [b(111), (C) => {
      C.ui.chapter('');
      C.fx.burst({ origin: V(0, -1, -6), dir: C.toCam(), spread: 1.2, count: 420, speed: [25, 95], life: [1.2, 2.8], size: [0.1, 0.22] });
      C.kick({ flash: 0.5, trauma: 0.6, ca: 1, flare: 1.2 });
      C.fx.flashGlints(10, 1.2);
    }],
    [b(111) + 0.8, (C) => C.ui.title({
      kicker: 'Calibre M-01 · Tourbillon Volant', text: 'Atelier Meridian', kind: 'mark', hold: 6.0,
      sub: `${stats.components} components · ${stats.jewels} jewels · 0 image files<br>Generated in code, running live in your browser`,
    })],
  ];
  for (const c of callouts) {
    events.push([c.t0, (C) => { C.ui.callout(c.id, c); C.blip(); }]);
    events.push([c.t1, (C) => C.ui.uncallout(c.id)]);
  }
  events.sort((x, y) => x[0] - y[0]);

  // tick marks on the progress line (the chapter names are set by events above)
  const chapters = [{ t: b(28) }, { t: b(54) }, { t: b(91) }, { t: b(105) }, { t: b(111) }];

  return { duration, shots, tracks, speedAt, finishAt, focusAt, explode, sweeps, chordAt, cues, events, chapters, heroPos, heroTarget };
}
