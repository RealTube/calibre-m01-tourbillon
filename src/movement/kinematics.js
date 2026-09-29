import { TEETH, LINE } from './layout.js';
import { meshAngle, meshAngleInternal } from '../geometry/gear.js';

// ─────────────────────────────────────────────────────────────
// Kinematics: simulated time → every moving part's angle.
//
// 21,600 vph = 6 beats/s = 3 Hz balance. The balance swings
// θ = A·sin(π·B) with B = 6·T beats, so it crosses zero once per
// beat. The Swiss lever is modelled geometrically: while the
// impulse pin is inside the fork (|θ| < lift) the fork follows it;
// outside, it rests on a banking pin. As the fork travels, the
// escape wheel recoils, receives impulse, then drops one half-tooth
// (12°) — which lets the cage, and so the entire train, advance
// exactly 1° per beat. Every other wheel follows through true
// tooth ratios and mesh phasing, so teeth stay interlocked.
// ─────────────────────────────────────────────────────────────

const DEG = Math.PI / 180;
const TAU = Math.PI * 2;
export const BEATS_PER_SECOND = 6;
export const AMPLITUDE = 280 * DEG;
export const LIFT = 26 * DEG; // half lift angle
export const FORK_BANK = 8 * DEG;
export const MAX_POWER = 72; // hours
const HOURS_PER_CROWN_TURN = 2.4;

const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const smooth = (x) => { x = clamp(x, 0, 1); return x * x * (3 - 2 * x); };

function secondsSinceMidnight() {
  const d = new Date();
  return d.getHours() * 3600 + d.getMinutes() * 60 + d.getSeconds() + d.getMilliseconds() / 1000;
}

/** Escape-wheel travel through one beat, as a function of fork progress p ∈ [0,1]. */
function escapeProfile(p) {
  if (p <= 0) return 0;
  if (p < 0.22) return -0.045 * Math.sin((Math.PI * p) / 0.22);       // unlocking: slight recoil (draw)
  if (p < 0.86) return 0.72 * smooth((p - 0.22) / 0.64);              // impulse on the pallet
  return 0.72 + 0.28 * smooth((p - 0.86) / 0.14);                     // drop onto the other pallet
}

export class Kinematics {
  constructor() {
    this.T = secondsSinceMidnight(); // simulated seconds since midnight
    this.Tb = this.T;                // balance clock (keeps swinging while the train is stopped)
    this.speed = 1;
    this.power = 61.5;               // hours of reserve
    this.amp = AMPLITUDE;
    this.running = true;
    this.stem = 0;                   // crown/stem rotation (rad)
    this.windRate = 0;               // crown turns per second while winding
    this.continuous = false;
    this.s = {};
    this.beatIndex = null;
    this.ratchetTooth = null;
    this.listeners = { beat: [], click: [], stop: [], power: [] };
    this.compute();
  }

  on(evt, fn) { this.listeners[evt].push(fn); }
  emit(evt, ...a) { for (const fn of this.listeners[evt]) fn(...a); }

  syncToNow() {
    this.T = this.Tb = secondsSinceMidnight();
  }

  /** Jump forward by real seconds spent away (e.g. a background tab). */
  advance(seconds) {
    if (!this.running || seconds <= 0) return;
    const sim = seconds * this.speed;
    const usable = Math.min(sim, this.power * 3600);
    this.T += usable;
    this.Tb = this.T;
    this.power = Math.max(0, this.power - usable / 3600);
    if (this.power <= 0) { this.running = false; this.emit('stop'); }
    this.compute();
  }

  /** dt: real seconds since last frame. */
  update(dt) {
    const simDt = dt * this.speed;
    dt = Math.min(dt, 0.1);

    // winding
    if (this.windRate > 0 && this.power < MAX_POWER) {
      const turns = this.windRate * dt;
      this.stem += turns * TAU;
      this.power = Math.min(MAX_POWER, this.power + turns * HOURS_PER_CROWN_TURN);
      this.emit('power', this.power);
      if (!this.running && this.power > 0.05) {
        this.running = true;
        this.Tb = this.T;
      }
    }

    if (this.running) {
      this.T += simDt;
      // above ~8× the balance would strobe; show it swinging in real time instead
      this.Tb = this.speed > 8 ? this.Tb + dt : this.T;
      this.power = Math.max(0, this.power - simDt / 3600);
      if (this.power <= 0) {
        this.running = false;
        this.emit('stop');
      }
      this.amp += (this.targetAmp() - this.amp) * Math.min(1, dt * 2);
    } else {
      this.Tb += simDt;
      this.amp *= Math.exp(-dt * 1.6);
    }
    this.compute();
  }

  targetAmp() {
    // amplitude falls off as the mainspring runs down (isochronism keeps rate)
    return AMPLITUDE * (0.62 + 0.38 * smooth(this.power / 30));
  }

