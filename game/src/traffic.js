// traffic.js — ambient traffic cars on the street grid + pedestrians on
// sidewalks. All randomness comes from seeded streams, so the layout and
// the screenshots reproduce exactly from the seed.
import * as THREE from 'three';
import { mulberry32, pick, range, clamp } from './rng.js';
import { WORLD } from './state.js';
import { spawnCar, driveCar } from './vehicles.js';

const PED_SHIRTS = [0xd94a3a, 0x2e7f9e, 0xd9a03a, 0x4a8a5a, 0x8a5a9e, 0xe8e4da];

function makePedMesh(color) {
  const g = new THREE.Group();
  const shirt = new THREE.MeshLambertMaterial({ color });
  const skin = new THREE.MeshLambertMaterial({ color: 0xc98a5a });
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.65, 0.3), shirt);
  torso.position.y = 1.05;
  g.add(torso);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.38, 0.36), skin);
  head.position.y = 1.6;
  g.add(head);
  for (const sx of [-0.17, 0.17]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.62, 0.22),
      new THREE.MeshLambertMaterial({ color: 0x2a2e33 }));
    leg.position.set(sx, 0.31, 0);
    g.add(leg);
  }
  return g;
}

export function spawnTraffic(S, scene) {
  const rng = mulberry32(S.seed + 77);
  const classes = ['hatch', 'sedan', 'sport', 'van'];
  // 6 moving traffic cars, each cruising one street line.
  for (let i = 0; i < 6; i++) {
    const horizontal = i % 2 === 0;
    const street = pick(rng, WORLD.streets);
    const along = range(rng, -150, 150);
    const yaw = horizontal
      ? (i % 4 < 2 ? Math.PI / 2 : -Math.PI / 2)
      : (i % 4 < 2 ? 0 : Math.PI);
    const car = spawnCar(S, scene, pick(rng, classes),
      horizontal ? along : street + (rng() < 0.5 ? -3.5 : 3.5),
      horizontal ? street + (rng() < 0.5 ? -3.5 : 3.5) : along,
      yaw, 'traffic');
    car.targetSpeed = range(rng, 8, 13);
    car.lane = street;
    car.horizontal = horizontal;
  }
  // 3 parked cars near the market + garage.
  spawnCar(S, scene, 'sedan', 24, -30, Math.PI / 2, 'parked');
  spawnCar(S, scene, 'hatch', -84, 78, Math.PI, 'parked');
  spawnCar(S, scene, 'van', 60, 132, 0, 'parked');
  // A market vendor who minds his stall by the parked sedan (18,-24) and
  // never wanders far. He is the guaranteed witness: stealing the sedan
  // parked next to his stall always raises wanted — the spec requires it,
  // and the 6 roaming market peds drift too far away on some runs (the
  // sedan sits 34 m from the plaza centre, outside their usual range).
  const vmesh = makePedMesh(PED_SHIRTS[0]);
  vmesh.position.set(18, 0, -24);
  scene.add(vmesh);
  S.peds.push({
    mesh: vmesh, x: 18, z: -24, yaw: Math.PI / 2,
    speed: 0.9, home: { x: 18, z: -24, r: 6 }, tx: 18, tz: -24, pause: 1,
  });
}

export function updateTraffic(S, dt) {
  // Traffic cars: cruise their lane, wrap at the city edge, brake for the
  // player when the player is ahead of them in their lane.
  for (const car of S.cars) {
    if (car.driver !== 'traffic') continue;
    const P = S.player;
    const ahead = Math.sin(car.yaw) * (P.x - car.x) + Math.cos(car.yaw) * (P.z - car.z);
    const nearPlayer = Math.abs(P.x - car.x) < 8 && Math.abs(P.z - car.z) < 8;
    const target = nearPlayer && ahead > 0 ? 0 : car.targetSpeed;
    driveCar(S, car, clamp((target - car.speed) / 6, -1, 1), 0, false, dt);
    if (Math.abs(car.x) > 172 || Math.abs(car.z) > 172) {
      if (car.horizontal) car.x = -Math.sign(car.x) * 168;
      else car.z = -Math.sign(car.z) * 168;
    }
  }
  // Pedestrians: pick a nearby target, walk, pause, repeat. Targets come
  // from S.pedRng (seeded) — never unseeded randomness — so shots stay
  // identical from run to run.
  for (const p of S.peds) {
    if (p.pause > 0) {
      p.pause -= dt;
      continue;
    }
    const dx = p.tx - p.x;
    const dz = p.tz - p.z;
    const d = Math.hypot(dx, dz);
    if (d < 0.6) {
      p.tx = p.home.x + (S.pedRng() * 2 - 1) * p.home.r;
      p.tz = p.home.z + (S.pedRng() * 2 - 1) * p.home.r;
      p.pause = 1 + S.pedRng() * 3;
      continue;
    }
    p.yaw = Math.atan2(dx, dz);
    p.x += (dx / d) * p.speed * dt;
    p.z += (dz / d) * p.speed * dt;
    p.mesh.position.set(p.x, 0, p.z);
    p.mesh.rotation.y = p.yaw;
    p.mesh.position.y = Math.abs(Math.sin(S.time * 8 + p.x)) * 0.05;
  }
}
