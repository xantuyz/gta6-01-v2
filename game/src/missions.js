// missions.js — the 5-job SOLMARA campaign, sequential, one job at a time.
// Step kinds: 'goto' (reach the target, any state), 'gotoFoot' (on foot),
// 'enter' (get into a car while near the target), 'deliver'
// (reach the target while driving). Job 4 raises the drawbridge; job 5,
// the finale, reuses the garage choice (sport -> marina handoff, van ->
// freight island) under a staged 3-star pursuit.
import { GARAGE, MARINA, MARKET, FREIGHT, toast, saveGame } from './state.js';
import { setBridgeRaised } from './city.js';
import { playerCar } from './vehicles.js';
import { setWanted } from './police.js';
import { dist2 } from './rng.js';

const JOBS = {
  1: {
    name: 'Marina Pickup', reward: 450,
    steps: [
      { text: 'Pergi ke mobil di garasi', target: { x: GARAGE.x, z: GARAGE.z }, radius: 6, kind: 'gotoFoot' },
      { text: 'Masuk mobil — tekan E', target: { x: GARAGE.x, z: GARAGE.z }, radius: 9, kind: 'enter' },
      { text: 'Antar paket ke Dermaga Marina', target: { x: MARINA.x, z: MARINA.z }, radius: 9, kind: 'deliver' },
      { text: 'Kembali ke Garasi Bos Dimas', target: { x: GARAGE.x, z: GARAGE.z }, radius: 9, kind: 'deliver' },
    ],
  },
  2: {
    name: 'Market Relay', reward: 600,
    steps: [
      { text: 'Pergi ke Pasar Solmara', target: { x: MARKET.x, z: MARKET.z }, radius: 9, kind: 'goto' },
      { text: 'Curi sedan di pasar — tekan E', target: { x: 24, z: -30 }, radius: 6, kind: 'enter' },
      { text: 'Antar sedan ke Dermaga Marina', target: { x: MARINA.x, z: MARINA.z }, radius: 9, kind: 'deliver' },
      { text: 'Kembali ke Garasi Bos Dimas', target: { x: GARAGE.x, z: GARAGE.z }, radius: 9, kind: 'deliver' },
    ],
  },
  3: {
    name: 'Freight Run', reward: 750,
    steps: [
      // A real garage choice: whichever car the player takes becomes the
      // crew choice the finale reuses (van -> island handoff, sport ->
      // marina handoff). Recorded by completeMission from the driven car.
      { text: 'Pilih kendaraan: Kargo Van (muat) atau Elang Sport (cepat) — tekan E', target: { x: GARAGE.x, z: GARAGE.z }, radius: 9, kind: 'enter' },
      { text: 'Antar kargo ke Pulau Freight', target: { x: FREIGHT.x, z: FREIGHT.z }, radius: 9, kind: 'deliver' },
      { text: 'Kembali ke Garasi Bos Dimas', target: { x: GARAGE.x, z: GARAGE.z }, radius: 9, kind: 'deliver' },
    ],
  },
  4: {
    name: 'Bridge Window', reward: 900,
    steps: [
      { text: 'Jembatan diangkat — putar lewat Pasar Solmara', target: { x: MARINA.x, z: MARINA.z }, radius: 9, kind: 'deliver' },
      { text: 'Kembali ke Garasi Bos Dimas', target: { x: GARAGE.x, z: GARAGE.z }, radius: 9, kind: 'deliver' },
    ],
  },
  5: {
    name: 'Second Crossing', reward: 1500,
    steps: [
      // Target depends on the garage choice; filled in by startMission.
      { text: 'Serahkan paket — lolos dari kejaran!', target: { x: MARINA.x, z: MARINA.z }, radius: 9, kind: 'deliver' },
      { text: 'Bawa pulang ke Garasi — akhiri malam ini', target: { x: GARAGE.x, z: GARAGE.z }, radius: 9, kind: 'deliver' },
    ],
  },
};

export function jobCount() {
  return Object.keys(JOBS).length;
}

function jobDef(id) {
  return JOBS[id];
}

export function startMission(S, id = 1) {
  const job = jobDef(id);
  S.mission.id = id;
  S.mission.name = job.name;
  S.mission.reward = job.reward;
  S.mission.step = 0;
  S.mission.done = false;
  S.mission.timer = 0;
  S.mission.prevOnFoot = S.player.onFoot;
  S.busted = false;
  S.campaign.job = id;
  // Job setup: bridge state + staged pursuit for the finale.
  setBridgeRaised(S, id === 4);
  if (id === 5) {
    // The finale reuses the garage choice: van crew hands off at the
    // freight island, sport crew at the marina.
    const island = S.crewChoice === 'van';
    job.steps[0].target = island
      ? { x: FREIGHT.x, z: FREIGHT.z }
      : { x: MARINA.x, z: MARINA.z };
    job.steps[0].text = island
      ? 'Serahkan kargo di Pulau Freight — lolos dari kejaran!'
      : 'Serahkan paket di Dermaga Marina — lolos dari kejaran!';
    setWanted(S, 3);
    toast(S, 'Polisi sudah menunggu — kabur!');
  }
  applyStep(S);
}

