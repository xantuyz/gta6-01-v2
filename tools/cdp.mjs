// tools/cdp.mjs — headless playtest + screenshot harness for SOLMARA.
// No dependencies: drives the Playwright chromium-headless-shell over CDP
// with Node 24's built-in WebSocket + fetch. Usage:
//   node tools/cdp.mjs smoke            # load, start, 0 console errors
//   node tools/cdp.mjs shots            # 4 deterministic screenshots
//   node tools/cdp.mjs shots2           # 2nd run for sha256 comparison
//   node tools/cdp.mjs day1             # Hari 1 playtest
//   node tools/cdp.mjs campaign van     # full campaign, job 3 picks van
//   node tools/cdp.mjs campaign sport   # full campaign, job 3 picks sport
// Logs go to stdout AND tools/logs/<mode>-<stamp>.log (incremental append).
import { spawn, execSync } from 'node:child_process';
import { appendFileSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const CHROME = process.env.CHROME_BIN
  || (process.env.HOME + '/.cache/ms-playwright/chromium_headless_shell-1255/chrome-headless-shell-linux64/chrome-headless-shell');
const PORT = 8091;
const CDP_PORT = 9223;

const mode = process.argv[2] || 'smoke';
const modeArg = process.argv[3] || '';
const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const LOG = join(HERE, 'logs', `${mode}-${modeArg || 'x'}-${stamp}.log`);
mkdirSync(join(HERE, 'logs'), { recursive: true });

const errors = [];
function log(...a) {
  const line = `[${new Date().toISOString().slice(11, 19)}] ` + a.join(' ');
  console.log(line);
  appendFileSync(LOG, line + '\n');
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- CDP client ----------
let ws = null;
let nextId = 1;
const pending = new Map();
function cdp(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = nextId++;
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
    setTimeout(() => { if (pending.has(id)) { pending.delete(id); reject(new Error('cdp timeout ' + method)); } }, 30000);
  });
}
async function evalJs(expression) {
  const r = await cdp('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error('page js error: ' + JSON.stringify(r.exceptionDetails).slice(0, 500));
  return r.result.value;
}

const KEYMAP = {
  w: { key: 'w', code: 'KeyW', vk: 87, text: 'w' },
  a: { key: 'a', code: 'KeyA', vk: 65, text: 'a' },
  s: { key: 's', code: 'KeyS', vk: 83, text: 's' },
  d: { key: 'd', code: 'KeyD', vk: 68, text: 'd' },
  e: { key: 'e', code: 'KeyE', vk: 69, text: 'e' },
  r: { key: 'r', code: 'KeyR', vk: 82, text: 'r' },
  shift: { key: 'Shift', code: 'ShiftLeft', vk: 16 },
  ' ': { key: ' ', code: 'Space', vk: 32, text: ' ' },
};
const held = new Set();
async function keyDown(k) {
  const m = KEYMAP[k];
  await cdp('Input.dispatchKeyEvent', { type: 'keyDown', ...m, windowsVirtualKeyCode: m.vk });
}
async function keyUp(k) {
  const m = KEYMAP[k];
  await cdp('Input.dispatchKeyEvent', { type: 'keyUp', ...m, windowsVirtualKeyCode: m.vk });
}
async function setKeys(want) {
  for (const k of [...held]) if (!want.has(k)) { held.delete(k); await keyUp(k); }
  for (const k of [...want]) if (!held.has(k)) { held.add(k); await keyDown(k); }
}
async function tap(k) {
  await keyDown(k);
  await sleep(90);
  await keyUp(k);
}
async function releaseAll() { await setKeys(new Set()); }

const SNAP = `(() => { const w = window.__solmara; if (!w) return {ready:false};
const S = w.S; const car = S.player.carId>=0 ? S.cars.find(c=>c.id===S.player.carId) : null;
return {ready:true, phase:S.phase, money:S.money, wanted:S.wanted, hp:S.player.hp,
job:S.mission.id, jobName:S.mission.name, step:S.mission.step, stepText:S.mission.text,
done:S.mission.done, campaignDone:S.campaign.done, onFoot:S.player.onFoot,
px:S.player.x, pz:S.player.z, camYaw:S.player.camYaw,
car: car?{x:car.x,z:car.z,yaw:car.yaw,speed:car.speed,cls:car.cls}:null,
target:{x:S.mission.target.x,z:S.mission.target.z}, police:S.police.length,
busted:S.busted, time:S.time, bridgeRaised:S.bridgeRaised, crewChoice:S.crewChoice,
cars:S.cars.map(c=>({x:Math.round(c.x),z:Math.round(c.z),cls:c.cls,driver:c.driver}))}; })()`;

async function snap() { return evalJs(SNAP); }

async function waitFor(fn, timeoutMs, label) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    const v = await fn().catch(() => null);
    if (v) return v;
    await sleep(200);
  }
  throw new Error('timeout waiting for ' + label);
}

