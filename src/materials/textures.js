import * as THREE from 'three';

// ─────────────────────────────────────────────────────────────
// Procedural surface finishes, generated once at startup.
// Every map is tileable and expressed in millimetres through the
// planar (x, y) UVs that ExtrudeGeometry gives to its caps.
// ─────────────────────────────────────────────────────────────

function hash(n) {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453123;
  return s - Math.floor(s);
}
function hash2(x, y) {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453123;
  return s - Math.floor(s);
}

function dataTexture(data, size, { repeat = 1, srgb = false, wrap = THREE.RepeatWrapping } = {}) {
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  tex.wrapS = tex.wrapT = wrap;
  tex.repeat.set(repeat, repeat);
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.anisotropy = 8;
  tex.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  tex.needsUpdate = true;
  return tex;
}

// height field → tangent-space normal map (+ optional roughness in a second texture)
function heightToNormal(height, size, strength) {
  const out = new Uint8Array(size * size * 4);
  const H = (x, y) => height[((y + size) % size) * size + ((x + size) % size)];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (H(x + 1, y) - H(x - 1, y)) * strength;
      const dy = (H(x, y + 1) - H(x, y - 1)) * strength;
      const len = Math.hypot(dx, dy, 1);
      const i = (y * size + x) * 4;
      out[i] = ((-dx / len) * 0.5 + 0.5) * 255;
      out[i + 1] = ((-dy / len) * 0.5 + 0.5) * 255;
      out[i + 2] = ((1 / len) * 0.5 + 0.5) * 255;
      out[i + 3] = 255;
    }
  }
  return out;
}

function scalarTexture(values, size, opts) {
  const out = new Uint8Array(size * size * 4);
  for (let i = 0; i < size * size; i++) {
    const v = Math.max(0, Math.min(255, values[i] * 255));
    out[i * 4] = out[i * 4 + 1] = out[i * 4 + 2] = v;
    out[i * 4 + 3] = 255;
  }
  return dataTexture(out, size, opts);
}

/** Côtes de Genève — arched stripes left by a rotating abrasive wheel. */
export function cotesDeGeneve(size = 1024, bands = 8) {
  const w = size / bands;
  const R = w * 1.25;
  const h = new Float32Array(size * size);
  const rough = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const k = Math.floor(x / w);
      const u = (x - k * w) / w;          // 0..1 across the band
      const lx = (u - 0.5) * w;
      const v = y + (lx * lx) / (2 * R);  // arched stroke of the abrasive wheel
      // each band is a shallow cylinder; its trailing edge tucks under the next band
      const ridge = Math.sin(Math.PI * Math.pow(u, 0.85)) * 0.5;
      const scratch = (hash(Math.floor(v * 1.3) + k * 91.3) - 0.5) * 0.05 + (hash(Math.floor(v * 4.1) + k * 7.7) - 0.5) * 0.025;
      h[y * size + x] = (ridge + scratch) * w * 0.05;
      rough[y * size + x] = 0.16 + 0.12 * (1 - Math.sin(Math.PI * u)) + (hash(Math.floor(v * 2.3) + k) - 0.5) * 0.05;
    }
  }
  return {
    normal: dataTexture(heightToNormal(h, size, 0.5), size),
    roughness: scalarTexture(rough, size, {}),
  };
}

/** Perlage — overlapping spots of circular graining. */
export function perlage(size = 1024, perRow = 16) {
  const s = size / perRow;
  const r = s * 0.78;
  const h = new Float32Array(size * size);
  const rough = new Float32Array(size * size).fill(0.4);
  let n = 0;
  for (let row = 0; row < perRow; row++) {
    for (let col = 0; col < perRow; col++) {
      const cx = col * s + (row % 2 ? s / 2 : 0);
      const cy = row * s;
      const phase = hash(n++) * 6.28;
      const tilt = hash(n * 3.3) * 6.28;
      for (let yy = -Math.ceil(r); yy <= Math.ceil(r); yy++) {
        for (let xx = -Math.ceil(r); xx <= Math.ceil(r); xx++) {
          const d = Math.hypot(xx, yy);
          if (d > r) continue;
          const px = (((Math.round(cx + xx)) % size) + size) % size;
          const py = (((Math.round(cy + yy)) % size) + size) % size;
          const idx = py * size + px;
          const grooves = Math.sin(d * 2.1 + phase) * 0.18 + (hash(Math.floor(d * 1.3) + phase) - 0.5) * 0.25;
          const dome = -((d / r) ** 2) * 0.6;
          const lean = (Math.cos(tilt) * xx + Math.sin(tilt) * yy) / r * 0.15;
          h[idx] = (grooves + dome + lean) * s * 0.06;
          rough[idx] = 0.3 + (d / r) * 0.15 + (hash(Math.floor(d * 0.7) + phase) - 0.5) * 0.1;
        }
      }
    }
  }
  return {
    normal: dataTexture(heightToNormal(h, size, 0.5), size),
    roughness: scalarTexture(rough, size, {}),
  };
}

