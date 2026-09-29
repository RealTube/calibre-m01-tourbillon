import * as THREE from 'three';
import { mat, grainedFace } from '../materials/library.js';
import { TEETH, MODULE, POS, Z, CAGE, PADS } from './layout.js';
import * as G from '../geometry/gear.js';
import { jewelGeometry, chatonGeometry, screwGeometry, cylinderZ, arborGeometry, pillarGeometry } from '../geometry/details.js';
import { balanceWheelGeometry, rollerGeometry, hairspringGeometry, breathingMaterial } from '../geometry/balance.js';
import { palletForkGeometry } from '../geometry/escapement.js';
import { extrudeSDF } from '../geometry/sdf2d.js';
import * as BR from '../geometry/bridges.js';
import * as CASE from '../geometry/case.js';
import * as DIAL from '../geometry/dial.js';
import * as STRAP from '../geometry/strap.js';
import { PARTS } from '../parts/registry.js';

const DEG = Math.PI / 180;

/**
 * Builds the complete watch. Returns:
 *  root      – THREE.Group
 *  parts     – Map(id → { id, meta, meshes[] })
 *  nodes     – explode nodes { obj, base, offset, delay }
 *  update(s) – applies a kinematic state
 *  noAO      – meshes excluded from AO / depth-of-field depth
 */
