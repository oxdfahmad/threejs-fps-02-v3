# Lantern Row — a night-market tactical FPS

A round-based tactical FPS in the Counter-Strike shape, built on three.js
0.187.0 (vendored, no network): five attackers of the **Ember Syndicate**
against five of the **Night Watch** on one hero map — a lantern-lit night
market with three lanes (Tea House, Lantern Gate, Spice Row) and two sites
(Spice Court, Fish Hall).

## What is in the game

- **Rounds:** 12 rounds, first to 7. Buy phase, then a live phase that ends
  by elimination, by the core exploding, by a defuse, or by the clock.
- **The core:** the Entry bot carries it; if they fall, the nearest attacker
  takes it — or you pick it up yourself, walk it to a site and hold E to
  plant (3.5 s). A planted core ticks 40 s; a defender channels 5 s to
  defuse.
- **Money:** kills pay $300, wins $3,250, losses $1,900 plus a streak bonus.
  The buy menu (B, during the buy phase) sells four primaries, armour,
  a helmet and three throwables.
- **Gunplay:** hitscan bodies with 4× headshots, recoil and bloom that
  punish firing on the move, ADS (right mouse), crouching, acceleration,
  jumping, collision with the map.
- **Bots:** five named bots per side with roles (Entry, Lurk, Support,
  Sniper, Caller / A Hold, B Hold, Mid, Roam, Sniper). They follow routes,
  hold positions, react to sight and to the sound of gunfire, and talk on
  the radio — contacts, rotations, plants and footsteps, always naming the
  place. Their names and callouts are on the HUD and in the screenshots.
- **HUD:** team bar with named teams and the round clock, a live minimap
  (walls, sites, the core, allies, seen enemies, your facing), a roster,
  the current location name, kill feed, radio feed, health/armour/money,
  weapon and ammunition, utility counts, plant progress, hitmarkers.
- **Sound:** every effect is synthesized with WebAudio — gunshots by weapon,
  hits, kills, reloads, footsteps, plant/defuse beeps, explosions, radio
  blips. No audio files. M mutes.
- **Code:** one module per job (`world`, `player`, `weapon`, `bots`,
  `radio`, `throwables`, `effects`, `audio`, `hud`, `rounds`, `input`);
  a fixed-step simulation (1/60 s) kept apart from rendering; effects are
  pooled and reused, so the hot loop makes no new objects per frame.

## Play

```sh
node serve.ts
# open http://localhost:8080 — click to lock the mouse and play
```

WASD move · mouse look · left click fire · right click aim · R reload ·
1/2/3 weapons · 4/5/6 frag / smoke / flash · E plant the core · B buy ·
C crouch · Space jump · M mute.

## Screenshots

`?shot=1` buy phase · `?shot=2` mid-fight in Tea House lane ·
`?shot=3` core planted at Spice Court · `?shot=4` round end.
All four are real renders of this code in a browser.
