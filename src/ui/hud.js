import { PARTS, CATEGORIES } from '../parts/registry.js';

// ─────────────────────────────────────────────────────────────
// DOM side of the app: loader, component drawer, part card,
// dock controls, readouts, tooltip and toasts.
// ─────────────────────────────────────────────────────────────

const $ = (id) => document.getElementById(id);

export function loader(progress, msg) {
  $('loader-fill').style.width = `${Math.round(progress * 100)}%`;
  if (msg) $('loader-msg').textContent = msg;
}
export function loaderDone() {
  $('loader').classList.add('done');
  setTimeout(() => $('loader').remove(), 1000);
}

export function createHUD(h) {
  // ── components drawer ────────────────────────────────
  const tree = $('tree');
  const rows = new Map();
  let total = 0;
  for (const cat of CATEGORIES) {
    const ids = [...h.parts.keys()].filter((id) => PARTS[id]?.cat === cat);
    if (!ids.length) continue;
    const head = document.createElement('h3');
    head.textContent = cat;
    tree.appendChild(head);
    for (const id of ids) {
      const p = h.parts.get(id);
      const b = document.createElement('button');
      b.type = 'button';
      b.innerHTML = `<span>${PARTS[id].name}</span>${p.pieces > 1 ? `<span class="n">×${p.pieces}</span>` : ''}`;
      b.addEventListener('click', () => h.onSelect(id, { fromTree: true }));
      b.addEventListener('pointerenter', () => h.onHoverRow(id));
      b.addEventListener('pointerleave', () => h.onHoverRow(null));
      tree.appendChild(b);
      rows.set(id, b);
      total++;
    }
  }
  $('drawer-count').textContent = total;
  const drawer = $('drawer');
  const narrow = () => window.matchMedia('(max-width: 820px)').matches;
  if (narrow()) {
    drawer.classList.add('collapsed');
    $('drawer-toggle').setAttribute('aria-expanded', 'false');
  }
  $('drawer-toggle').addEventListener('click', () => {
    const c = drawer.classList.toggle('collapsed');
    $('drawer-toggle').setAttribute('aria-expanded', String(!c));
  });

  // ── card ─────────────────────────────────────────────
  const card = $('card');
  $('card-close').addEventListener('click', () => h.onSelect(null));
  $('act-isolate').addEventListener('click', () => h.onIsolate());
  $('act-follow').addEventListener('click', () => h.onFollow());
  bindHold($('act-wind'), h.onWind);

  // ── dock ─────────────────────────────────────────────
  document.querySelectorAll('[data-view]').forEach((b) => b.addEventListener('click', () => h.onView(b.dataset.view)));
  const slider = $('explode');
  let dragging = false;
  let lastExplode = -1;
  slider.addEventListener('pointerdown', () => (dragging = true));
  window.addEventListener('pointerup', () => (dragging = false));
  slider.addEventListener('input', () => {
    setFill(slider);
    h.onExplode(parseFloat(slider.value));
  });
  document.querySelectorAll('[data-speed]').forEach((b) => b.addEventListener('click', () => h.onSpeed(parseFloat(b.dataset.speed))));
  $('t-xray').addEventListener('click', () => h.onToggle('xray'));
  $('t-night').addEventListener('click', () => h.onToggle('night'));
  $('t-sound').addEventListener('click', () => h.onToggle('sound'));
  document.querySelectorAll('[data-finish]').forEach((b) => b.addEventListener('click', () => h.onFinish(b.dataset.finish)));
  bindHold($('wind'), h.onWind);
  $('sync').addEventListener('click', () => h.onSync());
  $('film-play').addEventListener('click', () => h.onFilm());

  function setFill(el) {
    el.style.setProperty('--fill', `${(parseFloat(el.value) * 100).toFixed(1)}%`);
  }

  // panels on phones sit just above the dock, whatever its wrapped height
  const dock = document.querySelector('.dock');
  const syncDock = () => document.documentElement.style.setProperty('--dock-h', `${Math.round(dock.getBoundingClientRect().height)}px`);
  new ResizeObserver(syncDock).observe(dock);
  syncDock();

  // ── tooltip & toast ──────────────────────────────────
  const tip = $('tooltip');
  const toastEl = $('toast');
  let toastTimer = 0;

  return {
    showCard({ id, specs, canFollow, canWind }) {
      const meta = PARTS[id];
      $('card-cat').textContent = meta.cat;
      $('card-name').textContent = meta.name;
      $('card-desc').textContent = meta.desc;
      const dl = $('card-specs');
      dl.innerHTML = '';
      for (const [k, v, key] of specs) {
        const dt = document.createElement('dt');
        dt.textContent = k;
        const dd = document.createElement('dd');
        dd.textContent = v;
        if (key) dd.dataset.live = key;
        dl.append(dt, dd);
      }
      $('act-follow').hidden = !canFollow;
      $('act-wind').hidden = !canWind;
      $('act-isolate').setAttribute('aria-pressed', 'false');
      $('act-follow').setAttribute('aria-pressed', 'false');
      card.hidden = false;
      card.style.animation = 'none';
      void card.offsetWidth;
      card.style.animation = '';
      rows.forEach((b, rid) => b.classList.toggle('on', rid === id));
      rows.get(id)?.scrollIntoView({ block: 'nearest' });
    },
    hideCard() {
      card.hidden = true;
      rows.forEach((b) => b.classList.remove('on'));
    },
    setLive(key, value) {
      const dd = card.querySelector(`[data-live="${key}"]`);
      if (dd) dd.textContent = value;
    },
    setPressed(id, on) { $(id).setAttribute('aria-pressed', String(on)); },
    get cardVisible() { return !card.hidden; },
    treeHover(id) { rows.forEach((b, rid) => b.classList.toggle('hover', rid === id)); },
    tooltip(id, x, y) {
      if (!id) { tip.hidden = true; return; }
      tip.innerHTML = `${PARTS[id].name}<small>${PARTS[id].cat}</small>`;
      tip.style.left = `${x}px`;
      tip.style.top = `${y}px`;
      tip.hidden = false;
    },
    toast(msg, ms = 3200) {
      toastEl.textContent = msg;
      toastEl.hidden = false;
      toastEl.style.animation = 'none';
      void toastEl.offsetWidth;
      toastEl.style.animation = '';
      clearTimeout(toastTimer);
      toastTimer = setTimeout(() => (toastEl.hidden = true), ms);
    },
    readouts({ time, amp, power, counts, drift }) {
      $('ro-time').textContent = time;
      $('ro-amp').textContent = amp;
      $('ro-power').textContent = `${power.toFixed(power < 10 ? 1 : 0)} h`;
      $('ro-gauge').style.width = `${(power / 72) * 100}%`;
      document.querySelector('.ro-power').classList.toggle('low', power < 6);
      if (counts) $('ro-count').textContent = counts;
      $('sync').hidden = !drift;
    },
    setExplode(v, force = false) {
      if ((dragging && !force) || Math.abs(v - lastExplode) < 0.0005) return;
      lastExplode = v;
      slider.value = v;
      setFill(slider);
    },
    setSpeed(v) {
      document.querySelectorAll('[data-speed]').forEach((b) => b.classList.toggle('on', parseFloat(b.dataset.speed) === v));
    },
    setToggle(name, on) { $('t-' + name).setAttribute('aria-pressed', String(on)); },
    setFinish(key) { document.querySelectorAll('[data-finish]').forEach((b) => b.classList.toggle('on', b.dataset.finish === key)); },
    setWinding(on) {
      $('wind').classList.toggle('active', on);
      $('act-wind').classList.toggle('active', on);
    },
    pulseWind(on) { $('wind').classList.toggle('pulse', on); },
    intro(on) {
      document.body.classList.toggle('intro', on);
      $('skip').hidden = !on;
    },
  };
}

function bindHold(el, fn) {
  const start = (e) => { e.preventDefault(); el.setPointerCapture?.(e.pointerId); fn(true); };
  const stop = () => fn(false);
  el.addEventListener('pointerdown', start);
  el.addEventListener('pointerup', stop);
  el.addEventListener('pointercancel', stop);
  el.addEventListener('lostpointercapture', stop);
  el.addEventListener('keydown', (e) => { if ((e.key === 'Enter' || e.key === ' ') && !e.repeat) { e.preventDefault(); fn(true); } });
  el.addEventListener('keyup', (e) => { if (e.key === 'Enter' || e.key === ' ') fn(false); });
}
