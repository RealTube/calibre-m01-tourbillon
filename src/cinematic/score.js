// ─────────────────────────────────────────────────────────────
// The film score, synthesised live: no samples, only oscillators,
// noise, filters and a generated reverb. Trailer grammar: a riser
// climbs into each cut, a sub-drop and braam land on it, a long
// tail carries the title. Like Zimmer's Dunkirk score it is built
// on a ticking watch and a Shepard tone; here the arpeggio is
// literally played by the escapement (see director.js).
// Every voice takes an absolute AudioContext time.
//
// Signal flow: voices → bus (dry) and verbIn (wet, convolver) → limiter
// → out (master fade / mute) → speakers. Ticks and ratchet clicks come
// from tick.js through tickBus. Levels were set by rendering the whole
// cue sheet offline: peaks about −2.5 dBFS, a bed around −21 dB RMS,
// hits about 8 dB above it. Keep new voices in that range.
// Notes are MIDI numbers: 28 = E1, 40 = E2, 52 = E3, 64 = E4, 76 = E5.
// ─────────────────────────────────────────────────────────────

export const midi = (n) => 440 * 2 ** ((n - 69) / 12);

export function createScore(audio) {
  let ctx = null, out = null, bus = null, tickBus = null, verbIn = null, noiseBuf = null;
  const live = new Set();
  const LEVEL = 0.82;

  function init() {
    if (ctx) return;
    ctx = audio.context;
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -7;
    limiter.knee.value = 4;
    limiter.ratio.value = 16;
    limiter.attack.value = 0.002;
    limiter.release.value = 0.22;
    out = ctx.createGain();
    out.gain.value = 0;
    bus = ctx.createGain();
    bus.connect(limiter).connect(out).connect(ctx.destination);
    tickBus = ctx.createGain();
    tickBus.gain.value = 0.42;
    tickBus.connect(bus);
    const verb = ctx.createConvolver();
    verb.buffer = impulse(3.8);
    verbIn = ctx.createGain();
    const wet = ctx.createGain();
    wet.gain.value = 0.5;
    verbIn.connect(verb).connect(wet).connect(limiter);
    noiseBuf = ctx.createBuffer(2, ctx.sampleRate * 3, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = noiseBuf.getChannelData(c);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
  }

  // a dark hall: decaying noise whose high end dies faster than its low end
  function impulse(seconds) {
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      let y = 0;
      for (let i = 0; i < len; i++) {
        const x = i / len;
        const a = 0.85 - 0.75 * x; // one-pole low-pass that closes over the tail
        y += a * ((Math.random() * 2 - 1) - y);
        d[i] = y * Math.pow(1 - x, 2.6) * (i < 90 ? i / 90 : 1);
      }
    }
    return buf;
  }

  // ── building blocks ──────────────────────────────────
  // route(): dry goes to the bus, wet to the reverb. Automations always start with
  // setValueAtTime(…, t) so ramps begin at the voice's own time, not "now".
  function route(node, dry = 1, wet = 0) {
    if (dry > 0) {
      const g = ctx.createGain();
      g.gain.value = dry;
      node.connect(g).connect(bus);
    }
    if (wet > 0) {
      const g = ctx.createGain();
      g.gain.value = wet;
      node.connect(g).connect(verbIn);
    }
    return node;
  }
  function osc(type, f, t, stop, detune = 0) {
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f, t);
    o.detune.value = detune;
    o.start(t);
    o.stop(stop);
    return o;
  }
  function noise(t, stop) {
    const s = ctx.createBufferSource();
    s.buffer = noiseBuf;
    s.loop = true;
    s.start(t, Math.random() * 2.5);
    s.stop(stop);
    return s;
  }
  function filter(type, f, q = 0.7) {
    const b = ctx.createBiquadFilter();
    b.type = type;
    b.frequency.value = f;
    b.Q.value = q;
    return b;
  }
  function amp(t, attack, peak, decay) {
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
    return g;
  }
  function pan(v) {
    const p = ctx.createStereoPanner();
    p.pan.value = v;
    return p;
  }
  const shaperCurve = (() => {
    const n = 1024, c = new Float32Array(n);
    for (let i = 0; i < n; i++) c[i] = Math.tanh(((i / (n - 1)) * 2 - 1) * 2.6);
    return c;
  })();

  // ── voices ────────────────────────────────────────────
  /** Pitch-dropping sine: the felt-not-heard part of every impact. */
  function sub(t, { f0 = 120, f1 = 36, drop = 0.4, dur = 1.8, level = 0.9 } = {}) {
    const o = osc('sine', f0, t, t + dur + 0.05);
    o.frequency.exponentialRampToValueAtTime(f1, t + drop);
    const g = amp(t, 0.005, level, dur);
    route(o.connect(g), 1, 0.05);
  }

  function noiseHit(t, { lp = 1800, dur = 0.7, level = 0.45, wet = 0.7 } = {}) {
    const s = noise(t, t + dur + 0.05);
    const f = filter('lowpass', lp, 0.8);
    f.frequency.setValueAtTime(lp, t);
    f.frequency.exponentialRampToValueAtTime(Math.max(80, lp * 0.15), t + dur);
    route(s.connect(f).connect(amp(t, 0.003, level, dur)), 1, wet);
  }

  function crack(t, level = 0.22) {
    const s = noise(t, t + 0.2);
    route(s.connect(filter('highpass', 2600, 0.7)).connect(amp(t, 0.001, level, 0.11)), 1, 0.4);
  }

  /** Inharmonic steel partials, like a struck movement plate. */
  function ring(t, level = 0.05, base = 587) {
    [1, 2.36, 3.76, 5.13].forEach((r, i) => {
      const o = osc('sine', base * r, t, t + 2.6);
      route(o.connect(amp(t, 0.002, level / (1 + i * 0.6), 2.2 - i * 0.4)).connect(pan((i % 2 ? 1 : -1) * 0.3)), 0.6, 0.9);
    });
  }

  /** Hans Zimmer's "braam": detuned low saws, saturated, filter swelling open then closing. */
  function braam(t, { root = 40, dur = 3.4, level = 0.3 } = {}) {
    const f = midi(root);
    const mix = ctx.createGain();
    mix.gain.value = 0.22;
    const voices = [[f / 2, -7], [f / 2, 6], [f, -9], [f, 8], [f * 1.5, 0]];
    for (const [fr, det] of voices) osc('sawtooth', fr, t, t + dur + 0.1, det).connect(mix);
    const sh = ctx.createWaveShaper();
    sh.curve = shaperCurve;
    const lp = filter('lowpass', 90, 2.2);
    lp.frequency.setValueAtTime(90, t);
    lp.frequency.exponentialRampToValueAtTime(1500, t + 0.16);
    lp.frequency.exponentialRampToValueAtTime(220, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(level, t + 0.05);
    g.gain.setTargetAtTime(level * 0.55, t + 0.4, 0.5);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    route(mix.connect(sh).connect(lp).connect(g), 1, 0.55);
  }

  /** The full impact: size 0..1.2. */
  function hit(t, size = 1) {
    sub(t, { level: 0.55 + 0.4 * size, dur: 1.2 + size * 1.2 });
    noiseHit(t, { lp: 1200 + 1400 * size, dur: 0.4 + 0.5 * size, level: 0.25 + 0.25 * size });
    crack(t, 0.1 + 0.14 * size);
    ring(t, 0.025 + 0.035 * size);
    if (size >= 0.95) braam(t, { level: 0.22 + 0.1 * size });
  }

  /** Tension climbing into a cut: noise band sweeping up, a saw glissando, tremolo speeding up. */
  function riser(t, dur, level = 0.22) {
    const end = t + dur;
    const trem = ctx.createGain();
    trem.gain.value = 0.55;
    const lfo = osc('sine', 3, t, end + 0.05);
    lfo.frequency.exponentialRampToValueAtTime(20, end);
    const lfoAmt = ctx.createGain();
    lfoAmt.gain.value = 0.45;
    lfo.connect(lfoAmt).connect(trem.gain);

    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(level, end - 0.02);
    env.gain.linearRampToValueAtTime(0, end + 0.02);

    const s = noise(t, end + 0.05);
    const bp = filter('bandpass', 260, 1.4);
    bp.frequency.setValueAtTime(260, t);
    bp.frequency.exponentialRampToValueAtTime(7500, end);
    s.connect(bp).connect(trem);

    const o = osc('sawtooth', 70, t, end + 0.05);
    o.frequency.exponentialRampToValueAtTime(560, end);
    const lp = filter('lowpass', 300, 1);
    lp.frequency.setValueAtTime(300, t);
    lp.frequency.exponentialRampToValueAtTime(3800, end);
    const og = ctx.createGain();
    og.gain.value = 0.35;
    o.connect(lp).connect(og).connect(trem);

    route(trem.connect(env), 1, 0.35);
  }

  /** Noise that swells in reverse up to an exact moment, then cuts dead. */
  function reverseSwell(t, dur, level = 0.3) {
    const end = t + dur;
    const s = noise(t, end + 0.02);
    const lp = filter('lowpass', 300, 0.9);
    lp.frequency.setValueAtTime(300, t);
    lp.frequency.exponentialRampToValueAtTime(9000, end);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(level, end - 0.005);
    g.gain.linearRampToValueAtTime(0, end + 0.01);
    route(s.connect(lp).connect(g), 1, 0.15);
  }

  /**
   * Shepard tone: octave-spaced sines all gliding upward under a bell-shaped
   * loudness window, so the pitch seems to climb forever.
   */
  function shepard(t, dur, { level = 0.07, period = 2.4, voices = 6, fmin = 55 } = {}) {
    const rate = 80;
    const L = Math.ceil(dur * rate) + 1;
    const lp = filter('lowpass', 5000, 0.5);
    route(lp, 1, 0.35);
    for (let i = 0; i < voices; i++) {
      const fc = new Float32Array(L), gc = new Float32Array(L);
      for (let j = 0; j < L; j++) {
        const tt = j / rate;
        const x = (i + tt / period) % voices;
        const fade = Math.min(1, tt / 0.9) * Math.min(1, (dur - tt) / 0.12);
        fc[j] = fmin * 2 ** x;
        gc[j] = Math.max(0.0001, level * (0.5 - 0.5 * Math.cos((2 * Math.PI * x) / voices)) * fade);
      }
      // curves must not overlap other automation events, so no setValueAtTime here
      const o = ctx.createOscillator();
      o.frequency.value = fc[0];
      o.frequency.setValueCurveAtTime(fc, t, dur);
      o.start(t);
      o.stop(t + dur + 0.02);
      const g = ctx.createGain();
      g.gain.value = 0;
      g.gain.setValueCurveAtTime(gc, t, dur);
      o.connect(g).connect(lp);
    }
  }

  function whoosh(t, { dur = 0.8, level = 0.2, from = -0.7, to = 0.7 } = {}) {
    const s = noise(t, t + dur + 0.05);
    const bp = filter('bandpass', 320, 0.9);
    bp.frequency.setValueAtTime(320, t);
    bp.frequency.exponentialRampToValueAtTime(2400, t + dur * 0.6);
    bp.frequency.exponentialRampToValueAtTime(500, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(level, t + dur * 0.6);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    const p = pan(from);
    p.pan.setValueAtTime(from, t);
    p.pan.linearRampToValueAtTime(to, t + dur);
    route(s.connect(bp).connect(g).connect(p), 1, 0.3);
  }

  /** Glittering high partials tuned to E major: the sound of sparks. */
  function shimmer(t, { n = 16, spread = 1.4, level = 0.03 } = {}) {
    const notes = [88, 92, 95, 99, 100, 104, 107];
    for (let i = 0; i < n; i++) {
      const at = t + Math.random() ** 1.6 * spread;
      const o = osc('sine', midi(notes[(Math.random() * notes.length) | 0]), at, at + 1.6);
      route(o.connect(amp(at, 0.003, level * (0.5 + Math.random() * 0.5), 0.4 + Math.random() * 1.0)).connect(pan(Math.random() * 1.6 - 0.8)), 0.5, 1);
    }
  }

  function thump(t, level = 0.6) {
    sub(t, { f0: 92, f1: 44, drop: 0.12, dur: 0.42, level });
  }
  function heartbeat(t, level = 0.6) {
    thump(t, level);
    thump(t + 0.24, level * 0.62);
  }
  /** A part seating home during reassembly: a bright metallic tick with a little weight. */
  function seat(t, level = 0.3) {
    const s = noise(t, t + 0.1);
    route(s.connect(filter('bandpass', 3400, 3)).connect(amp(t, 0.001, level, 0.045)), 0.9, 0.35);
    route(osc('sine', 2100 + Math.random() * 900, t, t + 0.3).connect(amp(t, 0.001, level * 0.14, 0.22)), 0.6, 0.6);
    sub(t, { f0: 170, f1: 70, drop: 0.05, dur: 0.14, level: level * 0.55 });
  }

  /** The stadium-light "clunk" of a lamp striking. */
  function clunk(t) {
    sub(t, { f0: 75, f1: 38, drop: 0.25, dur: 1.0, level: 0.55 });
    noiseHit(t, { lp: 700, dur: 0.3, level: 0.35, wet: 0.9 });
    crack(t, 0.08);
  }

  /** A soft celesta-like pluck: the escapement's arpeggio. */
  function pluck(t, note, { level = 0.07, p = 0, bright = 1 } = {}) {
    const f = midi(note);
    const lp = filter('lowpass', 900 + 3200 * bright, 1.6);
    lp.frequency.setValueAtTime(900 + 3200 * bright, t);
    lp.frequency.exponentialRampToValueAtTime(520, t + 0.4);
    const g = amp(t, 0.003, level, 1.1);
    const o1 = osc('triangle', f, t, t + 1.2);
    const o2 = osc('sawtooth', f, t, t + 1.2, 4);
    const o3 = osc('sine', f * 2, t, t + 1.2);
    const g2 = ctx.createGain(); g2.gain.value = 0.22;
    const g3 = ctx.createGain(); g3.gain.value = 0.3;
    o1.connect(lp); o2.connect(g2).connect(lp); o3.connect(g3).connect(lp);
    route(lp.connect(g).connect(pan(p)), 0.8, 0.5);
  }

  /** UI ping for callouts. */
  function blip(t, note = 100, level = 0.04) {
    const f = midi(note);
    route(osc('sine', f, t, t + 0.6).connect(amp(t, 0.002, level, 0.4)), 0.6, 0.6);
    route(osc('sine', f * 2.76, t, t + 0.3).connect(amp(t, 0.001, level * 0.4, 0.18)), 0.6, 0.6);
  }

  /** Sustained voices return a handle; release() lets them die naturally. */
  function pad(t, notes, { attack = 1.6, level = 0.045, cutoff = 900, wet = 0.6 } = {}) {
    const lp = filter('lowpass', cutoff, 0.6);
    const lfo = osc('sine', 0.11, t, t + 600);
    const lfoAmt = ctx.createGain();
    lfoAmt.gain.value = cutoff * 0.25;
    lfo.connect(lfoAmt).connect(lp.frequency);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(level, t + attack);
    const oscs = [lfo];
    for (const n of notes) {
      for (const det of [-8, 7]) {
        const o = osc('sawtooth', midi(n), t, t + 600, det);
        o.connect(lp);
        oscs.push(o);
      }
    }
    route(lp.connect(g), 0.75, wet);
    return sustain(g, oscs);
  }

  function drone(t, { note = 28, level = 0.2 } = {}) {
    const f = midi(note);
    const lp = filter('lowpass', 260, 0.7);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(level, t + 3.5);
    const oscs = [];
    const mk = (type, fr, lvl) => {
      const o = osc(type, fr, t, t + 600);
      const og = ctx.createGain();
      og.gain.value = lvl;
      o.connect(og).connect(lp);
      oscs.push(o);
    };
    mk('sine', f, 1);
    mk('sine', f * 2, 0.35);
    mk('triangle', f * 3, 0.05);
    const rumble = noise(t, t + 600);
    const rg = ctx.createGain(); rg.gain.value = 0.18;
    rumble.connect(filter('lowpass', 80, 0.5)).connect(rg).connect(lp);
    oscs.push(rumble);
    // slow breathing on a separate stage so it never fights the envelope
    const breathe = ctx.createGain();
    breathe.gain.value = 1;
    const lfo = osc('sine', 0.09, t, t + 600);
    const la = ctx.createGain(); la.gain.value = 0.3;
    lfo.connect(la).connect(breathe.gain);
    oscs.push(lfo);
    route(lp.connect(g).connect(breathe), 1, 0.25);
    return sustain(g, oscs);
  }

  function sustain(g, sources) {
    const h = {
      release(at, time = 2.5) {
        g.gain.cancelScheduledValues(at);
        g.gain.setTargetAtTime(0.0001, at, time / 4);
        for (const s of sources) { try { s.stop(at + time + 0.2); } catch { /* already stopped */ } }
        live.delete(h);
      },
      level(at, v, time = 1) {
        g.gain.cancelScheduledValues(at);
        g.gain.setTargetAtTime(Math.max(0.0001, v), at, time / 3);
      },
      kill() {
        for (const s of sources) { try { s.stop(); } catch { /* already stopped */ } }
        live.delete(h);
      },
    };
    live.add(h);
    return h;
  }

  return {
    init,
    midi,
    get ctx() { init(); return ctx; },
    get bus() { init(); return bus; },
    get now() { init(); return ctx.currentTime; },
    async start(muted) {
      init();
      if (ctx.state !== 'running') { try { await ctx.resume(); } catch { /* blocked */ } }
      out.gain.cancelScheduledValues(ctx.currentTime);
      out.gain.setTargetAtTime(muted ? 0 : LEVEL, ctx.currentTime, 0.05);
    },
    setMuted(m) {
      if (!ctx) return;
      out.gain.cancelScheduledValues(ctx.currentTime);
      out.gain.setTargetAtTime(m ? 0 : LEVEL, ctx.currentTime, 0.08);
    },
    /** Fade everything out and free the sustained voices. */
    stop(fade = 0.5) {
      if (!ctx) return;
      const t = ctx.currentTime;
      out.gain.cancelScheduledValues(t);
      out.gain.setTargetAtTime(0, t, fade / 4);
      for (const h of [...live]) h.release(t, fade);
    },
    sub, hit, braam, riser, reverseSwell, shepard, whoosh, shimmer, thump, heartbeat, clunk, seat, pluck, blip, pad, drone, ring,
    tick: (t, parity, slow) => audio.tickAt(t, parity, slow, tickBus),
    click: (t) => audio.clickAt(t, tickBus),
  };
}
