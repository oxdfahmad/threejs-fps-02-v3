// Lantern Row — the game loop. A fixed-step simulation (1/60 s) runs apart
// from rendering: movement, shooting, bots, the core and the round clock all
// advance in step(); the renderer only draws. The player is the sixth member
// of the Ember Syndicate — five named bots fight beside them, the Entry
// carries the core, and the player can take it over, plant it, and win the
// round that way.
//
// Screenshots: ?shot=1..4 stages a real scene (buy menu, mid-fight, plant,
// round end) and freezes the simulation so the frame is stable.

import * as THREE from 'three';
import { createWorld } from './world.js';
import { createPlayer } from './player.js';
import { createLoadout } from './weapon.js';
import { createBots } from './bots.js';
import { createThrowables } from './throwables.js';
import { createEffects } from './effects.js';
import { createAudio } from './audio.js';
import { createRadio } from './radio.js';
import { createHud } from './hud.js';
import { createRounds, BUY_SECONDS } from './rounds.js';
import { createInput } from './input.js';
import { applyArmour, clamp, dist, makeRng } from './util.js';

const STEP = 1 / 60;
const params = new URLSearchParams(window.location.search);
const shotMode = Number(params.get('shot') || 0);

const container = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
renderer.setSize(window.innerWidth, window.innerHeight);
container.appendChild(renderer.domElement);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 200);
camera.rotation.order = 'YXZ';
scene.add(camera);

const rng = makeRng(20261115);
const world = createWorld(scene);
const audio = createAudio();
const radio = createRadio(rng);
const hud = createHud(world);
const effects = createEffects(scene);
const input = createInput(renderer.domElement);
const player = createPlayer(world, world.spawns.attacker[1]);
const loadout = createLoadout();

// --- state ------------------------------------------------------------------
let now = 0;
let matchStarted = false;
let playerCarriesBomb = false;
let plantProgress = 0;
let hurtFlash = 0;
let shake = 0;
let gunKick = 0;
let buyOpen = false;
let matchOver = false;
const util = { frag: 0, smoke: 0, flash: 0 };
const stats = { kills: 0, deaths: 0, damage: 0 };
const shotsThisStep = [];
const seenEnemies = []; // defender bots the player has recently seen, for the minimap
let wasAlive = true;

// Temp vectors, allocated once: the hot loop makes no new objects.
const tmpFwd = new THREE.Vector3();
const tmpRight = new THREE.Vector3();
const tmpUp = new THREE.Vector3();
const tmpDir = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);

// --- the gun the player sees ------------------------------------------------
const gunGroup = new THREE.Group();
{
  const dark = new THREE.MeshStandardMaterial({ color: 0x23262b, roughness: 0.5, metalness: 0.4 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.13, 0.42), dark);
  const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.3), dark);
  barrel.position.set(0, 0.02, -0.32);
  const sight = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.05, 0.08), dark);
  sight.position.set(0, 0.09, -0.05);
  gunGroup.add(body, barrel, sight);
  gunGroup.position.set(0.28, -0.24, -0.5);
  camera.add(gunGroup);
}

