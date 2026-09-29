import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { OutlinePass } from 'three/addons/postprocessing/OutlinePass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { BokehPass } from 'three/addons/postprocessing/BokehPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

// ─────────────────────────────────────────────────────────────
// Renderer + post: MSAA HDR target → GTAO (crevice occlusion)
// → outline (hover/selection) → bloom (glints & lume) → bokeh
// (macro) → neutral tone mapping.
// ─────────────────────────────────────────────────────────────

export function createRenderer(canvas, scene, camera) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', stencil: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.6));
  renderer.transmissionResolutionScale = 0.5; // rubies sample a half-res copy of the scene
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;

  const size = new THREE.Vector2();
  renderer.getDrawingBufferSize(size);
  const target = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: 4 });
  const composer = new EffectComposer(renderer, target);

  const renderPass = new RenderPass(scene, camera);
  composer.addPass(renderPass);

  // objects that must not write depth into AO / DoF buffers (glass, prints)
  const noDepth = [];
  const hideNoDepth = (fn) => {
    const vis = noDepth.map((o) => o.visible);
    noDepth.forEach((o) => (o.visible = false));
    fn();
    noDepth.forEach((o, i) => (o.visible = vis[i]));
  };

  const gtao = new GTAOPass(scene, camera, size.x, size.y);
  gtao.output = GTAOPass.OUTPUT.Default;
  gtao.blendIntensity = 0.85;
  gtao.updateGtaoMaterial({ radius: 1.1, distanceExponent: 1.6, thickness: 1.2, scale: 1.2, samples: 16, distanceFallOff: 1, screenSpaceRadius: false });
  gtao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, radiusExponent: 1, rings: 2, samples: 16 });
  const gtaoRender = gtao.render.bind(gtao);
  gtao.render = (...a) => hideNoDepth(() => gtaoRender(...a));
  composer.addPass(gtao);

  const outline = new OutlinePass(new THREE.Vector2(size.x, size.y), scene, camera);
  outline.edgeStrength = 4.0;
  outline.edgeGlow = 0.6;
  outline.edgeThickness = 1.4;
  outline.pulsePeriod = 0;
  outline.visibleEdgeColor.set('#f3c38a');
  outline.hiddenEdgeColor.set('#5a4430');
  composer.addPass(outline);

  const bloom = new UnrealBloomPass(new THREE.Vector2(size.x / 2, size.y / 2), 0.16, 0.35, 2.2);
  const bloomSetSize = bloom.setSize.bind(bloom);
  bloom.setSize = (w, h) => bloomSetSize(Math.round(w / 2), Math.round(h / 2)); // bloom at quarter res
  bloom.enabled = false; // only the lume in night mode blooms
  composer.addPass(bloom);

  const bokeh = new BokehPass(scene, camera, { focus: 40, aperture: 0.0006, maxblur: 0.012 });
  bokeh.enabled = false;
  const bokehRender = bokeh.render.bind(bokeh);
  bokeh.render = (...a) => hideNoDepth(() => bokehRender(...a));
  composer.addPass(bokeh);

  composer.addPass(new OutputPass());

  function resize() {
    const w = window.innerWidth, h = window.innerHeight;
    renderer.setSize(w, h, false);
    composer.setPixelRatio(renderer.getPixelRatio());
    composer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }

  function setPixelRatio(pr) {
    renderer.setPixelRatio(pr);
    resize();
  }

  return { renderer, composer, gtao, outline, bloom, bokeh, noDepth, resize, setPixelRatio };
}
