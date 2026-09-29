import './ui/styles.css';
import * as THREE from 'three';
import { createLibrary, mat, setFinish } from './materials/library.js';
import { createRenderer } from './scene/renderer.js';
import { createStudio } from './scene/studio.js';
import { buildWatch } from './movement/calibre.js';
import { Kinematics, MAX_POWER } from './movement/kinematics.js';
import { TEETH } from './movement/layout.js';
import { PARTS } from './parts/registry.js';
import { createCameraRig, PRESETS } from './interaction/cameraRig.js';
import { createPicker } from './interaction/picking.js';
import { createExploder } from './interaction/explode.js';
import { createAudio } from './audio/tick.js';
import { createHUD, loader, loaderDone } from './ui/hud.js';

// yield a frame so the loader can paint (falls back to a timeout in hidden tabs)
const frame = () => new Promise((r) => {
  let done = false;
  const go = () => { if (!done) { done = true; r(); } };
  requestAnimationFrame(go);
  setTimeout(go, 60);
});
const lerp = (a, b, t) => a + (b - a) * t;
const TAU = Math.PI * 2;

async function loadFonts() {
  const faces = ['600 40px "Cormorant Garamond"', '500 40px "Jost"', '400 20px "IBM Plex Mono"'];
  try {
    await Promise.race([Promise.all(faces.map((f) => document.fonts.load(f))), new Promise((r) => setTimeout(r, 2500))]);
  } catch { /* fall back to system faces */ }
}

