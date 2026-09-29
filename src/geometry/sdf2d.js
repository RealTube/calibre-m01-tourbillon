import * as THREE from 'three';

// ─────────────────────────────────────────────────────────────
// 2D signed-distance toolkit.
// Watch parts (bridges, frames, hands, forks) are designed as smooth
// unions of simple primitives, then contoured with marching squares
// into THREE.Shapes with holes — so every outline has organic fillets
// and extrudes as a single watertight solid.
// Negative distance = inside.
// ─────────────────────────────────────────────────────────────

const TAU = Math.PI * 2;

// allocation-free segment distance: returns distance, leaves the parameter in SEG_T
let SEG_T = 0;
function segD(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const l2 = dx * dx + dy * dy;
  let t = l2 > 0 ? ((px - ax) * dx + (py - ay) * dy) / l2 : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  SEG_T = t;
  const ex = px - (ax + dx * t), ey = py - (ay + dy * t);
  return Math.sqrt(ex * ex + ey * ey);
}
function segDist(px, py, ax, ay, bx, by) {
  return { d: segD(px, py, ax, ay, bx, by), t: SEG_T };
}

export const sd = {
  circle: (cx, cy, r) => (x, y) => Math.hypot(x - cx, y - cy) - r,

  ring: (cx, cy, r0, r1) => (x, y) => {
    const d = Math.hypot(x - cx, y - cy);
    return Math.max(r0 - d, d - r1);
  },

  capsule: (ax, ay, bx, by, r) => (x, y) => segD(x, y, ax, ay, bx, by) - r,

  // capsule whose radius tapers from ra (at a) to rb (at b)
  taper: (ax, ay, bx, by, ra, rb) => (x, y) => {
    const d = segD(x, y, ax, ay, bx, by);
    return d - (ra + (rb - ra) * SEG_T);
  },

  box: (cx, cy, hw, hh, angle = 0, round = 0) => {
    const c = Math.cos(-angle), s = Math.sin(-angle);
    return (x, y) => {
      const lx = (x - cx) * c - (y - cy) * s;
      const ly = (x - cx) * s + (y - cy) * c;
      const qx = Math.abs(lx) - hw + round, qy = Math.abs(ly) - hh + round;
      return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - round;
    };
  },

  // stroke along an arc of radius R from angle a0 to a1 (radians, CCW), half-width hw
  arc: (cx, cy, R, a0, a1, hw) => {
    const span = ((a1 - a0) % TAU + TAU) % TAU;
    const ex0 = cx + R * Math.cos(a0), ey0 = cy + R * Math.sin(a0);
    const ex1 = cx + R * Math.cos(a1), ey1 = cy + R * Math.sin(a1);
    return (x, y) => {
      const a = Math.atan2(y - cy, x - cx);
      const rel = ((a - a0) % TAU + TAU) % TAU;
      if (rel <= span) return Math.abs(Math.hypot(x - cx, y - cy) - R) - hw;
      return Math.min(Math.hypot(x - ex0, y - ey0), Math.hypot(x - ex1, y - ey1)) - hw;
    };
  },

  // quadratic bezier stroke (sampled)
  curve: (pts, hw, samples = 24) => {
    const P = [];
    for (let i = 0; i <= samples; i++) {
      const t = i / samples;
      if (pts.length === 3) {
        const [a, b, c] = pts;
        const u = 1 - t;
        P.push([u * u * a[0] + 2 * u * t * b[0] + t * t * c[0], u * u * a[1] + 2 * u * t * b[1] + t * t * c[1]]);
      } else {
        const [a, b, c, d] = pts;
        const u = 1 - t;
        P.push([
          u * u * u * a[0] + 3 * u * u * t * b[0] + 3 * u * t * t * c[0] + t * t * t * d[0],
          u * u * u * a[1] + 3 * u * u * t * b[1] + 3 * u * t * t * c[1] + t * t * t * d[1],
        ]);
      }
    }
    const hwFn = typeof hw === 'function' ? hw : () => hw;
    const n = P.length - 1;
    const X = new Float64Array(P.length), Y = new Float64Array(P.length), W = new Float64Array(P.length);
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity, maxW = 0;
    P.forEach(([px, py], i) => {
      X[i] = px; Y[i] = py; W[i] = hwFn(i / n);
      minX = Math.min(minX, px); maxX = Math.max(maxX, px); minY = Math.min(minY, py); maxY = Math.max(maxY, py);
      maxW = Math.max(maxW, W[i]);
    });
    return (x, y) => {
      // far from the stroke's bounding box: a cheap lower bound is enough
      const bx = Math.max(minX - x, 0, x - maxX), by = Math.max(minY - y, 0, y - maxY);
      const bd = Math.sqrt(bx * bx + by * by) - maxW;
      if (bd > 1.5) return bd;
      let best = Infinity;
      for (let i = 0; i < n; i++) {
        const d = segD(x, y, X[i], Y[i], X[i + 1], Y[i + 1]);
        const w = W[i] + (W[i + 1] - W[i]) * SEG_T;
        if (d - w < best) best = d - w;
      }
      return best;
    };
  },

  polygon: (pts) => (x, y) => {
    let d = Infinity, inside = false;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const [ax, ay] = pts[j], [bx, by] = pts[i];
      d = Math.min(d, segDist(x, y, ax, ay, bx, by).d);
      if ((by > y) !== (ay > y) && x < ((ax - bx) * (y - by)) / (ay - by) + bx) inside = !inside;
    }
    return inside ? -d : d;
  },
};

