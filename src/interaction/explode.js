// ─────────────────────────────────────────────────────────────
// Exploded view. A single progress value p ∈ [0,1] drives every
// node through a staggered, eased curve so the outermost parts
// lift off first and the stack opens like a technical drawing.
// ─────────────────────────────────────────────────────────────

const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const STAGGER = 0.42;

export function createExploder(nodes) {
  let p = 0, target = 0;
  let tween = null;

  function apply() {
    for (const n of nodes) {
      const local = Math.min(1, Math.max(0, (p - n.delay * STAGGER) / (1 - STAGGER)));
      const e = ease(local);
      n.obj.position.copy(n.base).addScaledVector(n.offset, e);
    }
  }

  function set(value, { duration = 0, immediate = false } = {}) {
    target = value;
    if (immediate) { p = value; tween = null; apply(); return; }
    tween = duration > 0 ? { from: p, to: value, t: 0, duration } : null;
  }

  function update(dt) {
    if (tween) {
      tween.t = Math.min(1, tween.t + dt / tween.duration);
      const k = tween.t;
      p = tween.from + (tween.to - tween.from) * k;
      if (k >= 1) tween = null;
    } else {
      p += (target - p) * (1 - Math.exp(-dt * 5));
      if (Math.abs(target - p) < 1e-4) p = target;
    }
    apply();
  }

  return { set, update, get value() { return p; }, get target() { return target; } };
}
