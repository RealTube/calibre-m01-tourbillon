import * as THREE from 'three';
import * as T from './textures.js';

// ─────────────────────────────────────────────────────────────
// Material library. Metals are physically based (metalness 1 with
// measured-ish albedo), stones use real refractive indices:
// ruby / sapphire (corundum) n ≈ 1.77.
// ─────────────────────────────────────────────────────────────

export const FINISHES = {
  rose: { label: '5N Rose Gold', color: '#f2b79a', accent: '#f2b79a', rough: 0.12, brushRough: 0.3 },
  platinum: { label: 'Platinum', color: '#e2e3e6', accent: '#e9e9ec', rough: 0.1, brushRough: 0.28 },
  dlc: { label: 'Black DLC', color: '#2a2b2f', accent: '#f0b596', rough: 0.22, brushRough: 0.42 },
};

let lib = null;

export function createLibrary() {
  const tex = {
    cdg: T.cotesDeGeneve(),
    perlage: T.perlage(),
    clous: T.clousDeParis(),
    grain: T.circularGrain(),
    leather: T.leatherGrain(),
  };

  // Côtes de Genève run diagonally across all bridges as one continuous pattern
  for (const t of [tex.cdg.normal, tex.cdg.roughness]) {
    t.repeat.set(1 / 17, 1 / 17);
    t.center.set(0.5, 0.5);
    t.rotation = 0.42;
  }
  for (const t of [tex.perlage.normal, tex.perlage.roughness]) t.repeat.set(1 / 9, 1 / 9);
  tex.clous.normal.repeat.set(1 / 7.5, 1 / 7.5);
  tex.clous.normal.center.set(0.5, 0.5);
  tex.clous.normal.rotation = Math.PI / 4;
  tex.leather.normal.repeat.set(1 / 10, 1 / 10);

  const m = {};

  // ── case ────────────────────────────────────────────────
  m.casePolished = new THREE.MeshPhysicalMaterial({ color: FINISHES.rose.color, metalness: 1, roughness: 0.12, clearcoat: 0.3, clearcoatRoughness: 0.05 });
  m.caseBrushed = new THREE.MeshPhysicalMaterial({ color: FINISHES.rose.color, metalness: 1, roughness: 0.3, anisotropy: 0.85, anisotropyRotation: Math.PI / 2 });
  m.accentGold = new THREE.MeshPhysicalMaterial({ color: FINISHES.rose.accent, metalness: 1, roughness: 0.14, clearcoat: 0.4 });

  // Sapphire crystal: an additive reflection layer (keeps rubies below visible
  // — transmission would hide other transmissive parts) with a violet AR coating.
  const sapphire = (strength = 1) =>
    new THREE.MeshPhysicalMaterial({
      color: 0x000000,
      metalness: 0,
      roughness: 0.03,
      ior: 1.77,
      specularIntensity: strength,
      iridescence: 0.3,
      iridescenceIOR: 1.38,
      iridescenceThicknessRange: [180, 320],
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.FrontSide,
      envMapIntensity: 0.9,
    });
  m.sapphire = sapphire(0.32);
  m.sapphireDial = new THREE.MeshPhysicalMaterial({
    color: 0x0c1220, metalness: 0, roughness: 0.05, ior: 1.77, transparent: true, opacity: 0.28, depthWrite: false,
    clearcoat: 1, clearcoatRoughness: 0.02, envMapIntensity: 1.2,
  });

  // ── movement metals ─────────────────────────────────────
  m.gilt = new THREE.MeshPhysicalMaterial({ color: '#e9c27a', metalness: 1, roughness: 0.26, anisotropy: 0.7 });
  m.giltPolished = new THREE.MeshPhysicalMaterial({ color: '#f3cf8a', metalness: 1, roughness: 0.07 });
  m.steelPolished = new THREE.MeshPhysicalMaterial({ color: '#dfe3e8', metalness: 1, roughness: 0.06 });
  m.steelBlack = new THREE.MeshPhysicalMaterial({ color: '#c9ced6', metalness: 1, roughness: 0.03, clearcoat: 0.6 });
  m.steelSatin = new THREE.MeshPhysicalMaterial({ color: '#cfd3d8', metalness: 1, roughness: 0.28, anisotropy: 0.6 });
  m.titanium = new THREE.MeshPhysicalMaterial({ color: '#b9bec6', metalness: 1, roughness: 0.18 });

  m.bridge = new THREE.MeshPhysicalMaterial({
    color: '#c2c6cd', metalness: 1, roughness: 1,
    normalMap: tex.cdg.normal, normalScale: new THREE.Vector2(0.7, 0.7),
    roughnessMap: tex.cdg.roughness,
  });
  m.bridgeChamfer = new THREE.MeshPhysicalMaterial({ color: '#e6e8ec', metalness: 1, roughness: 0.05 });
  m.plate = new THREE.MeshPhysicalMaterial({
    color: '#6e737b', metalness: 1, roughness: 1,
    normalMap: tex.perlage.normal, normalScale: new THREE.Vector2(0.8, 0.8),
    roughnessMap: tex.perlage.roughness,
  });

  // heat-blued steel: a deep cornflower oxide with a glassy top layer
  m.blued = new THREE.MeshPhysicalMaterial({
    color: '#2a52c9', metalness: 0.85, roughness: 0.22,
    clearcoat: 0.8, clearcoatRoughness: 0.08,
    sheen: 0.4, sheenColor: new THREE.Color('#6f8dff'), sheenRoughness: 0.4,
  });
  m.hairspring = new THREE.MeshPhysicalMaterial({
    color: '#3a5fcf', metalness: 1, roughness: 0.2,
    iridescence: 0.8, iridescenceIOR: 1.7, iridescenceThicknessRange: [300, 420],
  });

  m.ruby = new THREE.MeshPhysicalMaterial({
    color: '#ff3355', metalness: 0, roughness: 0.03,
    transmission: 1, thickness: 0.35, ior: 1.77,
    attenuationColor: new THREE.Color('#a8001e'), attenuationDistance: 0.22,
    specularIntensity: 1, specularColor: new THREE.Color('#ffffff'),
    envMapIntensity: 1.6,
  });

  m.mainspring = new THREE.MeshPhysicalMaterial({ color: '#9aa1ab', metalness: 1, roughness: 0.22 });

  // ── dial & hands ────────────────────────────────────────
  m.lume = new THREE.MeshStandardMaterial({ color: '#e9efe4', roughness: 0.6, emissive: new THREE.Color('#6effc2'), emissiveIntensity: 0.0 });
  m.dialRing = new THREE.MeshPhysicalMaterial({
    color: '#ffffff', metalness: 0.5, roughness: 0.24,
    normalMap: tex.clous.normal, normalScale: new THREE.Vector2(0.42, 0.42),
    clearcoat: 1, clearcoatRoughness: 0.08,
  });
  m.print = new THREE.MeshBasicMaterial({ color: '#f4f1ea', transparent: true, depthWrite: false });

  // ── strap ───────────────────────────────────────────────
  m.leather = new THREE.MeshPhysicalMaterial({
    color: '#1b2436', roughness: 0.62, metalness: 0,
    sheen: 0.8, sheenColor: new THREE.Color('#62739f'), sheenRoughness: 0.45,
    normalMap: tex.leather.normal, normalScale: new THREE.Vector2(0.9, 0.9),
    clearcoat: 0.12, clearcoatRoughness: 0.4,
  });
  m.leatherEdge = new THREE.MeshPhysicalMaterial({ color: '#10141f', roughness: 0.35, clearcoat: 0.6 });
  m.stitch = new THREE.MeshStandardMaterial({ color: '#d8c7a3', roughness: 0.8 });

  // ── x-ray / isolate ghost ───────────────────────────────
  m.ghost = new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color('#9cc7ff') }, uStrength: { value: 0.55 }, uBase: { value: 0.015 } },
    vertexShader: /* glsl */ `
      varying vec3 vN; varying vec3 vV;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vN = normalize(normalMatrix * normal);
        vV = normalize(-mv.xyz);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor; uniform float uStrength; uniform float uBase;
      varying vec3 vN; varying vec3 vV;
      void main() {
        float f = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 2.2);
        gl_FragColor = vec4(uColor * (f * uStrength + uBase), 1.0);
      }`,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  m.ghostDim = m.ghost.clone();
  m.ghostDim.uniforms = {
    uColor: { value: new THREE.Color('#8fa6c8') }, uStrength: { value: 0.18 }, uBase: { value: 0.004 },
  };

  lib = { m, tex, grainCache: new Map() };
  return lib;
}

export function mat() {
  return lib.m;
}

/** Circular-grained wheel face material, sized to a wheel radius. */
export function grainedFace(base, radius) {
  const key = base.uuid + ':' + radius.toFixed(2);
  if (lib.grainCache.has(key)) return lib.grainCache.get(key);
  const mtl = base.clone();
  const n = lib.tex.grain.normal.clone();
  const a = lib.tex.grain.anisotropy.clone();
  for (const t of [n, a]) T.planarFit(t, radius);
  mtl.normalMap = n;
  mtl.normalScale = new THREE.Vector2(0.35, 0.35);
  mtl.anisotropyMap = a;
  mtl.anisotropy = Math.max(mtl.anisotropy, 0.75);
  lib.grainCache.set(key, mtl);
  return mtl;
}

export function setFinish(key) {
  const f = FINISHES[key];
  const { m } = lib;
  m.casePolished.color.set(f.color);
  m.casePolished.roughness = f.rough;
  m.caseBrushed.color.set(f.color);
  m.caseBrushed.roughness = f.brushRough;
  m.accentGold.color.set(f.accent);
}
