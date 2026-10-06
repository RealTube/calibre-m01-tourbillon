import * as THREE from 'three';

// ─────────────────────────────────────────────────────────────
// Film-only effects, all procedural:
//  · a light rig: a moving strip softbox (RectAreaLight) for the
//    classic long highlight sliding over polished metal, plus warm
//    and cool rim spots and a top spot for the opening beam
//  · sparks: velocity-stretched streaks with drag and gravity,
//    solved analytically in the vertex shader, HDR so they bloom
//  · dust motes that light up inside the beam, and the beam itself
//  · star-filter glints that ride the specular highlight
// Everything lives under one group that is hidden outside the film,
// so the app's own shaders never pay for these lights. Particles are
// listed in R.noDepth (kept out of the AO / DoF depth passes) and are
// never frustum-culled (their geometry is a single quad).
// ─────────────────────────────────────────────────────────────

const rand = (a, b) => a + Math.random() * (b - a);

export function createFX({ scene, R }) {
  const root = new THREE.Group();
  root.name = 'film-fx';
  root.visible = false;
  scene.add(root);

  // ── light rig ────────────────────────────────────────
  // Positions are set every frame by the director, relative to the camera.
  // Spots use decay 0 (no falloff), so intensity behaves like the app's
  // directional key light (1.7). The sweep is a 2.4 × 110 mm strip.
  const sweep = new THREE.RectAreaLight('#fff1e2', 0, 2.4, 110);
  const spot = (color, angle, penumbra) => {
    const s = new THREE.SpotLight(color, 0, 0, angle, penumbra, 0);
    s.castShadow = false;
    root.add(s, s.target);
    return s;
  };
  root.add(sweep);
  const rimWarm = spot('#ffc996', 0.42, 0.8);
  const rimCool = spot('#8db6ff', 0.42, 0.8);
  const top = spot('#fff3e2', 0.3, 0.6);

  // ── shared clock for particle shaders ────────────────
  const clock = { value: 0 };
  const res = { value: new THREE.Vector2(1, 1) };
  const noDepth = [];

  // ── sparks ───────────────────────────────────────────
  // A ring buffer of MAX particles; burst() overwrites the oldest. Each
  // instance stores origin, launch velocity and (birth, life, size mm, seed);
  // the vertex shader solves the path at `age` and at `age − uTrail`, projects
  // both and draws a screen-space quad between them: a motion-stretched streak.
  // Note: `half` is a reserved word in GLSL ES 3.0, hence `hres`.
  const MAX = 1800;
  const sgeo = new THREE.InstancedBufferGeometry();
  sgeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, 0, 0, 1, 0, 0, 1, 1, 0, -1, 1, 0]), 3));
  sgeo.setIndex([0, 1, 2, 0, 2, 3]);
  const aOrigin = new THREE.InstancedBufferAttribute(new Float32Array(MAX * 3), 3);
  const aVel = new THREE.InstancedBufferAttribute(new Float32Array(MAX * 3), 3);
  const aInfo = new THREE.InstancedBufferAttribute(new Float32Array(MAX * 4).fill(-999), 4);
  for (const a of [aOrigin, aVel, aInfo]) a.setUsage(THREE.DynamicDrawUsage);
  sgeo.setAttribute('aOrigin', aOrigin);
  sgeo.setAttribute('aVel', aVel);
  sgeo.setAttribute('aInfo', aInfo);
  sgeo.instanceCount = MAX;
  const sparkMat = new THREE.ShaderMaterial({
    uniforms: { uTime: clock, uRes: res, uGravity: { value: new THREE.Vector3(0, -34, 0) }, uDrag: { value: 1.7 }, uTrail: { value: 0.045 }, uGain: { value: 1 } },
    vertexShader: /* glsl */ `
      uniform float uTime; uniform vec2 uRes; uniform vec3 uGravity; uniform float uDrag; uniform float uTrail;
      attribute vec3 aOrigin; attribute vec3 aVel; attribute vec4 aInfo; // birth, life, size (mm), seed
      varying vec2 vUv; varying float vLife; varying float vSeed;
      vec3 at(float t) {
        vec3 p = aOrigin + aVel * (1.0 - exp(-uDrag * t)) / uDrag + 0.5 * uGravity * t * t;
        // a little flutter so streaks don't look ballistic
        p += vec3(sin(t * 9.0 + aInfo.w * 40.0), cos(t * 7.0 + aInfo.w * 17.0), sin(t * 8.0 + aInfo.w * 9.0)) * 0.35 * t;
        return p;
      }
      void main() {
        float age = uTime - aInfo.x;
        if (age < 0.0 || age > aInfo.y) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
        vLife = age / aInfo.y;
        vSeed = aInfo.w;
        vec4 ch = projectionMatrix * modelViewMatrix * vec4(at(age), 1.0);
        vec4 ct = projectionMatrix * modelViewMatrix * vec4(at(max(age - uTrail, 0.0)), 1.0);
        if (ch.w < 0.5 || ct.w < 0.5) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
        vec2 hres = uRes * 0.5;
        vec2 sh = ch.xy / ch.w * hres;
        vec2 st = ct.xy / ct.w * hres;
        vec2 d = sh - st;
        float len = length(d);
        vec2 dir = len > 0.001 ? d / len : vec2(1.0, 0.0);
        vec2 nrm = vec2(-dir.y, dir.x);
        float wpx = max(aInfo.z * projectionMatrix[1][1] * hres.y / ch.w, 0.9);
        vec2 px = mix(sh + dir * wpx, st - dir * wpx, position.y) + nrm * position.x * wpx;
        float w = mix(ch.w, ct.w, position.y);
        float z = mix(ch.z / ch.w, ct.z / ct.w, position.y);
        gl_Position = vec4(px / hres * w, z * w, w);
        vUv = position.xy;
      }`,
    fragmentShader: /* glsl */ `
      uniform float uGain;
      varying vec2 vUv; varying float vLife; varying float vSeed;
      vec3 heat(float x) {
        vec3 c = mix(vec3(1.0, 0.96, 0.88), vec3(1.0, 0.74, 0.36), smoothstep(0.0, 0.3, x));
        return mix(c, vec3(0.95, 0.34, 0.08), smoothstep(0.3, 1.0, x));
      }
      void main() {
        float across = 1.0 - vUv.x * vUv.x;
        float along = mix(1.0, 0.12, vUv.y);
        float fade = (1.0 - smoothstep(0.55, 1.0, vLife)) * smoothstep(0.0, 0.03, vLife);
        float twinkle = 0.7 + 0.3 * sin(vLife * 70.0 + vSeed * 31.0);
        float a = across * across * along * fade * twinkle;
        gl_FragColor = vec4(heat(vLife) * a * uGain * 5.0, 1.0);
      }`,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const sparks = new THREE.Mesh(sgeo, sparkMat);
  sparks.frustumCulled = false;
  sparks.renderOrder = 20;
  root.add(sparks);
  noDepth.push(sparks);
  let cursor = 0;
  const v = new THREE.Vector3(), tmp = new THREE.Vector3();

  /**
   * Emit a burst. `dir` + `spread` (radians) make a cone; otherwise the burst
   * is spherical, optionally squashed along an axis by `flatten`.
   */
  function burst({ origin, count = 200, speed = [20, 60], life = [0.6, 1.6], size = [0.05, 0.12], dir = null, spread = 0.6, flatten = null, delay = 0 }) {
    for (let i = 0; i < count; i++) {
      const k = cursor++ % MAX;
      if (dir) {
        // random direction inside a cone around dir
        const u = Math.random(), ph = Math.random() * Math.PI * 2;
        const cosT = 1 - u * (1 - Math.cos(spread));
        const sinT = Math.sqrt(1 - cosT * cosT);
        const a = Math.abs(dir.x) < 0.9 ? tmp.set(1, 0, 0) : tmp.set(0, 1, 0);
        const b1 = a.clone().cross(dir).normalize();
        const b2 = dir.clone().cross(b1);
        v.copy(dir).multiplyScalar(cosT).addScaledVector(b1, sinT * Math.cos(ph)).addScaledVector(b2, sinT * Math.sin(ph));
      } else {
        v.randomDirection();
        if (flatten) v.addScaledVector(flatten, -v.dot(flatten) * 0.7).normalize();
      }
      v.multiplyScalar(rand(...speed) * (0.35 + 0.65 * Math.random() ** 0.5));
      aOrigin.setXYZ(k, origin.x + rand(-0.4, 0.4), origin.y + rand(-0.4, 0.4), origin.z + rand(-0.4, 0.4));
      aVel.setXYZ(k, v.x, v.y, v.z);
      aInfo.setXYZW(k, clock.value + delay + Math.random() * 0.05, rand(...life), rand(...size), Math.random());
    }
    aOrigin.needsUpdate = aVel.needsUpdate = aInfo.needsUpdate = true;
  }
  function clearSparks() {
    aInfo.array.fill(-999);
    aInfo.needsUpdate = true;
  }

  // ── dust motes ───────────────────────────────────────
  // Drift in the beam's frame (+Y is the beam axis); brighter inside the cone.
  const DN = 900;
  const dgeo = new THREE.BufferGeometry();
  const dpos = new Float32Array(DN * 3), dseed = new Float32Array(DN);
  for (let i = 0; i < DN; i++) {
    const r = 60 * Math.sqrt(Math.random()), a = Math.random() * Math.PI * 2;
    dpos.set([r * Math.cos(a), rand(-70, 70), r * Math.sin(a) * 0.9 + 10], i * 3);
    dseed[i] = Math.random();
  }
  dgeo.setAttribute('position', new THREE.BufferAttribute(dpos, 3));
  dgeo.setAttribute('aSeed', new THREE.BufferAttribute(dseed, 1));
  const dustMat = new THREE.ShaderMaterial({
    uniforms: { uTime: clock, uRes: res, uGain: { value: 0 }, uBeam: { value: 0 }, uBeamR: { value: 22 } },
    vertexShader: /* glsl */ `
      uniform float uTime; uniform vec2 uRes; uniform float uBeam; uniform float uBeamR;
      attribute float aSeed;
      varying float vI;
      void main() {
        vec3 p = position;
        float t = uTime * (0.25 + aSeed * 0.35);
        p.x += sin(t + aSeed * 40.0) * 3.0;
        p.z += cos(t * 0.8 + aSeed * 21.0) * 3.0;
        p.y = mod(p.y - uTime * (1.2 + aSeed * 2.0) + 70.0, 140.0) - 70.0;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        float size = (0.08 + aSeed * 0.22);
        gl_PointSize = max(size * projectionMatrix[1][1] * uRes.y * 0.5 / -mv.z, 1.0);
        // brighter inside the beam (a vertical cone over the watch)
        float rb = length(p.xz - vec2(0.0, 2.0));
        float inBeam = 1.0 - smoothstep(uBeamR * 0.55, uBeamR, rb);
        float tw = 0.55 + 0.45 * sin(uTime * (1.0 + aSeed * 3.0) + aSeed * 50.0);
        vI = tw * (0.12 + uBeam * inBeam * 1.6);
      }`,
    fragmentShader: /* glsl */ `
      uniform float uGain;
      varying float vI;
      void main() {
        vec2 c = gl_PointCoord - 0.5;
        float a = exp(-dot(c, c) * 22.0);
        gl_FragColor = vec4(vec3(1.0, 0.9, 0.76) * a * vI * uGain, 1.0);
      }`,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  // the beam and its dust share a frame whose +Y is the beam axis, aimed per shot
  const beamGroup = new THREE.Group();
  root.add(beamGroup);
  const dust = new THREE.Points(dgeo, dustMat);
  dust.frustumCulled = false;
  dust.renderOrder = 19;
  beamGroup.add(dust);
  noDepth.push(dust);

  // ── volumetric beam (an open cone from above, soft-edged) ──
  const bgeo = new THREE.CylinderGeometry(3.5, 24, 150, 96, 1, true);
  bgeo.translate(0, 75, 0);
  const beamMat = new THREE.ShaderMaterial({
    uniforms: { uTime: clock, uGain: { value: 0 } },
    vertexShader: /* glsl */ `
      varying vec3 vN; varying vec3 vV; varying float vY; varying float vA;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vN = normalize(normalMatrix * normal);
        vV = normalize(-mv.xyz);
        vY = position.y / 150.0;
        vA = atan(position.z, position.x);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform float uTime; uniform float uGain;
      varying vec3 vN; varying vec3 vV; varying float vY; varying float vA;
      void main() {
        float core = pow(abs(dot(normalize(vN), normalize(vV))), 2.2);
        float along = smoothstep(0.0, 0.12, vY) * pow(1.0 - vY, 1.4);
        float rays = 0.75 + 0.25 * sin(vA * 23.0 + uTime * 0.4) * sin(vA * 9.0 - uTime * 0.25);
        gl_FragColor = vec4(vec3(1.0, 0.9, 0.74) * core * along * rays * uGain * 0.16, 1.0);
      }`,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
  });
  const beam = new THREE.Mesh(bgeo, beamMat);
  beam.frustumCulled = false;
  beam.renderOrder = 18;
  beamGroup.add(beam);
  noDepth.push(beam);

  // ── star-filter glints on the bezel's top edge ───────
  const GN = 28;
  const ggeo = new THREE.BufferGeometry();
  const gpos = new Float32Array(GN * 3), gI = new Float32Array(GN), gS = new Float32Array(GN);
  const gLocal = [], gNormal = [];
  for (let i = 0; i < GN; i++) {
    const a = (i / GN) * Math.PI * 2 + 0.07;
    // the bezel's rounded crest (see geometry/case.js), normal tilted out and up
    gLocal.push(new THREE.Vector3(19.45 * Math.cos(a), 19.45 * Math.sin(a), 4.5));
    gNormal.push(new THREE.Vector3(0.62 * Math.cos(a), 0.62 * Math.sin(a), 0.78).normalize());
    gS[i] = Math.random();
  }
  ggeo.setAttribute('position', new THREE.BufferAttribute(gpos, 3));
  ggeo.setAttribute('aI', new THREE.BufferAttribute(gI, 1));
  ggeo.setAttribute('aSeed', new THREE.BufferAttribute(gS, 1));
  const glintMat = new THREE.ShaderMaterial({
    uniforms: { uRes: res, uSize: { value: 150 }, uTime: clock },
    vertexShader: /* glsl */ `
      uniform vec2 uRes; uniform float uSize; uniform float uTime;
      attribute float aI; attribute float aSeed;
      varying float vI; varying float vRot;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mv;
        vI = aI;
        vRot = 0.12 + 0.05 * sin(uTime * 0.7 + aSeed * 9.0);
        gl_PointSize = aI > 0.003 ? uSize * (uRes.y / 1080.0) * (0.55 + 0.45 * sqrt(aI)) : 0.0;
      }`,
    fragmentShader: /* glsl */ `
      varying float vI; varying float vRot;
      void main() {
        vec2 c = gl_PointCoord - 0.5;
        float cs = cos(vRot), sn = sin(vRot);
        vec2 r = vec2(c.x * cs - c.y * sn, c.x * sn + c.y * cs);
        float star = exp(-abs(r.y) * 90.0) * exp(-abs(r.x) * 7.0) + exp(-abs(r.x) * 90.0) * exp(-abs(r.y) * 7.0);
        vec2 q = vec2(r.x + r.y, r.x - r.y) * 0.7071;
        star += 0.35 * (exp(-abs(q.y) * 110.0) * exp(-abs(q.x) * 16.0) + exp(-abs(q.x) * 110.0) * exp(-abs(q.y) * 16.0));
        float core = exp(-dot(c, c) * 900.0) * 2.0 + exp(-dot(c, c) * 120.0) * 0.4;
        gl_FragColor = vec4(vec3(1.0, 0.93, 0.84) * (star + core) * vI * 3.0, 1.0);
      }`,
    transparent: true,
    depthWrite: false,
    depthTest: false,
    blending: THREE.AdditiveBlending,
  });
  const glints = new THREE.Points(ggeo, glintMat);
  glints.frustumCulled = false;
  glints.renderOrder = 30;
  root.add(glints);
  noDepth.push(glints);
  const glintKick = new Float32Array(GN);

  R.noDepth.push(...noDepth);

  // ── per-frame update ─────────────────────────────────
  const wp = new THREE.Vector3(), wn = new THREE.Vector3(), toCam = new THREE.Vector3(), toLight = new THREE.Vector3(), h = new THREE.Vector3();
  const nm = new THREE.Matrix3();
  /**
   * glint: { bezel (Object3D), lightPos (Vector3|null), gain }
   */
  const brightest = { pos: new THREE.Vector3(), i: 0 };
  function update(dt, camera, { glint }) {
    brightest.i = 0;
    clock.value += dt;
    R.renderer.getDrawingBufferSize(res.value);
    const bez = glint.bezel;
    bez.updateWorldMatrix(true, false);
    nm.getNormalMatrix(bez.matrixWorld);
    for (let i = 0; i < GN; i++) {
      wp.copy(gLocal[i]).applyMatrix4(bez.matrixWorld);
      gpos.set([wp.x, wp.y, wp.z], i * 3);
      let s = 0;
      if (glint.lightPos && glint.gain > 0) {
        wn.copy(gNormal[i]).applyMatrix3(nm).normalize();
        toCam.subVectors(camera.position, wp).normalize();
        toLight.subVectors(glint.lightPos, wp).normalize();
        h.addVectors(toCam, toLight).normalize();
        const nh = Math.max(0, wn.dot(h));
        s = Math.pow(nh, 160) * glint.gain * (wn.dot(toCam) > 0.05 ? 1 : 0);
      }
      glintKick[i] *= Math.exp(-dt * 3.2);
      gI[i] = Math.min(1.6, s + glintKick[i]);
      if (s > brightest.i) { brightest.i = s; brightest.pos.copy(wp); }
    }
    ggeo.attributes.position.needsUpdate = true;
    ggeo.attributes.aI.needsUpdate = true;
    return brightest;
  }

  /** Spark a few random glints at once (on a hit). */
  function flashGlints(n = 5, amount = 1) {
    for (let i = 0; i < n; i++) glintKick[(Math.random() * GN) | 0] = amount * rand(0.5, 1);
  }

  // the area light's LTC tables are ~300 KB, so they load only when the film starts
  let ready = null;
  function prepare() {
    ready ??= import('three/addons/lights/RectAreaLightUniformsLib.js').then((m) => m.RectAreaLightUniformsLib.init());
    return ready;
  }

  // director-facing handles: the lights to place, the materials whose uniforms it drives,
  // burst() / flashGlints() for events, update() once per frame, `visible` for the whole rig
  return {
    prepare,
    root, sweep, rimWarm, rimCool, top, sparks, dust, beam, beamGroup, glints,
    sparkMat, dustMat, beamMat,
    burst, clearSparks, flashGlints, update,
    set visible(on) { root.visible = on; },
  };
}

// ─────────────────────────────────────────────────────────────
// Final grade, applied after tone mapping (display space): fade,
// flash, radial chromatic aberration, an analytic anamorphic flare
// (long blue streak, glow and ghosts), S-curve, vignette, grain.
// ─────────────────────────────────────────────────────────────
export const CinemaShader = {
  name: 'CinemaShader',
  uniforms: {
    tDiffuse: { value: null },
    uRes: { value: new THREE.Vector2(1, 1) },
    uTime: { value: 0 },
    uFade: { value: 0 },
    uFlash: { value: new THREE.Vector3() },
    uCA: { value: 0 },
    uVignette: { value: 0.35 },
    uGrain: { value: 0.035 },
    uContrast: { value: 0.12 },
    uSat: { value: 1.0 },
    uFlare: { value: 0 },
    uFlarePos: { value: new THREE.Vector2(0.5, 0.5) },
    uFlareColor: { value: new THREE.Vector3(0.45, 0.66, 1.0) },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform vec2 uRes; uniform float uTime;
    uniform float uFade; uniform vec3 uFlash; uniform float uCA; uniform float uVignette; uniform float uGrain;
    uniform float uContrast; uniform float uSat;
    uniform float uFlare; uniform vec2 uFlarePos; uniform vec3 uFlareColor;
    varying vec2 vUv;
    float hash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
    void main() {
      vec2 c = vUv - 0.5;
      float r2 = dot(c, c);
      vec2 off = c * r2 * uCA * 0.09;
      vec3 col = vec3(
        texture2D(tDiffuse, vUv - off).r,
        texture2D(tDiffuse, vUv).g,
        texture2D(tDiffuse, vUv + off).b
      );
      if (uFlare > 0.002) {
        vec2 asp = vec2(uRes.x / uRes.y, 1.0);
        vec2 d = (vUv - uFlarePos) * asp;
        float streak = exp(-abs(d.y) * 340.0) * exp(-abs(d.x) * 1.3);
        float halo = exp(-abs(d.y) * 55.0) * exp(-abs(d.x) * 4.5) * 0.35;
        float glow = exp(-length(d) * 10.0) * 0.55 + exp(-length(d) * 40.0) * 0.8;
        vec3 f = uFlareColor * (streak + halo) + vec3(1.0, 0.9, 0.78) * glow;
        vec2 axis = vec2(0.5) - uFlarePos;
        float g = 0.0;
        g += smoothstep(0.05, 0.035, length((vUv - (uFlarePos + axis * 1.4)) * asp)) * 0.06;
        g += smoothstep(0.022, 0.012, length((vUv - (uFlarePos + axis * 1.75)) * asp)) * 0.1;
        g += smoothstep(0.11, 0.07, length((vUv - (uFlarePos + axis * 2.3)) * asp)) * 0.035;
        f += vec3(0.55, 0.75, 1.0) * g;
        col += f * uFlare;
      }
      // gentle S-curve that keeps black at black, and saturation
      col = clamp(col, 0.0, 1.0);
      col = mix(col, col * col * (3.0 - 2.0 * col), uContrast);
      float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
      col = mix(vec3(l), col, uSat);
      col += vec3(-0.006, 0.002, 0.012) * (1.0 - l) * (1.0 - l); // cool the shadows a touch
      float vig = smoothstep(0.98, 0.18, length(c * vec2(1.0, 0.82)));
      col *= mix(1.0, vig, uVignette);
      col += uFlash;
      col *= 1.0 - uFade;
      col += (hash(vUv * uRes + fract(uTime * 7.13) * 91.0) - 0.5) * uGrain * (1.0 - uFade);
      gl_FragColor = vec4(max(col, 0.0), 1.0);
    }`,
};
