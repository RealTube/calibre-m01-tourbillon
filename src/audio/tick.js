// ─────────────────────────────────────────────────────────────
// Synthesised movement sounds (no samples): each beat is a tiny
// band-passed noise transient plus two inharmonic steel partials;
// "tick" and "tock" differ slightly, as the entry and exit pallets
// really do. The ratchet click is lower and drier.
// ─────────────────────────────────────────────────────────────

export function createAudio() {
  let ctx = null, master = null, noise = null;
  let enabled = false;

  function ensure() {
    if (ctx) return;
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -18;
    comp.ratio.value = 6;
    master = ctx.createGain();
    master.gain.value = 0.55;
    master.connect(comp).connect(ctx.destination);
    const len = Math.floor(ctx.sampleRate * 0.05);
    noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  }

  function transient(t, { freq, q, peak, decay }, dest = master) {
    const src = ctx.createBufferSource();
    src.buffer = noise;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = freq;
    bp.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + 0.0007);
    g.gain.exponentialRampToValueAtTime(0.0001, t + decay);
    src.connect(bp).connect(g).connect(dest);
    src.start(t);
    src.stop(t + decay + 0.01);
  }

  function partial(t, freq, peak, decay, dest = master) {
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + 0.001);
    g.gain.exponentialRampToValueAtTime(0.0001, t + decay);
    o.connect(g).connect(dest);
    o.start(t);
    o.stop(t + decay + 0.01);
  }

  function beat(t, parity, slow, dest) {
    const k = slow < 1 ? 0.7 : 1;
    // lock → unlock → drop: two micro-transients a few ms apart
    transient(t, { freq: (parity ? 5600 : 4800) * k, q: 5, peak: 0.55, decay: 0.012 }, dest);
    transient(t + 0.0045, { freq: (parity ? 3900 : 3500) * k, q: 7, peak: 0.35, decay: 0.02 }, dest);
    partial(t, (parity ? 3180 : 2960) * k, 0.07, 0.05, dest);
    partial(t, (parity ? 7410 : 6890) * k, 0.03, 0.025, dest);
  }

  function ratchet(t, dest) {
    transient(t, { freq: 2300, q: 3, peak: 0.6, decay: 0.03 }, dest);
    partial(t, 1850, 0.05, 0.04, dest);
  }

  function tick(parity, slow = 1) {
    if (!enabled || !ctx) return;
    beat(ctx.currentTime + 0.004, parity, slow, master);
  }

  function click() {
    if (!enabled || !ctx) return;
    ratchet(ctx.currentTime + 0.002, master);
  }

  async function setEnabled(v) {
    enabled = v;
    if (v) {
      ensure();
      if (ctx.state !== 'running') await ctx.resume();
    }
  }

  return {
    tick,
    click,
    setEnabled,
    get enabled() { return enabled; },
    // the film schedules its own beats at exact times into its own bus, whatever the toggle says
    get context() { ensure(); return ctx; },
    tickAt(t, parity, slow = 1, dest = master) { ensure(); beat(t, parity, slow, dest); },
    clickAt(t, dest = master) { ensure(); ratchet(t, dest); },
  };
}
