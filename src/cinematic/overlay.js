import * as THREE from 'three';
import './cinematic.css';

// ─────────────────────────────────────────────────────────────
// The film's DOM layer: letterbox bars, chapter kicker, progress
// line, title cards (letters resolve out of blur), lower thirds,
// a live data readout and callouts pinned to 3D anchors.
// Markup lives in index.html (#cine), styles in cinematic.css.
// Timed exits use setTimeout, so they keep real time even when
// the film is stepped by hand in development.
// ─────────────────────────────────────────────────────────────

const $ = (id) => document.getElementById(id);
const ASPECT = 2.2; // picture aspect inside the letterbox: a touch narrower than scope so the watch keeps its height

function letters(text, base = 0) {
  return [...text].map((ch, i) => (ch === ' ' ? ' ' : `<span class="ch" style="--i:${base + i}">${ch}</span>`)).join('');
}

export function createOverlay({ onExit, onSound, chapters, duration }) {
  const root = $('cine');
  const titleBox = $('cine-title');
  const lowerBox = $('cine-lower');
  const dataBox = $('cine-data');
  const chapterEl = $('cine-chapter');
  const fill = $('cine-progress');
  const svg = $('cine-lines');
  const labels = $('cine-labels');
  const soundBtn = $('cine-sound');

  $('cine-exit').addEventListener('click', () => onExit());
  soundBtn.addEventListener('click', () => onSound());

  // chapter ticks on the progress line
  const ticks = $('cine-ticks');
  ticks.innerHTML = chapters.map((c) => `<i style="left:${(c.t / duration) * 100}%"></i>`).join('');

  // controls fade away while the mouse is still
  let idle = 0;
  window.addEventListener('pointermove', () => {
    if (root.hidden) return;
    idle = 0;
    root.classList.add('awake');
  });

  function sizeBars() {
    const w = window.innerWidth, h = window.innerHeight;
    const bar = Math.max(36, Math.round((h - w / ASPECT) / 2));
    root.style.setProperty('--bar', `${bar}px`);
    return bar;
  }
  window.addEventListener('resize', sizeBars);

  // ── titles ────────────────────────────────────────────
  let titleTimer = 0, lowerTimer = 0;
  const counters = [];

  function retire(box) {
    for (const c of [...box.children]) {
      if (c.classList.contains('out')) continue;
      c.classList.add('out');
      setTimeout(() => c.remove(), 900);
    }
  }

  /**
   * Centre title card; replaces the previous one.
   * kind: 'kicker-only' (small spaced caps) · 'hero' (huge caps) · 'big' (caps) ·
   *       'mid' (italic sentence, may wrap) · 'mark' (the wordmark).
   * kicker: small gold line above · sub: line below (HTML allowed) ·
   * hold: seconds before it dissolves (0 = until replaced) ·
   * count: the leading number counts up from 0 ("123 components").
   */
  function title({ kicker = '', text = '', sub = '', kind = 'big', hold = 3, count = false }) {
    retire(titleBox);
    clearTimeout(titleTimer);
    const card = document.createElement('div');
    card.className = `ct ct-${kind}`;
    const k = kicker ? `<p class="ct-kicker">${letters(kicker)}</p>` : '';
    let body = letters(text, kicker.length * 0.4);
    if (count) {
      const m = text.match(/^(\d+)(.*)$/);
      if (m) body = `<span class="ct-num" data-to="${m[1]}">0</span>${letters(m[2], 2)}`;
    }
    const s = sub ? `<p class="ct-sub">${sub}</p>` : '';
    card.innerHTML = `${k}<p class="ct-text">${body}</p>${s}`;
    titleBox.appendChild(card);
    const num = card.querySelector('.ct-num');
    if (num) counters.push({ el: num, to: +num.dataset.to, t: 0, dur: 1.1 });
    if (hold > 0) titleTimer = setTimeout(() => retire(titleBox), hold * 1000);
  }

  /** Lower third, bottom left: a display-serif line and an optional sentence under it. */
  function lower({ text, sub = '', hold = 3.5 }) {
    retire(lowerBox);
    clearTimeout(lowerTimer);
    const el = document.createElement('div');
    el.className = 'lt';
    el.innerHTML = `<p class="lt-text">${letters(text)}</p>${sub ? `<p class="lt-sub">${sub}</p>` : ''}`;
    lowerBox.appendChild(el);
    if (hold > 0) lowerTimer = setTimeout(() => retire(lowerBox), hold * 1000);
  }

  /** Chapter name in the top bar ('' clears it). */
  function chapter(text) {
    chapterEl.classList.remove('in');
    void chapterEl.offsetWidth;
    chapterEl.textContent = text;
    chapterEl.classList.toggle('in', !!text);
  }

  /** Top-right live readout, set every frame: { label, value, note } or null to hide. */
  let dataOn = false;
  function data(d) {
    if (!d) { if (dataOn) dataBox.classList.remove('in'); dataOn = false; return; }
    if (!dataOn) {
      dataBox.innerHTML = '<p class="cd-label"></p><p class="cd-value"></p><p class="cd-note"></p>';
      dataBox.classList.add('in');
      dataOn = true;
    }
    dataBox.children[0].textContent = d.label;
    dataBox.children[1].textContent = d.value;
    dataBox.children[2].textContent = d.note ?? '';
  }

  // ── callouts ──────────────────────────────────────────
  const callouts = new Map();
  const NS = 'http://www.w3.org/2000/svg';
  /**
   * Label pinned to a 3D point: dot + pulsing ring at the anchor, a leader line
   * drawn out to the label. anchor() → world Vector3 (called every frame, so it
   * can follow moving parts); side 1 = label to the right, −1 = left; dx / dy =
   * label offset in CSS px. Hidden while the anchor is outside the picture.
   */
  function callout(id, { anchor, title: t, sub = '', side = 1, dx = 150, dy = 70 }) {
    if (callouts.has(id)) return;
    const path = document.createElementNS(NS, 'path');
    path.setAttribute('class', 'co-line');
    const dot = document.createElementNS(NS, 'circle');
    dot.setAttribute('r', '3.2');
    dot.setAttribute('class', 'co-dot');
    const ring = document.createElementNS(NS, 'circle');
    ring.setAttribute('r', '9');
    ring.setAttribute('class', 'co-ring');
    svg.append(path, ring, dot);
    const label = document.createElement('div');
    label.className = `co ${side < 0 ? 'co-left' : ''}`;
    label.innerHTML = `<p class="co-title">${letters(t)}</p>${sub ? `<p class="co-sub">${sub}</p>` : ''}`;
    labels.appendChild(label);
    callouts.set(id, { anchor, side, dx, dy, path, dot, ring, label });
    void label.offsetWidth; // commit the start state so the draw-in transitions run
    label.classList.add('in'); path.classList.add('in'); ring.classList.add('in');
  }
  function uncallout(id) {
    const c = callouts.get(id);
    if (!c) return;
    callouts.delete(id);
    c.label.classList.remove('in');
    c.label.classList.add('out');
    c.path.classList.remove('in');
    c.path.classList.add('out');
    c.ring.classList.remove('in');
    setTimeout(() => { c.path.remove(); c.dot.remove(); c.ring.remove(); c.label.remove(); }, 700);
  }
  function clearCallouts() { for (const id of [...callouts.keys()]) uncallout(id); }

  const p = new THREE.Vector3();
  function update(dt, camera, progress) {
    idle += dt;
    if (idle > 1.6) root.classList.remove('awake');
    fill.style.transform = `scaleX(${Math.min(1, Math.max(0, progress))})`;
    for (let i = counters.length - 1; i >= 0; i--) {
      const c = counters[i];
      c.t += dt;
      const k = Math.min(1, c.t / c.dur);
      c.el.textContent = Math.round(c.to * (1 - Math.pow(1 - k, 3)));
      if (k >= 1) counters.splice(i, 1);
    }
    const w = window.innerWidth, h = window.innerHeight;
    const bar = parseFloat(root.style.getPropertyValue('--bar')) || 0;
    svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
    for (const c of callouts.values()) {
      p.copy(c.anchor()).project(camera);
      const x = (p.x * 0.5 + 0.5) * w, y = (-p.y * 0.5 + 0.5) * h;
      // only while the anchor is inside the picture, and keep the label off the bars
      const vis = p.z < 1 && x > 24 && x < w - 24 && y > bar + 12 && y < h - bar - 12;
      const lx = x + c.side * c.dx;
      const ly = Math.min(h - bar - 24, Math.max(bar + 64, y - c.dy));
      const ex = x + c.side * c.dx * 0.45;
      c.path.setAttribute('d', `M${x.toFixed(1)},${y.toFixed(1)} L${ex.toFixed(1)},${ly.toFixed(1)} L${lx.toFixed(1)},${ly.toFixed(1)}`);
      c.dot.setAttribute('cx', x.toFixed(1)); c.dot.setAttribute('cy', y.toFixed(1));
      c.ring.setAttribute('cx', x.toFixed(1)); c.ring.setAttribute('cy', y.toFixed(1));
      c.label.style.transform = `translate(${(lx + c.side * 8).toFixed(1)}px, ${(ly).toFixed(1)}px)`;
      const o = vis ? '' : '0';
      c.path.style.opacity = o; c.dot.style.opacity = o; c.ring.style.opacity = o; c.label.style.opacity = o;
    }
  }

  return {
    show() {
      sizeBars();
      root.hidden = false;
      root.classList.remove('closing');
      void root.offsetWidth; // commit the hidden state so the bars slide in
      root.classList.add('on', 'awake');
      idle = 0;
    },
    /** Retract the bars and clear everything; resolves when the bars are gone. */
    hide() {
      root.classList.add('closing');
      root.classList.remove('on');
      retire(titleBox); retire(lowerBox); clearCallouts(); data(null); chapter('');
      return new Promise((r) => setTimeout(() => { root.hidden = true; root.classList.remove('closing'); r(); }, 900));
    },
    setSound(on) {
      soundBtn.setAttribute('aria-pressed', String(on));
      soundBtn.textContent = on ? 'Sound on' : 'Sound off';
    },
    title, lower, chapter, data, callout, uncallout, clearCallouts, update,
    clearTitle: () => retire(titleBox),
    clearLower: () => retire(lowerBox),
  };
}
