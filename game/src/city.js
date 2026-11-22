// city.js — builds the Solmara block: marina, market, garage, drawbridge.
// One seeded layout; colliders go into S.colliders for walking and
// driving alike. The garage is deliberately WIDE (34 m): a car must be
// able to turn left inside it without wedging against a wall.
import * as THREE from 'three';
import { mulberry32, pick, range } from './rng.js';
import { WORLD, GARAGE, MARINA, MARKET, BRIDGE } from './state.js';

const WALL_COLORS = [0xe8c9a0, 0xd9a06b, 0xc97b5a, 0x9fc3d4, 0xf2e3c6, 0xb7d3a8, 0xe0a899, 0x8fb8c9];
const ROOF_COLORS = [0x8a4b3a, 0x5a6b7a, 0x74604a, 0x9a5a4a, 0x4a6b5a];

const GARAGE_HALF = 17; // garage interior half-width; front (north) stays open

function makeSign(text, sub, bg, fg) {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 160;
  const g = c.getContext('2d');
  g.fillStyle = bg;
  g.fillRect(0, 0, 512, 160);
  g.strokeStyle = fg;
  g.lineWidth = 10;
  g.strokeRect(8, 8, 496, 144);
  g.fillStyle = fg;
  g.textAlign = 'center';
  g.font = 'bold 64px system-ui, sans-serif';
  g.fillText(text, 256, 78);
  g.font = '28px system-ui, sans-serif';
  g.fillText(sub, 256, 128);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function box(parent, mat, w, h, d, x, y, z, ry = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  m.rotation.y = ry;
  parent.add(m);
  return m;
}

// Raise / lower the drawbridge (job 4). Raised: the south leaf lifts
// ~34 degrees and striped barrier arms close the road; a collider blocks
// the deck so cars cannot drive through the gap.
export function setBridgeRaised(S, raised) {
  if (!S.bridge) return;
  S.bridgeRaised = raised;
  S.bridge.leaf.rotation.x = raised ? -0.6 : 0;
  for (const arm of S.bridge.arms) arm.visible = raised;
  S.bridge.closedSign.visible = raised;
  const i = S.colliders.indexOf(S.bridge.barrier);
  if (raised && i === -1) S.colliders.push(S.bridge.barrier);
  if (!raised && i !== -1) S.colliders.splice(i, 1);
}

export function buildCity(S, scene) {
  const rng = mulberry32(1337);
  const mats = new Map();
  const mat = (color) => {
    if (!mats.has(color)) mats.set(color, new THREE.MeshLambertMaterial({ color }));
    return mats.get(color);
  };

  // Golden-hour sky, sun and haze over the harbour.
  scene.background = new THREE.Color(0xffc98a);
  scene.fog = new THREE.Fog(0xf2b878, 220, 520);
  const sun = new THREE.DirectionalLight(0xffd9a0, 2.4);
  sun.position.set(90, 130, 60);
  scene.add(sun);
  scene.add(new THREE.HemisphereLight(0x9fd0e8, 0x8a6a4a, 1.15));
  const sunDisc = new THREE.Mesh(
    new THREE.CircleGeometry(26, 24),
    new THREE.MeshBasicMaterial({ color: 0xfff2c0, fog: false }),
  );
  sunDisc.position.set(180, 95, -260);
  sunDisc.lookAt(0, 20, 0);
  scene.add(sunDisc);

  // Ground: sandy blocks, asphalt roads on the grid.
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(WORLD.half * 2 + 80, WORLD.half * 2 + 80),
    mat(0xcbb58a),
  );
  ground.rotation.x = -Math.PI / 2;
  scene.add(ground);
  const roadMat = mat(0x3a3f46);
  const dashMat = mat(0xe8e0c8);
  for (const s of WORLD.streets) {
    const h = new THREE.Mesh(new THREE.PlaneGeometry(WORLD.half * 2, WORLD.roadHalf * 2), roadMat);
    h.rotation.x = -Math.PI / 2;
    h.position.set(0, 0.02, s);
    scene.add(h);
    const v = new THREE.Mesh(new THREE.PlaneGeometry(WORLD.roadHalf * 2, WORLD.half * 2), roadMat);
    v.rotation.x = -Math.PI / 2;
    v.position.set(s, 0.02, 0);
    scene.add(v);
    for (let d = -160; d <= 160; d += 16) {
      box(scene, dashMat, 3, 0.05, 0.5, d, 0.04, s);
      box(scene, dashMat, 0.5, 0.05, 3, s, 0.04, d);
    }
  }

  // Water strip along the south edge, docks, moored boats.
  const water = new THREE.Mesh(
    new THREE.PlaneGeometry(WORLD.half * 2 + 80, 34),
    new THREE.MeshLambertMaterial({ color: 0x2e7f9e }),
  );
  water.rotation.x = -Math.PI / 2;
  water.position.set(0, 0.05, 167);
  scene.add(water);
  const dockMat = mat(0x8a6a44);
  for (const dx of [108, 132, 156]) box(scene, dockMat, 10, 1, 16, dx, 0.5, 156);
  for (let i = 0; i < 4; i++) {
    const bx = 96 + i * 22;
    const hull = box(scene, mat(pick(rng, [0xe8e4da, 0xd96a4a, 0x4a90b8])), 5, 1.6, 11, bx, 0.8, 168);
    hull.rotation.y = range(rng, -0.12, 0.12);
    box(scene, mat(0xffffff), 2.4, 2.2, 2.4, bx, 2.4, 168);
  }
  // South island + lighthouse, offset east so the bridge sightline (x = 0)
  // stays open for the chase cover shot. The island is a low sandbar
  // (top ~0.2 m) so cars can drive onto it to reach the freight handoff;
  // only the lighthouse and the crate stacks are solid.
  box(scene, mat(0x9a8a6a), 100, 0.2, 22, 20, 0.1, 196);
  box(scene, mat(0xf2ead8), 5, 22, 5, 48, 11.2, 198);
  box(scene, mat(0xd94a3a), 5.6, 3, 5.6, 48, 23.2, 198);
  box(scene, mat(0x8a6a44), 3, 2, 3, 40, 1, 192);
  box(scene, mat(0x8a6a44), 3, 2, 3, 22, 1, 200);
  S.colliders.push({ x0: 45.5, z0: 195.5, x1: 50.5, z1: 200.5 }); // lighthouse
  S.colliders.push({ x0: 38.5, z0: 190.5, x1: 41.5, z1: 193.5 }); // crates
  S.colliders.push({ x0: 20.5, z0: 198.5, x1: 23.5, z1: 201.5 }); // crates

  // Jembatan Angkat — two leaves over the causeway, flush with the road so
  // cars drive OVER it. The south leaf hinges at z=167: when the bridge is
  // raised (job 4) it lifts ~34 degrees and striped barrier arms close
  // the road.
  box(scene, mat(0x6a7078), 18, 0.4, 17, BRIDGE.x, 0.2, 158.5); // north leaf (fixed)
  const leafGroup = new THREE.Group();
  leafGroup.position.set(BRIDGE.x, 0.2, 167);
  const southLeaf = new THREE.Mesh(new THREE.BoxGeometry(18, 0.4, 17), mat(0x6a7078));
  southLeaf.position.set(0, 0, 8.5);
  leafGroup.add(southLeaf);
  scene.add(leafGroup);
  box(scene, mat(0xd9a03a), 1.2, 3, 17, -9.5, 1.5, 158.5);
  box(scene, mat(0xd9a03a), 1.2, 3, 17, 9.5, 1.5, 158.5);
  // Barrier arms + DITUTUP sign (hidden while the bridge is down).
  const armMat = mat(0xd9a03a);
  const armMat2 = mat(0x1a1d20);
  const arms = [];
  for (const ax of [-5, 5]) {
    arms.push(box(scene, armMat, 9, 0.5, 0.5, ax, 1.1, 150));
    arms.push(box(scene, armMat2, 1.2, 0.5, 0.5, ax + (ax < 0 ? -4 : 4), 1.1, 150));
  }
  const closedSign = new THREE.Mesh(
    new THREE.PlaneGeometry(12, 3.8),
    new THREE.MeshBasicMaterial({ map: makeSign('DITUTUP', 'JEMBATAN DIANGKAT', '#7a1a1a', '#ffe9a8') }),
  );
  closedSign.position.set(0, 5.5, 149);
  closedSign.rotation.y = Math.PI; // face north
  scene.add(closedSign);
  const barrier = { x0: -10, z0: 149, x1: 10, z1: 151 };
  S.bridge = { leaf: leafGroup, arms, closedSign, barrier };
  setBridgeRaised(S, false);
  const bridgeSign = new THREE.Mesh(
    new THREE.PlaneGeometry(14, 4.4),
    new THREE.MeshBasicMaterial({ map: makeSign('JEMBATAN', 'ANGKAT · SOLMARA', '#24384a', '#ffd23e') }),
  );
  bridgeSign.position.set(0, 9, 148);
  bridgeSign.rotation.y = Math.PI; // face north: drivers approaching read it
  scene.add(bridgeSign);

  // Buildings fill every block between streets; skip plaza, garage, marina.
  const skip = (cx, cz) => {
    if (Math.abs(cx - MARKET.x) < 34 && Math.abs(cz - MARKET.z) < 30) return true;
    if (Math.abs(cx - GARAGE.x) < 40 && Math.abs(cz - GARAGE.z) < 30) return true;
    if (cz > 128) return true; // marina strip
    if (Math.abs(cx) < 16 && Math.abs(cz - 168) < 26) return true; // bridge approach
    return false;
  };
  const blockCenters = [];
  for (let ix = 0; ix < 4; ix++) {
    for (let iz = 0; iz < 4; iz++) {
      blockCenters.push([WORLD.streets[ix] + 30, WORLD.streets[iz] + 30]);
    }
  }
  for (const [cx, cz] of blockCenters) {
    if (skip(cx, cz)) continue;
    const n = 1 + Math.floor(rng() * 2);
    for (let k = 0; k < n; k++) {
      const w = range(rng, 14, 22);
      const d = range(rng, 12, 20);
      const h = range(rng, 9, 30) * (rng() < 0.18 ? 1.7 : 1);
      const ox = cx + (k === 0 ? -8 : 9) + range(rng, -3, 3);
      const oz = cz + range(rng, -6, 6);
      box(scene, mat(pick(rng, WALL_COLORS)), w, h, d, ox, h / 2, oz);
      box(scene, mat(pick(rng, ROOF_COLORS)), w + 0.6, 0.8, d + 0.6, ox, h + 0.4, oz);
      const winMat = mat(0xffe9a8);
      const rows = Math.max(1, Math.floor(h / 6));
      for (let r = 0; r < rows; r++) {
        for (let ci = 0; ci < 3; ci++) {
          if (rng() < 0.45) continue;
          box(scene, winMat, 1.6, 2, 0.2, ox - w / 2 + 4 + ci * (w / 3.4), 4 + r * 5.4, oz + d / 2 + 0.12);
        }
      }
      S.colliders.push({ x0: ox - w / 2, z0: oz - d / 2, x1: ox + w / 2, z1: oz + d / 2 });
    }
  }

  // Distant skyline silhouettes — never due south, where they would wall
  // off the bridge view.
  for (let i = 0; i < 14; i++) {
    const h = range(rng, 26, 70);
    const a = (i / 14) * Math.PI * 2;
    const sx = Math.cos(a) * 260;
    const sz = Math.sin(a) * 260 - 40;
    if (sz > 120) continue;
    box(scene, mat(0x7a6a72), range(rng, 14, 26), h, range(rng, 14, 26), sx, h / 2, sz);
  }

  // Pasar Solmara — plaza with stalls, crates, palms.
  const plaza = new THREE.Mesh(new THREE.PlaneGeometry(56, 48), mat(0xd9c49a));
  plaza.rotation.x = -Math.PI / 2;
  plaza.position.set(MARKET.x, 0.03, MARKET.z);
  scene.add(plaza);
  const stallCols = [0xd94a3a, 0x2e7f9e, 0xd9a03a, 0x4a8a5a];
  for (let i = 0; i < 8; i++) {
    const sx = MARKET.x - 20 + (i % 4) * 13;
    const sz = MARKET.z - 12 + Math.floor(i / 4) * 22;
    box(scene, mat(0x8a6a44), 6, 2.4, 3.4, sx, 1.2, sz);
    const awn = box(scene, mat(stallCols[i % 4]), 7, 0.3, 4.6, sx, 3.1, sz);
    awn.rotation.x = 0.12;
    box(scene, mat(0xe8c9a0), 1.4, 1.4, 1.4, sx + 4.4, 0.7, sz + 1.4);
    S.colliders.push({ x0: sx - 3, z0: sz - 1.7, x1: sx + 3, z1: sz + 1.7 });
  }
  const marketSign = new THREE.Mesh(
    new THREE.PlaneGeometry(16, 5),
    new THREE.MeshBasicMaterial({ map: makeSign('PASAR', 'SOLMARA · SEJAK 1987', '#7a3a2a', '#ffe9a8') }),
  );
  marketSign.position.set(MARKET.x, 8, MARKET.z - 26);
  scene.add(marketSign);

  // Garasi Bos Dimas — open-front workshop, two bays, WIDE door (34 m).
  // No front wall at all: the whole north face is the entrance, so a car
  // turning left inside never wedges against a door frame.
  const g = GARAGE;
  const hw = GARAGE_HALF;
  box(scene, mat(0x5a6b7a), hw * 2, 9, 1, g.x, 4.5, g.z + 12); // back wall
  box(scene, mat(0x5a6b7a), 1, 9, 24, g.x - hw, 4.5, g.z); // west wall
  box(scene, mat(0x5a6b7a), 1, 9, 24, g.x + hw, 4.5, g.z); // east wall
  box(scene, mat(0x74604a), hw * 2 + 1, 1, 25, g.x, 9.5, g.z); // roof slab
  S.colliders.push({ x0: g.x - hw, z0: g.z + 11.5, x1: g.x + hw, z1: g.z + 12.5 });
  S.colliders.push({ x0: g.x - hw - 0.5, z0: g.z - 12, x1: g.x - hw + 0.5, z1: g.z + 12 });
  S.colliders.push({ x0: g.x + hw - 0.5, z0: g.z - 12, x1: g.x + hw + 0.5, z1: g.z + 12 });
  const garageSign = new THREE.Mesh(
    new THREE.PlaneGeometry(14, 4.4),
    new THREE.MeshBasicMaterial({ map: makeSign('GARASI DIMAS', 'BENGKEL & CREW SOLMARA', '#24384a', '#ffd23e') }),
  );
  garageSign.position.set(g.x, 8.2, g.z - 12.6);
  garageSign.rotation.y = Math.PI; // face north: readable from the street
  scene.add(garageSign);
  const workLight = new THREE.PointLight(0xffd9a0, 60, 40, 1.6);
  workLight.position.set(g.x, 6, g.z);
  scene.add(workLight);
  // Tyre stacks tucked against the BACK corners, clear of the turning path.
  for (let i = 0; i < 3; i++) {
    const tyre = new THREE.Mesh(new THREE.TorusGeometry(1.1, 0.45, 8, 16), mat(0x1a1d20));
    tyre.rotation.x = Math.PI / 2;
    tyre.position.set(g.x - hw + 3 + i * 2.6, 0.5, g.z + 9);
    scene.add(tyre);
  }

  // Marina pickup beacon post + sign.
  const mSign = new THREE.Mesh(
    new THREE.PlaneGeometry(15, 4.7),
    new THREE.MeshBasicMaterial({ map: makeSign('MARINA', 'DERMAGA 3 · SOLMARA', '#1e4a5a', '#ffffff') }),
  );
  mSign.position.set(MARINA.x, 7.5, MARINA.z - 8);
  mSign.rotation.y = Math.PI; // face north: readable from the marina road
  scene.add(mSign);
  box(scene, mat(0xd9a03a), 0.5, 7, 0.5, MARINA.x - 6, 3.5, MARINA.z);

  // Palms along the marina road + scattered street lamps.
  const trunkMat = mat(0x7a5a3a);
  const leafMat = mat(0x3f8a4a);
  for (let i = 0; i < 10; i++) {
    const px = -150 + i * 33;
    const pz = 142;
    box(scene, trunkMat, 0.7, 7, 0.7, px, 3.5, pz);
    const crown = new THREE.Mesh(new THREE.ConeGeometry(3.4, 3, 7), leafMat);
    crown.position.set(px, 8.4, pz);
    scene.add(crown);
    S.colliders.push({ x0: px - 0.5, z0: pz - 0.5, x1: px + 0.5, z1: pz + 0.5 });
  }
  for (const [lx, lz] of [[-60, -60], [60, -60], [-60, 60], [60, 60], [0, 120], [-120, 0], [120, 0]]) {
    box(scene, mat(0x2a2e33), 0.4, 6, 0.4, lx, 3, lz);
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.9, 8, 8),
      new THREE.MeshBasicMaterial({ color: 0xffe9a8 }));
    lamp.position.set(lx, 6.4, lz);
    scene.add(lamp);
  }

  // Water blocks everything except the bridge deck.
  S.colliders.push({ x0: -220, z0: 150, x1: -10, z1: 184 });
  S.colliders.push({ x0: 10, z0: 150, x1: 220, z1: 184 });
  // South of the water, only the island is drivable: water on both sides.
  S.colliders.push({ x0: -220, z0: 184, x1: -30, z1: 220 });
  S.colliders.push({ x0: 70, z0: 184, x1: 220, z1: 220 });
  // Island south face, cap the south edge.
  S.colliders.push({ x0: -30, z0: 207, x1: 70, z1: 210 });
  S.colliders.push({ x0: -220, z0: 210, x1: 220, z1: 220 });
  // World edge.
  S.colliders.push({ x0: -220, z0: -220, x1: -180, z1: 220 });
  S.colliders.push({ x0: 180, z0: -220, x1: 220, z1: 220 });
  S.colliders.push({ x0: -220, z0: -220, x1: 220, z1: -180 });
}
