// hud.js — DOM HUD (wanted stars, objective, speed, prompt, toast) plus
// the circular minimap canvas.
import { WORLD, GARAGE, MARINA, MARKET, BRIDGE } from './state.js';
import { playerCar } from './vehicles.js';

const $ = (id) => document.getElementById(id);

export function updateHud(S, input) {
  const stars = '★'.repeat(S.wanted)
    + '<span class="off">' + '★'.repeat(5 - S.wanted) + '</span>';
  $('wanted').innerHTML = stars;
  $('money').textContent = '$ ' + S.money.toLocaleString('id-ID');
  $('objName').textContent = S.mission.name.toUpperCase();
  $('objText').textContent = S.mission.text
    + (S.mission.done ? '' : ' — ' + objectiveDistance(S) + ' m');
  const car = playerCar(S);
  const kmh = car ? Math.round(Math.abs(car.speed) * 3.6) : 0;
  $('speedNum').textContent = kmh;
  $('gearTxt').textContent = car ? car.spec.name.toUpperCase() : 'JALAN KAKI';
  $('hpFill').style.width = Math.max(0, S.player.hp) + '%';
  // Context prompt.
  const prompt = $('prompt');
  if (S.phase === 'play') {
    const label = contextPrompt(S);
    if (label) {
      prompt.innerHTML = label;
      prompt.style.display = 'block';
    } else prompt.style.display = 'none';
  } else prompt.style.display = 'none';
  // Toasts (latest event, 3.2 s).
  const toastEl = $('toast');
  const ev = S.events[S.events.length - 1];
  if (ev && ev.t > 0) {
    toastEl.textContent = ev.text;
    toastEl.style.display = 'block';
  } else toastEl.style.display = 'none';
  drawMinimap(S);
}

function objectiveDistance(S) {
  const P = S.player;
  const car = playerCar(S);
  const px = car ? car.x : P.x;
  const pz = car ? car.z : P.z;
  const t = S.mission.target;
  return Math.round(Math.hypot(t.x - px, t.z - pz));
}

function contextPrompt(S) {
  const P = S.player;
  if (P.onFoot) {
    let best = null;
    let bestD = 4.2 * 4.2;
    for (const c of S.cars) {
      const d = (c.x - P.x) ** 2 + (c.z - P.z) ** 2;
      if (d < bestD) {
        bestD = d;
        best = c;
      }
    }
    if (best) {
      const owned = !best.crew && (best.driver === 'traffic' || best.driver === 'parked');
      return `<b>E</b>${owned ? 'Curi' : 'Masuk'} ${best.spec.name}`;
    }
    return '';
  }
  return '<b>E</b>Keluar mobil &nbsp;·&nbsp; <b>Spasi</b> rem tangan';
}

function drawMinimap(S) {
  const cv = $('minimap');
  const g = cv.getContext('2d');
  const W = cv.width;
  const scale = W / (WORLD.half * 2 + 20);
  const toMap = (x, z) => [(x + WORLD.half + 10) * scale, (z + WORLD.half + 10) * scale];
  g.clearRect(0, 0, W, W);
  g.fillStyle = '#12283a';
  g.beginPath();
  g.arc(W / 2, W / 2, W / 2 - 2, 0, Math.PI * 2);
  g.fill();
  g.save();
  g.beginPath();
  g.arc(W / 2, W / 2, W / 2 - 2, 0, Math.PI * 2);
  g.clip();
  // Water + roads.
  g.fillStyle = '#2e7f9e';
  g.fillRect(0, toMap(0, 150)[1], W, W);
  g.strokeStyle = '#5a6b7a';
  g.lineWidth = 10;
  for (const s of WORLD.streets) {
    const [x1, y1] = toMap(-WORLD.half, s);
    const [x2, y2] = toMap(WORLD.half, s);
    g.beginPath();
    g.moveTo(x1, y1);
    g.lineTo(x2, y2);
    g.stroke();
    const [x3, y3] = toMap(s, -WORLD.half);
    const [x4, y4] = toMap(s, WORLD.half);
    g.beginPath();
    g.moveTo(x3, y3);
    g.lineTo(x4, y4);
    g.stroke();
  }
  // Landmarks.
  const dot = (x, z, color, r) => {
    const [mx, my] = toMap(x, z);
    g.fillStyle = color;
    g.beginPath();
    g.arc(mx, my, r, 0, Math.PI * 2);
    g.fill();
  };
  dot(GARAGE.x, GARAGE.z, '#ffd23e', 7);
  dot(MARINA.x, MARINA.z, '#7dff9b', 7);
  dot(MARKET.x, MARKET.z, '#ff9d5c', 5);
  dot(BRIDGE.x, BRIDGE.z, '#9fd8ff', 5);
  // Mission target: pulsing gold ring.
  const [tx, ty] = toMap(S.mission.target.x, S.mission.target.z);
  g.strokeStyle = '#ffd23e';
  g.lineWidth = 3;
  g.beginPath();
  g.arc(tx, ty, 10 + Math.sin(S.time * 4) * 3, 0, Math.PI * 2);
  g.stroke();
  // Police as red dots.
  for (const car of S.police) dot(car.x, car.z, '#ff4a4a', 4);
  // Player arrow.
  const P = S.player;
  const car = playerCar(S);
  const [px, py] = toMap(car ? car.x : P.x, car ? car.z : P.z);
  const yaw = car ? car.yaw : P.yaw;
  g.fillStyle = '#ffffff';
  g.save();
  g.translate(px, py);
  g.rotate(Math.PI - yaw);
  g.beginPath();
  g.moveTo(0, -9);
  g.lineTo(6, 7);
  g.lineTo(-6, 7);
  g.closePath();
  g.fill();
  g.restore();
  g.restore();
}