// --- rounds -----------------------------------------------------------------
const rounds = createRounds(world, radio, {
  onRoundStart(round, site) {
    botApi.spawnRound(site);
    player.reset(world.spawns.attacker[1]);
    playerCarriesBomb = false;
    plantProgress = 0;
    rounds.bomb.carriedBy = 'Rook';
    wasAlive = true;
    buyOpen = true;
    hud.showBanner(`ROUND ${round} — take ${site === 'A' ? 'Spice Court' : 'Fish Hall'}`, now);
    refreshBuyMenu();
  },
  onLive() {
    buyOpen = false;
    hud.hideBuy();
    hud.showBanner('GO — plant the core', now);
    audio.blip();
  },
  onRoundEnd(winner, reason, sa, sd) {
    buyOpen = false;
    hud.hideBuy();
    const weWon = winner === 'attacker';
    hud.showBanner(`${weWon ? 'EMBER SYNDICATE' : 'NIGHT WATCH'} TAKES THE ROUND — ${reason}`, now);
    if (weWon) audio.win();
    else audio.lose();
  },
  onMatchEnd(result, sa, sd) {
    matchOver = true;
    const text =
      result === 'attacker'
        ? 'EMBER SYNDICATE WINS THE MATCH'
        : result === 'defender'
          ? 'NIGHT WATCH WINS THE MATCH'
          : 'DRAW — 6 : 6';
    hud.showEnd(
      text,
      result === 'attacker' ? 'The night market belongs to the Syndicate.' : 'The Watch held the market.',
      `Final ${sa} : ${sd} · You: ${stats.kills} kills, ${stats.deaths} deaths, ${Math.round(stats.damage)} damage · Click to play again`,
    );
    document.getElementById('end-screen').addEventListener('click', () => window.location.reload(), { once: true });
  },
  onPlanted(site) {
    hud.showBanner(`CORE PLANTED at ${site === 'A' ? 'Spice Court' : 'Fish Hall'} — 40 seconds`, now);
    audio.plantBeep();
  },
  onDefused() {
    hud.showBanner('CORE DEFUSED', now);
    audio.defuseBeep();
  },
});

// --- bots -------------------------------------------------------------------
const botApi = createBots(scene, world, radio, rng, {
  tracer(from, to, enemy) {
    effects.tracer(from, to, enemy);
  },
  muzzle(pos, yaw) {
    effects.muzzle(pos, yaw);
  },
  shotSound(d, kind) {
    audio.shot(kind, d);
  },
  playerHit(lost, head) {
    hurtFlash = Math.min(1, hurtFlash + 0.45);
    shake = Math.min(0.5, shake + 0.15);
  },
  botHit(target, dmg, head) {
    effects.puff({ x: target.x, y: 1.3, z: target.z });
  },
  kill(killer, victim, head, loc) {
    const killerName = killer ? killer.name : '—';
    hud.addKillfeed(`${killerName} ⌖ ${victim.name}${head ? ' (headshot)' : ''} — ${loc}`, head);
    if (victim.hasBomb) {
      rounds.bomb.drop(victim.x, victim.z);
      victim.hasBomb = false;
    }
    if (killer && killer.team === 'attacker') rounds.killReward();
  },
});

// --- throwables --------------------------------------------------------------
const throwables = createThrowables(world, {
  throwSound() {},
  boom(x, y, z) {
    audio.boom();
    shake = Math.min(0.8, shake + 0.4);
    for (let i = 0; i < 3; i++) effects.puff({ x: x + (Math.random() - 0.5), y: y + 0.3, z: z + (Math.random() - 0.5) });
  },
  smokePuff(x, y, z) {
    for (let i = 0; i < 4; i++) effects.puff({ x: x + (Math.random() - 0.5) * 2, y: y + 0.5, z: z + (Math.random() - 0.5) * 2 });
  },
  flashPop(x, y, z) {
    audio.flashPop();
  },
  kill(killer, victim, head, loc) {
    hud.addKillfeed(`frag ⌖ ${victim.name} — ${loc}`, false);
    if (victim.hasBomb) {
      rounds.bomb.drop(victim.x, victim.z);
      victim.hasBomb = false;
    }
  },
});

// --- shooting ----------------------------------------------------------------
function rayHitBot(ox, oy, oz, dx, dy, dz, maxDist) {
  let best = null;
  for (const b of botApi.bots) {
    if (!b.alive || b.team !== 'defender') continue;
    const cx = b.x - ox;
    const cy = 0.95 - oy;
    const cz = b.z - oz;
    const t = cx * dx + cy * dy + cz * dz;
    if (t < 0.2 || t > maxDist) continue;
    const px = ox + dx * t;
    const py = oy + dy * t;
    const pz = oz + dz * t;
    if (Math.hypot(px - b.x, pz - b.z) > 0.55) continue;
    if (py < 0.05 || py > 1.85) continue;
    if (!best || t < best.t) best = { bot: b, t, y: py, head: py > 1.45 };
  }
  return best;
}

