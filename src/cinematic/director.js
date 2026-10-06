import * as THREE from 'three';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { createFX, CinemaShader } from './fx.js';
import { createScore } from './score.js';
import { createOverlay } from './overlay.js';
import { buildFilm, BEAT } from './shots.js';

// ─────────────────────────────────────────────────────────────
// The director: runs the film on top of the live app. It owns the
// camera, the lights and the watch's speed and explosion while it
// plays, and hands everything back afterwards.
//
// phases
//   idle     nothing to do; main.js stages the app as usual
//   preroll  fade to black; under the black: load the area-light
//            tables, set frame 0, compileAsync the new shader variants
//   film     the timeline runs (shots.js); ends on the hero pose
//   outro    Esc / Exit: fade to black, then restore the app
//   fadein   the app is back; lift the black, then idle
// `active` is true for preroll, film and outro: main.js then skips
// its own camera, picking, night fade and DoF and calls update().
//
// What to edit where: docs/CINEMATIC.md.
// ─────────────────────────────────────────────────────────────

const DEG = Math.PI / 180;
// keep in step with the `.film` media query in cinematic.css
const DESKTOP = '(min-width: 821px) and (hover: hover) and (pointer: fine)';
// arpeggio over the four chord tones: root, fifth, third, fifth, top, fifth, third, fifth
const ARPEGGIO = [0, 2, 1, 2, 3, 2, 1, 2];

// smooth 1D value noise in [-1, 1], one stream per seed
function noise1(x, seed) {
  const i = Math.floor(x), f = x - i;
  const h = (n) => { const s = Math.sin((n + seed * 57.13) * 127.1) * 43758.5453; return (s - Math.floor(s)) * 2 - 1; };
  const u = f * f * (3 - 2 * f);
  return h(i) * (1 - u) + h(i + 1) * u;
}
const fbm = (x, seed) => noise1(x, seed) * 0.7 + noise1(x * 2.3, seed + 9) * 0.3;

/**
 * @param {object} app  what main.js lends the film:
 *   scene, camera, R (renderer + passes), studio, watch, kin, M (materials),
 *   audio (tick.js), stats, pose(name) → [pos, target],
 *   setFinish(key), setFocus(ids | null)  blueprint-isolate these part ids,
 *   enter() → saved   hide the UI and park the app's own state,
 *   leave(saved, heroTarget)   restore it.
 * @returns {{ play, stop, update, toggleSound, active, holdRender }}
 */
