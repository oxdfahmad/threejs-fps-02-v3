// Lantern Row — combat feedback. Everything here is pooled and reused:
// tracers, muzzle flashes, shell casings and impact puffs are created once
// at startup and recycled, so the hot loop makes no new objects per frame.

import * as THREE from 'three';
import { PALETTE } from './palette.js';

const TRACERS = 24;
const CASINGS = 20;
const PUFFS = 16;

export function createEffects(scene) {
  // --- tracers: thin glowing lines, one per shot ---------------------------
  const tracerMat = new THREE.LineBasicMaterial({ color: PALETTE.tracerAlly, transparent: true, opacity: 0.9 });
  const tracerMatEnemy = new THREE.LineBasicMaterial({ color: PALETTE.tracerEnemy, transparent: true, opacity: 0.9 });
  const tracers = [];
  for (let i = 0; i < TRACERS; i++) {
    const geo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
    const line = new THREE.Line(geo, tracerMat);
    line.visible = false;
    line.frustumCulled = false;
    scene.add(line);
    tracers.push({ line, life: 0 });
  }
  let tracerNext = 0;

  function tracer(from, to, enemy) {
    const t = tracers[tracerNext];
    tracerNext = (tracerNext + 1) % TRACERS;
    t.line.material = enemy ? tracerMatEnemy : tracerMat;
    const pos = t.line.geometry.attributes.position;
    pos.setXYZ(0, from.x, from.y, from.z);
    pos.setXYZ(1, to.x, to.y, to.z);
    pos.needsUpdate = true;
    t.line.visible = true;
    t.life = 0.09;
  }

  // --- muzzle flash: a soft radial sprite at the gun tip -------------------
  // A canvas radial gradient (hot white core fading to transparent) so the
  // flash reads as light, not as a yellow box. Additive: it glows over
  // the scene instead of covering it.
  const flashCanvas = document.createElement('canvas');
  flashCanvas.width = 64;
  flashCanvas.height = 64;
  const fctx = flashCanvas.getContext('2d');
  const grad = fctx.createRadialGradient(32, 32, 2, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255, 240, 200, 1)');
  grad.addColorStop(0.35, 'rgba(255, 200, 110, 0.85)');
  grad.addColorStop(1, 'rgba(255, 150, 40, 0)');
  fctx.fillStyle = grad;
  fctx.fillRect(0, 0, 64, 64);
  const flashTex = new THREE.CanvasTexture(flashCanvas);
  const flashGeo = new THREE.PlaneGeometry(0.34, 0.34);
  const flashMat = new THREE.MeshBasicMaterial({
    map: flashTex, transparent: true, opacity: 0, depthWrite: false,
    blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  });
  const flashQuad = new THREE.Mesh(flashGeo, flashMat);
  flashQuad.visible = false;
  scene.add(flashQuad);
  let flashLife = 0;

  function muzzle(pos, yaw, scale = 1) {
    flashQuad.position.set(
      pos.x - Math.sin(yaw) * 0.7,
      pos.y - 0.08,
      pos.z - Math.cos(yaw) * 0.7,
    );
    flashQuad.rotation.y = yaw;
    flashQuad.scale.setScalar(scale);
    flashQuad.visible = true;
    flashMat.opacity = 0.95;
    flashLife = 0.05;
  }

  // --- shell casings: small brass boxes that pop out and fall --------------
  const casingGeo = new THREE.BoxGeometry(0.05, 0.03, 0.09);
  const casingMat = new THREE.MeshStandardMaterial({ color: 0xd9a441, roughness: 0.4, metalness: 0.7 });
  const casings = [];
  for (let i = 0; i < CASINGS; i++) {
    const m = new THREE.Mesh(casingGeo, casingMat);
    m.visible = false;
    scene.add(m);
    casings.push({ mesh: m, vx: 0, vy: 0, vz: 0, life: 0 });
  }
  let casingNext = 0;

  function casing(pos, yaw) {
    const c = casings[casingNext];
    casingNext = (casingNext + 1) % CASINGS;
    c.mesh.position.set(pos.x, pos.y, pos.z);
    c.vx = Math.cos(yaw) * 1.4 + (Math.random() - 0.5);
    c.vy = 2.2;
    c.vz = -Math.sin(yaw) * 1.4;
    c.mesh.visible = true;
    c.life = 0.9;
  }

  // --- impact puffs: dust at wall hits --------------------------------------
  const puffGeo = new THREE.SphereGeometry(0.14, 6, 5);
  const puffMat = new THREE.MeshBasicMaterial({ color: 0xcfc8b8, transparent: true, opacity: 0.7 });
  const puffs = [];
  for (let i = 0; i < PUFFS; i++) {
    const m = new THREE.Mesh(puffGeo, puffMat.clone());
    m.visible = false;
    scene.add(m);
    puffs.push({ mesh: m, life: 0 });
  }
  let puffNext = 0;

  function puff(pos) {
    const p = puffs[puffNext];
    puffNext = (puffNext + 1) % PUFFS;
    p.mesh.position.set(pos.x, pos.y, pos.z);
    p.mesh.scale.setScalar(1);
    p.mesh.visible = true;
    p.mesh.material.opacity = 0.7;
    p.life = 0.35;
  }

  function update(dt) {
    for (const t of tracers) {
      if (t.life > 0) {
        t.life -= dt;
        if (t.life <= 0) t.line.visible = false;
      }
    }
    if (flashLife > 0) {
      flashLife -= dt;
      flashMat.opacity = Math.max(0, flashLife / 0.05) * 0.95;
      if (flashLife <= 0) flashQuad.visible = false;
    }
    for (const c of casings) {
      if (c.life > 0) {
        c.life -= dt;
        c.vy -= 12 * dt;
        c.mesh.position.x += c.vx * dt;
        c.mesh.position.y += c.vy * dt;
        c.mesh.position.z += c.vz * dt;
        if (c.mesh.position.y < 0.03) {
          c.mesh.position.y = 0.03;
          c.vy = 0;
          c.vx *= 0.7;
          c.vz *= 0.7;
        }
        if (c.life <= 0) c.mesh.visible = false;
      }
    }
    for (const p of puffs) {
      if (p.life > 0) {
        p.life -= dt;
        p.mesh.scale.setScalar(1 + (0.35 - p.life) * 3);
        p.mesh.material.opacity = Math.max(0, p.life / 0.35) * 0.7;
        if (p.life <= 0) p.mesh.visible = false;
      }
    }
  }

  return { tracer, muzzle, casing, puff, update };
}