/** Clous de Paris — hobnail pyramid guilloché. */
export function clousDeParis(size = 512, cells = 16) {
  const c = size / cells;
  const h = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = (x % c) / c - 0.5;
      const v = (y % c) / c - 0.5;
      h[y * size + x] = (0.5 - Math.max(Math.abs(u), Math.abs(v))) * c * 0.55;
    }
  }
  return { normal: dataTexture(heightToNormal(h, size, 0.5), size) };
}

/**
 * Circular graining for wheels: concentric micro-grooves (normal map)
 * plus a tangential anisotropy direction map. Mapped over [-1, 1]², so
 * each wheel sets repeat = 1/(2R), offset = 0.5.
 */
export function circularGrain(size = 1024) {
  const h = new Float32Array(size * size);
  const aniso = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const px = (x + 0.5) / size * 2 - 1;
      const py = (y + 0.5) / size * 2 - 1;
      const r = Math.hypot(px, py) + 1e-6;
      h[y * size + x] = (hash(Math.floor(r * 420)) - 0.5) * 0.8 + Math.sin(r * 900) * 0.15;
      const i = (y * size + x) * 4;
      aniso[i] = ((-py / r) * 0.5 + 0.5) * 255;
      aniso[i + 1] = ((px / r) * 0.5 + 0.5) * 255;
      aniso[i + 2] = 255;
      aniso[i + 3] = 255;
    }
  }
  const clamp = THREE.ClampToEdgeWrapping;
  return {
    normal: dataTexture(heightToNormal(h, size, 0.25), size, { wrap: clamp }),
    anisotropy: dataTexture(aniso, size, { wrap: clamp }),
  };
}

/** Pebbled leather grain (Worley cells). */
export function leatherGrain(size = 512, cells = 24) {
  const c = size / cells;
  const pts = [];
  for (let j = 0; j < cells; j++) for (let i = 0; i < cells; i++) pts.push([(i + hash2(i, j)) * c, (j + hash2(j + 7, i + 3)) * c]);
  const h = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const ci = Math.floor(x / c), cj = Math.floor(y / c);
      let f1 = 1e9, f2 = 1e9;
      for (let dj = -1; dj <= 1; dj++) {
        for (let di = -1; di <= 1; di++) {
          const ii = (ci + di + cells) % cells, jj = (cj + dj + cells) % cells;
          const p = pts[jj * cells + ii];
          const px = p[0] + (ci + di - ii) * c, py = p[1] + (cj + dj - jj) * c;
          const d = Math.hypot(x - px, y - py);
          if (d < f1) { f2 = f1; f1 = d; } else if (d < f2) f2 = d;
        }
      }
      h[y * size + x] = Math.min(1, (f2 - f1) / (c * 0.35)) * c * 0.25 + hash2(x, y) * 0.4;
    }
  }
  return { normal: dataTexture(heightToNormal(h, size, 0.35), size) };
}

// ── canvas printing ──────────────────────────────────────────
export function canvasTexture(size, draw, { srgb = true } = {}) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  draw(ctx, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  tex.anisotropy = 8;
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  return tex;
}

/** Map a world-mm square [-half, half]² onto a texture via planar UVs. */
export function planarFit(tex, half) {
  tex.repeat.set(1 / (2 * half), 1 / (2 * half));
  tex.offset.set(0.5, 0.5);
  return tex;
}

export function curvedText(ctx, text, cx, cy, radius, centerAngle, { font, color, spacing = 0, inward = false }) {
  ctx.save();
  ctx.font = font;
  ctx.fillStyle = color;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const widths = [...text].map((ch) => ctx.measureText(ch).width + spacing);
  const total = widths.reduce((a, b) => a + b, 0);
  let a = centerAngle + (inward ? -1 : 1) * (total / 2) / radius;
  [...text].forEach((ch, i) => {
    const step = widths[i] / radius;
    a += (inward ? 1 : -1) * step / 2;
    ctx.save();
    ctx.translate(cx + radius * Math.cos(a), cy + radius * Math.sin(a));
    ctx.rotate(a + (inward ? -Math.PI / 2 : Math.PI / 2));
    ctx.fillText(ch, 0, 0);
    ctx.restore();
    a += (inward ? 1 : -1) * step / 2;
  });
  ctx.restore();
}

export function backdrop() {
  return canvasTexture(1024, (ctx, s) => {
    const g = ctx.createRadialGradient(s * 0.5, s * 0.42, s * 0.05, s * 0.5, s * 0.5, s * 0.75);
    g.addColorStop(0, '#2b2e35');
    g.addColorStop(0.45, '#15171b');
    g.addColorStop(1, '#050506');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, s, s);
    // fine film grain to avoid banding
    const img = ctx.getImageData(0, 0, s, s);
    for (let i = 0; i < img.data.length; i += 4) {
      const n = (Math.random() - 0.5) * 5;
      img.data[i] += n; img.data[i + 1] += n; img.data[i + 2] += n;
    }
    ctx.putImageData(img, 0, 0);
  });
}
