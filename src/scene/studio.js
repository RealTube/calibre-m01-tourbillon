import * as THREE from 'three';
import { backdrop } from '../materials/textures.js';

// ─────────────────────────────────────────────────────────────
// Product-photography studio: emissive "lightformers" (strip
// softboxes, a ring light, kickers) rendered once into a PMREM
// environment. Long rectangular reflections are what make
// polished metal look expensive.
// ─────────────────────────────────────────────────────────────

export function createStudio(renderer, scene) {
  const env = new THREE.Scene();
  const O = new THREE.Vector3();

  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(60, 48, 24),
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.); }',
      fragmentShader: `varying vec3 vP;
        void main(){
          float h = vP.y * 0.5 + 0.5;
          vec3 c = mix(vec3(0.012, 0.012, 0.014), vec3(0.05, 0.052, 0.058), smoothstep(0.2, 0.9, h));
          c += vec3(0.03, 0.022, 0.016) * smoothstep(0.45, 0.0, h);
          gl_FragColor = vec4(c, 1.0);
        }`,
    }),
  );
  env.add(dome);

  const panel = (w, h, intensity, color, pos, target = O) => {
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(w, h),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(intensity), side: THREE.DoubleSide }),
    );
    m.position.set(...pos);
    m.lookAt(target);
    env.add(m);
    return m;
  };
  panel(34, 7, 5.5, '#ffffff', [0, 20, 8]);        // overhead strip softbox
  panel(4.5, 30, 7.0, '#fff4e6', [-18, 3, 12]);   // warm vertical strip, left
  panel(4.5, 30, 6.0, '#e8f0ff', [18, 1, 10]);    // cool vertical strip, right
  panel(22, 9, 2.6, '#ffffff', [0, 9, -24]);      // back fill (for the caseback view)
  panel(30, 15, 1.9, '#f2f5ff', [4, 3, -32]);     // big softbox behind: lights the bridges through the caseback
  panel(8, 8, 5.0, '#ffe7cf', [14, -8, -16]);     // warm kicker behind
  panel(36, 4, 1.2, '#ffd9b8', [0, -20, 6]);      // low bounce
  panel(3, 16, 4.0, '#ffffff', [-8, -2, -20]);    // back strip
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(9, 0.55, 12, 96),
    new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffffff').multiplyScalar(4.2) }),
  );
  ring.position.set(0, 2, 32);
  ring.lookAt(O);
  env.add(ring);

  const pmrem = new THREE.PMREMGenerator(renderer);
  const envTex = pmrem.fromScene(env, 0.035).texture;
  scene.environment = envTex;
  scene.environmentIntensity = 1.0;
  pmrem.dispose();

  scene.background = backdrop();
  scene.backgroundIntensity = 1;

  // key light rides with the camera so self-shadowing always reads
  const key = new THREE.DirectionalLight('#fff5ea', 1.7);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  const sc = key.shadow.camera;
  sc.left = -34; sc.right = 34; sc.top = 34; sc.bottom = -34; sc.near = 1; sc.far = 260;
  key.shadow.bias = -0.00025;
  key.shadow.normalBias = 0.025;
  key.shadow.radius = 3;
  scene.add(key, key.target);

  const tmp = new THREE.Vector3();
  function follow(camera, target) {
    // up-left of the camera, pointing at the target
    tmp.set(-0.55, 0.75, 0.35).applyQuaternion(camera.quaternion).normalize();
    key.position.copy(target).addScaledVector(tmp, 120);
    key.target.position.copy(target);
  }

  return { key, follow, envTex };
}