function smin(a, b, k) {
  if (k <= 0) return Math.min(a, b);
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.min(a, b) - h * h * k * 0.25;
}

export const op = {
  union: (...fs) => (x, y) => {
    let d = Infinity;
    for (const f of fs) d = Math.min(d, f(x, y));
    return d;
  },
  smooth: (k, ...fs) => (x, y) => {
    let d = fs[0](x, y);
    for (let i = 1; i < fs.length; i++) d = smin(d, fs[i](x, y), k);
    return d;
  },
  subtract: (a, ...bs) => (x, y) => {
    let d = a(x, y);
    for (const b of bs) d = Math.max(d, -b(x, y));
    return d;
  },
  smoothSubtract: (k, a, ...bs) => (x, y) => {
    let d = a(x, y);
    for (const b of bs) d = -smin(-d, b(x, y), k);
    return d;
  },
  intersect: (...fs) => (x, y) => {
    let d = -Infinity;
    for (const f of fs) d = Math.max(d, f(x, y));
    return d;
  },
  offset: (f, r) => (x, y) => f(x, y) - r,
};

// ── marching squares → closed loops ─────────────────────────
function marchingLoops(fn, x0, y0, x1, y1, h) {
  const nx = Math.ceil((x1 - x0) / h) + 1;
  const ny = Math.ceil((y1 - y0) / h) + 1;
  // coarse pass first; only samples that could be near the outline are evaluated exactly
  const S = 4, H = h * S;
  const cx = Math.ceil((nx - 1) / S) + 1, cy = Math.ceil((ny - 1) / S) + 1;
  const coarse = new Float32Array(cx * cy);
  for (let j = 0; j < cy; j++) for (let i = 0; i < cx; i++) coarse[j * cx + i] = fn(x0 + i * H, y0 + j * H);
  const safe = H * 0.75 + h * 2.5;
  const v = new Float32Array(nx * ny);
  for (let j = 0; j < ny; j++) {
    const y = y0 + j * h;
    const cj = Math.min(cy - 1, Math.round(j / S));
    for (let i = 0; i < nx; i++) {
      const c = coarse[cj * cx + Math.min(cx - 1, Math.round(i / S))];
      let d = Math.abs(c) > safe ? c : fn(x0 + i * h, y);
      // force a border of "outside" so every contour closes
      if (i === 0 || j === 0 || i === nx - 1 || j === ny - 1) d = Math.max(d, 1e-3);
      if (d === 0) d = 1e-7;
      v[j * nx + i] = d;
    }
  }
  const V = (i, j) => v[j * nx + i];
  // edge ids: horizontal edge (i,j)->(i+1,j): 2*(j*nx+i); vertical (i,j)->(i,j+1): 2*(j*nx+i)+1
  const pts = new Map();
  const edgePoint = (id) => {
    let p = pts.get(id);
    if (p) return p;
    const base = id >> 1, vert = id & 1;
    const i = base % nx, j = (base / nx) | 0;
    const a = V(i, j);
    const b = vert ? V(i, j + 1) : V(i + 1, j);
    const t = a / (a - b);
    p = vert ? [x0 + i * h, y0 + (j + t) * h] : [x0 + (i + t) * h, y0 + j * h];
    pts.set(id, p);
    return p;
  };
  const next = new Map(); // directed segments: from edge -> to edge (inside on the left)
  for (let j = 0; j < ny - 1; j++) {
    for (let i = 0; i < nx - 1; i++) {
      const a = V(i, j) < 0, b = V(i + 1, j) < 0, c = V(i + 1, j + 1) < 0, d = V(i, j + 1) < 0;
      const idx = (a ? 1 : 0) | (b ? 2 : 0) | (c ? 4 : 0) | (d ? 8 : 0);
      if (idx === 0 || idx === 15) continue;
      const eB = 2 * (j * nx + i);            // bottom  (a-b)
      const eR = 2 * (j * nx + i + 1) + 1;    // right   (b-c)
      const eT = 2 * ((j + 1) * nx + i);      // top     (d-c)
      const eL = 2 * (j * nx + i) + 1;        // left    (a-d)
      const add = (f, t) => next.set(f, t);
      switch (idx) {
        case 1: add(eL, eB); break;
        case 2: add(eB, eR); break;
        case 3: add(eL, eR); break;
        case 4: add(eR, eT); break;
        case 5: {
          const center = (V(i, j) + V(i + 1, j) + V(i + 1, j + 1) + V(i, j + 1)) / 4;
          if (center < 0) { add(eL, eT); add(eR, eB); } else { add(eL, eB); add(eR, eT); }
          break;
        }
        case 6: add(eB, eT); break;
        case 7: add(eL, eT); break;
        case 8: add(eT, eL); break;
        case 9: add(eT, eB); break;
        case 10: {
          const center = (V(i, j) + V(i + 1, j) + V(i + 1, j + 1) + V(i, j + 1)) / 4;
          if (center < 0) { add(eB, eL); add(eT, eR); } else { add(eB, eR); add(eT, eL); }
          break;
        }
        case 11: add(eT, eR); break;
        case 12: add(eR, eL); break;
        case 13: add(eR, eB); break;
        case 14: add(eB, eL); break;
      }
    }
  }
  const loops = [];
  const visited = new Set();
  for (const start of next.keys()) {
    if (visited.has(start)) continue;
    const loop = [];
    let cur = start;
    let guard = 0;
    while (!visited.has(cur) && guard++ < 1e6) {
      visited.add(cur);
      loop.push(edgePoint(cur));
      cur = next.get(cur);
      if (cur === undefined) break;
    }
    if (loop.length >= 3) loops.push(loop);
  }
  return loops;
}

