import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

// ─────────────────────────────────────────────────────────────
// Orbit camera with cinematic fly-to (interpolated in spherical
// coordinates so paths arc around the watch instead of through
// it) and a follow mode that rides along with a moving part.
// ─────────────────────────────────────────────────────────────

// pos gives the viewing direction; `fit` is the radius (mm) framed at any aspect
export const PRESETS = {
  hero: { pos: [30, -34, 76], target: [0, -1.5, -1], fit: 27 },
  dial: { pos: [0, -3, 86], target: [0, -1, 0], fit: 25 },
  movement: { pos: [-6, 4, -84], target: [0, 0, -3], fit: 25 },
  profile: { pos: [82, 12, 36], target: [0, 0, -2], fit: 30 },
  tourbillon: { pos: [6.5, -19.5, 21], target: [0, -9, 1.4], dof: true },
  exploded: { pos: [70, 62, 82], target: [0, 3, -1], fit: 56 },
};

const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

export function createCameraRig(camera, dom) {
  const controls = new OrbitControls(camera, dom);
  controls.enableDamping = true;
  controls.dampingFactor = 0.075;
  controls.rotateSpeed = 0.65;
  controls.zoomSpeed = 0.9;
  controls.panSpeed = 0.7;
  controls.minDistance = 9;
  controls.maxDistance = 320;
  controls.screenSpacePanning = true;

  let tween = null;
  let follow = null;
  const sph0 = new THREE.Spherical(), sph1 = new THREE.Spherical(), sph = new THREE.Spherical();
  const off = new THREE.Vector3(), tgt = new THREE.Vector3();

  function flyTo(pos, target, duration = 1.5) {
    const p1 = new THREE.Vector3(...(pos.isVector3 ? pos.toArray() : pos));
    const t1 = new THREE.Vector3(...(target.isVector3 ? target.toArray() : target));
    sph0.setFromVector3(off.copy(camera.position).sub(controls.target));
    sph1.setFromVector3(off.copy(p1).sub(t1));
    // shortest way around
    let dTheta = sph1.theta - sph0.theta;
    if (dTheta > Math.PI) dTheta -= Math.PI * 2;
    if (dTheta < -Math.PI) dTheta += Math.PI * 2;
    tween = {
      t: 0, duration,
      t0: controls.target.clone(), t1,
      r0: sph0.radius, r1: sph1.radius,
      ph0: sph0.phi, ph1: sph1.phi,
      th0: sph0.theta, dTheta,
    };
    controls.enabled = false;
  }

  function setFollow(getCenter) {
    follow = getCenter ? { getCenter, last: getCenter().clone() } : null;
  }

  function update(dt) {
    if (tween) {
      tween.t = Math.min(1, tween.t + dt / tween.duration);
      const e = ease(tween.t);
      tgt.lerpVectors(tween.t0, tween.t1, e);
      sph.radius = Math.exp(Math.log(tween.r0) + (Math.log(tween.r1) - Math.log(tween.r0)) * e);
      sph.phi = tween.ph0 + (tween.ph1 - tween.ph0) * e;
      sph.theta = tween.th0 + tween.dTheta * e;
      controls.target.copy(tgt);
      camera.position.setFromSpherical(sph).add(tgt);
      camera.lookAt(tgt);
      if (tween.t >= 1) {
        tween = null;
        controls.enabled = true;
      }
    } else if (follow) {
      const c = follow.getCenter();
      off.copy(c).sub(follow.last);
      camera.position.add(off);
      controls.target.add(off);
      follow.last.copy(c);
    }
    if (!tween) controls.update();
  }

  controls.addEventListener('start', () => {
    if (tween) { tween = null; controls.enabled = true; }
  });

  return {
    controls,
    flyTo,
    setFollow,
    update,
    get busy() { return !!tween; },
    cancel() { tween = null; controls.enabled = true; },
  };
}
