// rng.js — seeded randomness for SOLMARA. Every random choice in the
// game (city layout, traffic, pedestrians) flows through these functions,
// so a fixed seed always builds the same city and the same screenshots.
// There is deliberately no Math.random anywhere in the game code.
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function pick(rng, list) {
  return list[Math.floor(rng() * list.length)];
}

export function range(rng, lo, hi) {
  return lo + rng() * (hi - lo);
}

export function clamp(v, lo, hi) {
  if (v < lo) return lo;
  if (v > hi) return hi;
  return v;
}

// Shortest-arc angle blend, used for camera and heading smoothing.
export function lerpAngle(a, b, t) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

export function dist2(ax, az, bx, bz) {
  const dx = ax - bx;
  const dz = az - bz;
  return dx * dx + dz * dz;
}

// Wrap an angle difference to [-PI, PI]. NOTE: JS % keeps the sign of
// its left operand, so the one-liner ((d + 3PI) % 2PI) - PI is WRONG for
// d < -3PI (it returns values outside [-PI, PI] once a yaw has wound
// past ~9.4 rad). Reduce first, then correct once — the remainder is
// always in (-2PI, 2PI), so one step each way is enough.
export function wrapAngle(d) {
  d = d % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}
