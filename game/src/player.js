// player.js — on-foot movement, enter/exit car, third-person camera.
import * as THREE from 'three';
import { clamp, lerpAngle } from './rng.js';
import { collideCircle, carById } from './vehicles.js';
import { toast } from './state.js';

export function makePlayerMesh() {
  const g = new THREE.Group();
  const skin = new THREE.MeshLambertMaterial({ color: 0xc98a5a });
  const shirt = new THREE.MeshLambertMaterial({ color: 0x2e7f9e });
  const pants = new THREE.MeshLambertMaterial({ color: 0x2a2e33 });
  const cap = new THREE.MeshLambertMaterial({ color: 0xd9a03a });
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.72, 0.34), shirt);
  torso.position.y = 1.12;
  g.add(torso);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.42, 0.4), skin);
  head.position.y = 1.72;
  g.add(head);
  const hat = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.12, 0.48), cap);
  hat.position.y = 1.96;
  g.add(hat);
  for (const sx of [-0.2, 0.2]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.7, 0.24), pants);
    leg.position.set(sx, 0.35, 0);
    g.add(leg);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.62, 0.18), shirt);
    arm.position.set(sx * 1.9, 1.12, 0);
    g.add(arm);
  }
  return g;
}

// WASD relative to the camera yaw; returns true when the player moved.
export function walkPlayer(S, input, dt) {
  const P = S.player;
  const fwd = (input.keys.has('w') || input.keys.has('arrowup') ? 1 : 0)
    - (input.keys.has('s') || input.keys.has('arrowdown') ? 1 : 0);
  const strafe = (input.keys.has('d') || input.keys.has('arrowright') ? 1 : 0)
    - (input.keys.has('a') || input.keys.has('arrowleft') ? 1 : 0);
  if (fwd === 0 && strafe === 0) {
    P.speed = 0;
    return false;
  }
  const run = input.keys.has('shift') ? 7.5 : 4.6;
  const cy = P.camYaw;
  // Screen-right is (-cos cy, +sin cy): D must strafe toward the screen's
  // right edge, not the world's +x.
  const mx = Math.sin(cy) * fwd - Math.cos(cy) * strafe;
  const mz = Math.cos(cy) * fwd + Math.sin(cy) * strafe;
  const len = Math.hypot(mx, mz) || 1;
  const nx = P.x + (mx / len) * run * dt;
  const nz = P.z + (mz / len) * run * dt;
  const res = collideCircle(S, nx, nz, 0.6);
  P.x = res.x;
  P.z = res.z;
  P.speed = run;
  P.yaw = lerpAngle(P.yaw, Math.atan2(mx, mz), Math.min(1, 12 * dt));
  return true;
}

export function nearestCar(S, maxDist) {
  const P = S.player;
  let best = null;
  let bestD = maxDist * maxDist;
  for (const c of S.cars) {
    const dx = c.x - P.x;
    const dz = c.z - P.z;
    const d2 = dx * dx + dz * dz;
    if (d2 < bestD) {
      bestD = d2;
      best = c;
    }
  }
  return best;
}

// E: enter the nearest car, or step out of the one being driven.
export function tryEnterExit(S, scene) {
  const P = S.player;
  if (P.onFoot) {
    const car = nearestCar(S, 4.2);
    if (!car) return false;
    // Crew cars (Bos Dimas's garage) are yours — taking one is not theft.
    // A traffic or parked car taken in front of a witness is.
    const wasOwned = !car.crew && (car.driver === 'traffic' || car.driver === 'parked');
    P.onFoot = false;
    P.carId = car.id;
    car.driver = 'player';
    if (wasOwned) {
      S.stats.steals++;
      // Witnessed theft: a pedestrian or a traffic car close by sees it.
      const witnessed = S.peds.some((p) => (p.x - P.x) ** 2 + (p.z - P.z) ** 2 < 30 * 30)
        || S.cars.some((c) => c !== car && c.driver === 'traffic'
          && (c.x - P.x) ** 2 + (c.z - P.z) ** 2 < 28 * 28);
      if (witnessed) {
        S.wanted = Math.min(5, S.wanted + 1);
        S.wantedHeat = 1;
        toast(S, 'Pencurian disaksikan! Polisi dipanggil — wanted naik.');
      } else {
        toast(S, `Mobil ${car.spec.name} diambil tanpa saksi.`);
      }
    }
    return true;
  }
  // Step out beside the car.
  const car = carById(S, P.carId);
  if (!car) {
    P.onFoot = true;
    P.carId = -1;
    return true;
  }
  car.speed = 0;
  P.x = car.x + Math.cos(car.yaw) * 2.6;
  P.z = car.z - Math.sin(car.yaw) * 2.6;
  const res = collideCircle(S, P.x, P.z, 0.6);
  P.x = res.x;
  P.z = res.z;
  P.yaw = car.yaw;
  P.onFoot = true;
  P.carId = -1;
  car.driver = 'parked';
  return true;
}

// Third-person camera: behind the player/car, lerped, mouse-drag orbits.
export function updateCamera(S, camera, input, dt) {
  const P = S.player;
  if (input.camDragX !== 0) {
    P.camYaw -= input.camDragX * 0.005;
    input.camDragX = 0;
  }
  if (input.camDragY !== 0) {
    P.camPitch = clamp(P.camPitch + input.camDragY * 0.003, 0.08, 0.85);
    input.camDragY = 0;
  }
  if (input.wheel !== 0) {
    P.camDist = clamp(P.camDist + input.wheel * 0.01, 6, 16);
    input.wheel = 0;
  }
  const car = P.carId >= 0 ? carById(S, P.carId) : null;
  const heading = car ? car.yaw : P.yaw;
  // Camera yaw eases toward the heading so turns feel smooth, never snappy.
  if (!P.onFoot || P.speed > 0.5) P.camYaw = lerpAngle(P.camYaw, heading, Math.min(1, 1.6 * dt));
  const dist = car ? P.camDist + 2.5 : P.camDist;
  const height = car ? 4.6 : 3.6;
  const tx = P.onFoot ? P.x : car.x;
  const tz = P.onFoot ? P.z : car.z;
  const cx = tx - Math.sin(P.camYaw) * dist;
  const cz = tz - Math.cos(P.camYaw) * dist;
  camera.position.x += (cx - camera.position.x) * Math.min(1, 6 * dt);
  camera.position.y += (height - camera.position.y) * Math.min(1, 6 * dt);
  camera.position.z += (cz - camera.position.z) * Math.min(1, 6 * dt);
  camera.lookAt(tx + Math.sin(P.camYaw) * 6, 1.6, tz + Math.cos(P.camYaw) * 6);
}

export function syncPlayerMesh(S, mesh, time) {
  const P = S.player;
  mesh.visible = P.onFoot;
  if (!P.onFoot) return;
  mesh.position.set(P.x, 0, P.z);
  mesh.rotation.y = P.yaw;
  // Walk bob: legs swing while moving (children 3 and 5 are the legs).
  const swing = P.speed > 0.1 ? Math.sin(time * 11) * 0.5 : 0;
  mesh.children.forEach((c, i) => {
    if (i === 3) c.rotation.x = swing;
    if (i === 5) c.rotation.x = -swing;
  });
}