  compute() {
    const s = this.s;
    const B = this.T * BEATS_PER_SECOND;
    const k = Math.round(B);

    // ── escapement ─────────────────────────────────────────
    const theta = this.amp * Math.sin(Math.PI * this.Tb * BEATS_PER_SECOND);
    s.balance = theta;
    s.fork = -FORK_BANK * clamp(theta / LIFT, -1, 1);

    let A;
    if (this.continuous || this.speed > 8) {
      A = B;
      s.impulse = 0;
    } else {
      const liftBeats = Math.asin(Math.min(1, LIFT / Math.max(this.amp, LIFT))) / Math.PI;
      const p = clamp((B - (k - liftBeats)) / (2 * liftBeats), 0, 1);
      A = k - 1 + escapeProfile(p);
      s.impulse = p > 0 && p < 1 ? p : 0;
    }
    if (this.beatIndex !== k && this.running) {
      if (this.beatIndex !== null && Math.abs(k - this.beatIndex) < 4 && this.speed <= 2) this.emit('beat', k);
      this.beatIndex = k;
    }
    s.trainBeats = A;

    // ── tourbillon (1 rev/min, 1° per beat, clockwise) ─────
    s.cage = -A * DEG;
    const orbit = s.cage; // escape pinion sits at cage-local angle 0
    const escAbs = meshAngleInternal(0, TEETH.fixedRing, TEETH.escapePinion, orbit);
    s.escape = escAbs - s.cage; // relative to the cage

    // ── going train ────────────────────────────────────────
    s.third = meshAngle(s.cage, TEETH.cagePinion, TEETH.thirdWheel, LINE.ThT + Math.PI);
    s.center = meshAngle(s.third, TEETH.thirdPinion, TEETH.centerWheel, LINE.CTh + Math.PI);
    s.barrel = meshAngle(s.center, TEETH.centerPinion, TEETH.barrel, LINE.CB);

    // ── hands & motion works ───────────────────────────────
    const secs = A / BEATS_PER_SECOND;
    s.minuteHand = -TAU * (secs / 3600);
    s.hourHand = -TAU * (secs / 43200);
    s.cannon = s.minuteHand;
    s.minuteWheel = meshAngle(s.cannon, TEETH.cannonPinion, TEETH.minuteWheel, LINE.CMW);
    s.hourWheel = meshAngle(s.minuteWheel, TEETH.minutePinion, TEETH.hourWheel, LINE.CMW + Math.PI);

    // ── keyless works ──────────────────────────────────────
    s.stem = this.stem;
    s.contrate = -this.stem * (TEETH.windingPinion / TEETH.contrate);
    s.crownWheel = s.contrate;
    s.ratchet = meshAngle(s.crownWheel, TEETH.crownWheel, TEETH.ratchet, LINE.CWB);
    const pitchR = TAU / TEETH.ratchet;
    const rel = s.ratchet / pitchR;
    const tooth = Math.floor(rel);
    s.click = (rel - tooth); // 0..1 ride over each tooth
    if (this.ratchetTooth !== null && tooth !== this.ratchetTooth) this.emit('click', tooth);
    this.ratchetTooth = tooth;

    s.power = this.power;
    s.running = this.running;
    s.seconds = secs;
  }

  /** Live rotation rate of a part in rev/min (numeric derivative through the real kinematics). */
  rpm(key) {
    const save = { T: this.T, Tb: this.Tb, bi: this.beatIndex, rt: this.ratchetTooth, cont: this.continuous, stem: this.stem };
    this.continuous = true;
    this.compute();
    const a0 = this.s[key];
    this.T += 60; this.Tb += 60;
    this.compute();
    const a1 = this.s[key];
    Object.assign(this, { T: save.T, Tb: save.Tb, beatIndex: save.bi, ratchetTooth: save.rt, continuous: save.cont, stem: save.stem });
    this.compute();
    return (a1 - a0) / TAU;
  }

  /** Dev self-test: tooth ratios, periods, and wall-clock agreement. */
  selfTest() {
    const results = [];
    const check = (name, got, want, tol = 1e-6) => results.push({ name, got, want, ok: Math.abs(got - want) <= tol * Math.max(1, Math.abs(want)) });
    check('cage rev/min', this.rpm('cage'), -1);
    check('escape wheel rev/min (rel. cage)', this.rpm('escape'), TEETH.fixedRing / TEETH.escapePinion);
    check('third / cage ratio', this.rpm('third') / this.rpm('cage'), -TEETH.cagePinion / TEETH.thirdWheel);
    check('centre wheel rev/min', this.rpm('center'), -1 / 60);
    check('barrel rev/min', this.rpm('barrel'), (1 / 60) * (TEETH.centerPinion / TEETH.barrel));
    check('minute hand rev/min', this.rpm('minuteHand'), -1 / 60);
    check('hour hand rev/min', this.rpm('hourHand'), -1 / 720);
    check('motion works → hour wheel', this.rpm('hourWheel'), -1 / 720);
    check('beats per escape tooth', (TEETH.fixedRing / TEETH.escapePinion) * TEETH.escapeWheel * 2, 360);
    const now = new Date();
    const wantMin = (now.getMinutes() + now.getSeconds() / 60) / 60;
    const gotMin = ((-this.s.minuteHand / TAU) % 1 + 1) % 1;
    const diff = Math.min(Math.abs(gotMin - wantMin), 1 - Math.abs(gotMin - wantMin)) * 3600;
    results.push({ name: 'minute hand vs wall clock (s)', got: diff, want: 0, ok: diff < 1.5 });
    return results;
  }
}

export { DEG, TAU };