export function createCinematic(app) {
  const { scene, camera, R, studio, watch, kin, M } = app;
  const fx = createFX(app);
  const score = createScore(app.audio);
  const cinema = new ShaderPass(CinemaShader);
  cinema.enabled = false;
  R.composer.addPass(cinema); // after OutputPass: it grades display-referred pixels
  const U = cinema.uniforms;
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  let film = buildFilm(app); // rebuilt on every play (the hero pose depends on the window)
  const ui = createOverlay({ onExit: () => stop(), onSound: () => toggleSound(), chapters: film.chapters, duration: film.duration });

  let phase = 'idle';
  let t = 0, clock = 0, fade = 0, holdRender = false;
  let cueIdx = 0, evIdx = 0, saved = null, muted = false;
  let curFinish = null, curFocus;
  let nextBeat = null;
  const imp = { flash: 0, trauma: 0, ca: 0, flare: 0 };
  const flarePos = new THREE.Vector2(0.5, 0.5);
  const shot = { pos: new THREE.Vector3(), target: new THREE.Vector3(), fov: 28, roll: 0, dof: 0, ap: 1 };
  const fwd = new THREE.Vector3(), right = new THREE.Vector3(), up = new THREE.Vector3(), back = new THREE.Vector3();
  const tmp = new THREE.Vector3(), tmp2 = new THREE.Vector3(), Y = new THREE.Vector3(0, 1, 0);
  const drawSize = new THREE.Vector2();
  // unlit prints (the sapphire disc's signature) would glow in a dark room; scale them with the ambient light
  const decals = [];
  watch.root.traverse((o) => {
    if (o.isMesh && o.material?.isMeshBasicMaterial) decals.push({ m: o.material, c: o.material.color.clone() });
  });
  const setDecals = (k) => { for (const d of decals) d.m.color.copy(d.c).multiplyScalar(k); };

  // the context handed to visual events (shots.js `events`): the fx and
  // overlay, kick() for flash / shake / aberration / flare impulses,
  // toCam() for aiming bursts, blip() for a callout ping, and `live`, a
  // function returning { label, value, note } for the top-right readout
  const C = {
    fx, ui, kin, app, live: null,
    kick({ flash = 0, trauma = 0, ca = 0, flare = 0 }) {
      const k = reduced ? 0.3 : 1;
      imp.flash = Math.max(imp.flash, flash * k);
      imp.trauma = Math.min(1, imp.trauma + trauma);
      imp.ca = Math.max(imp.ca, ca * k);
      if (flare > imp.flare) {
        imp.flare = flare;
        tmp.set(0, 0, 0).project(camera);
        flarePos.set(tmp.x * 0.5 + 0.5, tmp.y * 0.5 + 0.5);
      }
    },
    toCam: () => new THREE.Vector3().copy(camera.position).normalize(),
    blip: () => { if (phase === 'film') score.blip(score.now + 0.01, 100 + ((Math.random() * 3) | 0) * 2, 0.035); },
  };

  // ── play ──────────────────────────────────────────────
  function play() {
    if (phase !== 'idle' || !window.matchMedia(DESKTOP).matches) return;
    phase = 'preroll';
    t = 0; fade = U.uFade.value = 0;
    saved = app.enter();
    film = buildFilm(app);
    ui.show();
    ui.setSound(!muted);
    cinema.enabled = true;
    score.start(muted); // inside the click: unlocks audio
  }

  async function begin() {
    holdRender = true;
    try { await fx.prepare(); } catch { /* the sweep light just stays dark */ }
    if (phase !== 'preroll') { holdRender = false; return; } // Esc during the black
    // set the first frame of the film under the black, then compile every new program
    fx.visible = true;
    fx.clearSparks();
    kin.power = 60;
    kin.running = true;
    kin.windRate = 0;
    kin.amp = kin.targetAmp();
    cueIdx = evIdx = 0;
    curFinish = null; curFocus = undefined;
    nextBeat = null;
    Object.assign(imp, { flash: 0, trauma: 0, ca: 0, flare: 0 });
    C.live = null;
    apply(0, 0);
    R.bloom.enabled = true;
    try { await R.renderer.compileAsync(scene, camera); } catch { /* compiles lazily instead */ }
    holdRender = false;
    if (phase === 'preroll') phase = 'film';
  }

  // ── stop: Esc / Exit mid-film ─────────────────────────
  function stop() {
    if (phase !== 'film' && phase !== 'preroll') return;
    phase = 'outro';
    fade = U.uFade.value;
    score.stop(0.45);
    ui.hide();
  }

  // ── restore the app (under black, or at the natural end) ──
  function restore() {
    fx.visible = false;
    fx.clearSparks();
    for (const n of watch.nodes) n.obj.position.copy(n.base);
    camera.position.copy(film.heroPos);
    camera.lookAt(film.heroTarget);
    camera.fov = 28;
    camera.updateProjectionMatrix();
    R.bokeh.enabled = false;
    setDecals(1);
    app.leave(saved, film.heroTarget);
    saved = null;
  }

  function toggleSound() {
    muted = !muted;
    score.setMuted(muted);
    ui.setSound(!muted);
  }

  // ── the per-frame entry point (called every frame, even when idle) ──
  function update(dt) {
    if (phase === 'idle') return;
    clock += dt;
    U.uTime.value = clock;
    R.renderer.getDrawingBufferSize(drawSize);
    U.uRes.value.copy(drawSize);

    if (phase === 'preroll') {
      fade = Math.min(1, fade + dt / 0.7);
      U.uFade.value = fade * fade;
      U.uVignette.value = 0.4 * fade;
      if (fade >= 1 && !holdRender) begin();
      return;
    }

    if (phase === 'outro') {
      fade = Math.min(1, fade + dt / 0.35);
      U.uFade.value = fade;
      if (fade >= 1) {
        restore();
        U.uFlash.value.set(0, 0, 0);
        U.uFlare.value = U.uCA.value = U.uGrain.value = U.uVignette.value = U.uContrast.value = 0;
        phase = 'fadein';
      }
      return;
    }

    if (phase === 'fadein') {
      fade = Math.max(0, fade - dt / 0.8);
      U.uFade.value = fade * fade;
      if (fade <= 0) { cinema.enabled = false; phase = 'idle'; }
      return;
    }

    // ── film ──
    t += dt;
    const ahead = t + 0.15;
    while (cueIdx < film.cues.length && film.cues[cueIdx][0] <= ahead) {
      const [ct, fn] = film.cues[cueIdx++];
      fn(score, score.now + Math.max(0.005, ct - t));
    }
    apply(t, dt);
    // one-shots after the camera is placed, so bursts aim at this shot's lens
    while (evIdx < film.events.length && film.events[evIdx][0] <= t) film.events[evIdx++][1](C);
    scheduleBeats();
    if (t >= film.duration) {
      // natural end: the last shot already sits on the hero pose in the studio light
      score.stop(3.5);
      ui.hide();
      restore();
      cinema.enabled = false;
      phase = 'idle';
    }
  }

  // ── everything that is a function of film time ───────
  function apply(time, dt) {
    const T = film.tracks;

    // the watch itself
    kin.speed = film.speedAt(time);
    kin.windRate = T.wind(time);
    watch.nodes.forEach((n, i) => n.obj.position.copy(n.base).addScaledVector(n.offset, film.explode(time, n, i)));
    const fin = film.finishAt(time);
    if (fin !== curFinish) { app.setFinish(fin); curFinish = fin; }
    const foc = film.focusAt(time);
    if (foc !== curFocus) { app.setFocus(foc); curFocus = foc; }

    // camera
    const s = film.shots.find((x) => time >= x.t0 && time < x.t1) ?? film.shots.at(-1);
    s.cam(Math.min(1, (time - s.t0) / (s.t1 - s.t0)), shot, time - s.t0);
    camera.position.copy(shot.pos);
    camera.lookAt(shot.target);
    const hh = T.handheld(time) * (reduced ? 0.3 : 1);
    const tr = imp.trauma * imp.trauma * (reduced ? 0.25 : 1);
    camera.rotateY((hh * fbm(time * 0.33, 1) + tr * 2.4 * noise1(time * 14, 4)) * DEG);
    camera.rotateX((hh * fbm(time * 0.29, 2) + tr * 2.4 * noise1(time * 14, 5)) * DEG);
    camera.rotateZ((shot.roll + hh * 0.7 * fbm(time * 0.21, 3) + tr * 1.8 * noise1(time * 12, 6)) * DEG);
    if (camera.fov !== shot.fov) { camera.fov = shot.fov; camera.updateProjectionMatrix(); }
    camera.updateMatrixWorld();

    // camera basis for camera-relative lights
    camera.getWorldDirection(fwd);
    right.setFromMatrixColumn(camera.matrixWorld, 0);
    up.setFromMatrixColumn(camera.matrixWorld, 1);
    back.copy(fwd).negate();

    // studio
    scene.environmentIntensity = T.env(time);
    scene.backgroundIntensity = T.bg(time);
    studio.follow(camera, shot.target);
    studio.key.intensity = T.key(time);
    R.renderer.toneMappingExposure = T.exposure(time);
    M.lume.emissiveIntensity = T.lume(time);
    setDecals(Math.min(1, T.env(time) * 1.1));
    const bs = T.bloom(time);
    R.bloom.enabled = bs > 0.01;
    R.bloom.strength = bs;
    R.bloom.threshold = T.bloomThreshold(time);
    R.bloom.radius = T.bloomRadius(time);

    // rims: behind the watch, either side; the top spot from screen-up
    const rim = T.rim(time);
    const tg = shot.target;
    // wide and low enough that the almost-flat crystal never mirrors them into the lens
    fx.rimWarm.position.copy(tg).addScaledVector(fwd, 50).addScaledVector(right, -95).addScaledVector(up, 18);
    fx.rimCool.position.copy(tg).addScaledVector(fwd, 50).addScaledVector(right, 95).addScaledVector(up, -12);
    fx.rimWarm.target.position.copy(tg);
    fx.rimCool.target.position.copy(tg);
    fx.rimWarm.intensity = rim;
    fx.rimCool.intensity = rim * 0.85;
    fx.top.position.copy(tg).addScaledVector(up, 120).addScaledVector(fwd, 14);
    fx.top.target.position.copy(tg);
    fx.top.intensity = T.top(time);

    // the beam falls from screen-up, tilted slightly toward the lens
    const beam = T.beam(time);
    fx.beamGroup.position.copy(tg);
    tmp.copy(up).addScaledVector(back, 0.22).normalize();
    fx.beamGroup.quaternion.setFromUnitVectors(Y, tmp);
    fx.beamMat.uniforms.uGain.value = beam;
    fx.dustMat.uniforms.uGain.value = T.dust(time);
    fx.dustMat.uniforms.uBeam.value = beam;

    // the moving strip softbox
    let sweepGain = 0;
    for (const [a, c, peak, h, dist, from, to] of film.sweeps) {
      if (time < a || time > c) continue;
      const k = (time - a) / (c - a);
      sweepGain = Math.pow(Math.sin(Math.PI * k), 0.7);
      fx.sweep.intensity = peak * sweepGain;
      fx.sweep.position.copy(tg).addScaledVector(right, (from + (to - from) * k) * dist).addScaledVector(up, h * dist).addScaledVector(back, dist);
      fx.sweep.up.copy(up);
      fx.sweep.lookAt(tg);
      break;
    }
    if (!sweepGain) fx.sweep.intensity = 0;

    // depth of field
    R.bokeh.enabled = shot.dof > 0.02;
    if (R.bokeh.enabled) {
      const u = R.bokeh.uniforms;
      u.focus.value = camera.position.distanceTo(shot.target);
      u.aperture.value = 0.0011 * shot.dof * shot.ap;
      u.maxblur.value = 0.016 * shot.dof * Math.min(1.5, shot.ap);
    }

    // particles and glints
    const g = fx.update(dt, camera, { glint: { bezel: watch.root.getObjectByName('bezel'), lightPos: sweepGain ? fx.sweep.position : null, gain: sweepGain } });

    // impulses decay
    imp.flash *= Math.exp(-dt * 4.5);
    imp.ca *= Math.exp(-dt * 2.6);
    imp.flare *= Math.exp(-dt * 1.8);
    imp.trauma = Math.max(0, imp.trauma - dt * 0.85);

    // post
    U.uFade.value = T.fade(time);
    U.uVignette.value = T.vignette(time);
    U.uGrain.value = T.grain(time);
    U.uContrast.value = T.contrast(time);
    U.uCA.value = T.ca(time) + imp.ca;
    U.uFlash.value.set(1, 0.86, 0.72).multiplyScalar(imp.flash);
    const glintFlare = g.i * 0.55;
    if (glintFlare > imp.flare && g.i > 0.02) {
      tmp2.copy(g.pos).project(camera);
      U.uFlarePos.value.set(tmp2.x * 0.5 + 0.5, tmp2.y * 0.5 + 0.5);
      U.uFlare.value = Math.min(1, glintFlare);
    } else {
      U.uFlarePos.value.copy(flarePos);
      U.uFlare.value = imp.flare;
    }

    // DOM
    ui.data(C.live ? C.live() : null);
    ui.update(dt, camera, time / film.duration);
  }

  // ── the escapement plays the score ────────────────────
  // Beat n sounds when the train position crosses n − ½ (see kinematics.js);
  // predict those instants from the simulated clock and schedule them exactly.
  function scheduleBeats() {
    const sp = kin.speed;
    if (!(sp > 0.001) || sp > 2 || !kin.running || muted) { nextBeat = null; return; }
    const B = kin.T * 6;
    const first = Math.floor(B + 0.5) + 1;
    if (nextBeat === null || nextBeat < first - 1 || nextBeat > first + 40) nextBeat = first;
    const now = score.now;
    for (let guard = 0; guard < 8; guard++) {
      const dtReal = (nextBeat - 0.5 - B) / 6 / sp;
      if (dtReal > 0.14) break;
      const when = now + Math.max(0.004, dtReal);
      score.tick(when, nextBeat % 2 === 0, sp);
      const chord = film.chordAt(t + dtReal);
      if (chord) {
        const note = chord[ARPEGGIO[((nextBeat % 8) + 8) % 8]];
        score.pluck(when, note, { level: sp < 0.5 ? 0.075 : 0.055, p: nextBeat % 2 ? 0.35 : -0.35, bright: sp < 0.5 ? 0.6 : 1 });
      }
      nextBeat++;
    }
  }

  // ratchet clicks while the film winds the crown
  kin.on('click', () => { if (phase === 'film' && !muted) score.click(score.now + 0.003); });

  window.addEventListener('resize', () => { if (phase !== 'idle') ui.update(0, camera, t / film.duration); });
  document.addEventListener('visibilitychange', () => {
    if (phase === 'idle' || !score.ctx) return;
    if (document.hidden) score.ctx.suspend(); else score.ctx.resume();
  });

  // dev-only console hooks, for tuning shots (see docs/CINEMATIC.md § Testing)
  if (import.meta.env.DEV) {
    window.__cine = {
      play, stop,
      get t() { return t; },
      get phase() { return phase; },
      /** Jump to film time `s` (skips the sounds and one-shot events in between). */
      seek(s) {
        if (phase !== 'film') return;
        t = s;
        cueIdx = film.cues.findIndex((c) => c[0] > s);
        if (cueIdx < 0) cueIdx = film.cues.length;
        evIdx = film.events.findIndex((e) => e[0] > s);
        if (evIdx < 0) evIdx = film.events.length;
        ui.clearCallouts();
        apply(t, 0);
      },
      beat: BEAT,
      fx, score,
    };
  }

  return {
    play, stop, update, toggleSound,
    get active() { return phase === 'preroll' || phase === 'film' || phase === 'outro'; },
    get holdRender() { return holdRender; },
  };
}