async function boot() {
  const totalTeeth = Object.values(TEETH).reduce((a, b) => a + b, 0);
  loader(0.04, 'Setting type…');
  await loadFonts();
  await frame();

  const tm = { t0: performance.now() };
  loader(0.12, 'Grinding Côtes de Genève and perlage…');
  await frame();
  createLibrary();
  tm.textures = performance.now();
  const M = mat();

  const canvas = document.getElementById('gl');
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(28, window.innerWidth / window.innerHeight, 0.8, 1500);
  camera.position.set(...PRESETS.hero.pos);
  const R = createRenderer(canvas, scene, camera);
  const studio = createStudio(R.renderer, scene);

  loader(0.34, `Cutting ${totalTeeth.toLocaleString()} teeth and bevelling the bridges…`);
  await frame();
  const watch = buildWatch();
  tm.build = performance.now();
  scene.add(watch.root);
  R.noDepth.push(...watch.noAO);

  loader(0.72, 'Regulating the balance to 21,600 vph…');
  await frame();
  const kin = new Kinematics();
  if (import.meta.env.DEV) {
    const tests = kin.selfTest();
    console.table(tests);
    console.info(tests.every((t) => t.ok) ? '✓ kinematics self-test passed' : '✗ kinematics self-test FAILED');
    window.__watch = { scene, camera, watch, kin, R };
  }
  watch.update(kin.s);

  const rig = createCameraRig(camera, canvas);
  rig.controls.target.set(...PRESETS.hero.target);
  const exploder = createExploder(watch.nodes);
  const audio = createAudio();

  // ── state ─────────────────────────────────────────────
  const st = {
    selected: null, hovered: null, rowHover: null,
    isolate: false, follow: false, xray: false, night: false, nightT: 0,
    finish: 'rose', lastSpeed: 1, winding: false, loading: true, intro: true, dof: 0, dofTarget: 0,
    viewShift: 0,
  };
  const meshesOf = (id) => (id ? watch.parts.get(id)?.meshes ?? [] : []);

  // ── visibility modes (x-ray / isolate) ────────────────
  const XRAY_GHOST = new Set(['bezel', 'midcase', 'caseback', 'crown', 'dial', 'indices', 'strap', 'buckle']);
  const XRAY_HIDE = new Set(['crystal', 'backCrystal', 'sapphireDial']);
  function applyVisibility() {
    for (const [id, p] of watch.parts) {
      let mode = 'normal';
      if (st.isolate && st.selected && id !== st.selected) mode = XRAY_HIDE.has(id) ? 'hidden' : 'dim';
      else if (st.xray && id !== st.selected) mode = XRAY_HIDE.has(id) ? 'hidden' : XRAY_GHOST.has(id) ? 'ghost' : 'normal';
      for (const m of p.meshes) {
        if (!m.userData.orig) m.userData.orig = { material: m.material, cast: m.castShadow };
        const o = m.userData.orig;
        const transparentDecor = !Array.isArray(o.material) && o.material.transparent && mode !== 'normal';
        m.visible = mode !== 'hidden' && !(m.isInstancedMesh && mode !== 'normal') && !transparentDecor;
        if (mode === 'ghost' || mode === 'dim') {
          m.material = mode === 'ghost' ? M.ghost : M.ghostDim;
          m.castShadow = false;
          m.userData.ghosted = true;
        } else {
          m.material = o.material;
          m.castShadow = o.cast;
          m.userData.ghosted = false;
        }
      }
    }
    updateOutline();
  }

  function updateOutline() {
    const set = new Set([...meshesOf(st.selected), ...meshesOf(st.hovered), ...meshesOf(st.rowHover)]);
    R.outline.selectedObjects = [...set].filter((m) => m.visible && !m.isInstancedMesh);
  }

  // ── part geometry helpers ─────────────────────────────
  const box = new THREE.Box3(), tmpBox = new THREE.Box3();
  function partBounds(id) {
    box.makeEmpty();
    for (const m of meshesOf(id)) {
      if (!m.geometry || m.isInstancedMesh) continue;
      if (!m.geometry.boundingBox) m.geometry.computeBoundingBox();
      tmpBox.copy(m.geometry.boundingBox).applyMatrix4(m.matrixWorld);
      box.union(tmpBox);
    }
    const sphere = new THREE.Sphere();
    box.getBoundingSphere(sphere);
    return sphere;
  }

  function frameParts(id) {
    const s = partBounds(id);
    const dir = new THREE.Vector3().subVectors(camera.position, rig.controls.target).normalize();
    // look from the side where the part actually lives
    if (s.center.z < -1.5 && dir.z > 0) dir.z = -dir.z;
    if (s.center.z > 1.2 && dir.z < 0) dir.z = -dir.z;
    if (Math.abs(dir.z) < 0.25) dir.z = Math.sign(dir.z || 1) * 0.25;
    dir.normalize();
    const fov = (camera.fov * Math.PI) / 180;
    const dist = Math.max(26, (s.radius / Math.sin(fov / 2)) * 1.7);
    rig.flyTo(s.center.clone().addScaledVector(dir, dist), s.center, 1.3);
  }

  // ── selection ─────────────────────────────────────────
  function formatRate(rpm) {
    const r = Math.abs(rpm);
    if (r === 0) return '—';
    const dir = rpm < 0 ? 'clockwise' : 'counter-clockwise';
    if (r >= 1) return `${+r.toFixed(2)} rev/min, ${dir}`;
    const minutes = 1 / r;
    if (minutes < 90) return `1 rev / ${+minutes.toFixed(1)} min, ${dir}`;
    return `1 rev / ${+(minutes / 60).toFixed(1)} h, ${dir}`;
  }
  const TEETH_TEXT = {
    centerWheel: '72-tooth wheel · 10-leaf pinion',
    thirdWheel: '75-tooth wheel · 10-leaf pinion',
    escapeWheel: '15 club teeth · 8-leaf pinion',
    minuteWheel: '36-tooth wheel · 10-leaf pinion',
    crownWheel: '36 teeth · 20 contrate teeth',
    stem: '12-leaf winding pinion',
    cagePinion: '9 leaves',
    fixedRing: '96 internal teeth',
    ratchet: '76 saw teeth',
    barrel: '80 teeth',
    hourWheel: '40 teeth',
    cannonPinion: '12 leaves',
  };
  const MOVING = new Set(['centerWheel', 'thirdWheel', 'barrel', 'mainspring', 'cageUpper', 'cageLower', 'cagePinion', 'escapeWheel', 'palletFork', 'balance', 'hairspring', 'minuteHand', 'hourHand', 'cannonPinion', 'minuteWheel', 'hourWheel']);

  function specsFor(id) {
    const meta = PARTS[id];
    const out = [];
    if (TEETH_TEXT[id]) out.push(['Teeth', TEETH_TEXT[id]]);
    if (id === 'balance') {
      out.push(['Frequency', '3 Hz · 21,600 vph · 6 beats/s']);
      out.push(['Amplitude', `±${Math.round((kin.amp * 180) / Math.PI)}°`, 'amp']);
      out.push(['Lift angle', '52°']);
    }
    if (id === 'hairspring') out.push(['Coils', '12, Archimedean'], ['Section', '0.028 × 0.14 mm']);
    if (id === 'palletFork') out.push(['Travel', '±8° between banking pins'], ['Rate', '6 beats per second']);
    if (id === 'cageUpper' || id === 'cageLower') out.push(['Diameter', '11.9 mm'], ['Carries', 'Balance, fork, escape wheel']);
    if (id === 'mainspring') out.push(['Reserve', `${kin.power.toFixed(1)} of ${MAX_POWER} h`, 'power']);
    if (meta.rpmKey) {
      const rate = formatRate(kin.rpm(meta.rpmKey));
      out.push(['Speed', id === 'escapeWheel' ? `${rate} (relative to the cage)` : rate]);
    }
    const n = watch.parts.get(id).pieces;
    if (meta.multi) out.push(['Count', `${n}`]);
    out.push(['Finish', meta.material]);
    return out;
  }

  function select(id, { fly = true } = {}) {
    if (st.intro) return;
    if (id === st.selected && id) { if (fly) frameParts(id); return; }
    st.selected = id;
    st.isolate = false;
    st.follow = false;
    rig.setFollow(null);
    if (id) {
      hud.showCard({ id, specs: specsFor(id), canFollow: MOVING.has(id), canWind: id === 'crown' || id === 'ratchet' || id === 'mainspring' || id === 'barrel' });
      if (fly) frameParts(id);
      setDof(false);
    } else {
      hud.hideCard();
    }
    applyVisibility();
  }

  // ── night mode ────────────────────────────────────────
  function applyNight(t) {
    scene.environmentIntensity = lerp(1, 0.035, t);
    scene.backgroundIntensity = lerp(1, 0.22, t);
    studio.key.intensity = lerp(1.7, 0.05, t);
    M.lume.emissiveIntensity = lerp(0, 3.4, t);
    R.bloom.enabled = t > 0.02;
    R.bloom.strength = lerp(0, 0.95, t);
    R.bloom.radius = lerp(0.3, 0.45, t);
    R.bloom.threshold = lerp(3, 0.55, t);
    R.renderer.toneMappingExposure = lerp(1.05, 1.25, t);
  }

  function setDof(on) { st.dofTarget = on ? 1 : 0; }

  // ── view presets (distance fitted to the viewport) ────
  function fitDistance(radius) {
    const v = (camera.fov * Math.PI) / 180;
    const hf = 2 * Math.atan(Math.tan(v / 2) * camera.aspect);
    // leave room for the HUD bands at the top and bottom
    return radius / Math.sin(Math.min(v * 0.74, hf * 0.9) / 2);
  }
  function pose(name) {
    const p = PRESETS[name];
    const t = new THREE.Vector3(...p.target);
    const dir = new THREE.Vector3(...p.pos).sub(t);
    const dist = p.fit ? fitDistance(p.fit) : dir.length();
    return [t.clone().addScaledVector(dir.normalize(), dist), t];
  }
  function goView(name) {
    const p = PRESETS[name];
    st.follow = false;
    rig.setFollow(null);
    if (name === 'exploded') exploder.set(1, { duration: 2.4 });
    else if (exploder.target > 0) exploder.set(0, { duration: 1.8 });
    const [pos, target] = pose(name);
    rig.flyTo(pos, target, name === 'exploded' ? 2.2 : 1.6);
    setDof(!!p.dof);
  }

  // ── HUD wiring ────────────────────────────────────────
  const hud = createHUD({
    parts: watch.parts,
    onSelect: (id) => select(id),
    onHoverRow: (id) => { st.rowHover = id; hud.treeHover(id); updateOutline(); },
    onView: goView,
    onExplode: (v) => exploder.set(v),
    onSpeed: (v) => setSpeed(v),
    onToggle: (name) => {
      if (name === 'xray') { st.xray = !st.xray; hud.setToggle('xray', st.xray); applyVisibility(); }
      if (name === 'night') { st.night = !st.night; hud.setToggle('night', st.night); }
      if (name === 'sound') {
        const on = !audio.enabled;
        audio.setEnabled(on);
        hud.setToggle('sound', on);
        if (on && kin.speed > 2) hud.toast('Ticks play at 1× and slower');
      }
    },
    onFinish: (key) => { st.finish = key; setFinish(key); hud.setFinish(key); },
    onWind: (on) => setWinding(on),
    onIsolate: () => { st.isolate = !st.isolate; hud.setPressed('act-isolate', st.isolate); applyVisibility(); },
    onFollow: () => {
      st.follow = !st.follow;
      hud.setPressed('act-follow', st.follow);
      if (st.follow && st.selected) {
        const id = st.selected;
        rig.setFollow(() => partBounds(id).center);
      } else rig.setFollow(null);
    },
    onSync: () => { kin.syncToNow(); setSpeed(1); hud.toast('Set to local time'); },
  });

  function setSpeed(v) {
    kin.speed = v;
    if (v > 0) st.lastSpeed = v;
    hud.setSpeed(v);
  }

  function setWinding(on) {
    if (on && kin.power >= MAX_POWER - 0.01) {
      hud.toast('Fully wound: 72 hours in the mainspring');
      on = false;
    }
    st.winding = on;
    kin.windRate = on ? 2.4 : 0;
    hud.setWinding(on);
    if (on) hud.pulseWind(false);
  }

  kin.on('beat', (k) => audio.tick(k % 2 === 0, kin.speed));
  kin.on('click', () => audio.click());
  kin.on('stop', () => {
    hud.toast('Power reserve depleted. Hold Wind to restart the watch.', 5200);
    hud.pulseWind(true);
  });
  let fullToastShown = false;
  kin.on('power', (p) => {
    if (p >= MAX_POWER - 0.01 && !fullToastShown) {
      fullToastShown = true;
      hud.toast('Fully wound: 72 hours in the mainspring');
      setWinding(false);
    }
    if (p < MAX_POWER - 1) fullToastShown = false;
  });

  // ── picking ───────────────────────────────────────────
  const picker = createPicker({
    camera, dom: canvas, root: watch.root,
    onHover: (id, c) => {
      if (st.intro) return;
      if (id !== st.hovered) { st.hovered = id; updateOutline(); }
      hud.tooltip(id, c.x, c.y);
      canvas.style.cursor = id ? 'pointer' : 'grab';
    },
    onSelect: (id) => {
      if (st.ignoreClick) { st.ignoreClick = false; return; }
      select(id);
    },
  });

  let last = performance.now();

  // ── keyboard ──────────────────────────────────────────
  const views = ['dial', 'movement', 'profile', 'tourbillon', 'exploded'];
  window.addEventListener('keydown', (e) => {
    if (st.loading || e.target.closest('input, textarea')) return;
    if (st.intro) { endIntro(); return; }
    const k = e.key.toLowerCase();
    if (k >= '1' && k <= '5') goView(views[+k - 1]);
    else if (k === 'e') { const to = exploder.target > 0.5 ? 0 : 1; exploder.set(to, { duration: 2.2 }); }
    else if (k === 'x') document.getElementById('t-xray').click();
    else if (k === 'n') document.getElementById('t-night').click();
    else if (k === ' ' && !e.target.closest('button')) { e.preventDefault(); setSpeed(kin.speed === 0 ? st.lastSpeed : 0); }
    else if (k === 'escape') select(null);
    else if (k === 'w' && !e.repeat) setWinding(true);
  });
  window.addEventListener('keyup', (e) => { if (!st.loading && e.key.toLowerCase() === 'w') setWinding(false); });
  window.addEventListener('resize', () => R.resize());
  // a real watch keeps running while you look away
  let hiddenAt = 0;
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) hiddenAt = performance.now();
    else if (hiddenAt) {
      kin.advance((performance.now() - hiddenAt) / 1000);
      last = performance.now();
      hiddenAt = 0;
    }
  });

  // ── counts ────────────────────────────────────────────
  const jewelCount = watch.stats.jewels;
  const countsText = `${jewelCount} · ${watch.stats.components}`;

  // ── compile shaders before the curtain lifts ──────────
  loader(0.88, 'Compiling shaders…');
  await frame();
  try { await R.renderer.compileAsync(scene, camera); } catch { /* optional */ }
  tm.compile = performance.now();
  if (import.meta.env.DEV) console.info(`load: textures ${Math.round(tm.textures - tm.t0)} ms · geometry ${Math.round(tm.build - tm.textures)} ms · shaders ${Math.round(tm.compile - tm.build)} ms`);
  loader(1, 'Ready');

  // ── intro sequence ────────────────────────────────────
  // start exploded, macro on the beating balance, then assemble and pull back
  exploder.set(1, { immediate: true });
  const balanceWorld = new THREE.Vector3();
  watch.anim.balance.updateWorldMatrix(true, false);
  watch.anim.balance.getWorldPosition(balanceWorld);
  balanceWorld.z += 1.4;
  camera.position.copy(balanceWorld).add(new THREE.Vector3(7, -11, 15));
  rig.controls.target.copy(balanceWorld);
  camera.lookAt(balanceWorld);
  st.dof = 1; st.dofTarget = 1;
  st.loading = false;
  st.intro = true;
  hud.intro(true);
  let introT = 0;
  let introTimers = [];
  function endIntro(skip = true) {
    if (!st.intro) return;
    st.intro = false;
    introTimers.forEach(clearTimeout);
    hud.intro(false);
    setDof(false);
    if (skip) {
      exploder.set(0, { duration: 0.9 });
      rig.flyTo(...pose('hero'), 1.0);
    }
    canvas.style.cursor = 'grab';
  }
  introTimers.push(setTimeout(() => {
    exploder.set(0, { duration: 3.8 });
    rig.flyTo(...pose('hero'), 5.2);
  }, 1300));
  introTimers.push(setTimeout(() => setDof(false), 3200));
  introTimers.push(setTimeout(() => endIntro(false), 6600));
  canvas.addEventListener('pointerdown', () => {
    if (st.intro && introT > 0.4) { st.ignoreClick = true; endIntro(); }
  }, { capture: true });

  loaderDone();

  // ── loop ──────────────────────────────────────────────
  kin.syncToNow();
  last = performance.now();
  let readoutTimer = 0;
  const perf = { acc: 0, n: 0, level: 0, settle: 0 };

  function tick() {
    const t = performance.now();
    const realDt = Math.min((t - last) / 1000, 60);
    last = t;
    step(realDt, true);
    requestAnimationFrame(tick);
  }

  function step(realDt, measure = false) {
    const dt = Math.min(realDt, 0.1);
    introT += dt;

    kin.update(realDt); // the watch keeps true time even on slow frames
    watch.update(kin.s);
    exploder.update(dt);
    hud.setExplode(exploder.value);

    // night fade
    st.nightT += ((st.night ? 1 : 0) - st.nightT) * (1 - Math.exp(-dt * 3));
    applyNight(st.nightT);

    // depth of field
    st.dof += (st.dofTarget - st.dof) * (1 - Math.exp(-dt * 2.5));
    R.bokeh.enabled = st.dof > 0.02;
    if (R.bokeh.enabled) {
      const u = R.bokeh.uniforms;
      u.focus.value = camera.position.distanceTo(rig.controls.target);
      u.aperture.value = 0.0011 * st.dof;
      u.maxblur.value = 0.016 * st.dof;
    }

    // keep the selected part clear of the card: sideways on wide screens, upward on phones
    const wide = window.innerWidth > 820;
    const wantX = hud.cardVisible && wide ? 170 : 0;
    const wantY = wide ? 0 : window.innerHeight * (hud.cardVisible ? 0.22 : 0.1);
    const k = 1 - Math.exp(-dt * 4);
    st.viewShift += (wantX - st.viewShift) * k;
    st.viewShiftY = (st.viewShiftY ?? 0) + (wantY - (st.viewShiftY ?? 0)) * k;
    if (Math.abs(st.viewShift) > 0.5 || Math.abs(st.viewShiftY) > 0.5) {
      const w = window.innerWidth, h = window.innerHeight;
      camera.setViewOffset(w, h, st.viewShift, st.viewShiftY, w, h);
    } else if (camera.view) camera.clearViewOffset();

    rig.update(dt);
    studio.follow(camera, rig.controls.target);
    picker.frame(!rig.busy);

    readoutTimer -= dt;
    if (readoutTimer <= 0) {
      readoutTimer = 0.1;
      const secs = ((kin.s.seconds % 86400) + 86400) % 86400;
      const hh = Math.floor(secs / 3600), mm = Math.floor((secs % 3600) / 60), ss = Math.floor(secs % 60);
      const d = new Date();
      const wall = d.getHours() * 3600 + d.getMinutes() * 60 + d.getSeconds() + d.getMilliseconds() / 1000;
      let drift = Math.abs(secs - wall) % 43200;
      drift = Math.min(drift, 43200 - drift);
      hud.readouts({
        time: `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`,
        amp: `${Math.round((kin.amp * 180) / Math.PI)}°`,
        power: kin.power,
        counts: countsText,
        drift: drift > 2.5 && !st.intro,
      });
      if (st.selected === 'balance') hud.setLive('amp', `±${Math.round((kin.amp * 180) / Math.PI)}°`);
      if (st.selected === 'mainspring') hud.setLive('power', `${kin.power.toFixed(1)} of ${MAX_POWER} h`);
    }

    R.composer.render(dt);

    // adaptive quality: shed AO, then resolution, if frames run long
    if (!st.intro && measure && !document.hidden) {
      perf.acc += dt; perf.n++;
      if (perf.n >= 60) {
        const avg = perf.acc / perf.n;
        perf.acc = 0; perf.n = 0;
        if (avg > 0.024 && perf.level < 3) {
          perf.level++;
          if (perf.level === 1) R.setPixelRatio(Math.min(R.renderer.getPixelRatio(), 1.25));
          else if (perf.level === 2) R.gtao.enabled = false;
          else R.setPixelRatio(1);
        }
      }
    }
  }
  requestAnimationFrame(tick);

  if (import.meta.env.DEV) {
    // test hook: advance the app deterministically even when the tab is hidden
    window.__app = {
      st, goView, select, exploder, rig, setSpeed, applyVisibility, kin, camera,
      run(seconds = 1, fps = 30) { for (let i = 0; i < seconds * fps; i++) step(1 / fps); },
    };
  }
}

boot().catch((err) => {
  console.error(err);
  const msg = document.getElementById('loader-msg');
  if (msg) msg.textContent = 'This device could not start WebGL 2. Try a recent desktop browser.';
});
