// police.js — wanted level, patrol pursuit, hiding to cool down, busted.
//
// The chase is tuned so a slower car can still escape: a patrol car that
// touches the player's car while the player is moving fast (> 12 m/s) is
// RAMMED — stunned for 2.5 s, coasting to a stop instead of grinding the
// player down. That is the whole point of the finale: the van (22 m/s)
// cannot outrun three patrol cars (32 m/s) in a straight line, but it can
// shove them off, one by one, and keep moving. HP is only chipped by a
// fast impact, never by matched-speed grinding.
import { clamp, wrapAngle } from './rng.js';
import { spawnCar, driveCar, playerCar } from './vehicles.js';
import { toast } from './state.js';

export function setWanted(S, level) {
  S.wanted = clamp(level, 0, 5);
  S.wantedHeat = S.wanted > 0 ? 1 : 0;
  if (S.wanted > 0) S.hideTimer = 0;
}

// Keep the right number of patrol cars on the road for the wanted level.
export function updatePolice(S, scene, dt) {
  const P = S.player;
  const want = S.wanted > 0 ? Math.min(3, S.wanted) : 0;
  while (S.police.length < want) {
    const angle = (S.police.length / Math.max(1, want)) * Math.PI * 2 + 0.7;
    const car = spawnCar(S, scene, 'police',
      P.x + Math.sin(angle) * 55, P.z + Math.cos(angle) * 55, 0, 'police');
    car.targetSpeed = 30;
    S.police.push(car);
    toast(S, 'Patroli polisi mendekat!');
  }
  while (S.police.length > want) {
    const car = S.police.pop();
    scene.remove(car.mesh);
    S.cars.splice(S.cars.indexOf(car), 1);
  }
  const pc = playerCar(S);
  const px = pc ? pc.x : P.x;
  const pz = pc ? pc.z : P.z;
  let nearest = Infinity;
  for (const car of S.police) {
    // Steer toward the player; ram to slow them down.
    const dx = px - car.x;
    const dz = pz - car.z;
    const d = Math.hypot(dx, dz) || 1;
    nearest = Math.min(nearest, d);
    const wantYaw = Math.atan2(dx, dz);
    const diff = wrapAngle(wantYaw - car.yaw);
    // Positive steer turns right (yaw decreases), so negate the diff.
    const steer = clamp(-diff * 1.4, -1, 1);
    const throttle = d > 6 ? 1 : 0.6;
    // Staged (held) patrol cars — e.g. the roadblock in the chase cover —
    // stay where the shot put them instead of U-turning toward the player.
    if (!car.hold && car.stun <= 0) driveCar(S, car, throttle, steer, false, dt);
    else if (car.stun > 0) driveCar(S, car, 0, 0, false, dt);
    // Ram contact: shove + slow the player's car.
    if (pc && d < 4.4) {
      // Player rams back at speed: the patrol car is stunned and falls off.
      if (Math.abs(pc.speed) > 12 && car.stun <= 0) {
        car.stun = 2.5;
        car.speed = 0;
        toast(S, 'Polisi ditabrak — lepas!');
      } else {
        pc.speed *= Math.max(0, 1 - 1.8 * dt);
      }
      // HP is chipped only by a fast impact — grinding alongside at
      // matched speed slows you down but does not wreck you.
      if (car.speed > 10) P.hp = Math.max(0, P.hp - 5 * dt);
    }
    if (d < 3.2 && !pc) {
      // Caught on foot.
      bustPlayer(S);
      return;
    }
  }
  // Hiding: no police in sight for a while cools the wanted level down.
  if (S.wanted > 0) {
    if (nearest > 60) {
      S.hideTimer += dt;
      if (S.hideTimer > 6) {
        S.wanted -= 1;
        S.hideTimer = 0;
        toast(S, S.wanted === 0 ? 'Polisi kehilangan jejakmu. Bersih.' : `Wanted turun ke ${S.wanted} bintang.`);
      }
    } else {
      S.hideTimer = 0;
    }
    // Wanted heat eases while the player stays out of trouble.
    S.wantedHeat = clamp(S.wantedHeat - 0.02 * dt, 0.3, 1);
  }
  // Busted on foot by contact, or HP gone while driving.
  if (P.hp <= 0) bustPlayer(S);
}

export function bustPlayer(S) {
  if (S.busted) return;
  S.busted = true;
  S.stats.busts++;
  S.wanted = 0;
  S.wantedHeat = 0;
  resetPlayerToGarage(S);
  toast(S, 'TERTANGKAP! Bos Dimas menebusmu — kembali ke garasi.');
}

function resetPlayerToGarage(S) {
  const P = S.player;
  const car = playerCar(S);
  if (car) {
    car.driver = 'parked';
    car.speed = 0;
  }
  P.onFoot = true;
  P.carId = -1;
  P.x = -88;
  P.z = 88;
  P.hp = 100;
  P.camYaw = Math.PI * 0.75;
}
