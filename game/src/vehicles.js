// vehicles.js — car meshes (4 civilian classes + police), arcade driving,
// and circle-vs-building collision. Forward is (sin yaw, cos yaw):
// yaw 0 drives toward +z (south, toward the bridge), yaw PI drives north.
import * as THREE from 'three';
import { clamp, lerpAngle } from './rng.js';

export const CAR_CLASSES = {
  hatch: { name: 'Kancil Hatch', color: 0xd9a03a, maxSpeed: 24, accel: 13, grip: 2.6 },
  sedan: { name: 'Sinar Sedan', color: 0x4a90b8, maxSpeed: 28, accel: 14, grip: 2.4 },
  sport: { name: 'Elang Sport', color: 0xd94a3a, maxSpeed: 36, accel: 17, grip: 2.2 },
  van: { name: 'Kargo Van', color: 0x8a8a7a, maxSpeed: 22, accel: 11, grip: 2.8 },
  police: { name: 'Patroli Polisi', color: 0x1e2a3a, maxSpeed: 32, accel: 16, grip: 2.5 },
};

let nextCarId = 1;

function carMesh(cls, color) {
  const g = new THREE.Group();
  const bodyMat = new THREE.MeshLambertMaterial({ color });
  const glassMat = new THREE.MeshLambertMaterial({ color: 0x1a2a3a });
  const darkMat = new THREE.MeshLambertMaterial({ color: 0x14171a });
  const body = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.62, 4.4), bodyMat);
  body.position.y = 0.55;
  g.add(body);
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.55, 2.2), glassMat);
  cabin.position.set(0, 1.1, -0.25);
  g.add(cabin);
  const roof = new THREE.Mesh(new THREE.BoxGeometry(1.75, 0.1, 2.0), bodyMat);
  roof.position.set(0, 1.42, -0.25);
  g.add(roof);
  for (const [wx, wz] of [[-0.95, 1.45], [0.95, 1.45], [-0.95, -1.45], [0.95, -1.45]]) {
    const w = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.36, 0.28, 10), darkMat);
    w.rotation.z = Math.PI / 2;
    w.position.set(wx, 0.36, wz);
    g.add(w);
  }
  const hlMat = new THREE.MeshLambertMaterial({ color: 0xfff2b0, emissive: 0x887733 });
  const tlMat = new THREE.MeshLambertMaterial({ color: 0xd91e1e, emissive: 0x550000 });
  for (const sx of [-0.6, 0.6]) {
    const h = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.18, 0.1), hlMat);
    h.position.set(sx, 0.62, 2.22);
    g.add(h);
    const t = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.18, 0.1), tlMat);
    t.position.set(sx, 0.62, -2.22);
    g.add(t);
  }
  if (cls === 'police') {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.22, 0.5),
      new THREE.MeshLambertMaterial({ color: 0x2244cc, emissive: 0x112266 }));
    bar.position.set(0, 1.55, -0.25);
    g.add(bar);
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(2.02, 0.2, 4.42),
      new THREE.MeshLambertMaterial({ color: 0xffffff }));
    stripe.position.y = 0.72;
    g.add(stripe);
  }
  if (cls === 'van') {
    const cargo = new THREE.Mesh(new THREE.BoxGeometry(2.0, 1.1, 2.6), bodyMat);
    cargo.position.set(0, 1.2, -0.8);
    g.add(cargo);
  }
  return g;
}

export function spawnCar(S, scene, cls, x, z, yaw, driver) {
  const spec = CAR_CLASSES[cls];
  const mesh = carMesh(cls, spec.color);
  mesh.position.set(x, 0, z);
  mesh.rotation.y = yaw;
  scene.add(mesh);
  const car = {
    id: nextCarId++, cls, spec, mesh, driver, // player | traffic | police | parked | crew
    x, z, yaw, speed: 0, steer: 0, crew: false,
    targetSpeed: 0, stuck: 0, stun: 0, hold: false,
  };
  S.cars.push(car);
  return car;
}

export function carById(S, id) {
  return S.cars.find((c) => c.id === id);
}

