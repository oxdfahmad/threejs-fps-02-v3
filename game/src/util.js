// Lantern Row — small shared helpers: numbers, angles, seeded chance.
// Nothing here knows about the game; every module above imports from here.

// Clamp v into [lo, hi].
export function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

// Wrap an angle in radians to (-PI, PI].
export function wrapAngle(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a <= -Math.PI) a += Math.PI * 2;
  return a;
}

// Shortest signed turn from angle a to angle b, in (-PI, PI].
export function angleTo(a, b) {
  return wrapAngle(b - a);
}

// Deterministic RNG (mulberry32). One instance per match, seeded from the
// URL (?seed=) so a screenshot run replays the same bot behaviour.
export function makeRng(seed) {
  let s = (seed >>> 0) || 0x9e3779b9;
  return function () {
    s |= 0;
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function pick(rng, list) {
  return list[Math.floor(rng() * list.length)];
}

export function chance(rng, p) {
  return rng() < p;
}

// Squared distance on the ground plane (x/z only). Hot path: no sqrt.
export function dist2(ax, az, bx, bz) {
  const dx = ax - bx;
  const dz = az - bz;
  return dx * dx + dz * dz;
}

export function dist(ax, az, bx, bz) {
  return Math.sqrt(dist2(ax, az, bx, bz));
}

// Armour absorbs half of a hit until it runs out. Mutates target.armour
// and returns the hp damage actually dealt (at least 1). Shared by the
// player, bot-vs-bot fire and the player's shots so the rule lives once.
export function applyArmour(target, dmg) {
  let dealt = dmg;
  if (target.armour > 0) {
    const absorbed = Math.min(target.armour, dealt * 0.5);
    target.armour -= absorbed;
    dealt -= absorbed;
  }
  return Math.max(1, Math.round(dealt));
}

// Format seconds as M:SS for the round clock.
export function clockText(seconds) {
  const s = Math.max(0, Math.ceil(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export function moneyText(n) {
  return '$' + Math.round(n).toLocaleString('en-US');
}
