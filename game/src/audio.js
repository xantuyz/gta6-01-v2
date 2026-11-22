// audio.js — WebAudio synthesis only: engine hum, police siren, pickup
// and success blips. No audio files are loaded; nothing plays until the
// player clicks MULAI (browsers require a user gesture for audio).
let ctx = null;
let engineOsc = null;
let engineGain = null;
let sirenOsc = null;
let sirenGain = null;
let muted = false;

export function ensureAudio() {
  if (ctx || muted) return;
  try {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    engineOsc = ctx.createOscillator();
    engineOsc.type = 'sawtooth';
    engineOsc.frequency.value = 55;
    engineGain = ctx.createGain();
    engineGain.gain.value = 0;
    const filt = ctx.createBiquadFilter();
    filt.type = 'lowpass';
    filt.frequency.value = 420;
    engineOsc.connect(filt);
    filt.connect(engineGain);
    engineGain.connect(ctx.destination);
    engineOsc.start();
    sirenOsc = ctx.createOscillator();
    sirenOsc.type = 'sine';
    sirenOsc.frequency.value = 720;
    sirenGain = ctx.createGain();
    sirenGain.gain.value = 0;
    sirenOsc.connect(sirenGain);
    sirenGain.connect(ctx.destination);
    sirenOsc.start();
  } catch { ctx = null; }
}

export function setMuted(m) {
  muted = m;
  if (engineGain) engineGain.gain.value = 0;
  if (sirenGain) sirenGain.gain.value = 0;
}

function blip(freq, dur, type = 'sine', vol = 0.16) {
  if (!ctx || muted) return;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.value = freq;
  g.gain.setValueAtTime(vol, ctx.currentTime);
  g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
  o.connect(g);
  g.connect(ctx.destination);
  o.start();
  o.stop(ctx.currentTime + dur);
}

export function sfxPickup() {
  blip(660, 0.12);
  setTimeout(() => blip(880, 0.16), 90);
}

export function sfxComplete() {
  [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => blip(f, 0.22), i * 110));
}

export function sfxBusted() {
  blip(220, 0.4, 'square', 0.12);
  setTimeout(() => blip(160, 0.5, 'square', 0.12), 180);
}

// Called every frame: engine pitch follows speed, siren wails while wanted.
export function updateAudio(S, dt, time) {
  if (!ctx || muted) return;
  const car = S.player.carId >= 0
    ? S.cars.find((c) => c.id === S.player.carId) : null;
  const spd = car ? Math.abs(car.speed) : 0;
  engineGain.gain.setTargetAtTime(S.phase === 'play' ? 0.02 + spd * 0.0016 : 0, ctx.currentTime, 0.1);
  engineOsc.frequency.setTargetAtTime(48 + spd * 4.2, ctx.currentTime, 0.08);
  if (S.wanted > 0 && S.phase === 'play') {
    sirenGain.gain.setTargetAtTime(0.045, ctx.currentTime, 0.2);
    sirenOsc.frequency.setTargetAtTime(660 + Math.sin(time * 5) * 220, ctx.currentTime, 0.05);
  } else {
    sirenGain.gain.setTargetAtTime(0, ctx.currentTime, 0.2);
  }
  void dt;
}