export function playerCar(S) {
  const P = S.player;
  return P.carId >= 0 ? carById(S, P.carId) : null;
}

// Circle (radius r) vs building AABBs: push out, report whether it hit.
export function collideCircle(S, x, z, r) {
  let hit = false;
  for (const c of S.colliders) {
    const nx = clamp(x, c.x0, c.x1);
    const nz = clamp(z, c.z0, c.z1);
    const dx = x - nx;
    const dz = z - nz;
    const d2 = dx * dx + dz * dz;
    if (d2 < r * r) {
      hit = true;
      if (d2 > 0.0001) {
        const d = Math.sqrt(d2);
        x = nx + (dx / d) * r;
        z = nz + (dz / d) * r;
      } else {
        // Centre inside the box: push out along the smallest penetration.
        const pl = x - c.x0, pr = c.x1 - x, pt = z - c.z0, pb = c.z1 - z;
        const m = Math.min(pl, pr, pt, pb);
        if (m === pl) x = c.x0 - r;
        else if (m === pr) x = c.x1 + r;
        else if (m === pt) z = c.z0 - r;
        else z = c.z1 + r;
      }
    }
  }
  return { x, z, hit };
}

// Arcade driving: throttle/brake/steer inputs in [-1, 1]; dt seconds.
// A stunned car (rammed hard by the player) coasts to a stop and cannot
// steer until its stun timer runs out.
export function driveCar(S, car, throttle, steerIn, handbrake, dt) {
  if (car.stun > 0) {
    car.stun -= dt;
    car.speed *= Math.max(0, 1 - 3 * dt);
    car.x += Math.sin(car.yaw) * car.speed * dt;
    car.z += Math.cos(car.yaw) * car.speed * dt;
    car.mesh.position.set(car.x, 0, car.z);
    return;
  }
  const spec = car.spec;
  const accel = throttle >= 0 ? spec.accel * throttle : spec.accel * 1.6 * throttle;
  car.speed += accel * dt;
  if (handbrake) car.speed *= Math.max(0, 1 - 2.4 * dt);
  car.speed -= car.speed * 0.35 * dt; // drag
  if (throttle === 0) car.speed -= Math.sign(car.speed) * 3 * dt;
  if (Math.abs(car.speed) < 0.15 && throttle === 0) car.speed = 0;
  car.speed = clamp(car.speed, -9, spec.maxSpeed);
  const spd = Math.abs(car.speed);
  const steerTarget = steerIn * 0.62 * clamp(spd / 8, 0, 1) * (1 - clamp(spd / spec.maxSpeed, 0, 0.55));
  car.steer = lerpAngle(car.steer, steerTarget, Math.min(1, 8 * dt));
  // D (steer +1) turns RIGHT: yaw decreases, because forward is (sin, cos).
  car.yaw -= car.steer * car.speed * 0.055 * dt * 3.2;
  const fx = Math.sin(car.yaw);
  const fz = Math.cos(car.yaw);
  const nx = car.x + fx * car.speed * dt;
  const nz = car.z + fz * car.speed * dt;
  const res = collideCircle(S, nx, nz, 2.1);
  if (res.hit && spd > 4) car.speed *= 0.55; // scrape the wall, don't stop dead
  car.x = res.x;
  car.z = res.z;
  // Soft car-car push (player + traffic + police share one pass).
  for (const o of S.cars) {
    if (o === car) continue;
    const dx = car.x - o.x;
    const dz = car.z - o.z;
    const d2 = dx * dx + dz * dz;
    if (d2 < 16 && d2 > 0.01) {
      const d = Math.sqrt(d2);
      const push = (4 - d) * 0.5;
      car.x += (dx / d) * push;
      car.z += (dz / d) * push;
      if (o.driver !== 'player') { o.x -= (dx / d) * push * 0.6; o.z -= (dz / d) * push * 0.6; }
      car.speed *= 0.92;
    }
  }
  car.mesh.position.set(car.x, 0, car.z);
  car.mesh.rotation.y = car.yaw;
  // Body lean sells the motion.
  car.mesh.rotation.z = car.steer * 0.06 * Math.sign(car.speed || 1);
}