function rdp(points, eps) {
  if (points.length < 3) return points;
  const keep = new Uint8Array(points.length);
  keep[0] = keep[points.length - 1] = 1;
  const stack = [[0, points.length - 1]];
  while (stack.length) {
    const [s, e] = stack.pop();
    let maxD = 0, idx = -1;
    for (let i = s + 1; i < e; i++) {
      const d = segDist(points[i][0], points[i][1], points[s][0], points[s][1], points[e][0], points[e][1]).d;
      if (d > maxD) { maxD = d; idx = i; }
    }
    if (maxD > eps && idx > 0) {
      keep[idx] = 1;
      stack.push([s, idx], [idx, e]);
    }
  }
  return points.filter((_, i) => keep[i]);
}

function simplifyClosed(loop, eps) {
  // split the ring at its farthest point pair so RDP works on two open chains
  const n = loop.length;
  let far = 0, fd = 0;
  for (let i = 1; i < n; i++) {
    const d = Math.hypot(loop[i][0] - loop[0][0], loop[i][1] - loop[0][1]);
    if (d > fd) { fd = d; far = i; }
  }
  const a = rdp(loop.slice(0, far + 1), eps);
  const b = rdp(loop.slice(far).concat([loop[0]]), eps);
  return a.slice(0, -1).concat(b.slice(0, -1));
}

function area(loop) {
  let s = 0;
  for (let i = 0, j = loop.length - 1; i < loop.length; j = i++) s += (loop[j][0] - loop[i][0]) * (loop[j][1] + loop[i][1]);
  return s / 2;
}

function pointInLoop(p, loop) {
  let inside = false;
  for (let i = 0, j = loop.length - 1; i < loop.length; j = i++) {
    const [ax, ay] = loop[j], [bx, by] = loop[i];
    if ((by > p[1]) !== (ay > p[1]) && p[0] < ((ax - bx) * (p[1] - by)) / (ay - by) + bx) inside = !inside;
  }
  return inside;
}

/**
 * Contour an SDF into THREE.Shapes (outer loops with their holes).
 * bounds: [x0, y0, x1, y1]; h: grid cell size (mm).
 */
export function sdfToShapes(fn, bounds, h = 0.05, eps = h * 0.12) {
  const [x0, y0, x1, y1] = bounds;
  const pad = h * 2;
  let loops = marchingLoops(fn, x0 - pad, y0 - pad, x1 + pad, y1 + pad, h)
    .map((l) => simplifyClosed(l, eps))
    .filter((l) => l.length >= 3 && Math.abs(area(l)) > h * h * 2);

  const depth = loops.map((l, i) => loops.reduce((acc, o, j) => (j !== i && pointInLoop(l[0], o) ? acc + 1 : acc), 0));
  const shapes = [];
  const outers = [];
  loops.forEach((l, i) => {
    if (depth[i] % 2 === 0) {
      const s = new THREE.Shape(l.map(([x, y]) => new THREE.Vector2(x, y)));
      shapes.push(s);
      outers.push({ loop: l, shape: s, area: Math.abs(area(l)) });
    }
  });
  loops.forEach((l, i) => {
    if (depth[i] % 2 === 1) {
      // attach to the smallest containing outer
      let best = null;
      for (const o of outers) if (pointInLoop(l[0], o.loop) && (!best || o.area < best.area)) best = o;
      if (best) best.shape.holes.push(new THREE.Path(l.map(([x, y]) => new THREE.Vector2(x, y))));
    }
  });
  return shapes;
}

/**
 * Extrude an SDF-designed plate with a polished chamfer (anglage).
 * Returns a BufferGeometry centered on z ∈ [0, depth] with groups: 0 = faces, 1 = flanks/chamfers.
 */
export function extrudeSDF(fn, bounds, depth, { h = 0.05, bevel = 0.04, bevelSegments = 2 } = {}) {
  const shapes = sdfToShapes(fn, bounds, h);
  const geo = new THREE.ExtrudeGeometry(shapes, {
    depth: Math.max(0.001, depth - bevel * 2),
    bevelEnabled: bevel > 0,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelOffset: -bevel,
    bevelSegments,
    curveSegments: 1,
  });
  geo.translate(0, 0, bevel);
  return geo;
}
