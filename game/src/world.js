// Lantern Row — the night market. One hero map: a lantern-lit market at dusk
// with three lanes, two bomb sites and named corners everywhere, so a radio
// callout ("Contact at Spice Row!") always means a place the player can see.
//
// Layout (metres, x east, z south; the market is 64 x 44):
//   west end: Lantern Gate (attacker spawn)      east end: defender spawn
//   Site A Spice Court: north-east              Site B Fish Hall: south-east
//   Mid: Koi Pond courtyard with a footbridge    Flank: Paper Lane (west)
//   Lanes: Tea House (north, long), Lantern Gate (mid), Spice Row (south),
//   Silk Alley (north-south connector), Noodle Cart (mid cover).
//
// Collision is circles vs axis-aligned boxes. Tall boxes block movement and
// sight; low crates block movement only, so a player can shoot over them.

import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { clamp, dist2 } from './util.js';

const EYE = 1.55; // eye height used for sight traces

// Named zones, as rectangles. locationAt() returns the first match; the
// whole map falls back to "Lantern Row".
const ZONES = [
  { name: 'Lantern Gate', minX: -32, maxX: -22, minZ: -22, maxZ: 22 },
  { name: 'Spice Court', minX: 14, maxX: 32, minZ: -22, maxZ: -8 },
  { name: 'Fish Hall', minX: 14, maxX: 32, minZ: 8, maxZ: 22 },
  { name: 'Tea House', minX: -22, maxX: 14, minZ: -22, maxZ: -12 },
  { name: 'Spice Row', minX: -22, maxX: 14, minZ: 12, maxZ: 22 },
  { name: 'Koi Pond', minX: -8, maxX: 8, minZ: -8, maxZ: 8 },
  { name: 'Silk Alley', minX: 4, maxX: 12, minZ: -12, maxZ: 12 },
  { name: 'Paper Lane', minX: -22, maxX: -12, minZ: -8, maxZ: 8 },
  { name: 'Noodle Cart', minX: -12, maxX: -2, minZ: -4, maxZ: 4 },
];

