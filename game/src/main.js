// main.js — bootstrap, game loop, camera, shot mode, menus. Wires every system.
import * as THREE from 'three';
import { createState, loadGame, GARAGE } from './state.js';
import { createInput, axis, pressed } from './input.js';
import { buildCity } from './city.js';
import { makePlayerMesh, walkPlayer, tryEnterExit, updateCamera, syncPlayerMesh } from './player.js';
import { spawnCar, driveCar, playerCar } from './vehicles.js';
import { spawnTraffic, updateTraffic } from './traffic.js';
import { updatePolice } from './police.js';
import { startMission, updateMission, restartMission, nextJob } from './missions.js';
import { updateHud } from './hud.js';
import { ensureAudio, updateAudio, setMuted, sfxPickup, sfxComplete, sfxBusted } from './audio.js';
import { applyShot, SHOT_STEPS } from './shots.js';

const params = new URLSearchParams(location.search);
const shotName = params.get('shot');
const seed = Number(params.get('seed') || '1') || 1;

const S = createState(seed);
S.shot = shotName ? { name: shotName, seed } : null;
loadGame(S);

const canvas = document.getElementById('scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = false;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 900);
camera.position.set(-70, 14, 70);

buildCity(S, scene);
const playerMesh = makePlayerMesh();
scene.add(playerMesh);
spawnTraffic(S, scene);
// The mission cars wait in the garage: Elang Sport (fast) + Kargo Van (roomy).
// Wide garage now (34 m): bays at +/-7.5 m leave a full turning lane.
// They are crew cars — taking one is not theft (see player.js).
const sportCar = spawnCar(S, scene, 'sport', GARAGE.x - 7.5, GARAGE.z - 2, Math.PI, 'crew');
sportCar.crew = true;
const vanCar = spawnCar(S, scene, 'van', GARAGE.x + 7.5, GARAGE.z - 2, Math.PI, 'crew');
vanCar.crew = true;
startMission(S, 1);

const input = createInput();
const overlay = document.getElementById('overlay');
const banner = document.getElementById('banner');
// Debug hook for headless playtests (not part of the game UI).
window.__solmara = { S, scene, camera, THREE };

function showBanner(title, text, ms = 2600) {
  document.getElementById('bannerTitle').textContent = title;
  document.getElementById('bannerText').textContent = text;
  banner.style.display = 'flex';
  setTimeout(() => { banner.style.display = 'none'; }, ms);
}

let last = performance.now();

function step(dt) {
  S.time += dt;
  for (const ev of S.events) ev.t -= dt;
  S.events = S.events.filter((ev) => ev.t > 0);
  const P = S.player;
  if (S.phase !== 'play') return;
  // Keys that act once per press.
  if (pressed(input, 'e')) {
    const wasOnFoot = P.onFoot;
    if (tryEnterExit(S, scene) && wasOnFoot && S.mission.step === 1) sfxPickup();
  }
  if (pressed(input, 'r')) restartMission(S, scene);
  if (pressed(input, 'p')) togglePause();
  if (pressed(input, 'm')) {
    S.muted = !S.muted;
    setMuted(S.muted);
  }
  if (pressed(input, 'escape')) togglePause();
  // Movement / driving.
  const car = playerCar(S);
  if (car) {
    const throttle = axis(input, 's', 'w') + axis(input, 'arrowdown', 'arrowup');
    const steer = axis(input, 'a', 'd') + axis(input, 'arrowleft', 'arrowright');
    const handbrake = input.keys.has(' ');
    driveCar(S, car, Math.max(-1, Math.min(1, throttle)), steer, handbrake, dt);
  } else {
    walkPlayer(S, input, dt);
  }
  updateTraffic(S, dt);
  updatePolice(S, scene, dt);
  const wasDone = S.mission.done;
  updateMission(S, scene, dt);
  if (!wasDone && S.mission.done) {
    sfxComplete();
    const finished = S.mission.name;
    const reward = S.mission.reward;
    const next = nextJob(S);
    if (next) {
      showBanner(`${finished.toUpperCase()} SELESAI`, `+$${reward}. Job ${next}: ${S.mission.name}.`, 3600);
    } else {
      showBanner('TAMAT', 'Semua 5 job selesai — Solmara milikmu malam ini. Free roam terbuka.', 5000);
    }
  }
  if (S.busted) {
    sfxBusted();
    showBanner('TERTANGKAP', 'Bos Dimas menebusmu. Misi diulang dari garasi.', 3200);
    S.busted = false;
    restartMission(S, scene);
  }
  syncPlayerMesh(S, playerMesh, S.time);
  updateCamera(S, camera, input, dt);
  updateAudio(S, dt, S.time);
}

function togglePause() {
  if (S.phase === 'play') {
    S.phase = 'paused';
    showBanner('JEDA', 'Tekan P untuk lanjut.', 1200);
  } else if (S.phase === 'paused') {
    S.phase = 'play';
    banner.style.display = 'none';
  }
}

function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000 || 0.016);
  last = now;
  step(dt);
  updateHud(S, input);
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}

function resize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}
window.addEventListener('resize', resize);

document.getElementById('startBtn').addEventListener('click', () => {
  ensureAudio();
  overlay.style.display = 'none';
  S.phase = 'play';
});

// ---- Deterministic screenshot mode: ?shot=<name>&seed=1 ----
// Stages the scene, runs SHOT_STEPS fixed updates, renders once, then
// flags window.__shotReady so headless capture knows the frame is final.
// The live loop is NOT started in shot mode: if it kept running, every
// frame would advance the sim by a wall-clock dt and the captured frame
// would differ from run to run.
let shotStaged = false;
if (shotName) {
  overlay.style.display = 'none';
  const staged = applyShot(shotName, S, scene);
  if (staged) {
    shotStaged = true;
    S.phase = 'play';
    const fixed = 1 / 30;
    // Scripted throttle for driving shots: hold W so step() drives the car
    // exactly once per fixed step. Only while driving — on foot, W would
    // walk the staged player away.
    if (playerCar(S)) input.keys.add('w');
    for (let i = 0; i < SHOT_STEPS; i++) step(fixed);
    input.keys.delete('w');
    updateCamera(S, camera, input, 0.5);
    syncPlayerMesh(S, playerMesh, S.time);
    updateHud(S, input);
    renderer.render(scene, camera);
    document.title = 'SHOT READY — ' + staged;
    window.__shotReady = true;
    window.__shotName = staged;
  }
}

if (!shotStaged) requestAnimationFrame(frame);
