import * as THREE from 'three';

// ─────────────────────────────────────────────────────────────
// Hover & click picking. Raycasts at most once per frame, skips
// glass, prints and ghosted (x-ray/isolated) meshes.
// ─────────────────────────────────────────────────────────────

export function createPicker({ camera, dom, root, onHover, onSelect }) {
  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  let dirty = false, inside = false;
  let hoverId = null;
  let down = null;
  const client = { x: 0, y: 0 };
  let pickables = [];

  function refresh() {
    pickables = [];
    root.traverse((o) => {
      if ((o.isMesh || o.isInstancedMesh) && o.userData.partId && !o.userData.noPick) pickables.push(o);
    });
  }
  refresh();

  dom.addEventListener('pointermove', (e) => {
    client.x = e.clientX; client.y = e.clientY;
    const r = dom.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    dirty = true;
    inside = true;
  });
  dom.addEventListener('pointerleave', () => {
    inside = false;
    if (hoverId) { hoverId = null; onHover(null, client); }
  });
  dom.addEventListener('pointerdown', (e) => {
    down = { x: e.clientX, y: e.clientY, t: performance.now(), button: e.button };
  });
  dom.addEventListener('pointerup', (e) => {
    if (!down || down.button !== 0) return;
    const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
    if (moved < 6 && performance.now() - down.t < 500) {
      const r = dom.getBoundingClientRect();
      ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      onSelect(cast());
    }
    down = null;
  });

  function isVisible(o) {
    for (let p = o; p; p = p.parent) if (!p.visible) return false;
    return true;
  }

  function cast() {
    ray.setFromCamera(ndc, camera);
    const hits = ray.intersectObjects(pickables, false);
    for (const h of hits) {
      const o = h.object;
      if (o.userData.ghosted || !isVisible(o)) continue;
      return o.userData.partId;
    }
    return null;
  }

  function frame(enabled = true) {
    if (!dirty || !inside || !enabled) return;
    dirty = false;
    const id = cast();
    if (id !== hoverId) {
      hoverId = id;
      onHover(id, client);
    } else if (id) {
      onHover(id, client, true);
    }
  }

  return { frame, refresh, get hoverId() { return hoverId; } };
}
