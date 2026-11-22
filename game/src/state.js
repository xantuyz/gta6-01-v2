// state.js — the single game-state object, world landmarks and save/load.
// Rendering lives in the other modules; this file only describes state.
import { mulberry32 } from './rng.js';

export const WORLD = {
  half: 180, // playable half-extent in metres
  roadHalf: 7, // half width of a road
  streets: [-120, -60, 0, 60, 120], // street centre lines, both axes
};

// Landmarks. The garage front faces north (open side at z = GARAGE.z - 12);
// the marina sits on the south road; the bridge crosses the water at x = 0.
export const GARAGE = { x: -96, z: 96, name: 'Garasi Bos Dimas' };
export const MARINA = { x: 132, z: 138, name: 'Dermaga Marina' };
export const MARKET = { x: 0, z: -6, name: 'Pasar Solmara' };
export const BRIDGE = { x: 0, z: 168, name: 'Jembatan Angkat' };
export const FREIGHT = { x: 30, z: 196, name: 'Pulau Freight' };

export function createState(seed) {
  return {
    seed,
    rng: mulberry32(seed),
    // Pedestrian wander targets get their own seeded stream, so the
    // screenshots reproduce exactly from the seed.
    pedRng: mulberry32(seed + 991),
    time: 0,
    phase: 'menu', // menu | play | paused
    money: 1200,
    wanted: 0, // 0..5 stars
    wantedHeat: 0, // 0..1, drives how hard police push
    hideTimer: 0, // seconds with no police in sight
    busted: false,
    muted: false,
    mission: {
      id: 1, name: 'Marina Pickup', step: 0, done: false,
      text: 'Pergi ke mobil di garasi', target: { x: GARAGE.x, z: GARAGE.z },
      timer: 0, reward: 450,
    },
    campaign: { job: 1, done: false }, // jobs 1..5, sequential
    crewChoice: null, // 'sport' | 'van' — car picked in job 3, reused in the finale
    bridgeRaised: false,
    bridge: null, // city.js fills in: { leaf, arms, closedSign, barrier }
    player: {
      x: -88, z: 88, yaw: Math.PI * 0.75, speed: 0,
      onFoot: true, carId: -1, hp: 100,
      camYaw: Math.PI * 0.75, camPitch: 0.32, camDist: 10,
    },
    cars: [], // vehicles.js entries
    peds: [], // traffic.js entries
    police: [], // police.js entries (subset of cars)
    colliders: [], // {x0,z0,x1,z1} building AABBs
    events: [], // toast queue {text, t}
    stats: { steals: 0, busts: 0, missionsDone: 0, bestTime: 0 },
    shot: null, // {name, seed} while ?shot= is active
  };
}

export function toast(S, text) {
  S.events.push({ text, t: 3.2 });
}

const SAVE_KEY = 'solmara-second-crossing-v2';
export function saveGame(S) {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify({
      money: S.money, missionsDone: S.stats.missionsDone, bestTime: S.stats.bestTime,
    }));
  } catch { /* storage unavailable — the game still plays */ }
}

export function loadGame(S) {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return;
    const d = JSON.parse(raw);
    if (typeof d.money === 'number') S.money = d.money;
    if (typeof d.missionsDone === 'number') S.stats.missionsDone = d.missionsDone;
    if (typeof d.bestTime === 'number') S.stats.bestTime = d.bestTime;
  } catch { /* corrupted save — start fresh */ }
}
