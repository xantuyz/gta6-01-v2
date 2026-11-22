// shots.js — deterministic staging for the 4 dossier screenshots.
// Each shot is a state the game can really reach; the sim then runs a
// fixed number of 1/30 s steps so the frame settles the same every run.
import { GARAGE, MARINA } from './state.js';
import { spawnCar } from './vehicles.js';
import { startMission } from './missions.js';

export const SHOT_STEPS = 45; // fixed 1/30 s steps after staging

export function applyShot(name, S, scene) {
  const P = S.player;
  S.phase = 'play';
  P.hp = 100;
  P.onFoot = true;
  P.carId = -1;
  S.money = 12450;
  S.wanted = 0;
  S.wantedHeat = 0;
  if (name === 'chase') {
    // Cover: pengejaran menuju Jembatan Angkat. The player speeds south
    // (yaw 0 = +z) toward the bridge; TWO police cars wait ON the bridge
    // deck ahead of the player, facing north (yaw PI) so their fronts,
    // light bars and white stripes face the camera. They are HELD in place
    // (car.hold) — police staged behind the player sit behind the camera
    // and never read in the frame. Player starts at z=100, speed 16:
    // after the 45 settle steps he is near z=136, still short of the
    // first patrol car — close, in frame, no collision shove yet.
    const car = spawnCar(S, scene, 'sport', -3, 100, 0, 'player');
    P.onFoot = false;
    P.carId = car.id;
    car.speed = 16;
    const p1 = spawnCar(S, scene, 'police', -6, 150, Math.PI, 'police');
    p1.hold = true;
    const p2 = spawnCar(S, scene, 'police', 6, 162, Math.PI, 'police');
    p2.hold = true;
    S.wanted = 3;
    S.wantedHeat = 1;
    S.police = S.cars.filter((c) => c.driver === 'police');
    P.camYaw = 0;
    P.camPitch = 0.3;
    startMission(S, 1);
    S.mission.step = 3;
    S.mission.text = 'Lolos ke Garasi Bos Dimas';
    S.mission.target = { x: GARAGE.x, z: GARAGE.z };
    return 'chase';
  }
  if (name === 'street') {
    // On foot in the market: pedestrians, traffic, stalls, and a parked
    // car right beside the player so the "E — Curi" prompt reads in frame.
    P.x = -14;
    P.z = 8;
    P.camYaw = Math.PI * 0.85;
    P.camPitch = 0.3;
    spawnCar(S, scene, 'hatch', -12, 5, Math.PI / 2, 'parked');
    spawnCar(S, scene, 'sedan', 0, -42, 0, 'traffic');
    startMission(S, 1);
    S.mission.step = 0;
    S.mission.text = 'Pergi ke mobil di garasi';
    S.mission.target = { x: GARAGE.x, z: GARAGE.z };
    return 'street';
  }
  if (name === 'garage') {
    // Choice: garage crew — the player north of the garage, camera facing
    // south (camYaw 0) into the workshop and the two mission cars inside.
    // The garage is 34 m wide now, so both cars read with room to spare.
    P.x = GARAGE.x - 4;
    P.z = GARAGE.z - 22;
    P.yaw = 0;
    P.camYaw = 0;
    P.camPitch = 0.3;
    // No extra cars: the two mission cars (sport + van) already wait inside.
    startMission(S, 1);
    S.mission.step = 1;
    S.mission.text = 'Pilih kendaraan: Elang Sport (cepat) atau Kargo Van (muat banyak)';
    S.mission.target = { x: GARAGE.x, z: GARAGE.z };
    return 'garage';
  }
  if (name === 'bridge') {
    // Consequence: jalan memutar — the player drives east on the marina
    // road (z=120) toward the Dermaga; the bridge reads in the right
    // background, palms on the left.
    const car = spawnCar(S, scene, 'sedan', -60, 120, Math.PI / 2, 'player');
    P.onFoot = false;
    P.carId = car.id;
    car.speed = 18;
    spawnCar(S, scene, 'hatch', 10, 120, Math.PI / 2, 'traffic');
    S.wanted = 1;
    S.wantedHeat = 0.6;
    S.police = S.cars.filter((c) => c.driver === 'police');
    P.camYaw = Math.PI / 2;
    P.camPitch = 0.3;
    startMission(S, 1);
    S.mission.step = 2;
    S.mission.text = 'Jembatan ditutup — putar lewat Pasar Solmara';
    S.mission.target = { x: MARINA.x, z: MARINA.z };
    return 'bridge';
  }
  return null;
}