function playerShoot() {
  const st = player.state;
  const shot = loadout.fire(now, player.groundSpeed(), !st.onGround, st.crouched, input.aiming);
  if (!shot) return;
  const eye = player.eyePos();
  camera.getWorldDirection(tmpFwd);
  tmpRight.crossVectors(tmpFwd, UP).normalize();
  tmpUp.crossVectors(tmpRight, tmpFwd).normalize();
  const gunTip = {
    x: eye.x + tmpFwd.x * 0.6 + tmpRight.x * 0.2 - tmpUp.x * 0.15,
    y: eye.y + tmpFwd.y * 0.6 - 0.15,
    z: eye.z + tmpFwd.z * 0.6 + tmpRight.z * 0.2,
  };
  effects.muzzle(gunTip, st.yaw, 0.45);
  effects.casing(gunTip, st.yaw);
  audio.shot(shot.def.sound, 0);
  gunKick = Math.min(0.09, gunKick + 0.03);
  shotsThisStep.push({ x: st.x, z: st.z });
  for (let p = 0; p < shot.pellets; p++) {
    const a = Math.random() * Math.PI * 2;
    const r = ((Math.random() + Math.random()) / 2) * shot.spread;
    tmpDir
      .copy(tmpFwd)
      .addScaledVector(tmpRight, Math.cos(a) * r)
      .addScaledVector(tmpUp, Math.sin(a) * r)
      .normalize();
    const wallDist = world.traceShot(eye.x, eye.y, eye.z, tmpDir.x, tmpDir.y, tmpDir.z, 120);
    const hit = rayHitBot(eye.x, eye.y, eye.z, tmpDir.x, tmpDir.y, tmpDir.z, wallDist);
    if (hit) {
      const end = { x: eye.x + tmpDir.x * hit.t, y: hit.y, z: eye.z + tmpDir.z * hit.t };
      effects.tracer(gunTip, end, false);
      const dmg = Math.round(loadout.damageAt(shot.def, hit.t) * (hit.head ? 4 : 1));
      const b = hit.bot;
      const dealt = applyArmour(b, dmg);
      b.hp -= dealt;
      stats.damage += dealt;
      hud.showHitmarker(hit.head, now);
      audio.hit(hit.head);
      effects.puff(end);
      if (b.hp <= 0 && b.alive) {
        b.alive = false;
        b.mesh.visible = false;
        stats.kills += 1;
        rounds.killReward();
        hud.addKillfeed(`You ⌖ ${b.name}${hit.head ? ' (headshot)' : ''} — ${world.locationAt(b.x, b.z)}`, hit.head);
        radio.say('You', 'Entry', 'kill', world.locationAt(b.x, b.z), now);
        if (b.hasBomb) {
          rounds.bomb.drop(b.x, b.z);
          b.hasBomb = false;
        }
      }
    } else {
      const end = {
        x: eye.x + tmpDir.x * wallDist,
        y: eye.y + tmpDir.y * wallDist,
        z: eye.z + tmpDir.z * wallDist,
      };
      effects.tracer(gunTip, end, false);
      if (wallDist < 120) effects.puff(end);
    }
  }
}

// --- buy menu ------------------------------------------------------------------
const BUY_ITEMS = [
  { id: 'kestrel', name: 'Kestrel AR', desc: '30-rd assault rifle, steady at range', price: 2700, kind: 'gun' },
  { id: 'hornet', name: 'Hornet SMG', desc: 'Fast close-range spray', price: 1700, kind: 'gun' },
  { id: 'riot', name: 'Riot-12 Shotgun', desc: '8 pellets, devastating up close', price: 1500, kind: 'gun' },
  { id: 'longshot', name: 'Longshot DMR', desc: 'One headshot, one kill', price: 4750, kind: 'gun' },
  { id: 'armour', name: 'Kevlar Vest', desc: 'Absorbs half of body damage', price: 650, kind: 'armour' },
  { id: 'helmet', name: 'Helmet', desc: 'Halves headshot damage', price: 350, kind: 'helmet' },
  { id: 'frag', name: 'Frag Grenade', desc: '95 damage inside 6 m', price: 300, kind: 'util' },
  { id: 'smoke', name: 'Smoke Grenade', desc: 'Blocks sight for 13 s', price: 300, kind: 'util' },
  { id: 'flash', name: 'Flashbang', desc: 'Blinds anyone looking at it', price: 200, kind: 'util' },
];