export function buildWatch() {
  const M = mat();
  const root = new THREE.Group();
  root.name = 'watch';
  const parts = new Map();
  const nodes = [];
  const noAO = [];
  const anim = {};
  let components = 0;
  let jewels = 0;

  const entry = (id) => {
    if (!parts.has(id)) parts.set(id, { id, meta: PARTS[id], meshes: [], pieces: 0 });
    return parts.get(id);
  };
  function mesh(geo, material, partId, { shadow = true, piece = true, pick = true } = {}) {
    const m = new THREE.Mesh(geo, material);
    m.castShadow = shadow;
    m.receiveShadow = true;
    if (partId) {
      m.userData.partId = partId;
      entry(partId).meshes.push(m);
      if (piece) { entry(partId).pieces++; components++; }
    }
    if (!pick) m.userData.noPick = true;
    return m;
  }
  function group(name, parent, x = 0, y = 0, z = 0) {
    const g = new THREE.Group();
    g.name = name;
    g.position.set(x, y, z);
    parent.add(g);
    return g;
  }
  function explode(g, offset) {
    nodes.push({ obj: g, base: g.position.clone(), offset: new THREE.Vector3(...offset) });
  }
  function jewel(parent, x, y, z, { facing = 1, R = 0.4, chaton = true } = {}) {
    const j = mesh(jewelGeometry(R), M.ruby, 'jewels');
    j.position.set(x, y, z + facing * 0.02);
    if (facing < 0) j.rotation.x = Math.PI;
    parent.add(j);
    jewels++;
    if (chaton) {
      const c = mesh(chatonGeometry(R), M.giltPolished, 'jewels');
      c.position.set(x, y, z);
      if (facing < 0) c.rotation.x = Math.PI;
      parent.add(c);
    }
  }
  const SLOT = 0.35; // every slot aligned, a finisher's signature
  function screw(parent, x, y, z, { facing = 1, R = 0.36, H = 0.26, material = M.blued } = {}) {
    const s = mesh(screwGeometry(R, H), material, 'screws');
    s.position.set(x, y, z);
    s.rotation.set(facing < 0 ? Math.PI : 0, 0, facing < 0 ? -SLOT : SLOT);
    parent.add(s);
  }
  const wheelMats = (base, polished, r) => [grainedFace(base, r), polished];

  const movement = group('movement', root);

  // ═════════════ MAIN PLATE ═════════════
  const plate = group('mainplate', movement, 0, 0, Z.plateBottom);
  plate.add(mesh(extrudeSDF(BR.mainplateSDF(), [-16.1, -16.1, 16.1, 16.1], 0.9, { h: 0.05, bevel: 0.07 }), [M.plate, M.bridgeChamfer], 'mainplate'));
  jewel(plate, ...POS.Th, 0.9);
  jewel(plate, ...POS.CW, 0.9);
  jewel(plate, 0, 0, 0.9 - 0.21, { R: 0.52 }); // centre arbor, set flush under the cannon pinion
  explode(plate, [0, 0, 0]);

  // pillars between plate and bridges
  const pillars = group('pillars', movement, 0, 0, Z.bridgeBottom);
  for (const [x, y] of [...PADS.barrel, ...PADS.train, ...PADS.tourbillon]) {
    const p = mesh(pillarGeometry(0.5, Z.plateBottom - Z.bridgeBottom), M.steelPolished, 'pillars');
    p.position.set(x, y, 0);
    pillars.add(p);
  }
  explode(pillars, [0, 0, -12]);

  // ═════════════ GOING TRAIN ═════════════
  // centre wheel & pinion (1 rev/h)
  {
    const g = group('centerWheel', movement, ...POS.C, 0);
    const wg = G.wheelGeometry({ z: TEETH.centerWheel, m: MODULE.train, thickness: 0.22, crossings: 5, sweep: 0.5 });
    const w = mesh(wg, wheelMats(M.gilt, M.giltPolished, wg.userData.r + 0.2), 'centerWheel');
    w.position.z = Z.centerWheel;
    const p = mesh(G.pinionGeometry({ z: TEETH.centerPinion, m: MODULE.train, length: 0.45 }), M.steelPolished, 'centerWheel');
    p.position.z = Z.level2;
    const a = mesh(arborGeometry(0.34, Z.bridgeBottom - 0.1, 0.2), M.steelPolished, 'centerWheel', { piece: false });
    const hub = mesh(cylinderZ(0.62, 0.34, 32), M.giltPolished, 'centerWheel', { piece: false });
    hub.position.z = Z.centerWheel + 0.2;
    g.add(w, p, a, hub);
    anim.center = g;
    explode(g, [0, 0, -6]);
  }
  // third wheel & pinion
  {
    const g = group('thirdWheel', movement, ...POS.Th, 0);
    const wg = G.wheelGeometry({ z: TEETH.thirdWheel, m: MODULE.train, thickness: 0.2, crossings: 5, sweep: -0.5 });
    const w = mesh(wg, wheelMats(M.gilt, M.giltPolished, wg.userData.r + 0.2), 'thirdWheel');
    w.position.z = Z.level2;
    const p = mesh(G.pinionGeometry({ z: TEETH.thirdPinion, m: MODULE.train, length: 0.42 }), M.steelPolished, 'thirdWheel');
    p.position.z = Z.centerWheel;
    const a = mesh(arborGeometry(0.2, Z.bridgeBottom - 0.1, -0.05), M.steelPolished, 'thirdWheel', { piece: false });
    const hub = mesh(cylinderZ(0.5, 0.3, 32), M.giltPolished, 'thirdWheel', { piece: false });
    hub.position.z = Z.level2 - 0.22;
    g.add(w, p, a, hub);
    anim.third = g;
    explode(g, [0, 0, -10]);
  }

  // ═════════════ BARREL & MAINSPRING ═════════════
  let mainspring;
  {
    const g = group('barrel', movement, ...POS.B, 0);
    // toothed ring
    const { pts } = G.toothOutline({ z: TEETH.barrel, m: MODULE.train });
    const shape = new THREE.Shape(pts);
    const hole = new THREE.Path();
    hole.absarc(0, 0, 3.95, 0, Math.PI * 2, true);
    shape.holes.push(hole);
    const ringGeo = new THREE.ExtrudeGeometry(shape, { depth: 0.24, bevelEnabled: true, bevelThickness: 0.03, bevelSize: 0.03, bevelOffset: -0.03, bevelSegments: 2, curveSegments: 64 });
    ringGeo.translate(0, 0, -0.15);
    const ring = mesh(ringGeo, wheelMats(M.gilt, M.giltPolished, 4.6), 'barrel');
    ring.position.z = Z.level2;
    // drum wall
    const drumProf = [[3.95, Z.barrelBottom], [4.12, Z.barrelBottom], [4.12, Z.barrelTop], [3.95, Z.barrelTop], [3.95, Z.barrelBottom]].map(([r, z]) => new THREE.Vector2(r, z));
    const drumGeo = new THREE.LatheGeometry(drumProf, 96);
    drumGeo.rotateX(Math.PI / 2);
    const drum = mesh(drumGeo, M.giltPolished, 'barrel', { piece: false });
    // openworked covers
    const coverShape = new THREE.Shape();
    coverShape.absarc(0, 0, 4.02, 0, Math.PI * 2, false);
    coverShape.holes.push(...G.crossingHoles({ n: 5, hub: 1.05, rim: 3.45, spokeW: 0.3, sweep: 0.7 }));
    const coverGeo = new THREE.ExtrudeGeometry(coverShape, { depth: 0.08, bevelEnabled: true, bevelThickness: 0.03, bevelSize: 0.03, bevelOffset: -0.03, bevelSegments: 2, curveSegments: 64 });
    for (const z of [Z.barrelTop - 0.14, Z.barrelBottom]) {
      const c = mesh(coverGeo, wheelMats(M.gilt, M.giltPolished, 4.1), 'barrel', { piece: z === Z.barrelTop - 0.14 });
      c.position.z = z;
      g.add(c);
    }
    g.add(ring, drum);
    anim.barrel = g;
    explode(g, [0, 0, -15]);

    // mainspring: CPU-updated spiral ribbon between the covers
    const msGroup = group('mainspring', g, 0, 0, (Z.barrelTop + Z.barrelBottom) / 2);
    mainspring = makeMainspring();
    const ms = mesh(mainspring.geometry, M.mainspring, 'mainspring');
    msGroup.add(ms);
    explode(msGroup, [0, 0, -4]);
  }

  // ═════════════ BRIDGES (back) ═════════════
  const bridgeDefs = [
    ['barrelBridge', BR.barrelBridgeSDF(), -21, PADS.barrel, [], [-3.6, -1.8, 16, 16.2]],
    ['trainBridge', BR.trainBridgeSDF(), -20, PADS.train, [POS.C, POS.Th], [-16.2, -7.5, 2, 14.5]],
    ['tourbillonBridge', BR.tourbillonBridgeSDF(), -20, PADS.tourbillon, [POS.T], [-10.5, -14.6, 10.5, -6.8]],
  ];
  for (const [id, fn, ex, pads, jewelPts, bounds] of bridgeDefs) {
    const g = group(id, movement, 0, 0, Z.bridgeTop);
    g.add(mesh(extrudeSDF(fn, bounds, Z.bridgeBottom - Z.bridgeTop, { h: 0.05, bevel: 0.08 }), [M.bridge, M.bridgeChamfer], id));
    for (const [x, y] of pads) screw(g, x, y, 0, { facing: -1, R: 0.42 });
    for (const [x, y] of jewelPts) {
      jewel(g, x, y, 0.02, { facing: -1, R: 0.45 });
      // two tiny chaton screws
      for (const s of [1, -1]) screw(g, x + s * 0.95, y + s * 0.2, 0, { facing: -1, R: 0.2, H: 0.15 });
    }
    explode(g, [0, 0, ex]);
  }

  // ═════════════ KEYLESS WORKS ═════════════
  {
    // ratchet wheel on the barrel arbor
    const g = group('ratchet', movement, ...POS.B, 0);
    const rg = G.ratchetGeometry({ z: TEETH.ratchet, rTip: (MODULE.keyless * TEETH.ratchet) / 2 + 0.1, depth: 0.3, thickness: 0.28 });
    const r = mesh(rg, wheelMats(M.steelSatin, M.steelPolished, 4.0), 'ratchet');
    r.position.z = Z.ratchet;
    const a = mesh(arborGeometry(0.5, Z.ratchet, Z.plateBottom + 0.05), M.steelPolished, 'ratchet', { piece: false });
    g.add(r, a);
    screw(g, 0, 0, Z.ratchet - 0.14, { facing: -1, R: 0.75, H: 0.27 });
    anim.ratchet = g;
    explode(g, [0, 0, -27]);
  }
  {
    // crown wheel (spur on top) + contrate (below) on one arbor
    const g = group('crownWheel', movement, ...POS.CW, 0);
    const wg = G.wheelGeometry({ z: TEETH.crownWheel, m: MODULE.keyless, thickness: 0.26, crossings: 0 });
    const w = mesh(wg, wheelMats(M.steelSatin, M.steelPolished, 1.9), 'crownWheel');
    w.position.z = Z.ratchet;
    const c = mesh(G.contrateGeometry({ z: TEETH.contrate, r: 0.9 }), M.steelPolished, 'crownWheel');
    c.position.z = -1.95;
    const a = mesh(arborGeometry(0.22, Z.ratchet - 0.1, -1.9), M.steelPolished, 'crownWheel', { piece: false });
    g.add(w, c, a);
    screw(g, 0, 0, Z.ratchet - 0.13, { facing: -1, R: 0.5, H: 0.26 });
    anim.crownWheel = g;
    explode(g, [0, 0, -27]);
  }
  {
    // click & click spring
    const [kx, ky] = BR.CLICK_PIVOT;
    const g = group('click', movement, kx, ky, Z.ratchet);
    const { pawl, spring } = BR.clickSDF();
    const pg = extrudeSDF(pawl, [-2.2, -2.2, 2.2, 2.2], 0.22, { h: 0.02, bevel: 0.03 });
    pg.translate(0, 0, -0.11);
    const pawlMesh = mesh(pg, [M.steelBlack, M.steelPolished], 'click');
    const pawlPivot = group('pawl', g);
    pawlPivot.add(pawlMesh);
    const sg = extrudeSDF(spring, [-1.6, -1.6, 1.6, 1.6], 0.18, { h: 0.015, bevel: 0.02 });
    sg.translate(0, 0, -0.09);
    g.add(mesh(sg, [M.steelPolished, M.steelPolished], 'click'));
    screw(g, 0, 0, -0.12, { facing: -1, R: 0.34, H: 0.22 });
    anim.click = pawlPivot;
    explode(g, [0, 0, -27]);
  }
  {
    // winding stem + winding pinion (axis along +x)
    const g = group('stem', movement, 0, 0, Z.stem);
    const stemGeo = new THREE.CylinderGeometry(0.33, 0.33, 12.8, 24);
    stemGeo.rotateZ(Math.PI / 2);
    stemGeo.translate(8.6 + 6.4, 0, 0);
    const pin = G.pinionGeometry({ z: TEETH.windingPinion, m: 0.075, length: 0.55 });
    pin.rotateY(Math.PI / 2);
    pin.translate(POS.CW[0] + 0.9, 0, 0);
    g.add(mesh(stemGeo, M.steelPolished, 'stem'), mesh(pin, M.steelPolished, 'stem'));
    anim.stem = g;
    explode(g, [9, 0, 0]);
  }

  // ═════════════ MOTION WORKS (front) ═════════════
  {
    const g = group('cannonPinion', movement, 0, 0, 0);
    const p = mesh(G.pinionGeometry({ z: TEETH.cannonPinion, m: MODULE.motion, length: 0.3 }), M.steelPolished, 'cannonPinion');
    p.position.z = Z.motion;
    const pipe = mesh(cylinderZ(0.36, Z.minuteHand - 0.15, 24, 0.3), M.steelPolished, 'cannonPinion', { piece: false });
    pipe.position.z = (Z.minuteHand + 0.15) / 2 + 0.02;
    g.add(p, pipe);
    anim.cannon = g;
    explode(g, [0, 0, 13]);
  }
  {
    const g = group('minuteWheel', movement, ...POS.MW, 0);
    const wg = G.wheelGeometry({ z: TEETH.minuteWheel, m: MODULE.motion, thickness: 0.12, crossings: 4, sweep: 0.3, hubR: 0.4, rimW: 0.2, spokeW: 0.08 });
    const w = mesh(wg, wheelMats(M.gilt, M.giltPolished, wg.userData.r + 0.1), 'minuteWheel');
    w.position.z = Z.motion;
    const p = mesh(G.pinionGeometry({ z: TEETH.minutePinion, m: MODULE.hour, length: 0.28 }), M.steelPolished, 'minuteWheel');
    p.position.z = Z.hourWheel;
    const a = mesh(arborGeometry(0.12, 0.0, 1.0), M.steelPolished, 'minuteWheel', { piece: false });
    g.add(w, p, a);
    anim.minuteWheel = g;
    explode(g, [0, 0, 15]);
  }
  {
    const g = group('hourWheel', movement, 0, 0, 0);
    const wg = G.wheelGeometry({ z: TEETH.hourWheel, m: MODULE.hour, thickness: 0.12, crossings: 4, sweep: -0.3, hubR: 0.72, rimW: 0.2, spokeW: 0.09 });
    const w = mesh(wg, wheelMats(M.gilt, M.giltPolished, wg.userData.r + 0.1), 'hourWheel');
    w.position.z = Z.hourWheel;
    const pipe = mesh(cylinderZ(0.56, Z.hourHand - Z.hourWheel, 32, 0.5), M.giltPolished, 'hourWheel', { piece: false });
    pipe.position.z = (Z.hourHand + Z.hourWheel) / 2;
    g.add(w, pipe);
    anim.hourWheel = g;
    explode(g, [0, 0, 17]);
  }

  // ═════════════ TOURBILLON ═════════════
  const { E, F, dFB, pillars: cagePillars } = BR.CAGE_PTS;
  {
    const ring = group('fixedRing', movement, ...POS.T, CAGE.fixedRing);
    const rg = G.internalRingGeometry({ z: TEETH.fixedRing, m: MODULE.tourbillon, outerR: 4.35, thickness: 0.18 });
    ring.add(mesh(rg, wheelMats(M.gilt, M.giltPolished, 4.4), 'fixedRing'));
    const ears = extrudeSDF(BR.fixedRingEarsSDF(), [-7, -7, 7, 7], 0.18, { h: 0.03, bevel: 0.03 });
    ears.translate(0, 0, -0.09);
    ring.add(mesh(ears, [M.giltPolished, M.giltPolished], 'fixedRing', { piece: false }));
    explode(ring, [0, 0, 3]);
  }

  const cage = group('cage', movement, ...POS.T, 0);
  anim.cage = cage;
  explode(cage, [0, 0, 8]);
  {
    // lower frame + pillars + cage pinion & arbor
    const lower = group('cageLower', cage, 0, 0, CAGE.lower[0]);
    lower.add(mesh(extrudeSDF(BR.cageLowerSDF(), [-6.1, -6.1, 6.1, 6.1], CAGE.lower[1] - CAGE.lower[0], { h: 0.03, bevel: 0.04 }), [M.titanium, M.steelPolished], 'cageLower'));
    for (const [x, y] of cagePillars) {
      const p = mesh(pillarGeometry(0.3, CAGE.upper[0] - CAGE.lower[1]), M.steelPolished, 'cageLower');
      p.position.set(x, y, CAGE.lower[1] - CAGE.lower[0]);
      lower.add(p);
    }
    const topZ = CAGE.lower[1] - CAGE.lower[0];
    jewel(lower, 0, 0, topZ, { R: 0.34 });
    const capL = mesh(cylinderZ(0.28, 0.05, 32), M.ruby, 'jewels');
    capL.position.z = -0.03;
    lower.add(capL);
    jewels++;
    jewel(lower, E[0], E[1], topZ, { R: 0.3 });
    jewel(lower, F[0], F[1], topZ, { R: 0.28 });
    // banking pins for the pallet fork
    for (const s of [1, -1]) {
      const b = mesh(cylinderZ(0.05, 0.45, 10), M.giltPolished, 'cageLower', { piece: false });
      b.position.set(F[0] - 0.85, s * 0.34, topZ + 0.22);
      lower.add(b);
    }
    explode(lower, [0, 0, 0]);

    const cp = group('cagePinion', cage, 0, 0, 0);
    const pin = mesh(G.pinionGeometry({ z: TEETH.cagePinion, m: MODULE.train, length: 0.46 }), M.steelPolished, 'cagePinion');
    pin.position.z = Z.level2;
    const arbor = mesh(arborGeometry(0.3, Z.bridgeBottom - 0.1, CAGE.lower[0]), M.steelPolished, 'cagePinion', { piece: false });
    cp.add(pin, arbor);
  }
  {
    // escape wheel & pinion
    const g = group('escapeWheel', cage, E[0], E[1], 0);
    const ew = G.escapeWheelGeometry({ teeth: TEETH.escapeWheel, rTip: CAGE.escapeTip, rRoot: 1.32, thickness: 0.16 });
    const wheel = mesh(ew, [M.steelBlack, M.steelPolished], 'escapeWheel');
    wheel.position.z = CAGE.escape;
    // phase the wheel on its arbor so a tooth rests on the engaged pallet at every beat
    const P = (2 * Math.PI) / TEETH.escapeWheel;
    const escRel0 = G.meshAngleInternal(0, TEETH.fixedRing, TEETH.escapePinion, 0);
    wheel.rotation.z = ((147 * DEG - 0.285 * P - escRel0) % P + P) % P;
    const pin = mesh(G.pinionGeometry({ z: TEETH.escapePinion, m: MODULE.tourbillon, length: 0.3 }), M.steelPolished, 'escapeWheel');
    pin.position.z = CAGE.fixedRing;
    const arbor = mesh(arborGeometry(0.1, CAGE.fixedRing - 0.2, CAGE.upper[0] + 0.15), M.steelPolished, 'escapeWheel', { piece: false });
    const hub = mesh(cylinderZ(0.26, 0.24, 20), M.steelPolished, 'escapeWheel', { piece: false });
    hub.position.z = CAGE.escape;
    g.add(wheel, pin, arbor, hub);
    anim.escape = g;
    explode(g, [0, 0, 2.2]);
  }
  {
    // pallet fork
    const g = group('palletFork', cage, F[0], F[1], CAGE.fork);
    const fk = palletForkGeometry({ rTip: CAGE.escapeTip, dFB });
    g.add(mesh(fk.body, [M.steelBlack, M.steelPolished], 'palletFork'));
    for (const s of fk.stones) { g.add(mesh(s, M.ruby, 'palletFork')); jewels++; }
    g.add(mesh(fk.dart, M.steelPolished, 'palletFork', { piece: false }));
    const arbor = mesh(arborGeometry(0.08, -0.7, CAGE.upper[0] - CAGE.fork + 0.15), M.steelPolished, 'palletFork', { piece: false });
    g.add(arbor);
    anim.fork = g;
    explode(g, [0, 0, 3.8]);
  }
  let hairspringMat;
  {
    // balance, roller, impulse jewel, staff
    const g = group('balance', cage, 0, 0, 0);
    const bw = balanceWheelGeometry({});
    const rim = mesh(bw.rim, wheelMats(M.gilt, M.giltPolished, 3.5), 'balance');
    rim.position.z = CAGE.balance;
    const screws = mesh(bw.screws, M.giltPolished, 'balance', { piece: false });
    screws.position.z = CAGE.balance;
    const rl = rollerGeometry({});
    const roller = mesh(rl.disc, M.steelPolished, 'balance', { piece: false });
    roller.position.z = CAGE.roller;
    const ipin = mesh(rl.pin, M.ruby, 'balance', { piece: false });
    ipin.position.z = CAGE.roller;
    jewels++;
    const staff = mesh(arborGeometry(0.11, CAGE.lower[1] - 0.15, CAGE.upper[1] - 0.1), M.steelPolished, 'balance', { piece: false });
    const collet = mesh(cylinderZ(0.42, 0.16, 20), M.steelPolished, 'balance', { piece: false });
    collet.position.z = CAGE.hairspring;
    g.add(rim, screws, roller, ipin, staff, collet);
    anim.balance = g;
    explode(g, [0, 0, 6.5]);

    // hairspring — fixed at the stud, turned at the collet by the shader
    const hs = group('hairspring', cage, 0, 0, CAGE.hairspring);
    hairspringMat = breathingMaterial(M.hairspring);
    hs.add(mesh(hairspringGeometry({}), hairspringMat, 'hairspring', { shadow: false }));
    explode(hs, [0, 0, 8.4]);
  }
  {
    // upper frame, stud carrier, jewels, pillar screws
    const upper = group('cageUpper', cage, 0, 0, CAGE.upper[0]);
    const t = CAGE.upper[1] - CAGE.upper[0];
    upper.add(mesh(extrudeSDF(BR.cageUpperSDF(), [-6.2, -6.2, 6.2, 7.2], t, { h: 0.03, bevel: 0.05 }), [M.steelBlack, M.steelPolished], 'cageUpper'));
    jewel(upper, 0, 0, t, { R: 0.36 });
    // balance end-stone (cap jewel) above the hole jewel
    const cap = mesh(cylinderZ(0.3, 0.05, 32), M.ruby, 'jewels');
    cap.position.z = t + 0.24;
    upper.add(cap);
    jewels++;
    jewel(upper, E[0], E[1], t, { R: 0.3 });
    jewel(upper, F[0], F[1], t, { R: 0.28 });
    for (const [x, y] of cagePillars) screw(upper, x, y, t, { R: 0.3, H: 0.2 });
    // hairspring stud & carrier
    const stud = mesh(new THREE.BoxGeometry(0.34, 0.24, 0.3), M.steelPolished, 'cageUpper', { piece: false });
    stud.position.set(2.62, 0, CAGE.hairspring - CAGE.upper[0]);
    const post = mesh(cylinderZ(0.1, CAGE.upper[0] - CAGE.hairspring, 12), M.steelPolished, 'cageUpper', { piece: false });
    post.position.set(2.75, 0, (CAGE.hairspring - CAGE.upper[0]) / 2);
    upper.add(stud, post);
    explode(upper, [0, 0, 11]);
  }

  // ═════════════ DIAL ═════════════
  const dial = group('dial', root, 0, 0, Z.dial);
  {
    M.dialRing.map = DIAL.dialPrintTexture();
    M.dialRing.needsUpdate = true;
    dial.add(mesh(DIAL.chapterRingGeometry(Z.dialT), [M.dialRing, M.accentGold], 'dial'));
    for (const [x, y] of DIAL.dialFeet) {
      const f = mesh(cylinderZ(0.22, Z.dial - Z.plateTop, 12), M.giltPolished, 'dial', { piece: false });
      f.position.set(x, y, -(Z.dial - Z.plateTop) / 2);
      dial.add(f);
    }
    const single = DIAL.indexGeometry(false), dbl = DIAL.indexGeometry(true);
    for (let h = 1; h <= 12; h++) {
      if (h === 6) continue;
      const a = Math.PI / 2 - (h / 12) * Math.PI * 2;
      const geo = h === 12 ? dbl : single;
      const ig = group('index' + h, dial, 14.08 * Math.cos(a), 14.08 * Math.sin(a), Z.dialT);
      ig.rotation.z = a - Math.PI / 2;
      ig.add(mesh(geo.body, [M.accentGold, M.accentGold], 'indices'), mesh(geo.insert, M.lume, 'indices', { piece: false }));
    }
    explode(dial, [0, 0, 23]);
  }
  {
    const g = group('sapphireDial', root, 0, 0, Z.sapphireDial);
    const shapes = DIAL.sapphireDiscShapes();
    const disc = mesh(new THREE.ExtrudeGeometry(shapes, { depth: 0.12, bevelEnabled: false, curveSegments: 1 }), M.sapphireDial, 'sapphireDial', { shadow: false, pick: false });
    const printMat = M.print.clone();
    printMat.map = DIAL.sapphirePrintTexture();
    const print = mesh(new THREE.ShapeGeometry(shapes), printMat, 'sapphireDial', { shadow: false, piece: false, pick: false });
    print.position.z = 0.125;
    g.add(disc, print);
    noAO.push(disc, print);
    explode(g, [0, 0, 27]);
  }

  // ═════════════ HANDS ═════════════
  {
    const hh = DIAL.handGeometry({ length: 9.3, width: 1.8, tail: 2.2, hub: 0.95, thickness: 0.13 });
    const g = group('hourHand', root, 0, 0, Z.hourHand);
    g.add(mesh(hh.body, [M.accentGold, M.accentGold], 'hourHand'), mesh(hh.lume, M.lume, 'hourHand', { piece: false }));
    anim.hourHand = g;
    explode(g, [0, 0, 31]);
    const mh = DIAL.handGeometry({ length: 14.6, width: 1.36, tail: 2.9, hub: 0.8, thickness: 0.12 });
    const g2 = group('minuteHand', root, 0, 0, Z.minuteHand);
    g2.add(mesh(mh.body, [M.accentGold, M.accentGold], 'minuteHand'), mesh(mh.lume, M.lume, 'minuteHand', { piece: false }));
    const cap = new THREE.SphereGeometry(0.5, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2);
    cap.rotateX(Math.PI / 2);
    const capM = mesh(cap, M.accentGold, 'minuteHand', { piece: false });
    capM.position.z = 0.12;
    capM.scale.z = 0.5;
    g2.add(capM);
    anim.minuteHand = g2;
    explode(g2, [0, 0, 34]);
  }

  // ═════════════ CASE ═════════════
  {
    const mc = group('midcase', root);
    mc.add(mesh(CASE.midcaseGeometry(), M.caseBrushed, 'midcase'));
    const lug = CASE.lugGeometry();
    for (const [sx, rot] of [[1, 0], [-1, 0], [1, Math.PI], [-1, Math.PI]]) {
      const l = mesh(lug, [M.caseBrushed, M.casePolished], 'midcase');
      l.position.x = sx * 12.42;
      if (rot) { l.position.x = -sx * 12.42; l.rotation.z = rot; }
      mc.add(l);
    }
    explode(mc, [0, 0, -52]);
  }
  {
    const b = group('bezel', root);
    b.add(mesh(CASE.bezelGeometry(), M.casePolished, 'bezel'));
    explode(b, [0, 0, 54]);
    const c = group('crystal', root);
    const cm = mesh(CASE.crystalGeometry(), M.sapphire, 'crystal', { shadow: false, pick: false });
    cm.renderOrder = 10;
    c.add(cm);
    noAO.push(cm);
    explode(c, [0, 0, 62]);
  }
  {
    const cb = group('caseback', root);
    cb.add(mesh(CASE.casebackGeometry(), M.casePolished, 'caseback'));
    const engr = new THREE.RingGeometry(15.3, 18.15, 160, 1);
    engr.rotateY(Math.PI);
    const engrMat = new THREE.MeshStandardMaterial({ map: CASE.casebackEngraving(18.15, jewels), transparent: true, metalness: 0.6, roughness: 0.55, color: '#ffffff', depthWrite: false });
    const em = mesh(engr, engrMat, 'caseback', { piece: false, shadow: false, pick: false });
    em.position.z = -5.765;
    cb.add(em);
    noAO.push(em);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + Math.PI / 6;
      screw(cb, 17.62 * Math.cos(a), 17.62 * Math.sin(a), -5.76, { facing: -1, R: 0.42, H: 0.2, material: M.casePolished });
    }
    explode(cb, [0, 0, -38]);
    const bc = group('backCrystal', root);
    const bcm = mesh(CASE.backCrystalGeometry(), M.sapphire, 'backCrystal', { shadow: false, pick: false });
    bc.add(bcm);
    noAO.push(bcm);
    explode(bc, [0, 0, -33]);
  }
  {
    const cg = group('crown', root, 0, 0, Z.stem);
    const { crown, tube } = CASE.crownGeometry({ x0: 20.35 });
    cg.add(mesh(crown, M.casePolished, 'crown'), mesh(tube, M.casePolished, 'crown', { piece: false }));
    const capTex = CASE.crownCapTexture();
    const cap = mesh(new THREE.CircleGeometry(1.55, 48), new THREE.MeshStandardMaterial({ map: capTex, transparent: true, metalness: 0.8, roughness: 0.4, depthWrite: false }), 'crown', { piece: false, shadow: false, pick: false });
    cap.rotation.y = Math.PI / 2;
    cap.position.x = 20.35 + 4.03;
    cg.add(cap);
    noAO.push(cap);
    anim.crown = cg;
    explode(cg, [18, 0, 0]);
  }

  // ═════════════ STRAP ═════════════
  for (const dir of [1, -1]) {
    const g = group(dir > 0 ? 'strapTop' : 'strapBottom', root);
    const L = dir > 0 ? 38 : 60;
    const strap = STRAP.strapGeometry(dir, L, { tip: dir > 0 ? 'square' : 'point' });
    g.add(mesh(strap.geometry, M.leather, 'strap'));
    const st = STRAP.stitchInstances(strap, M.stitch);
    st.userData.partId = 'strap';
    st.castShadow = false;
    g.add(st);
    entry('strap').meshes.push(st);
    // spring bar
    const bar = mesh(new THREE.CylinderGeometry(0.45, 0.45, 22.6, 16).rotateZ(Math.PI / 2), M.steelPolished, 'strap', { piece: true });
    bar.position.set(0, dir * 23.35, -1.4);
    g.add(bar);
    if (dir < 0) {
      for (const h of STRAP.strapHoles(strap)) {
        const hole = mesh(cylinderZ(0.62, 0.06, 20), M.leatherEdge, 'strap', { piece: false, shadow: false });
        hole.position.copy(h.p);
        hole.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), h.n);
        g.add(hole);
      }
    } else {
      const f = strap.frames[strap.frames.length - 1];
      const bk = STRAP.buckleGeometry(20.8);
      const bg = group('buckle', g);
      const X = new THREE.Vector3().crossVectors(f.t, f.n);
      bg.matrixAutoUpdate = true;
      const m4 = new THREE.Matrix4().makeBasis(X, f.t, f.n).setPosition(f.p.clone().addScaledVector(f.t, -0.6));
      m4.decompose(bg.position, bg.quaternion, bg.scale);
      bg.add(mesh(bk.body, [M.casePolished, M.casePolished], 'buckle'), mesh(bk.tang, M.casePolished, 'buckle'));
    }
    explode(g, [0, dir * 6, -52]);
  }

  // ═════════════ finishing touches ═════════════
  root.traverse((o) => {
    if (o.isMesh && o.material && !Array.isArray(o.material) && o.material.transparent) o.castShadow = false;
  });
  // stagger: outermost parts leave first
  const maxOff = Math.max(...nodes.map((n) => n.offset.length()));
  for (const n of nodes) n.delay = 1 - n.offset.length() / maxOff;

  let lastPower = -1;
  function update(s) {
    anim.cage.rotation.z = s.cage;
    anim.escape.rotation.z = s.escape;
    anim.fork.rotation.z = s.fork;
    anim.balance.rotation.z = s.balance;
    hairspringMat.userData.uniforms.uAngle.value = s.balance;
    anim.third.rotation.z = s.third;
    anim.center.rotation.z = s.center;
    anim.barrel.rotation.z = s.barrel;
    anim.cannon.rotation.z = s.cannon;
    anim.minuteWheel.rotation.z = s.minuteWheel;
    anim.hourWheel.rotation.z = s.hourWheel;
    anim.minuteHand.rotation.z = s.minuteHand;
    anim.hourHand.rotation.z = s.hourHand;
    anim.ratchet.rotation.z = s.ratchet;
    anim.crownWheel.rotation.z = s.crownWheel;
    anim.stem.rotation.x = s.stem;
    anim.crown.rotation.x = s.stem;
    // click rides up each saw tooth, then snaps back
    const ride = s.click < 0.85 ? s.click / 0.85 : 1 - (s.click - 0.85) / 0.15;
    anim.click.rotation.z = -0.05 + 0.09 * ride;
    if (Math.abs(s.power - lastPower) > 0.15) {
      mainspring.setWind(s.power / 72);
      lastPower = s.power;
    }
  }

  return { root, parts, nodes, update, noAO, anim, stats: { components, jewels } };
}