export function applyStep(S) {
  const step = jobDef(S.mission.id).steps[S.mission.step];
  S.mission.text = step.text;
  S.mission.target = { x: step.target.x, z: step.target.z };
}

export function missionTarget(S) {
  return S.mission.target;
}

// Called every frame while playing; advances steps and completes the job.
export function updateMission(S, scene, dt) {
  const M = S.mission;
  if (M.done) return;
  M.timer += dt;
  const P = S.player;
  const car = playerCar(S);
  const px = car ? car.x : P.x;
  const pz = car ? car.z : P.z;
  const steps = jobDef(M.id).steps;
  const step = steps[M.step];
  const entered = M.prevOnFoot && !P.onFoot;
  M.prevOnFoot = P.onFoot;
  const near = dist2(px, pz, step.target.x, step.target.z) < step.radius * step.radius;
  let advance = false;
  if (step.kind === 'goto' && near) advance = true;
  if (step.kind === 'gotoFoot' && near && P.onFoot) advance = true;
  if (step.kind === 'enter' && entered && near) advance = true;
  if (step.kind === 'deliver' && near && !P.onFoot) advance = true;
  if (!advance) return;
  if (M.step < steps.length - 1) {
    M.step++;
    applyStep(S);
    toast(S, 'Bagus. ' + S.mission.text);
  } else {
    completeMission(S);
  }
}

export function completeMission(S) {
  const M = S.mission;
  M.done = true;
  const secs = Math.round(M.timer);
  S.money += M.reward;
  S.stats.missionsDone++;
  if (!S.stats.bestTime || secs < S.stats.bestTime) S.stats.bestTime = secs;
  // The garage choice is the car the player drove for this job.
  const car = playerCar(S);
  if (car) S.crewChoice = car.cls;
  // Crew cars the player is not driving come home to the garage when a
  // job ends. Without this, job 2 strands the van at the market (the
  // player drives the stolen sedan home) and job 3 has no van to choose
  // from — the garage choice the finale reuses must be there to pick.
  for (const c of S.cars) {
    if (!c.crew || c === car) continue;
    c.x = GARAGE.x + (c.cls === 'van' ? 7.5 : -7.5);
    c.z = GARAGE.z - 2;
    c.yaw = Math.PI;
    c.speed = 0;
    c.driver = 'crew';
    c.mesh.position.set(c.x, 0, c.z);
    c.mesh.rotation.y = c.yaw;
  }
  saveGame(S);
  toast(S, `${M.name} selesai dalam ${secs} detik. +$${M.reward}`);
  if (M.id === 4) setBridgeRaised(S, false); // the bridge lowers again
  return { secs, reward: M.reward };
}

// Advance to the next job, or finish the campaign with an ending.
export function nextJob(S) {
  if (S.mission.id < jobCount()) {
    startMission(S, S.mission.id + 1);
    toast(S, `Job ${S.mission.id}: ${S.mission.name} — ${S.mission.text}`);
    return S.mission.id;
  }
  S.campaign.done = true;
  S.mission.text = 'TAMAT — Solmara milikmu malam ini.';
  return 0;
}

// Restart the current job from the checkpoint: player + mission car back
// at the garage, wanted cleared. The car comes back too — otherwise a
// restart could strand the player with no car to drive.
export function restartMission(S, scene) {
  const P = S.player;
  const car = playerCar(S);
  if (car) {
    car.driver = car.crew ? 'crew' : 'parked';
    car.speed = 0;
    car.x = GARAGE.x - 7.5;
    car.z = GARAGE.z - 2;
    car.yaw = Math.PI;
    car.mesh.position.set(car.x, 0, car.z);
    car.mesh.rotation.y = car.yaw;
  }
  P.onFoot = true;
  P.carId = -1;
  P.x = -88;
  P.z = 88;
  P.hp = 100;
  P.camYaw = Math.PI * 0.75;
  S.wanted = 0;
  S.wantedHeat = 0;
  S.busted = false;
  startMission(S, S.mission.id);
  toast(S, 'Misi diulang dari garasi.');
}