function buyItem(id) {
  const item = BUY_ITEMS.find((i) => i.id === id);
  if (!item) return;
  const money = rounds.match.money;
  if (money < item.price) return;
  if (item.kind === 'gun') {
    if (loadout.owned[id]) return;
    const left = loadout.buy(id, money);
    if (left === money) return;
    rounds.match.money = left;
    loadout.equip(id);
  } else if (item.kind === 'armour') {
    if (player.state.armour >= 100) return;
    rounds.match.money -= item.price;
    player.state.armour = 100;
  } else if (item.kind === 'helmet') {
    if (player.state.helmet) return;
    rounds.match.money -= item.price;
    player.state.helmet = true;
  } else {
    if (util[id] >= 2) return;
    rounds.match.money -= item.price;
    util[id] += 1;
  }
  audio.blip();
  refreshBuyMenu();
}

function refreshBuyMenu() {
  if (!buyOpen) return;
  const items = BUY_ITEMS.map((i) => ({
    ...i,
    owned:
      i.kind === 'gun'
        ? !!loadout.owned[i.id]
        : i.kind === 'armour'
          ? player.state.armour >= 100
          : i.kind === 'helmet'
            ? player.state.helmet
            : util[i.id] >= 2,
  }));
  hud.showBuy({ items, money: rounds.match.money, buy: buyItem });
}

// --- the core ------------------------------------------------------------------
function updateCore(dt) {
  const st = player.state;
  const bomb = rounds.bomb;
  if (bomb.state === 'dropped' && st.alive && dist(st.x, st.z, bomb.x, bomb.z) < 1.6) {
    playerCarriesBomb = true;
    bomb.state = 'carried';
    bomb.carriedBy = 'player';
    radio.say('You', 'Entry', 'pickup', world.locationAt(st.x, st.z), now);
    audio.blip();
  }
  if (playerCarriesBomb && st.alive) {
    const siteKey = dist(st.x, st.z, world.sites.A.x, world.sites.A.z) < 3.5
      ? 'A'
      : dist(st.x, st.z, world.sites.B.x, world.sites.B.z) < 3.5
        ? 'B'
        : null;
    if (siteKey && input.keys.has('KeyE')) {
      plantProgress += dt / 3.5;
      if (plantProgress >= 1) {
        bomb.plant(world.sites[siteKey]);
        playerCarriesBomb = false;
        plantProgress = 0;
      }
    } else {
      plantProgress = Math.max(0, plantProgress - dt * 2);
    }
  } else {
    plantProgress = 0;
  }
}