function signTexture(lines, fg, bg) {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 192;
  const g = c.getContext('2d');
  g.fillStyle = bg;
  g.fillRect(0, 0, 512, 192);
  g.fillStyle = fg;
  g.textAlign = 'center';
  g.font = 'bold 64px system-ui, sans-serif';
  g.fillText(lines[0], 256, 84);
  g.font = '28px system-ui, sans-serif';
  g.fillText(lines[1], 256, 140);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function createWorld(scene) {
  const solids = []; // block movement AND sight: {minX,maxX,minZ,maxZ,h}
  const lows = []; // block movement only (crates, counters)

  const mats = {};
  const mat = (color, opts = {}) => {
    const key = color + JSON.stringify(opts);
    if (!mats[key]) {
      mats[key] = new THREE.MeshStandardMaterial({ color, roughness: 0.9, metalness: 0.05, ...opts });
    }
    return mats[key];
  };

  function box(x, z, w, d, h, color, list, y = 0) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(color));
    m.position.set(x, y + h / 2, z);
    scene.add(m);
    list.push({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2, h });
    return m;
  }

  // --- ground, sky, light -------------------------------------------------
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(64, 44),
    new THREE.MeshStandardMaterial({ color: PALETTE.ground, roughness: 0.85, metalness: 0.1 }),
  );
  ground.rotation.x = -Math.PI / 2;
  scene.add(ground);
  scene.fog = new THREE.Fog(PALETTE.fog, 30, 95);
  scene.background = new THREE.Color(PALETTE.skyLow);
  const hemi = new THREE.HemisphereLight(0x8a7ec0, 0x2a2118, 0.75);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffb347, 1.4);
  sun.position.set(-30, 26, -14);
  scene.add(sun);
  const lanternLight = new THREE.PointLight(0xffb347, 30, 26, 1.6);
  lanternLight.position.set(0, 4.2, 0);
  scene.add(lanternLight);

  // --- perimeter ----------------------------------------------------------
  box(0, -22.5, 66, 1, 4.5, PALETTE.wallPlaster, solids);
  box(0, 22.5, 66, 1, 4.5, PALETTE.wallPlaster, solids);
  box(-32.5, 0, 1, 46, 4.5, PALETTE.wallPlaster, solids);
  box(32.5, 0, 1, 46, 4.5, PALETTE.wallPlaster, solids);

  // --- stall blocks (tall, block sight) -----------------------------------
  // North row: Tea House block with a gap at the long lane.
  box(-16, -17, 12, 6, 3.2, PALETTE.wallBrick, solids);
  box(2, -17, 10, 6, 3.2, PALETTE.wallBrick, solids);
  // South row: Spice Row stalls.
  box(-16, 17, 12, 6, 3.2, PALETTE.wallBrick, solids);
  box(2, 17, 10, 6, 3.2, PALETTE.wallBrick, solids);
  // East blocks guarding the sites.
  box(20, -11, 8, 4, 3.4, PALETTE.wallBrick, solids);
  box(20, 11, 8, 4, 3.4, PALETTE.wallBrick, solids);
  box(28, 0, 4, 12, 3.4, PALETTE.wallBrick, solids);
  // West block by Paper Lane.
  box(-24, -6, 6, 8, 3.0, PALETTE.wallBrick, solids);
  box(-24, 8, 6, 6, 3.0, PALETTE.wallBrick, solids);

  // --- low cover: crates, counters, carts (shoot over, not through) ------
  const crate = (x, z, w = 1.6, d = 1.6, h = 1.1) => box(x, z, w, d, h, PALETTE.wood, lows);
  crate(-8, -6);
  crate(-8, 6);
  crate(8, -6);
  crate(8, 6);
  crate(-2, -11, 2.2, 1.4, 1.0);
  crate(-2, 11, 2.2, 1.4, 1.0);
  crate(14, -3, 1.6, 1.6, 1.1);
  crate(14, 3, 1.6, 1.6, 1.1);
  crate(-18, 0, 2.4, 1.2, 1.0); // Noodle Cart counter
  crate(26, -16, 2.0, 2.0, 1.0);
  crate(26, 16, 2.0, 2.0, 1.0);
  crate(-28, -14, 1.8, 1.8, 1.1);
  crate(-28, 14, 1.8, 1.8, 1.1);

  // --- awnings over the stall rows (visual, no collision) -----------------
  function awning(x, z, w, d, color) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, 0.12, d), mat(color));
    m.position.set(x, 3.45, z);
    m.rotation.z = 0.06;
    scene.add(m);
  }
  awning(-16, -17, 12.6, 7, PALETTE.clothRed);
  awning(2, -17, 10.6, 7, PALETTE.clothTeal);
  awning(-16, 17, 12.6, 7, PALETTE.clothTeal);
  awning(2, 17, 10.6, 7, PALETTE.clothRed);

  // --- koi pond (mid courtyard) ------------------------------------------
  const pond = new THREE.Mesh(
    new THREE.PlaneGeometry(9, 6),
    new THREE.MeshStandardMaterial({ color: PALETTE.water, roughness: 0.25, metalness: 0.4 }),
  );
  pond.rotation.x = -Math.PI / 2;
  pond.position.set(0, 0.06, 0);
  scene.add(pond);
  // Footbridge over the pond (walkable deck, low rim blocks movement at ends).
  box(0, 0, 2.2, 7, 0.35, PALETTE.woodLight, lows, 0.05);
  // Pond rim stones (low).
  box(-4.8, 0, 0.6, 6.6, 0.5, PALETTE.groundDark, lows);
  box(4.8, 0, 0.6, 6.6, 0.5, PALETTE.groundDark, lows);

  // --- lanterns (emissive paper balls on posts) ---------------------------
  const lanterns = [];
  const lanternGeo = new THREE.SphereGeometry(0.32, 10, 8);
  const lanternMat = new THREE.MeshStandardMaterial({
    color: PALETTE.lanternPaper, emissive: PALETTE.lantern, emissiveIntensity: 1.6, roughness: 0.6,
  });
  const postMat = mat(PALETTE.metal);
  for (const [x, z] of [[-20, -8], [-20, 8], [-8, -13], [-8, 13], [8, -13], [8, 13], [20, -6], [20, 6], [0, -4], [0, 4]]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 3.6, 6), postMat);
    post.position.set(x, 1.8, z);
    scene.add(post);
    const lamp = new THREE.Mesh(lanternGeo, lanternMat);
    lamp.position.set(x, 3.8, z);
    scene.add(lamp);
    lanterns.push(lamp);
  }

  // --- site signs (canvas textures, readable at a glance) -----------------
  function sign(x, z, ry, lines) {
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(5.4, 2.0),
      new THREE.MeshStandardMaterial({ map: signTexture(lines, '#f5e9c8', '#241a12'), roughness: 0.85 }),
    );
    m.position.set(x, 3.4, z);
    m.rotation.y = ry;
    scene.add(m);
  }
  sign(20, -21.8, 0, ['SPICE COURT', 'SITE A — plant here']);
  sign(20, 21.8, Math.PI, ['FISH HALL', 'SITE B — plant here']);
  sign(-31.8, 0, Math.PI / 2, ['LANTERN ROW', 'night market — round 1 of 12']);

  // --- waypoint graph (bots walk it; findPath is a BFS) -------------------
  const nodes = [
    { x: -28, z: 0 }, // 0 attacker spawn
    { x: -20, z: -12 }, // 1 Tea House west — clear of the north stalls
    { x: -20, z: 12 }, // 2 Spice Row west — clear of the south stalls
    { x: -12, z: 0 }, // 3 Paper Lane
    { x: -6, z: -8 }, // 4 Tea House mid
    { x: -6, z: 8 }, // 5 Spice Row mid
    { x: 0, z: -4 }, // 6 pond north bridge
    { x: 0, z: 4 }, // 7 pond south bridge
    { x: 8, z: -10 }, // 8 Silk Alley north
    { x: 8, z: 10 }, // 9 Silk Alley south
    { x: 14, z: -14 }, // 10 Tea House east
    { x: 14, z: 14 }, // 11 Spice Row east
    { x: 22, z: -16 }, // 12 Site A — 1 m inside the plant zone, clear of the guard block
    { x: 22, z: 16 }, // 13 Site B — 1 m inside the plant zone, clear of the guard block
    { x: 28, z: -9 }, // 14 defender north — clear of the east block
    { x: 28, z: 9 }, // 15 defender south — clear of the east block
    { x: 16, z: 0 }, // 16 mid-east connector
    { x: -14, z: -8 }, // 17 Tea House cover
    { x: -14, z: 8 }, // 18 Spice Row cover
  ];
  const edges = [
    [0, 1], [0, 2], [0, 3], [1, 4], [2, 5], [3, 4], [3, 5], [4, 6], [5, 7],
    [6, 8], [7, 9], [8, 10], [9, 11], [10, 12], [11, 13], [12, 14], [13, 15],
    [14, 16], [15, 16], [16, 8], [16, 9], [4, 17], [5, 18], [17, 6], [18, 7],
    [10, 16], [11, 16], [1, 17], [2, 18],
  ];
  const adj = nodes.map(() => []);
  for (const [a, b] of edges) {
    adj[a].push(b);
    adj[b].push(a);
  }

  function nearestNode(x, z) {
    let best = 0;
    let bestD = Infinity;
    for (let i = 0; i < nodes.length; i++) {
      const d = dist2(x, z, nodes[i].x, nodes[i].z);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    return best;
  }

  function findPath(from, to) {
    if (from === to) return [to];
    const prev = new Array(nodes.length).fill(-1);
    const queue = [from];
    prev[from] = from;
    while (queue.length) {
      const cur = queue.shift();
      for (const nb of adj[cur]) {
        if (prev[nb] === -1) {
          prev[nb] = cur;
          if (nb === to) {
            const path = [to];
            let p = to;
            while (p !== from) {
              p = prev[p];
              path.unshift(p);
            }
            return path;
          }
          queue.push(nb);
        }
      }
    }
    return [to];
  }

  // --- collision + sight ----------------------------------------------------
  function pushOut(p, r, list) {
    for (const b of list) {
      const cx = clamp(p.x, b.minX, b.maxX);
      const cz = clamp(p.z, b.minZ, b.maxZ);
      const dx = p.x - cx;
      const dz = p.z - cz;
      const d2 = dx * dx + dz * dz;
      if (d2 < r * r) {
        if (d2 > 1e-8) {
          const d = Math.sqrt(d2);
          p.x = cx + (dx / d) * r;
          p.z = cz + (dz / d) * r;
        } else {
          // Inside the box: push out along the smallest penetration axis.
          const pl = Math.min(p.x - b.minX + r, b.maxX - p.x + r, p.z - b.minZ + r, b.maxZ - p.z + r);
          if (pl === p.x - b.minX + r) p.x = b.minX - r;
          else if (pl === b.maxX - p.x + r) p.x = b.maxX + r;
          else if (pl === p.z - b.minZ + r) p.z = b.minZ - r;
          else p.z = b.maxZ + r;
        }
      }
    }
    return p;
  }

  function segmentBlocked(ax, az, bx, bz) {
    // 2D segment vs tall boxes only (low crates do not block sight).
    for (const b of solids) {
      const dx = bx - ax;
      const dz = bz - az;
      let t0 = 0;
      let t1 = 1;
      let ok = true;
      for (const [o, d, lo, hi] of [[ax, dx, b.minX, b.maxX], [az, dz, b.minZ, b.maxZ]]) {
        if (Math.abs(d) < 1e-9) {
          if (o < lo || o > hi) { ok = false; break; }
        } else {
          let ta = (lo - o) / d;
          let tb = (hi - o) / d;
          if (ta > tb) [ta, tb] = [tb, ta];
          t0 = Math.max(t0, ta);
          t1 = Math.min(t1, tb);
          if (t0 > t1) { ok = false; break; }
        }
      }
      if (ok && t0 <= t1 && t0 < 1 && t1 > 0) return true;
    }
    return false;
  }

  // 3D shot trace against tall boxes and low crates: returns the first hit
  // distance along the ray, or Infinity when the shot flies clear.
  function traceShot(ox, oy, oz, dx, dy, dz, maxDist) {
    let best = maxDist;
    for (const b of [...solids, ...lows]) {
      let t0 = 0;
      let t1 = best;
      let ok = true;
      for (const [o, d, lo, hi] of [
        [ox, dx, b.minX, b.maxX],
        [oy, dy, 0, b.h],
        [oz, dz, b.minZ, b.maxZ],
      ]) {
        if (Math.abs(d) < 1e-9) {
          if (o < lo || o > hi) { ok = false; break; }
        } else {
          let ta = (lo - o) / d;
          let tb = (hi - o) / d;
          if (ta > tb) [ta, tb] = [tb, ta];
          t0 = Math.max(t0, ta);
          t1 = Math.min(t1, tb);
          if (t0 > t1) { ok = false; break; }
        }
      }
      if (ok && t0 >= 0 && t0 < best) best = t0;
    }
    return best;
  }

  function locationAt(x, z) {
    for (const zn of ZONES) {
      if (x >= zn.minX && x <= zn.maxX && z >= zn.minZ && z <= zn.maxZ) return zn.name;
    }
    return 'Lantern Row';
  }

  return {
    bounds: { minX: -32, maxX: 32, minZ: -22, maxZ: 22 },
    solids, // tall boxes: the minimap draws these as the map's skeleton
    lows,
    sites: {
      A: { x: 22, z: -15, name: 'Spice Court' },
      B: { x: 22, z: 15, name: 'Fish Hall' },
    },
    spawns: {
      attacker: [
        { x: -28, z: -4, angle: -Math.PI / 2 },
        { x: -28, z: 0, angle: -Math.PI / 2 },
        { x: -28, z: 4, angle: -Math.PI / 2 },
        { x: -29, z: -8, angle: -Math.PI / 2 },
        { x: -29, z: 8, angle: -Math.PI / 2 },
      ],
      defender: [
        { x: 24, z: -4, angle: Math.PI / 2 },
        { x: 24, z: 0, angle: Math.PI / 2 },
        { x: 24, z: 4, angle: Math.PI / 2 },
        { x: 29, z: -8, angle: Math.PI / 2 },
        { x: 29, z: 8, angle: Math.PI / 2 },
      ],
    },
    nodes,
    nearestNode,
    findPath,
    locationAt,
    hasSight(ax, az, bx, bz) {
      return !segmentBlocked(ax, az, bx, bz);
    },
    moveCircle(p, r) {
      p.x = clamp(p.x, -31.4, 31.4);
      p.z = clamp(p.z, -21.4, 21.4);
      pushOut(p, r, solids);
      pushOut(p, r, lows);
      return p;
    },
    traceShot,
    eyeHeight: EYE,
    update(_dt, t) {
      // Lanterns breathe gently; cheap life in an otherwise static map.
      const s = 1.5 + Math.sin(t * 1.7) * 0.12;
      for (const l of lanterns) l.material.emissiveIntensity = s;
      lanternLight.intensity = 28 + Math.sin(t * 1.7) * 2;
    },
  };
}