// ── mainspring ribbon (rebuilt when the wind state changes) ───
function makeMainspring() {
  const turns = 12, seg = 72, N = turns * seg;
  const height = 1.38, thick = 0.07;
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array((N + 1) * 4 * 3);
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const idx = [];
  for (let i = 0; i < N; i++) {
    const a = i * 4, b = (i + 1) * 4;
    for (let k = 0; k < 4; k++) {
      const k2 = (k + 1) % 4;
      idx.push(a + k, b + k, b + k2, a + k, b + k2, a + k2);
    }
  }
  geo.setIndex(idx);
  const rWound = (s) => (s < 0.9 ? 0.62 + 1.55 * (s / 0.9) : 2.17 + 1.7 * ((s - 0.9) / 0.1));
  const rFree = (s) => (s < 0.1 ? 0.62 + 2.1 * (s / 0.1) : 2.72 + 1.15 * ((s - 0.1) / 0.9));
  function setWind(w) {
    w = Math.max(0, Math.min(1, w));
    for (let i = 0; i <= N; i++) {
      const s = i / N;
      const th = s * turns * Math.PI * 2;
      const r = rFree(s) * (1 - w) + rWound(s) * w;
      const c = Math.cos(th), sn = Math.sin(th);
      const ri = r - thick / 2, ro = r + thick / 2;
      pos.set([ri * c, ri * sn, -height / 2, ro * c, ro * sn, -height / 2, ro * c, ro * sn, height / 2, ri * c, ri * sn, height / 2], i * 12);
    }
    geo.attributes.position.needsUpdate = true;
    geo.computeVertexNormals();
    geo.computeBoundingSphere();
  }
  setWind(0.85);
  return { geometry: geo, setWind };
}