// --- one fixed step --------------------------------------------------------------
function step() {
  now += STEP;
  shotsThisStep.length = 0;
  const st = player.state;
  const match = rounds.match;

  // Look.
  if (input.locked) {
    const look = input.consumeLook();
    st.yaw -= look.dx * 0.0023;
    st.pitch = clamp(st.pitch - look.dy * 0.0023, -1.5, 1.5);
  }

  // Keys that fire once.
  if (input.consumePressed('KeyR')) {
    if (loadout.startReload(now)) audio.reload();
  }
  if (input.consumePressed('Digit1')) loadout.switchSlot(1);
  if (input.consumePressed('Digit2')) loadout.switchSlot(2);
  if (input.consumePressed('Digit3')) loadout.switchSlot(3);
  if (input.consumePressed('KeyB') && match.phase === 'buy') {
    buyOpen = !buyOpen;
    if (buyOpen) refreshBuyMenu();
    else hud.hideBuy();
  }
  if (input.consumePressed('KeyM')) audio.toggleMute();
  for (const [key, kind] of [['Digit4', 'frag'], ['Digit5', 'smoke'], ['Digit6', 'flash']]) {
    if (input.consumePressed(key) && util[kind] > 0 && match.phase === 'live' && st.alive) {
      const eye = player.eyePos();
      camera.getWorldDirection(tmpFwd);
      throwables.throwIt(kind, { x: eye.x, y: eye.y - 0.1, z: eye.z }, { x: tmpFwd.x, y: tmpFwd.y, z: tmpFwd.z }, now);
      util[kind] -= 1;
      if (kind === 'smoke') radio.say('You', 'Support', 'smoke', world.locationAt(st.x, st.z), now);
      if (kind === 'flash') radio.say('You', 'Support', 'flash', world.locationAt(st.x, st.z), now);
    }
  }

  // Movement + shooting.
  const move = input.moveInput();
  player.step(move, STEP);
  loadout.update(STEP);
  if (input.firing && input.locked && match.phase === 'live' && st.alive) playerShoot();

  // The core, then the bots, then the throwables. The buy phase is safe:
  // bots stand at their spawns until the round goes live.
  updateCore(STEP);
  const counts = botApi.aliveCounts();
  const atkAlive = counts.atk + (st.alive ? 1 : 0);
  if (match.phase !== 'buy') botApi.update(STEP, now, { player, bomb: rounds.bomb, shots: shotsThisStep });
  throwables.update(STEP, now, player, botApi.bots);

  // Rounds.
  rounds.update(STEP, now, { atkAlive, defAlive: counts.def, playerAlive: st.alive });

  // The player died this step.
  if (wasAlive && !st.alive) {
    stats.deaths += 1;
    wasAlive = false;
    hud.showBanner('YOU ARE DOWN — your team fights on', now);
    if (playerCarriesBomb) {
      rounds.bomb.drop(st.x, st.z);
      playerCarriesBomb = false;
    }
  }
  if (!st.alive) wasAlive = false;

  hurtFlash = Math.max(0, hurtFlash - STEP * 1.4);
  shake = Math.max(0, shake - STEP * 1.8);
  gunKick = Math.max(0, gunKick - STEP * 0.5);
  effects.update(STEP);
  world.update(STEP, now);
}

// --- HUD snapshot ----------------------------------------------------------------
function hudSnapshot() {
  const st = player.state;
  const match = rounds.match;
  const bomb = rounds.bomb;
  const counts = botApi.aliveCounts();
  // Enemies the player can actually see go on the minimap.
  seenEnemies.length = 0;
  for (const b of botApi.bots) {
    if (!b.alive || b.team !== 'defender') continue;
    if (dist(st.x, st.z, b.x, b.z) < 26 && world.hasSight(st.x, st.z, b.x, b.z)) seenEnemies.push(b);
  }
  const atkNames = botApi.bots.filter((b) => b.team === 'attacker').map((b) => b.name);
  const defNames = botApi.bots.filter((b) => b.team === 'defender').map((b) => b.name);
  const primary = Object.values(loadout.owned).find((o) => o.def.slot === 1);
  const bombStatus =
    bomb.state === 'planted'
      ? `CORE PLANTED at ${bomb.site === 'A' ? 'Spice Court' : 'Fish Hall'} — ${Math.ceil(bomb.timer)}s`
      : bomb.state === 'dropped'
        ? 'CORE DROPPED — pick it up'
        : bomb.state === 'defused'
          ? 'CORE DEFUSED'
          : bomb.state === 'exploded'
            ? 'CORE DETONATED'
            : bomb.carriedBy === 'player'
              ? 'CORE WITH YOU — take it to a site, hold E'
              : `CORE WITH ${bomb.carriedBy ?? 'Rook'}`;
  const spreadPx = 4 + loadout.spread(now, player.groundSpeed(), !st.onGround, st.crouched, input.aiming) * 260;
  return {
    hp: st.hp,
    armour: st.armour,
    money: match.money,
    weaponName: loadout.current.def.name,
    ammo: loadout.ammoText(),
    timer: Math.max(0, match.timer),
    round: match.round,
    phase: match.phase === 'buy' ? 'BUY' : match.phase === 'live' ? 'LIVE' : match.phase === 'over' ? 'ROUND OVER' : 'MATCH OVER',
    scoreAtk: match.scoreAtk,
    scoreDef: match.scoreDef,
    location: world.locationAt(st.x, st.z),
    slots: `1 ${primary ? primary.def.name : '—'} · 2 Lark P-9 · 3 Shiv`,
    utility: `Frag ${util.frag} · Smoke ${util.smoke} · Flash ${util.flash}`,
    bombStatus,
    crossGap: spreadPx,
    crossHidden: !matchStarted || buyOpen || !st.alive || match.phase !== 'live',
    flash: st.flash,
    hurt: hurtFlash,
    plant: plantProgress > 0 ? { label: 'PLANTING THE CORE — hold E', progress: plantProgress } : null,
    walls: world.solids,
    sites: world.sites,
    bomb: { state: bomb.state, x: bomb.x, z: bomb.z },
    allies: botApi.bots.filter((b) => b.alive && b.team === 'attacker'),
    enemies: seenEnemies,
    player: { x: st.x, z: st.z, yaw: st.yaw },
    radio: radio.recent(4),
    atkAlive: counts.atk + (st.alive ? 1 : 0),
    defAlive: counts.def,
    atkNames,
    defNames,
  };
}