// ---------- browser / server ----------
let chromeProc = null;
let serverProc = null;
async function startInfra(winW, winH) {
  serverProc = spawn('node', ['serve.ts', '--port', String(PORT)], { cwd: ROOT, stdio: 'ignore' });
  await waitFor(async () => {
    try { const r = await fetch(`http://127.0.0.1:${PORT}/index.html`); return r.ok || null; } catch { return null; }
  }, 15000, 'server');
  const profile = `/tmp/solmara-profile-${mode}-${stamp}`;
  chromeProc = spawn(CHROME, ['--headless', '--no-sandbox', '--disable-gpu',
    '--enable-unsafe-swiftshader', `--window-size=${winW},${winH}`,
    `--remote-debugging-port=${CDP_PORT}`, `--user-data-dir=${profile}`, 'about:blank'],
    { stdio: 'ignore' });
  const targets = await waitFor(async () => {
    try {
      const r = await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`);
      const list = await r.json();
      return list.length ? list : null;
    } catch { return null; }
  }, 30000, 'cdp');
  const page = targets.find((t) => t.type === 'page');
  ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id).resolve(m.result); pending.delete(m.id); return; }
    if (m.method === 'Runtime.exceptionThrown') {
      const e = m.params.exceptionDetails?.exception?.description || m.params.exceptionDetails?.text || 'exception';
      errors.push('EXCEPTION: ' + String(e).slice(0, 400));
    }
    if (m.method === 'Runtime.consoleAPICalled' && (m.params.type === 'error' || m.params.type === 'warning')) {
      const text = m.params.args.map((a) => a.value ?? a.description ?? '').join(' ');
      if (m.params.type === 'error') errors.push('CONSOLE ERROR: ' + text.slice(0, 400));
      else log('console warning: ' + text.slice(0, 200));
    }
    if (m.method === 'Log.entryAdded' && m.params.entry.level === 'error') {
      errors.push('LOG ERROR: ' + (m.params.entry.text || '').slice(0, 400));
    }
  };
  await cdp('Runtime.enable');
  await cdp('Page.enable');
  await cdp('Log.enable');
  await cdp('Emulation.setDeviceMetricsOverride', { width: winW, height: winH, deviceScaleFactor: 1, mobile: false });
}
async function stopInfra() {
  try { await releaseAll(); } catch {}
  try { ws?.close(); } catch {}
  try { chromeProc?.kill('SIGKILL'); } catch {}
  try { serverProc?.kill('SIGKILL'); } catch {}
}
async function navigate(url) {
  await cdp('Page.navigate', { url });
}
async function clickStart() {
  await evalJs(`document.getElementById('startBtn').click(); 'ok'`);
  await sleep(300);
}
async function screenshotJpeg(path) {
  const r = await cdp('Page.captureScreenshot', { format: 'jpeg', quality: 85 });
  writeFileSync(path, Buffer.from(r.data, 'base64'));
}
function sha256(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

// ---------- autopilot ----------
const wrapAngle = (d) => {
  d = d % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
};
const dist = (ax, az, bx, bz) => Math.hypot(ax - bx, az - bz);

// Road waypoints per leg (hand-tuned to the street grid; the controller
// only presses keys, it never teleports or edits state).
// The east -> north turn at (0,60) needs an early-turn pair (-20,60) ->
// (-6,30): the car's tightest turn radius is ~14 m and the (30,30) block's
// building face sits at x ~= 8, so a turn started at x ~= 0 sweeps into
// the building and wedges the car. Starting the turn at x <= -20 keeps
// even a slow (5 m/s, ~20 m radius) arc west of the face.
const LEGS = {
  garageToMarina: [{ x: -96, z: 60 }, { x: 120, z: 60 }, { x: 128, z: 132 }, { x: 132, z: 138 }],
  marinaToGarage: [{ x: 120, z: 138 }, { x: 120, z: 60 }, { x: -96, z: 60 }, { x: -100, z: 72 }, { x: -96, z: 96 }],
  garageToMarket: [{ x: -96, z: 60 }, { x: -20, z: 60 }, { x: -6, z: 30 }, { x: 0, z: -6 }],
  marketToMarina: [{ x: 24, z: -60 }, { x: 120, z: -60 }, { x: 120, z: 60 }, { x: 128, z: 132 }, { x: 132, z: 138 }],
  garageToFreight: [{ x: -96, z: 60 }, { x: -20, z: 60 }, { x: -6, z: 30 }, { x: 0, z: 120 }, { x: 0, z: 150 }, { x: 0, z: 172 }, { x: 0, z: 186 }, { x: 30, z: 196 }],
  freightToGarage: [{ x: 0, z: 186 }, { x: 0, z: 172 }, { x: 0, z: 150 }, { x: 0, z: 120 }, { x: 0, z: 60 }, { x: -96, z: 60 }, { x: -100, z: 72 }, { x: -96, z: 96 }],
};

// Drive toward a waypoint list. Returns when the final waypoint is
// reached (within `accept` m) or `timeoutMs` elapses. Logs progress.
// The controller brakes before sharp turns and before the final stop —
// a human driver does the same; holding W through a 90-degree turn at
// full speed just grinds the car along the buildings.
async function driveRoute(wps, accept, timeoutMs, label) {
  const t0 = Date.now();
  let wi = 0;
  let slowSince = 0;
  let slowX = 0, slowZ = 0;
  let reversingUntil = 0;
  let lastLog = 0;
  while (Date.now() - t0 < timeoutMs) {
    const s = await snap();
    if (!s.ready) { await sleep(150); continue; }
    if (s.busted) return { ok: false, why: 'busted', s };
    const car = s.car;
    if (!car) return { ok: false, why: 'not-in-car', s };
    const wp = wps[Math.min(wi, wps.length - 1)];
    const isFinal = wi >= wps.length - 1;
    const d = dist(car.x, car.z, wp.x, wp.z);
    // Intermediate waypoints are guide points on 14 m-wide roads: accept
    // 14 m for them (the car may pass one while turning into the next
    // leg — e.g. the garage mouth, already passed while driving in).
    // The final waypoint keeps the caller's tighter acceptance.
    const acc = isFinal ? accept : Math.max(accept, 14);
    if (d < acc) {
      if (isFinal) { await releaseAll(); return { ok: true, s }; }
      wi++;
      continue;
    }
    const now = Date.now();
    // Steering always aims at the CURRENT waypoint (stay on the road);
    // braking looks at the turn to the NEXT waypoint. Aiming the steering
    // at the next waypoint pulls the car diagonally through building
    // blocks — that is what stranded the car at z=102 twice.
    const diff = wrapAngle(Math.atan2(wp.x - car.x, wp.z - car.z) - car.yaw);
    const adiff = Math.abs(diff);
    let nextTurn = 0;
    if (!isFinal && wi < wps.length - 1) {
      const nxt = wps[wi + 1];
      const dirNow = Math.atan2(wp.x - car.x, wp.z - car.z);
      const dirNext = Math.atan2(nxt.x - wp.x, nxt.z - wp.z);
      nextTurn = Math.abs(wrapAngle(dirNext - dirNow));
    }
    const spd = Math.abs(car.speed);
    const keys = new Set();
    if (now < reversingUntil) {
      keys.add('s');
      keys.add(diff > 0 ? 'd' : 'a'); // steer opposite while reversing
    } else if (spd < 4) {
      // Barely moving: only reverse when the car is REALLY not going
      // anywhere (moved < 2 m in 3 s). A car sliding along a wall at
      // 3 m/s is still making progress — reversing would undo its turn.
      if (!slowSince) { slowSince = now; slowX = car.x; slowZ = car.z; }
      if (now - slowSince > 3000 && Math.hypot(car.x - slowX, car.z - slowZ) < 2) {
        log(`  [${label}] stuck at (${car.x.toFixed(0)},${car.z.toFixed(0)}) spd=${car.speed.toFixed(1)} — reversing`);
        reversingUntil = now + 1300;
        slowSince = 0;
        keys.add('s');
      } else {
        keys.add('w');
        if (diff > 0.12) keys.add('a');
        else if (diff < -0.12) keys.add('d');
      }
    } else {
      slowSince = 0;
      if (adiff > 2.5 && spd < 9 && now > reversingUntil) {
        // Near U-turn at low speed: 3-point turn — reverse briefly with
        // opposite steer instead of creeping around in a wide arc.
        log(`  [${label}] 3-point turn at (${car.x.toFixed(0)},${car.z.toFixed(0)}) diff=${diff.toFixed(2)}`);
        reversingUntil = now + 1200;
        keys.add('s');
        keys.add(diff > 0 ? 'd' : 'a');
      } else if ((adiff > 0.4 || (nextTurn > 0.4 && d < 30)) && spd > 8) {
        keys.add('s'); // brake (straight) before a sharp turn — down to
        // ~8 m/s, where this arcade model turns fastest (~0.7 rad/s).
        // Braking to a crawl (4 m/s) turns at only ~0.1 rad/s and the
        // car wanders off in a 100-second arc instead of turning.
      } else if (isFinal && d < 28 && spd > 9) {
        keys.add('s'); // brake for the final stop
        if (diff > 0.12) keys.add('a');
        else if (diff < -0.12) keys.add('d');
      } else {
        keys.add('w');
        if (diff > 0.12) keys.add('a'); // yaw must increase -> steer left
        else if (diff < -0.12) keys.add('d');
      }
    }
    await setKeys(keys);
    if (now - lastLog > 5000) {
      lastLog = now;
      log(`  [${label}] wp ${wi + 1}/${wps.length} d=${d.toFixed(0)}m pos=(${car.x.toFixed(0)},${car.z.toFixed(0)}) spd=${car.speed.toFixed(1)} hp=${s.hp} wanted=${s.wanted} police=${s.police}`);
    }
    await sleep(140);
  }
  await releaseAll();
  return { ok: false, why: 'timeout', s: await snap() };
}

// Walk on foot toward a point (camera-relative keys). Returns when within
// `accept` m or on timeout.
async function walkTo(tx, tz, accept, timeoutMs, label) {
  const t0 = Date.now();
  let lastLog = 0;
  while (Date.now() - t0 < timeoutMs) {
    const s = await snap();
    if (!s.ready) { await sleep(150); continue; }
    if (!s.onFoot) return { ok: false, why: 'in-car', s };
    const d = dist(s.px, s.pz, tx, tz);
    if (d < accept) { await releaseAll(); return { ok: true, s }; }
    const dx = tx - s.px, dz = tz - s.pz;
    const len = Math.hypot(dx, dz) || 1;
    const fwd = (Math.sin(s.camYaw) * dx + Math.cos(s.camYaw) * dz) / len;
    const right = (-Math.cos(s.camYaw) * dx + Math.sin(s.camYaw) * dz) / len;
    const keys = new Set(['shift']);
    if (fwd > 0.3) keys.add('w');
    else if (fwd < -0.3) keys.add('s');
    if (right > 0.3) keys.add('d');
    else if (right < -0.3) keys.add('a');
    await setKeys(keys);
    const now = Date.now();
    if (now - lastLog > 5000) {
      lastLog = now;
      log(`  [${label}] walk d=${d.toFixed(1)}m pos=(${s.px.toFixed(0)},${s.pz.toFixed(0)})`);
    }
    await sleep(140);
  }
  await releaseAll();
  return { ok: false, why: 'timeout', s: await snap() };
}

// Wait until the mission reaches (job, step) or the job completes.
async function waitStep(job, step, timeoutMs, label) {
  const t0 = Date.now();
  let last = null;
  while (Date.now() - t0 < timeoutMs) {
    const s = await snap();
    if (!s.ready) { await sleep(200); continue; }
    if (s.job !== job || s.step !== step) last = s;
    if ((s.job === job && s.step === step) || s.job > job) return { ok: true, s };
    if (s.busted) return { ok: false, why: 'busted', s };
    await sleep(200);
  }
  return { ok: false, why: 'timeout', s: last || await snap() };
}

function check(name, cond, extra = '') {
  log(`${cond ? 'PASS' : 'FAIL'} — ${name} ${extra}`);
  return cond;
}

// ---------- modes ----------
async function modeSmoke() {
  await startInfra(800, 450);
  await navigate(`http://127.0.0.1:${PORT}/index.html`);
  await waitFor(async () => (await snap()).ready || null, 15000, 'game boot');
  await clickStart();
  await sleep(3000);
  const s = await snap();
  log('phase=' + s.phase + ' money=' + s.money + ' job=' + s.job + ' ' + s.jobName + ' step=' + s.step + ' hp=' + s.hp);
  check('game boots, phase play', s.phase === 'play');
  check('job 1 Marina Pickup, step 0', s.job === 1 && s.step === 0);
  check('money starts 1200', s.money === 1200);
  check('0 console errors', errors.length === 0, errors.join(' | '));
}

const SHOTS = JSON.parse(readFileSync(join(ROOT, 'shots.json'), 'utf8'));
async function modeShots(outDir, tag) {
  mkdirSync(outDir, { recursive: true });
  await startInfra(1280, 720);
  for (const shot of SHOTS) {
    await navigate(`http://127.0.0.1:${PORT}/index.html${shot.query}`);
    await waitFor(async () => (await evalJs(`window.__shotReady ? window.__shotName : null`)) || null, 20000, 'shot ' + shot.name);
    await sleep(400);
    const p = join(outDir, shot.name);
    await screenshotJpeg(p);
    log(`${tag} shot ${shot.name}: sha256=${sha256(p)} bytes=${readFileSync(p).length}`);
  }
  check('0 console errors during shots', errors.length === 0, errors.join(' | '));
}

async function modeDay1() {
  await startInfra(800, 450);
  await navigate(`http://127.0.0.1:${PORT}/index.html`);
  await waitFor(async () => (await snap()).ready || null, 15000, 'game boot');
  await clickStart();
  let s = await snap();
  check('phase play', s.phase === 'play');
  // 1. Walk to the garage (step 0 -> 1).
  let r = await walkTo(-96, 96, 5, 60000, 'walk-garage');
  check('walk to garage', r.ok, r.why || '');
  r = await waitStep(1, 1, 10000, 'step1');
  check('mission step 0 -> 1 (gotoFoot)', r.ok, JSON.stringify({ job: r.s.job, step: r.s.step }));
  // 2. Enter the nearest crew car.
  s = await snap();
  const cars = s.cars.filter((c) => c.driver === 'crew');
  let target = cars[0];
  for (const c of cars) if (dist(s.px, s.pz, c.x, c.z) < dist(s.px, s.pz, target.x, target.z)) target = c;
  r = await walkTo(target.x, target.z, 2.5, 60000, 'walk-to-car');
  check('walk to crew car ' + target.cls, r.ok, r.why || '');
  await tap('e');
  await sleep(500);
  s = await snap();
  check('entered car (onFoot=false)', !s.onFoot && !!s.car, JSON.stringify({ onFoot: s.onFoot, car: s.car?.cls }));
  check('no wanted from crew car', s.wanted === 0, 'wanted=' + s.wanted);
  r = await waitStep(1, 2, 10000, 'step2');
  check('mission step 1 -> 2 (enter)', r.ok, JSON.stringify({ job: r.s.job, step: r.s.step }));
  // 3. Turn LEFT inside the garage (the old wedge bug): hold A+W, yaw must grow.
  // Headless SwiftShader runs the sim slower than wall clock, so hold for
  // 4 s — a real player turning left from a standstill turns well inside that.
  const yaw0 = (await snap()).car.yaw;
  await setKeys(new Set(['w', 'a']));
  await sleep(4000);
  await releaseAll();
  const yaw1 = (await snap()).car.yaw;
  const dYaw = wrapAngle(yaw1 - yaw0);
  log(`garage left turn: yaw ${yaw0.toFixed(2)} -> ${yaw1.toFixed(2)} (delta ${dYaw.toFixed(2)} rad)`);
  check('car turns left inside garage', dYaw > 0.25, 'delta=' + dYaw.toFixed(2));
  // 4. Drive out of the garage onto the street, already turning east —
  // one route so the corner lookahead sees the turn at (-96, 60).
  r = await driveRoute([{ x: -96, z: 60 }, { x: 0, z: 60 }], 8, 120000, 'exit-garage');
  check('drive out of garage', r.ok, r.why || '');
  // 5. Drive to the marina (step 2 -> 3).
  r = await driveRoute([{ x: 120, z: 60 }, { x: 128, z: 132 }, { x: 132, z: 138 }], 8, 180000, 'to-marina');
  check('drive garage -> marina', r.ok, r.why || '');
  r = await waitStep(1, 3, 15000, 'step3');
  check('mission step 2 -> 3 (deliver marina)', r.ok, JSON.stringify({ job: r.s.job, step: r.s.step }));
  // 6. Drive back to the garage: job 1 completes +$450 (1200 -> 1650).
  r = await driveRoute(LEGS.marinaToGarage, 8, 180000, 'to-garage');
  check('drive marina -> garage', r.ok, r.why || '');
  r = await waitStep(2, 0, 20000, 'job2');
  s = await snap();
  check('job 1 done, job 2 Market Relay starts', r.ok && s.job === 2, JSON.stringify({ job: s.job, name: s.jobName, money: s.money }));
  check('money 1200 -> 1650 (+$450)', s.money === 1650, 'money=' + s.money);
  // 7. Restart (R): player + car back at the garage, job 2 step 0.
  await tap('r');
  await sleep(800);
  s = await snap();
  check('R: player on foot at garage', s.onFoot && dist(s.px, s.pz, -88, 88) < 6, `pos=(${s.px.toFixed(0)},${s.pz.toFixed(0)})`);
  check('R: job 2 step 0, wanted 0', s.job === 2 && s.step === 0 && s.wanted === 0, JSON.stringify({ job: s.job, step: s.step, wanted: s.wanted }));
  // 8. Steal at the market: drive there, exit, take the sedan.
  r = await walkTo(-96, 96, 5, 60000, 'walk-garage-2');
  const s2 = await snap();
  const crew2 = s2.cars.filter((c) => c.driver === 'crew');
  let t2 = crew2[0];
  for (const c of crew2) if (dist(s2.px, s2.pz, c.x, c.z) < dist(s2.px, s2.pz, t2.x, t2.z)) t2 = c;
  r = await walkTo(t2.x, t2.z, 2.5, 60000, 'walk-to-car-2');
  await tap('e');
  await sleep(500);
  s = await snap();
  check('re-entered car after R', !s.onFoot && !!s.car, JSON.stringify({ car: s.car?.cls }));
  r = await driveRoute(LEGS.garageToMarket, 8, 180000, 'to-market');
  check('drive garage -> market', r.ok, r.why || '');
  r = await waitStep(2, 1, 15000, 'job2-step1');
  check('job 2 step 0 -> 1 (goto market)', r.ok, JSON.stringify({ job: r.s.job, step: r.s.step }));
  await tap('e'); // exit the crew car
  await sleep(500);
  s = await snap();
  check('exited car at market', s.onFoot, '');
  r = await walkTo(24, -30, 2.5, 90000, 'walk-to-sedan');
  check('walk to market sedan', r.ok, r.why || '');
  await tap('e');
  await sleep(1200);
  s = await snap();
  check('stole sedan (in car, sedan)', !s.onFoot && s.car?.cls === 'sedan', JSON.stringify({ car: s.car?.cls }));
  check('wanted 1 after witnessed theft', s.wanted === 1, 'wanted=' + s.wanted);
  check('1 police dispatched', s.police === 1, 'police=' + s.police);
  check('0 console errors', errors.length === 0, errors.join(' | '));
  log('DAY1 RESULT: ' + (errors.length === 0 ? 'ALL CHECKS DONE (see PASS/FAIL above)' : 'CONSOLE ERRORS PRESENT'));
}

async function modeCampaign(pickCls) {
  await startInfra(800, 450);
  await navigate(`http://127.0.0.1:${PORT}/index.html`);
  await waitFor(async () => (await snap()).ready || null, 15000, 'game boot');
  await clickStart();
  const moneyLog = [];
  const tCampaign0 = Date.now();
  let bustedCount = 0;
  // ---- Job 1: walk, enter crew car, marina, garage.
  log('JOB 1 Marina Pickup — start');
  let r = await walkTo(-96, 96, 5, 60000, 'j1-walk-garage');
  if (!r.ok) throw new Error('j1 walk failed: ' + r.why);
  let s = await snap();
  const crew = s.cars.filter((c) => c.driver === 'crew');
  let t = crew[0];
  for (const c of crew) if (dist(s.px, s.pz, c.x, c.z) < dist(s.px, s.pz, t.x, t.z)) t = c;
  r = await walkTo(t.x, t.z, 2.5, 60000, 'j1-walk-car');
  if (!r.ok) throw new Error('j1 walk to car failed: ' + r.why);
  await tap('e'); await sleep(500);
  r = await driveRoute([{ x: -96, z: 60 }, ...LEGS.garageToMarina.slice(1) ], 8, 240000, 'j1-to-marina');
  if (!r.ok) throw new Error('j1 to marina failed: ' + r.why);
  await waitStep(1, 3, 15000, 'j1-step3');
  r = await driveRoute(LEGS.marinaToGarage, 8, 240000, 'j1-to-garage');
  if (!r.ok) throw new Error('j1 to garage failed: ' + r.why);
  r = await waitStep(2, 0, 20000, 'j2-start');
  s = await snap();
  moneyLog.push(['job1', s.money]);
  log(`JOB 1 DONE money=${s.money} hp=${s.hp} wanted=${s.wanted} (expect 1650)`);
  check('job 1 money 1650', s.money === 1650, 'money=' + s.money);
  // ---- Job 2: market, steal sedan, marina, garage.
  log('JOB 2 Market Relay — start');
  r = await driveRoute(LEGS.garageToMarket, 8, 240000, 'j2-to-market');
  if (!r.ok) throw new Error('j2 to market failed: ' + r.why);
  await waitStep(2, 1, 15000, 'j2-step1');
  await tap('e'); await sleep(500); // exit crew car
  r = await walkTo(24, -30, 2.5, 90000, 'j2-walk-sedan');
  if (!r.ok) throw new Error('j2 walk to sedan failed: ' + r.why);
  await tap('e'); await sleep(800);
  s = await snap();
  log(`JOB 2 steal: car=${s.car?.cls} wanted=${s.wanted} police=${s.police}`);
  check('job 2 stole sedan', s.car?.cls === 'sedan', 'car=' + s.car?.cls);
  r = await driveRoute(LEGS.marketToMarina, 8, 240000, 'j2-to-marina');
  if (!r.ok) throw new Error('j2 to marina failed: ' + r.why);
  await waitStep(2, 3, 15000, 'j2-step3');
  r = await driveRoute(LEGS.marinaToGarage, 8, 240000, 'j2-to-garage');
  if (!r.ok) throw new Error('j2 to garage failed: ' + r.why);
  r = await waitStep(3, 0, 20000, 'j3-start');
  s = await snap();
  moneyLog.push(['job2', s.money]);
  log(`JOB 2 DONE money=${s.money} hp=${s.hp} wanted=${s.wanted} (expect 2250)`);
  check('job 2 money 2250', s.money === 2250, 'money=' + s.money);
  // ---- Job 3: pick van or sport in the garage, freight island, garage.
  log(`JOB 3 Freight Run — pick ${pickCls}`);
  await tap('e'); await sleep(500); // exit sedan
  s = await snap();
  const wantCar = pickCls === 'van' ? { x: -88.5, z: 94 } : { x: -103.5, z: 94 };
  let entered = null;
  for (let attempt = 1; attempt <= 3 && !entered; attempt++) {
    r = await walkTo(wantCar.x, wantCar.z, 2.2, 90000, `j3-walk-${pickCls}-a${attempt}`);
    if (!r.ok) break;
    await tap('e'); await sleep(600);
    s = await snap();
    if (!s.onFoot && s.car?.cls === pickCls) entered = s.car.cls;
    else if (!s.onFoot) { log(`  j3 attempt ${attempt}: entered ${s.car?.cls} instead — exiting`); await tap('e'); await sleep(500); }
  }
  check('job 3 picked ' + pickCls, entered === pickCls, 'entered=' + entered);
  if (!entered) throw new Error('job 3 pick failed');
  r = await driveRoute(LEGS.garageToFreight, 8, 300000, 'j3-to-freight');
  if (!r.ok) throw new Error('j3 to freight failed: ' + r.why);
  await waitStep(3, 2, 15000, 'j3-step2');
  r = await driveRoute(LEGS.freightToGarage, 8, 300000, 'j3-to-garage');
  if (!r.ok) throw new Error('j3 to garage failed: ' + r.why);
  r = await waitStep(4, 0, 20000, 'j4-start');
  s = await snap();
  moneyLog.push(['job3', s.money]);
  log(`JOB 3 DONE money=${s.money} hp=${s.hp} crewChoice=${s.crewChoice} bridgeRaised=${s.bridgeRaised} (expect 3000, van/sport)`);
  check('job 3 money 3000', s.money === 3000, 'money=' + s.money);
  check('job 3 crewChoice=' + pickCls, s.crewChoice === pickCls, 'crewChoice=' + s.crewChoice);
  // ---- Job 4: bridge raised — verify barrier, then marina + garage.
  s = await snap();
  check('job 4 bridge raised', s.bridgeRaised === true, 'bridgeRaised=' + s.bridgeRaised);
  log('JOB 4 Bridge Window — start (bridge raised)');
  r = await driveRoute(LEGS.garageToMarina, 8, 240000, 'j4-to-marina');
  if (!r.ok) throw new Error('j4 to marina failed: ' + r.why);
  await waitStep(4, 1, 15000, 'j4-step1');
  r = await driveRoute(LEGS.marinaToGarage, 8, 240000, 'j4-to-garage');
  if (!r.ok) throw new Error('j4 to garage failed: ' + r.why);
  r = await waitStep(5, 0, 20000, 'j5-start');
  s = await snap();
  moneyLog.push(['job4', s.money]);
  log(`JOB 4 DONE money=${s.money} hp=${s.hp} bridgeRaised=${s.bridgeRaised} wanted=${s.wanted} police=${s.police} (expect 3900, wanted 3)`);
  check('job 4 money 3900', s.money === 3900, 'money=' + s.money);
  check('job 4 bridge lowered after', s.bridgeRaised === false, 'bridgeRaised=' + s.bridgeRaised);
  check('job 5 finale starts wanted 3', s.wanted === 3, 'wanted=' + s.wanted);
  check('job 5 finale 3 police', s.police === 3, 'police=' + s.police);
  // ---- Job 5 finale: handoff depends on pick (van -> freight, sport -> marina), then garage.
  const finaleTarget = pickCls === 'van' ? 'freight' : 'marina';
  log(`JOB 5 Second Crossing (finale, ${pickCls} -> ${finaleTarget}) — start wanted=3`);
  const leg1 = pickCls === 'van' ? LEGS.garageToFreight : LEGS.garageToMarina;
  r = await driveRoute(leg1, 8, 300000, 'j5-to-handoff');
  if (!r.ok) {
    s = await snap();
    log(`j5 leg1 failed: ${r.why} hp=${s.hp} busted=${s.busted} pos car=${JSON.stringify(s.car)}`);
    throw new Error('j5 to handoff failed: ' + r.why);
  }
  await waitStep(5, 1, 15000, 'j5-step1');
  s = await snap();
  log(`j5 handoff reached hp=${s.hp} wanted=${s.wanted} police=${s.police}`);
  const leg2 = pickCls === 'van' ? LEGS.freightToGarage : LEGS.marinaToGarage;
  r = await driveRoute(leg2, 8, 300000, 'j5-to-garage');
  if (!r.ok) {
    s = await snap();
    log(`j5 leg2 failed: ${r.why} hp=${s.hp} busted=${s.busted} pos car=${JSON.stringify(s.car)}`);
    throw new Error('j5 to garage failed: ' + r.why);
  }
  const t1 = Date.now();
  let done = null;
  while (Date.now() - t1 < 20000) {
    s = await snap();
    if (s.campaignDone) { done = s; break; }
    await sleep(200);
  }
  s = await snap();
  moneyLog.push(['job5', s.money]);
  log(`JOB 5 DONE money=${s.money} hp=${s.hp} campaignDone=${s.campaignDone} (expect 5400, TAMAT)`);
  check('job 5 money 5400', s.money === 5400, 'money=' + s.money);
  check('campaign TAMAT (campaignDone)', s.campaignDone === true, 'campaignDone=' + s.campaignDone);
  check('0 console errors', errors.length === 0, errors.join(' | '));
  const mins = ((Date.now() - tCampaign0) / 60000).toFixed(1);
  log(`CAMPAIGN ${pickCls.toUpperCase()} RESULT: money trail=${JSON.stringify(moneyLog)} wall=${mins} min`);
}

// ---------- main ----------
try {
  if (mode === 'smoke') await modeSmoke();
  else if (mode === 'shots') await modeShots(join(ROOT, 'screenshots'), 'run1');
  else if (mode === 'shots2') await modeShots(join(HERE, 'shots-run2'), 'run2');
  else if (mode === 'day1') await modeDay1();
  else if (mode === 'campaign') await modeCampaign(modeArg === 'sport' ? 'sport' : 'van');
  else throw new Error('unknown mode ' + mode);
  log('MODE ' + mode + ' finished. console errors: ' + errors.length);
  if (errors.length) for (const e of errors) log('  ERR: ' + e);
} catch (e) {
  log('MODE ' + mode + ' THREW: ' + (e?.stack || e));
  try { const s = await snap(); log('last state: ' + JSON.stringify(s)); } catch {}
  if (errors.length) for (const e2 of errors) log('  ERR: ' + e2);
} finally {
  await stopInfra();
}
log('LOG FILE: ' + LOG);
