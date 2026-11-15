// Lantern Row — the night-market palette. One dusk sky, warm lantern light
// against deep blue shadow, so the whole map reads at a glance in a single
// frame: warm stalls, cool lanes, red paper, teal water.

// Sky: dusk gradient is painted by the renderer fog + clear colour; these are
// the material colours the world is built from.
export const PALETTE = {
  skyTop: 0x1b2a52, // deep dusk blue, high
  skyLow: 0xff9a4d, // lantern orange at the horizon
  fog: 0x2a2f45, // haze between stalls
  ground: 0x3a3a40, // wet stone lanes
  groundDark: 0x2c2c33, // shadowed alley stone
  wallPlaster: 0x8a7a68, // old shop walls
  wallBrick: 0x7a4a3a, // brick stall bases
  wood: 0x6b4a2f, // stall frames and crates
  woodLight: 0x9a744a, // crate lids and counters
  clothRed: 0xb03a2e, // awnings and banners
  clothTeal: 0x2e7f7a, // second awning colour
  clothGold: 0xd9a441, // trim and signs
  lantern: 0xffb347, // paper lantern glow
  lanternPaper: 0xffd9a0, // lantern shell
  water: 0x2e5f6b, // koi pond
  leaf: 0x4a7a4a, // planters and vines
  metal: 0x5a6068, // shutters and pipes
  chalk: 0xe8e0d0, // painted site letters
  ally: 0x35c8e8, // ally markers on the minimap
  enemy: 0xff4d8d, // enemy markers when seen
  tracerAlly: 0xffd27a, // ally tracer colour
  tracerEnemy: 0xff5a5a, // enemy tracer colour
  smoke: 0xcfd4da, // smoke puffs
};