// --- render -----------------------------------------------------------------------
function render() {
  const st = player.state;
  if (!matchStarted) {
    // Attract camera: a slow orbit over the market behind the title.
    const t = now * 0.06;
    camera.position.set(Math.sin(t) * 18, 9, Math.cos(t) * 14);
    camera.lookAt(0, 1, 0);
  } else {
    const eye = player.eyePos();
    camera.position.set(eye.x, eye.y, eye.z);
    camera.rotation.y = st.yaw;
    camera.rotation.x = st.pitch;
    if (shake > 0) {
      camera.rotation.x += (Math.random() - 0.5) * shake * 0.02;
      camera.rotation.y += (Math.random() - 0.5) * shake * 0.02;
    }
    // ADS narrows the view; the gun slides to the centre.
    const targetFov = input.aiming ? 55 : 75;
    if (Math.abs(camera.fov - targetFov) > 0.2) {
      camera.fov += (targetFov - camera.fov) * 0.25;
      camera.updateProjectionMatrix();
    }
    const gx = input.aiming ? 0 : 0.28;
    gunGroup.position.x += (gx - gunGroup.position.x) * 0.3;
    gunGroup.position.z = -0.5 + gunKick;
    const bob = Math.sin(now * 9) * 0.006 * Math.min(1, player.groundSpeed() / 4);
    gunGroup.position.y = -0.24 + bob - (loadout.reloading > 0 ? 0.08 : 0);
  }
  hud.update(hudSnapshot(), now);
  renderer.render(scene, camera);
}

// --- start / shots ------------------------------------------------------------------
let frames = 0;
let last = performance.now();
let acc = 0;
function frame(t) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.1, (t - last) / 1000);
  last = t;
  if (shotMode) {
    render();
    frames += 1;
    if (frames === 2) window.__shotReady = true;
    return;
  }
  if (!matchStarted) {
    now += dt;
    world.update(dt, now);
    render();
    return;
  }
  acc += dt;
  let n = 0;
  while (acc >= STEP && n < 5) {
    step();
    acc -= STEP;
    n += 1;
  }
  if (n === 5) acc = 0;
  render();
}

function applyShot(n) {
  matchStarted = true;
  hud.hideStart();
  botApi.spawnRound('A');
  player.reset(world.spawns.attacker[1]);
  rounds.bomb.carriedBy = 'Rook';
  const st = player.state;
  if (n === 1) {
    // Buy phase: the player at spawn, looking down Lantern Gate, menu open.
    st.yaw = -Math.PI / 2 + 0.1;
    st.pitch = 0.02;
    rounds.match.phase = 'buy';
    rounds.match.timer = BUY_SECONDS;
    buyOpen = true;
    rounds.match.money = 4700;
    refreshBuyMenu();
    radio.say('Kip', 'Caller', 'plan', 'Spice Court', now);
    radio.say('Rook', 'Entry', 'hold', 'Lantern Gate', now);
  } else if (n === 2) {
    // Mid-fight: Tea House lane, two defenders in the open, radio live.
    st.x = -6;
    st.z = -8;
    st.yaw = -Math.PI / 2 + 0.35;
    st.pitch = 0.01;
    rounds.match.phase = 'live';
    rounds.match.timer = 71;
    rounds.match.money = 2400;
    const defs = botApi.bots.filter((b) => b.team === 'defender');
    if (defs[0]) {
      defs[0].x = 2;
      defs[0].z = -9;
      defs[0].mesh.position.set(2, 0, -9);
    }
    if (defs[1]) {
      defs[1].x = 6;
      defs[1].z = -5;
      defs[1].mesh.position.set(6, 0, -5);
    }
    const atks = botApi.bots.filter((b) => b.team === 'attacker');
    if (atks[1]) {
      atks[1].x = -2;
      atks[1].z = -12;
      atks[1].mesh.position.set(-2, 0, -12);
    }
    radio.say('Sol', 'A Hold', 'contact', 'Tea House', now);
    radio.say('Rook', 'Entry', 'rotate', 'Spice Court', now);
    radio.say('Fable', 'Lurk', 'heard', 'Paper Lane', now);
    hud.addKillfeed('Maren ⌖ Bram — Lantern Gate', false);
    hud.addKillfeed('You ⌖ Wren (headshot) — Tea House', true);
    effects.tracer({ x: -6, y: 1.5, z: -8 }, { x: 2, y: 1.3, z: -9 }, false);
    effects.muzzle({ x: -5.3, y: 1.45, z: -8.3 }, st.yaw, 0.45);
  } else if (n === 3) {
    // The core is down at Spice Court; a defender is on the defuse.
    st.x = 12;
    st.z = -8;
    st.yaw = -0.96;
    st.pitch = 0.02;
    rounds.match.phase = 'live';
    rounds.match.timer = 0.01;
    rounds.match.money = 3850;
    rounds.bomb.plant(world.sites.A);
    const defs = botApi.bots.filter((b) => b.team === 'defender');
    if (defs[0]) {
      defs[0].x = 15;
      defs[0].z = -12;
      defs[0].mesh.position.set(15, 0, -12);
    }
    radio.say('Rook', 'Entry', 'planted', 'Spice Court', now);
    radio.say('Sol', 'A Hold', 'defuse', 'Spice Court', now);
    radio.say('Maren', 'Sniper', 'hold', 'Spice Court', now);
    hud.addKillfeed('Rook ⌖ Mira — Spice Court', false);
  } else if (n === 4) {
    // Round end: the Syndicate takes it, score on the board.
    st.x = 18;
    st.z = -10;
    st.yaw = -0.67;
    rounds.match.phase = 'over';
    rounds.match.timer = 0;
    rounds.match.scoreAtk = 7;
    rounds.match.scoreDef = 5;
    rounds.match.round = 12;
    rounds.bomb.state = 'exploded';
    radio.say('Kip', 'Caller', 'planted', 'Spice Court', now);
    radio.say('Rook', 'Entry', 'kill', 'Spice Court', now);
    hud.showBanner('EMBER SYNDICATE TAKES THE ROUND — the core blew at Spice Court', now);
    hud.addKillfeed('You ⌖ Sol — Spice Court', false);
  }
  window.__shotReady = false;
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

if (shotMode) {
  applyShot(shotMode);
  requestAnimationFrame(frame);
} else {
  hud.showStart();
  document.getElementById('start-screen').addEventListener('click', () => {
    audio.resume();
    hud.hideStart();
    matchStarted = true;
    input.lock();
    rounds.startRound(now);
  });
  requestAnimationFrame(frame);
}
