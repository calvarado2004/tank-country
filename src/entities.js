import * as THREE from 'three';
import {
  TAU, clamp, lerp, damp, dampAngle, shortestAngle, makeRng, makeCanvas, canvasTexture,
  setShadow,
} from './utils.js';
import {
  createTank, createArtillery, createBomber, animateTankTracks, setTankMaterials,
} from './models.js';
import { solveBallistic, solveHighArc, rayPoint } from './combat.js';

const UP = new THREE.Vector3(0, 1, 0);
const FORWARD = new THREE.Vector3(0, 0, 1);
const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();
const _q1 = new THREE.Quaternion();

// ---------------------------------------------------------------------------
// shared helpers
// ---------------------------------------------------------------------------

function terrainPose(entity, dt, groundOffset = 0) {
  const { world, model, position, hullYaw } = entity;
  const h = world.height(position.x, position.z);
  const fx = Math.sin(hullYaw);
  const fz = Math.cos(hullYaw);
  const rx = Math.cos(hullYaw);
  const rz = -Math.sin(hullYaw);
  const hf = world.height(position.x + fx * 1.9, position.z + fz * 1.9);
  const hb = world.height(position.x - fx * 1.9, position.z - fz * 1.9);
  const hr = world.height(position.x + rx * 1.5, position.z + rz * 1.5);
  const hl = world.height(position.x - rx * 1.5, position.z - rz * 1.5);
  position.y = damp(position.y, h + groundOffset, 24, dt);
  model.position.copy(position);
  model.rotation.y = hullYaw;
  const body = model.userData.body;
  if (body) {
    const pitch = -Math.atan2(hf - hb, 3.8);
    const roll = Math.atan2(hr - hl, 3.0);
    body.rotation.x = damp(body.rotation.x, clamp(pitch, -0.22, 0.22), 8, dt);
    body.rotation.z = damp(body.rotation.z, clamp(roll, -0.22, 0.22), 8, dt);
  }
}

export function createHealthBar(width = 2.6, height = 0.3, y = 3.25) {
  const canvas = makeCanvas(256, 32);
  const ctx = canvas.getContext('2d');
  const texture = canvasTexture(canvas);
  const mat = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
  });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(width, height, 1);
  sprite.position.y = y;
  sprite.visible = false;
  sprite.renderOrder = 30;
  let lastFraction = -1;
  const draw = (fraction, tint) => {
    ctx.clearRect(0, 0, 256, 32);
    ctx.fillStyle = 'rgba(16,15,12,0.82)';
    ctx.fillRect(2, 6, 252, 20);
    ctx.strokeStyle = 'rgba(242,232,211,0.4)';
    ctx.lineWidth = 2;
    ctx.strokeRect(2, 6, 252, 20);
    const w = Math.max(0, Math.min(1, fraction)) * 246;
    ctx.fillStyle = tint;
    ctx.fillRect(5, 9, w, 14);
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    ctx.fillRect(5, 9, w, 4);
    texture.needsUpdate = true;
  };
  draw(1, '#7fa89b');
  return {
    sprite,
    texture,
    update(fraction) {
      const f = clamp(fraction, 0, 1);
      if (Math.abs(f - lastFraction) > 0.006) {
        lastFraction = f;
        const tint = f > 0.55 ? '#7fa89b' : f > 0.28 ? '#e6b85c' : '#c84a32';
        draw(f, tint);
      }
      sprite.visible = true;
    },
    hide() {
      sprite.visible = false;
    },
  };
}

export function createDangerMarker(scene, world, x, z, radius = 7, life = 2.5) {
  const group = new THREE.Group();
  const y = world.height(x, z) + 0.1;
  group.position.set(x, y, z);
  const outerMat = new THREE.MeshBasicMaterial({
    color: 0xff6b3d,
    transparent: true,
    opacity: 0.8,
    side: THREE.DoubleSide,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -4,
    polygonOffsetUnits: -4,
    toneMapped: false,
  });
  const ring = new THREE.Mesh(new THREE.RingGeometry(radius - 0.28, radius, 48), outerMat);
  ring.rotation.x = -Math.PI / 2;
  group.add(ring);
  const innerMat = new THREE.MeshBasicMaterial({
    color: 0xff6b3d,
    transparent: true,
    opacity: 0.12,
    side: THREE.DoubleSide,
    depthWrite: false,
    toneMapped: false,
  });
  const disc = new THREE.Mesh(new THREE.CircleGeometry(radius - 0.28, 32), innerMat);
  disc.rotation.x = -Math.PI / 2;
  disc.position.y = 0.005;
  group.add(disc);
  const tickMat = new THREE.MeshBasicMaterial({ color: 0xffd0a0, transparent: true, opacity: 0.7, depthWrite: false, toneMapped: false });
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * TAU;
    const tick = new THREE.Mesh(new THREE.PlaneGeometry(0.15, 1.1), tickMat);
    tick.rotation.x = -Math.PI / 2;
    tick.rotation.z = -a;
    tick.position.set(Math.cos(a) * (radius + 0.5), 0.01, Math.sin(a) * (radius + 0.5));
    group.add(tick);
  }
  scene.add(group);
  return {
    group,
    life,
    elapsed: 0,
    radius,
    update(dt) {
      this.elapsed += dt;
      const pulse = 1 + Math.sin(this.elapsed * 9) * 0.045;
      group.scale.setScalar(pulse);
      outerMat.opacity = 0.55 + Math.sin(this.elapsed * 8) * 0.22;
      innerMat.opacity = 0.08 + Math.sin(this.elapsed * 8) * 0.04;
      tickMat.opacity = 0.45 + Math.sin(this.elapsed * 8 + 1) * 0.2;
    },
    remove() {
      scene.remove(group);
      ring.geometry.dispose();
      outerMat.dispose();
      disc.geometry.dispose();
      innerMat.dispose();
      group.children.slice().forEach((c) => {
        if (c.geometry) c.geometry.dispose();
      });
      tickMat.dispose();
    },
  };
}

function tintWreck(entity) {
  const model = entity.model;
  setTankMaterials(model, new THREE.Color(0x2d2923), 0x1a0d05);
  const u = model.userData;
  if (u.turret) {
    u.turret.rotation.z = 0.08 + Math.random() * 0.12;
    u.turret.rotation.x = 0.04;
    u.turret.position.y -= 0.06;
  }
  if (u.barrelPivot) {
    u.barrelPivot.rotation.x = 0.08;
    u.barrelPivot.position.z -= 0.22;
  }
  if (u.wheels) {
    u.wheels.forEach((w, i) => {
      if (i % 3 === 0) w.rotation.z += 0.2;
    });
  }
  model.rotation.z += (Math.random() - 0.5) * 0.05;
}

function startWreckSmoke(game, entity, scale = 1) {
  const pos = entity.position.clone().add(new THREE.Vector3(0, 1.3, 0));
  game.effects.addSmokeEmitter({
    position: pos,
    duration: 60,
    rate: 1.7,
    scale: 2.2 * scale,
    color: 0x2f2c27,
    rise: 1.5,
    spread: 1.0,
    opacity: 0.2,
  });
  game.effects.addSmokeEmitter({
    position: pos.clone().add(new THREE.Vector3(0, 0.4, 0)),
    duration: 22,
    rate: 2.8,
    scale: 1.4,
    color: 0x4c4237,
    rise: 2.2,
    spread: 0.7,
    opacity: 0.16,
  });
  game.effects.fire(pos.clone().add(new THREE.Vector3(0, 0.6, 0)), 1.3 * scale);
}

// ---------------------------------------------------------------------------
// player
// ---------------------------------------------------------------------------

export class PlayerTank {
  constructor(game) {
    this.game = game;
    this.world = game.world;
    this.isPlayer = true;
    this.isTank = true;
    this.name = 'player';
    this.model = createTank({ enemy: false, name: 'player-tank' });
    this.game.scene.add(this.model);
    this.position = new THREE.Vector3(this.world.playerStart.x, this.world.playerStart.y, this.world.playerStart.z);
    this.hullYaw = Math.PI;
    this.turretWorldYaw = Math.PI;
    this.turretLocalYaw = 0;
    this.barrelPitch = 0.02;
    this.speed = 0;
    this.maxSpeed = 13.2;
    this.reverseSpeed = 5.5;
    this.acceleration = 13;
    this.health = 100;
    this.maxHealth = 100;
    this.reloadTime = 2.25;
    this.reload = 0;
    this.mgCooldown = 0;
    this.recoil = 0;
    this.dead = false;
    this.radius = 2.0;
    this.dustTimer = 0;
    this.smokeTimer = 0;
    this.hitTimer = 0;
    this.flashTimer = 0;
    this.trackOffset = 0;
    this.muzzleLightTimer = 0;
    this.damageSmokeActive = false;
    this._muzzleWorld = new THREE.Vector3();
    this._barrelWorld = new THREE.Vector3();
    this.velocityDir = new THREE.Vector3(0, 0, -1);
    this.stats = { distance: 0 };
    terrainPose(this, 1, 0);
  }

  get turret() {
    return this.model.userData.turret;
  }

  get barrelPivot() {
    return this.model.userData.barrelPivot;
  }

  get muzzle() {
    return this.model.userData.muzzle;
  }

  update(dt) {
    if (this.dead) return;
    const { input } = this.game;
    const inFriendlyTerritory = this.game.world.territory?.factionAt(this.position.x, this.position.z) === 'player';
    this.reload = Math.max(0, this.reload - dt * (inFriendlyTerritory ? 1.2 : 1));
    this.mgCooldown = Math.max(0, this.mgCooldown - dt);
    this.hitTimer = Math.max(0, this.hitTimer - dt);
    this.flashTimer = Math.max(0, this.flashTimer - dt);
    this.recoil = Math.max(0, this.recoil - dt * 4.5);
    this.muzzleLightTimer = Math.max(0, this.muzzleLightTimer - dt);

    // movement in camera space
    let ix = 0;
    let iz = 0;
    if (input.keys.has('KeyW') || input.keys.has('ArrowUp')) iz += 1;
    if (input.keys.has('KeyS') || input.keys.has('ArrowDown')) iz -= 1;
    if (input.keys.has('KeyA') || input.keys.has('ArrowLeft')) ix -= 1;
    if (input.keys.has('KeyD') || input.keys.has('ArrowRight')) ix += 1;
    const hasInput = ix !== 0 || iz !== 0;
    const yaw = input.cameraYaw;
    const fx = -Math.sin(yaw);
    const fz = -Math.cos(yaw);
    const rx = Math.cos(yaw);
    const rz = -Math.sin(yaw);
    let mx = 0;
    let mz = 0;
    if (hasInput) {
      mx = fx * iz + rx * ix;
      mz = fz * iz + rz * ix;
      const len = Math.hypot(mx, mz);
      mx /= len;
      mz /= len;
      const targetYaw = Math.atan2(mx, mz);
      this.hullYaw = dampAngle(this.hullYaw, targetYaw, 3.6, dt);
      this.velocityDir.set(mx, 0, mz);
    }
    const desiredSpeed = hasInput ? this.maxSpeed : 0;
    this.speed = damp(this.speed, desiredSpeed, hasInput ? 2.8 : 5.0, dt);
    if (this.speed > 0.05) {
      const turnPenalty = hasInput ? clamp(0.6 + 0.4 * Math.cos(shortestAngle(this.hullYaw, Math.atan2(mx, mz))), 0.55, 1) : 1;
      this.position.x += this.velocityDir.x * this.speed * turnPenalty * dt;
      this.position.z += this.velocityDir.z * this.speed * turnPenalty * dt;
      this.stats.distance += this.speed * dt;
    }

    // static collisions
    const hit = this.world.resolveCollisions(this.position, this.radius, true);
    if (hit) this.speed *= 0.75;

    // enemy separation
    for (const e of this.game.enemies) {
      if (e.dead) continue;
      const dx = this.position.x - e.position.x;
      const dz = this.position.z - e.position.z;
      const d = Math.hypot(dx, dz);
      if (d < 4.1 && d > 0.001) {
        this.position.x += (dx / d) * (4.1 - d) * 0.45;
        this.position.z += (dz / d) * (4.1 - d) * 0.45;
      }
    }

    terrainPose(this, dt);
    animateTankTracks(this.model, this.speed * 1.6, dt);
    this.model.userData.body.position.y = Math.sin(this.game.elapsed * 19) * 0.006 * (this.speed / this.maxSpeed);

    // aim
    const aimTarget = this.getAimTarget();
    if (aimTarget) {
      this.aimAt(aimTarget, dt);
    }
    // barrel recoil
    if (this.barrelPivot) {
      this.barrelPivot.position.z = 1.1 - this.recoil * 0.32;
      this.barrelPivot.rotation.x = -this.barrelPitch;
    }
    if (this.model.userData.muzzleFlash) {
      this.model.userData.muzzleFlash.intensity = this.muzzleLightTimer > 0 ? 28 * (this.muzzleLightTimer / 0.08) : 0;
    }

    // dust + engine
    if (this.speed > 1.2) {
      this.dustTimer -= dt;
      if (this.dustTimer <= 0) {
        this.dustTimer = 0.09 + Math.random() * 0.06;
        const fwd = _v1.set(Math.sin(this.hullYaw), 0, Math.cos(this.hullYaw));
        this.game.effects.tankDust(this.position, fwd, clamp(this.speed / this.maxSpeed, 0.4, 1));
      }
    }
    this.game.audio.setEngine(this.speed / this.maxSpeed, true, this.health / 100);

    if (this.health < 52) {
      this.smokeTimer -= dt;
      if (this.smokeTimer <= 0) {
        this.smokeTimer = this.health < 25 ? 0.18 : 0.4;
        this.game.effects.damageSmoke(this.position.clone().add(new THREE.Vector3(0, 2.1, 0)), this.health < 25 ? 0x1f1d19 : 0x484138, this.health < 25 ? 1.25 : 0.8);
      }
    }

    if (this.game.input.mouseDown && this.reload <= 0 && this.game.state === 'playing') {
      this.fire();
    }
    if (input.keys.has('Space') && this.mgCooldown <= 0 && !input.airTarget && this.game.state === 'playing') {
      this.fireMG();
    }
  }

  getAimTarget() {
    const input = this.game.input;
    if (input.airTarget && !input.airTarget.dead) {
      const b = input.airTarget;
      const muzzlePos = this.muzzle.getWorldPosition(this._muzzleWorld);
      const dist = muzzlePos.distanceTo(b.position);
      const flight = clamp(dist / 175, 0.15, 1.4);
      return b.position.clone().addScaledVector(b.velocity, flight * 0.92);
    }
    return input.aimPoint ? input.aimPoint.clone() : null;
  }

  aimAt(target, dt) {
    const turretWorld = this.model.localToWorld(_v2.set(0, 2.35, 0.3));
    const dx = target.x - turretWorld.x;
    const dz = target.z - turretWorld.z;
    const desiredWorldYaw = Math.atan2(dx, dz);
    this.turretLocalYaw = dampAngle(this.turretLocalYaw, shortestAngle(this.hullYaw, desiredWorldYaw), 4.8, dt);
    if (this.turret) this.turret.rotation.y = this.turretLocalYaw;
    const dist = Math.hypot(dx, dz);
    const dy = target.y - (this.position.y + 2.35);
    let desiredPitch = Math.atan2(dy, Math.max(dist, 1.0));
    if (!this.game.input.airTarget) desiredPitch = clamp(desiredPitch, -0.09, 0.42);
    else desiredPitch = clamp(desiredPitch, -0.05, 1.12);
    this.barrelPitch = damp(this.barrelPitch, desiredPitch, 5.2, dt);
  }

  fire() {
    const input = this.game.input;
    const isAir = !!input.airTarget && !input.airTarget.dead;
    const target = this.getAimTarget();
    if (!target) return;
    const muzzlePos = this.muzzle.getWorldPosition(this._muzzleWorld.clone());
    const muzzleBase = this.barrelPivot.getWorldPosition(this._barrelWorld.clone());
    let velocity;
    if (isAir) {
      velocity = solveBallistic(muzzlePos, target, 190, 24);
    } else {
      velocity = solveBallistic(muzzlePos, target, 150, 26);
    }
    if (!Number.isFinite(velocity.x) || velocity.length() < 1) return;
    this.game.spawnShell({
      position: muzzlePos,
      velocity,
      owner: 'player',
      damage: isAir ? 34 : 42,
      splash: isAir ? 18 : 22,
      radius: isAir ? 8 : 5.2,
      gravity: isAir ? 24 : 26,
      color: 0xffd38b,
      size: 1,
      proximityAir: isAir ? 9 : 0,
      airLock: isAir,
      targetPlane: isAir ? input.airTarget : null,
    });
    this.game.audio.cannon();
    this.game.effects.muzzleFlash(muzzlePos, velocity.clone().normalize(), 1.15);
    this.recoil = 1;
    this.reload = this.reloadTime;
    this.muzzleLightTimer = 0.08;
    this.game.shake(isAir ? 0.35 : 0.55);
    this.game.stats.shots++;
    this.game.hud.hitMarker(false);
    // alert nearby enemies
    this.game.alertEnemiesNear(this.position, 110);
    this.game.audio.setEngine(this.speed / this.maxSpeed, true, this.health / 100);
  }

  fireMG() {
    const input = this.game.input;
    const origin = this.turret.localToWorld(new THREE.Vector3(0.45, 0.93, 1.05));
    const dir = new THREE.Vector3().copy(input.aimPoint).sub(origin);
    dir.y = Math.max(dir.y, -6);
    if (dir.lengthSq() < 0.5) dir.set(0, 0, 1);
    dir.normalize();
    const hit = this.findMgTarget(origin, dir);
    this.mgCooldown = 0.085;
    this.game.audio.mg();

    const end = hit ? hit.point : origin.clone().addScaledVector(dir, 64);
    this.game.effects.tracer(origin, end, 0xffe0a0, 0.5);
    this.game.effects.muzzleFlash(origin, dir, 0.3);

    if (!hit) return;
    this.game.hud.hitMarker(false);
    if (hit.soldier) {
      hit.squad.damageSoldier(hit.soldier, 9 + Math.random() * 3);
      if (Math.random() < 0.35) {
        this.game.effects.sparks.spawn({
          position: end.clone(),
          velocity: new THREE.Vector3((Math.random() - 0.5) * 4, 2 + Math.random() * 2, (Math.random() - 0.5) * 4),
          gravity: -12,
          life: 0.3,
          scale0: 0.3,
          scale1: 0.02,
          color: 0xffb08a,
        });
      }
    } else if (hit.entity) {
      hit.entity.takeChipDamage(0.35);
    }
  }

  findMgTarget(origin, dir) {
    let best = null;
    let bestT = 90;
    const point = new THREE.Vector3();
    for (const squad of this.game.enemySquads) {
      if (squad.dead) continue;
      for (const soldier of squad.soldiers) {
        if (!soldier.alive) continue;
        point.set(soldier.pos.x, soldier.pos.y + 1.0, soldier.pos.z);
        const { t, perp } = rayPoint(origin, dir, point);
        if (t < 1.5 || t > bestT || perp > 1.0) continue;
        bestT = t;
        best = {
          soldier,
          squad,
          point: origin.clone().addScaledVector(dir, t),
        };
      }
    }
    if (best) return best;
    for (const list of [this.game.enemies, this.game.artilleries]) {
      for (const entity of list) {
        if (entity.dead) continue;
        point.set(entity.position.x, entity.position.y + 1.4, entity.position.z);
        const { t, perp } = rayPoint(origin, dir, point);
        if (t < 2 || t > bestT || perp > 2.0) continue;
        bestT = t;
        best = {
          entity,
          point: origin.clone().addScaledVector(dir, t),
        };
      }
    }
    return best;
  }

  takeChipDamage(amount) {
    if (this.dead) return;
    this.health = Math.max(0, this.health - amount);
    this.hitTimer = Math.max(this.hitTimer, 0.12);
    this.game.hud.updateHealth(this.health, this.maxHealth);
    if (this.health <= 0) this.destroy();
  }

  takeDamage(amount, sourcePosition, direct = false) {
    if (this.dead) return;
    this.health = Math.max(0, this.health - amount);
    this.hitTimer = 0.35;
    this.game.hud.damageFlash(clamp(amount / 28, 0.25, 1));
    this.game.shake(direct ? 0.7 : 0.4);
    this.game.audio.metalHit();
    const p = this.position.clone().add(new THREE.Vector3(0, 1.8, 0));
    this.game.effects.sparks.spawn({
      position: p,
      velocity: new THREE.Vector3((Math.random() - 0.5) * 5, 3 + Math.random() * 3, (Math.random() - 0.5) * 5),
      gravity: -12,
      life: 0.4,
      scale0: 0.5,
      scale1: 0.02,
      color: 0xffd08a,
    });
    this.game.hud.updateHealth(this.health, this.maxHealth);
    if (this.health <= 0) this.destroy();
  }

  repair(amount) {
    this.health = Math.min(this.maxHealth, this.health + amount);
    this.game.hud.updateHealth(this.health, this.maxHealth);
  }

  destroy() {
    if (this.dead) return;
    this.dead = true;
    this.game.playerDestroyed();
  }
}

// ---------------------------------------------------------------------------
// enemy tank
// ---------------------------------------------------------------------------

export class EnemyTank {
  constructor(game, opts = {}) {
    this.game = game;
    this.world = game.world;
    this.isEnemy = true;
    this.isTank = true;
    this.heavy = !!opts.heavy;
    this.name = this.heavy ? 'heavy-tank' : 'enemy-tank';
    this.model = createTank({
      enemy: true,
      heavy: this.heavy,
      name: this.name,
    });
    this.game.scene.add(this.model);
    this.position = new THREE.Vector3(opts.x, this.world.height(opts.x, opts.z), opts.z);
    this.home = this.position.clone();
    this.hullYaw = opts.yaw ?? Math.atan2(-opts.x, -opts.z);
    this.turretWorldYaw = this.hullYaw;
    this.turretLocalYaw = 0;
    this.barrelPitch = 0.03;
    this.speed = 0;
    this.maxSpeed = this.heavy ? 4.6 : 6.4;
    this.health = this.heavy ? 95 : 62;
    this.maxHealth = this.health;
    this.radius = 2.1;
    this.reload = 1.4 + Math.random() * 1.6;
    this.dead = false;
    this.alerted = !!opts.alerted;
    this.alertRadius = opts.alertRadius ?? 88;
    this.preferredRange = this.heavy ? 22 : 26;
    this.strafeDir = Math.random() < 0.5 ? -1 : 1;
    this.strafeTimer = 2 + Math.random() * 3;
    this.homeAngle = Math.random() * TAU;
    this.fireFlash = 0;
    this.muzzleLightTimer = 0;
    this.hitTimer = 0;
    this.assignedOutpost = opts.outpost || null;
    this.wanderTimer = 0;
    this.wanderTarget = null;
    this.deadTime = 0;
    this.healthBar = createHealthBar(this.heavy ? 3.0 : 2.6, this.heavy ? 0.34 : 0.28, this.heavy ? 3.5 : 3.2);
    this.model.add(this.healthBar.sprite);
    this._muzzleWorld = new THREE.Vector3();
    this._turretWorld = new THREE.Vector3();
    terrainPose(this, 1);
  }

  update(dt) {
    if (this.dead) {
      this.deadTime += dt;
      return;
    }
    const player = this.game.player;
    if (!player || player.dead || this.game.state !== 'playing') {
      this.idle(dt);
      return;
    }
    const dist = this.position.distanceTo(player.position);
    if (!this.alerted && dist < this.alertRadius) this.alerted = true;
    if (this.assignedOutpost && this.assignedOutpost.owner === 'player' && dist < 120) this.alerted = true;

    if (this.alerted) {
      this.combat(dt, player, dist);
    } else {
      this.patrol(dt);
    }

    this.reload = Math.max(0, this.reload - dt);
    this.fireFlash = Math.max(0, this.fireFlash - dt);
    this.muzzleLightTimer = Math.max(0, this.muzzleLightTimer - dt);
    this.hitTimer = Math.max(0, this.hitTimer - dt);
    if (this.model.userData.muzzleFlash) {
      this.model.userData.muzzleFlash.intensity = this.muzzleLightTimer > 0 ? 24 * (this.muzzleLightTimer / 0.08) : 0;
    }
    animateTankTracks(this.model, this.speed * 1.4, dt);
    if (this.model.userData.body) {
      this.model.userData.body.position.y = Math.sin(this.game.elapsed * 18 + this.position.x) * 0.004 * (this.speed / this.maxSpeed);
    }
    if (this.health < this.maxHealth * 0.55) {
      if (Math.random() < dt * 2.4) {
        this.game.effects.damageSmoke(this.position.clone().add(new THREE.Vector3(0, 2.2, 0)), 0x35322b, 0.85);
      }
    }
    this.healthBar.sprite.visible = this.alerted || this.health < this.maxHealth;
    if (this.healthBar.sprite.visible) this.healthBar.update(this.health / this.maxHealth);
  }

  idle(dt) {
    this.speed = damp(this.speed, 0, 3, dt);
    terrainPose(this, dt);
  }

  patrol(dt) {
    this.homeAngle += dt * 0.16;
    const tx = this.home.x + Math.cos(this.homeAngle) * 8;
    const tz = this.home.z + Math.sin(this.homeAngle) * 8;
    this.moveToward(tx, tz, dt, 0.55);
    const desiredYaw = Math.atan2(tx - this.position.x, tz - this.position.z);
    this.turretLocalYaw = dampAngle(this.turretLocalYaw, shortestAngle(this.hullYaw, desiredYaw + 0.5), 1.4, dt);
    if (this.model.userData.turret) this.model.userData.turret.rotation.y = this.turretLocalYaw;
  }

  combat(dt, player, dist) {
    this.strafeTimer -= dt;
    if (this.strafeTimer <= 0) {
      this.strafeTimer = 2.5 + Math.random() * 3.5;
      this.strafeDir *= -1;
    }
    let tx = player.position.x;
    let tz = player.position.z;
    if (dist > this.preferredRange + 7) {
      // close in, with slight offset so tanks don't line up
      tx += Math.cos(this.strafeDir) * 5;
      tz += Math.sin(this.strafeDir) * 5;
    } else if (dist < this.preferredRange - 8) {
      tx = this.position.x - (player.position.x - this.position.x);
      tz = this.position.z - (player.position.z - this.position.z);
    } else {
      // hold and strafe
      const dx = player.position.x - this.position.x;
      const dz = player.position.z - this.position.z;
      const d = Math.hypot(dx, dz) || 1;
      tx = this.position.x + (-dz / d) * this.strafeDir * 10;
      tz = this.position.z + (dx / d) * this.strafeDir * 10;
    }
    // stay reasonably near home if far from player
    if (dist > 120) {
      tx = lerp(tx, this.home.x, 0.5);
      tz = lerp(tz, this.home.z, 0.5);
    }
    this.moveToward(tx, tz, dt, 1);

    // aim
    const turretWorld = this.model.localToWorld(this._turretWorld.set(0, 2.3, 0.2));
    const lead = clamp(dist / 80, 0, 0.8);
    const pvx = player.velocityDir.x * player.speed * 0.55;
    const pvz = player.velocityDir.z * player.speed * 0.55;
    const aimX = player.position.x + pvx * lead;
    const aimZ = player.position.z + pvz * lead;
    const desiredWorldYaw = Math.atan2(aimX - turretWorld.x, aimZ - turretWorld.z);
    this.turretLocalYaw = dampAngle(this.turretLocalYaw, shortestAngle(this.hullYaw, desiredWorldYaw), this.heavy ? 2.0 : 2.6, dt);
    if (this.model.userData.turret) this.model.userData.turret.rotation.y = this.turretLocalYaw;
    const dx = aimX - turretWorld.x;
    const dz = aimZ - turretWorld.z;
    const aimDist = Math.hypot(dx, dz);
    const dy = player.position.y + 1.5 - turretWorld.y;
    const desiredPitch = clamp(Math.atan2(dy, Math.max(aimDist, 1)), -0.08, 0.26);
    this.barrelPitch = damp(this.barrelPitch, desiredPitch, 2.4, dt);
    if (this.model.userData.barrelPivot) this.model.userData.barrelPivot.rotation.x = -this.barrelPitch;

    if (this.reload <= 0 && dist < 92 && aimDist > 5) {
      const aimError = Math.abs(shortestAngle(this.turretWorldYaw + this.turretLocalYaw, desiredWorldYaw));
      const worldYaw = this.hullYaw + this.turretLocalYaw;
      if (Math.abs(shortestAngle(worldYaw, desiredWorldYaw)) < 0.16) this.fire(player);
    }
    this.turretWorldYaw = this.hullYaw;
  }

  moveToward(tx, tz, dt, throttle = 1) {
    const dx = tx - this.position.x;
    const dz = tz - this.position.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 1.2) {
      this.speed = damp(this.speed, 0, 4, dt);
    } else {
      const desiredYaw = Math.atan2(dx, dz);
      this.hullYaw = dampAngle(this.hullYaw, desiredYaw, this.heavy ? 1.8 : 2.4, dt);
      const align = Math.max(0, Math.cos(shortestAngle(this.hullYaw, desiredYaw)));
      const targetSpeed = this.maxSpeed * throttle * (0.35 + align * 0.65);
      this.speed = damp(this.speed, targetSpeed, 2.5, dt);
      const fx = Math.sin(this.hullYaw);
      const fz = Math.cos(this.hullYaw);
      this.position.x += fx * this.speed * dt;
      this.position.z += fz * this.speed * dt;
    }
    // separation from other enemies
    for (const e of this.game.enemies) {
      if (e === this || e.dead) continue;
      const ddx = this.position.x - e.position.x;
      const ddz = this.position.z - e.position.z;
      const d = Math.hypot(ddx, ddz);
      if (d < 4.6 && d > 0.001) {
        this.position.x += (ddx / d) * (4.6 - d) * 0.5;
        this.position.z += (ddz / d) * (4.6 - d) * 0.5;
      }
    }
    const hit = this.world.resolveCollisions(this.position, this.radius);
    if (hit) {
      this.speed *= 0.7;
      this.hullYaw += 0.7 * dt;
    }
    terrainPose(this, dt);
  }

  fire(player) {
    const muzzlePos = this.model.userData.muzzle.getWorldPosition(this._muzzleWorld.clone());
    const turretWorld = this.model.localToWorld(this._turretWorld.set(0, 2.3, 0.2));
    const inaccuracy = this.heavy ? 1.5 : 2.8;
    const target = new THREE.Vector3(
      player.position.x + (Math.random() - 0.5) * inaccuracy * 2,
      player.position.y + 1.3,
      player.position.z + (Math.random() - 0.5) * inaccuracy * 2,
    );
    const dist = muzzlePos.distanceTo(target);
    const flight = clamp(dist / 82, 0, 2);
    target.x += player.velocityDir.x * player.speed * flight * 0.4;
    target.z += player.velocityDir.z * player.speed * flight * 0.4;
    const velocity = solveBallistic(muzzlePos, target, 82, 18);
    this.game.spawnShell({
      position: muzzlePos,
      velocity,
      owner: 'enemy',
      damage: this.heavy ? 16 : 10,
      splash: this.heavy ? 9 : 6,
      radius: this.heavy ? 5.5 : 4.5,
      gravity: 18,
      color: 0xff7a4a,
      size: this.heavy ? 1.2 : 0.9,
      craterRadius: 3.0,
      craterDepth: 0.55,
      source: this,
    });
    this.reload = (this.heavy ? 3.8 : 3.0) + Math.random() * 1.8;
    this.muzzleLightTimer = 0.08;
    this.game.effects.muzzleFlash(muzzlePos, velocity.clone().normalize(), 1.0);
    if (this.game.player.position.distanceTo(this.position) < 90) this.game.audio.enemyCannon();
    this.game.shake(0.05);
  }

  takeChipDamage(amount) {
    if (this.dead) return;
    this.health -= amount;
    this.alerted = true;
    if (this.health <= 0) this.destroy();
  }

  takeDamage(amount, hitPosition, direct = false) {
    if (this.dead) return;
    this.health -= amount;
    this.alerted = true;
    this.healthBar.update(Math.max(0, this.health / this.maxHealth));
    this.healthBar.sprite.visible = true;
    this.game.effects.sparks.spawn({
      position: hitPosition ? hitPosition.clone() : this.position.clone().add(new THREE.Vector3(0, 1.5, 0)),
      velocity: new THREE.Vector3((Math.random() - 0.5) * 8, 3 + Math.random() * 5, (Math.random() - 0.5) * 8),
      gravity: -14,
      life: 0.5,
      scale0: 0.55,
      scale1: 0.02,
      color: 0xffd08a,
    });
    if (this.health <= 0) this.destroy(hitPosition);
  }

  destroy(hitPosition) {
    if (this.dead) return;
    this.dead = true;
    this.healthBar.hide();
    const pos = this.position.clone().add(new THREE.Vector3(0, 1.2, 0));
    this.game.effects.explosion(pos, { size: this.heavy ? 2.2 : 1.7, ground: true, debris: true });
    this.game.audio.explosion(this.heavy ? 1.4 : 1.0);
    this.game.shake(0.5);
    this.game.world.addScorchDecal(this.position.x, this.position.z, 4.5);
    this.game.world.deformTerrain(this.position.x, this.position.z, 3.6, 0.4, false);
    tintWreck(this);
    startWreckSmoke(this.game, this, this.heavy ? 1.35 : 1);
    this.game.stats.kills++;
    this.game.hud.toast(this.heavy ? 'Heavy armor destroyed' : 'Enemy tank destroyed', 'The road north is a little quieter', '✖', 'capture');
    this.game.hud.hitMarker(true);
    this.game.onEnemyKilled?.(this);
  }
}

// ---------------------------------------------------------------------------
// enemy artillery
// ---------------------------------------------------------------------------

export class EnemyArtillery {
  constructor(game, opts = {}) {
    this.game = game;
    this.world = game.world;
    this.isEnemy = true;
    this.isArtillery = true;
    this.name = 'artillery';
    this.model = createArtillery({ enemy: true });
    this.game.scene.add(this.model);
    this.position = new THREE.Vector3(opts.x, this.world.height(opts.x, opts.z), opts.z);
    this.home = this.position.clone();
    this.hullYaw = opts.yaw ?? 0;
    this.turretLocalYaw = 0;
    this.health = 48;
    this.maxHealth = 48;
    this.radius = 2.1;
    this.reload = 4 + Math.random() * 3;
    this.dead = false;
    this.alerted = false;
    this.alertRadius = 190;
    this.fireFlash = 0;
    this.muzzleLightTimer = 0;
    this.smokeTimer = 0;
    this.healthBar = createHealthBar(2.8, 0.3, 3.5);
    this.model.add(this.healthBar.sprite);
    this._muzzleWorld = new THREE.Vector3();
    this._turretWorld = new THREE.Vector3();
    this.aimPitch = 0.5;
    terrainPose(this, 1);
  }

  update(dt) {
    if (this.dead) return;
    const player = this.game.player;
    if (!player || player.dead || this.game.state !== 'playing') return;
    const dist = this.position.distanceTo(player.position);
    if (!this.alerted && dist < this.alertRadius) this.alerted = true;
    this.reload = Math.max(0, this.reload - dt);
    this.muzzleLightTimer = Math.max(0, this.muzzleLightTimer - dt);
    this.turretWorldYaw = this.hullYaw;
    if (!this.alerted) {
      this.turretLocalYaw = damp(this.turretLocalYaw, Math.sin(this.game.elapsed * 0.25) * 0.8, 0.5, dt);
      if (this.model.userData.turret) this.model.userData.turret.rotation.y = this.turretLocalYaw;
      this.healthBar.sprite.visible = false;
      terrainPose(this, dt);
      return;
    }
    this.healthBar.sprite.visible = true;
    this.healthBar.update(this.health / this.maxHealth);
    const turretWorld = this.model.localToWorld(this._turretWorld.set(0, 2.4, 0.2));
    const desiredWorldYaw = Math.atan2(player.position.x - turretWorld.x, player.position.z - turretWorld.z);
    this.turretLocalYaw = dampAngle(this.turretLocalYaw, shortestAngle(this.hullYaw, desiredWorldYaw), 1.2, dt);
    if (this.model.userData.turret) this.model.userData.turret.rotation.y = this.turretLocalYaw;
    if (this.model.userData.barrelPivot) {
      this.model.userData.barrelPivot.rotation.x = -0.55;
    }
    terrainPose(this, dt);
    if (this.reload <= 0 && dist < 185 && dist > 25) {
      this.fire(player);
    }
    if (this.health < this.maxHealth * 0.5 && Math.random() < dt * 2) {
      this.game.effects.damageSmoke(this.position.clone().add(new THREE.Vector3(0, 2.5, 0)), 0x3b362d, 1);
    }
    if (this.model.userData.muzzleFlash) {
      this.model.userData.muzzleFlash.intensity = this.muzzleLightTimer > 0 ? 30 * (this.muzzleLightTimer / 0.08) : 0;
    }
  }

  fire(player) {
    const muzzlePos = this.model.userData.muzzle.getWorldPosition(this._muzzleWorld.clone());
    const flightTime = 2.2 + Math.random() * 0.5;
    const target = new THREE.Vector3(
      player.position.x + player.velocityDir.x * player.speed * flightTime * 0.45 + (Math.random() - 0.5) * 5,
      player.position.y,
      player.position.z + player.velocityDir.z * player.speed * flightTime * 0.45 + (Math.random() - 0.5) * 5,
    );
    const velocity = solveHighArc(muzzlePos, target, 70, 18);
    const marker = this.game.createDangerMarker(target.x, target.z, 8, 3);
    this.game.spawnShell({
      position: muzzlePos,
      velocity,
      owner: 'artillery',
      damage: 28,
      splash: 16,
      radius: 8,
      gravity: 18,
      color: 0xffa057,
      size: 1.6,
      craterRadius: 5.5,
      craterDepth: 1.35,
      marker,
      target,
      source: this,
      whistle: true,
    });
    this.reload = 8.5 + Math.random() * 3;
    this.muzzleLightTimer = 0.08;
    this.game.effects.muzzleFlash(muzzlePos, velocity.clone().normalize(), 1.5);
    this.game.audio.shellWhistle(1.8);
    if (this.game.player.position.distanceTo(this.position) < 130) this.game.shake(0.12);
    this.alerted = true;
  }

  takeDamage(amount, hitPosition, direct = false) {
    if (this.dead) return;
    this.health -= amount;
    this.alerted = true;
    this.healthBar.update(Math.max(0, this.health / this.maxHealth));
    this.healthBar.sprite.visible = true;
    this.game.effects.sparks.spawn({
      position: hitPosition ? hitPosition.clone() : this.position.clone().add(new THREE.Vector3(0, 1.4, 0)),
      velocity: new THREE.Vector3((Math.random() - 0.5) * 7, 3 + Math.random() * 5, (Math.random() - 0.5) * 7),
      gravity: -14,
      life: 0.5,
      scale0: 0.5,
      scale1: 0.02,
      color: 0xffd08a,
    });
    if (this.health <= 0) this.destroy();
  }

  destroy() {
    if (this.dead) return;
    this.dead = true;
    this.healthBar.hide();
    const pos = this.position.clone().add(new THREE.Vector3(0, 1.4, 0));
    this.game.effects.explosion(pos, { size: 2.1, ground: true, debris: true });
    this.game.audio.explosion(1.4);
    this.game.shake(0.55);
    tintWreck(this);
    startWreckSmoke(this.game, this, 1.2);
    this.game.world.addScorchDecal(this.position.x, this.position.z, 4.5);
    this.game.stats.kills++;
    this.game.hud.toast('Artillery silenced', 'No more falling shells — for now', '✖', 'capture');
    this.game.hud.hitMarker(true);
    this.game.onEnemyKilled?.(this);
  }
}

// ---------------------------------------------------------------------------
// bomber
// ---------------------------------------------------------------------------

export class Bomber {
  constructor(game, opts = {}) {
    this.game = game;
    this.world = game.world;
    this.isEnemy = true;
    this.isBomber = true;
    this.name = 'bomber';
    this.model = createBomber({ enemy: true });
    this.game.scene.add(this.model);
    this.model.scale.setScalar(1.0);
    this.position = new THREE.Vector3(opts.x, opts.y ?? 52, opts.z);
    this.target = new THREE.Vector3(opts.targetX, 0, opts.targetZ);
    this.target.y = this.world.height(this.target.x, this.target.z);
    this.altitude = this.position.y;
    this.speed = opts.speed ?? 19;
    const dx = this.target.x - this.position.x;
    const dz = this.target.z - this.position.z;
    const len = Math.hypot(dx, dz) || 1;
    this.direction = new THREE.Vector3(dx / len, 0, dz / len);
    this.velocity = this.direction.clone().multiplyScalar(this.speed);
    this.hullYaw = Math.atan2(this.direction.x, this.direction.z);
    this.health = 100;
    this.maxHealth = 100;
    this.dead = false;
    this.falling = false;
    this.dropTimer = 1.2;
    this.bombsDropped = 0;
    this.bombsMax = 3;
    this.dropStarted = false;
    this.age = 0;
    this.bank = 0;
    this.healthBar = createHealthBar(4.2, 0.42, 3.0);
    this.model.add(this.healthBar.sprite);
    this._muzzle = new THREE.Vector3();
    this._tmp = new THREE.Vector3();
    this.startWarnings = false;
    this.engineSmokeTimer = 0;
    this.model.position.copy(this.position);
    this.model.rotation.y = this.hullYaw;
    this.game.audio.bomberDrone(13);
  }

  update(dt) {
    if (this.dead) return;
    this.age += dt;
    if (this.falling) {
      this.updateFalling(dt);
      return;
    }
    this.position.addScaledVector(this.velocity, dt);
    const horizontalDist = Math.hypot(this.target.x - this.position.x, this.target.z - this.position.z);
    const passed = (this.position.x - this.target.x) * this.direction.x + (this.position.z - this.target.z) * this.direction.z > 8;
    if (!this.dropStarted && horizontalDist < 66) {
      this.dropStarted = true;
      this.game.hud.alert('Bomber over the valley', 'Bombs away — keep moving');
      this.game.audio.warning();
    }
    if (this.dropStarted && !passed) {
      this.dropTimer -= dt;
      if (this.dropTimer <= 0 && this.bombsDropped < this.bombsMax) {
        this.dropBomb();
        this.bombsDropped++;
        this.dropTimer = 0.62;
      }
    }
    if (Math.abs(this.position.x) > 175 || Math.abs(this.position.z) > 175 || this.age > 32 || (passed && horizontalDist > 75)) {
      this.leave();
      return;
    }
    // subtle banking and bobbing
    this.bank = damp(this.bank, Math.sin(this.age * 0.6) * 0.04, 1.2, dt);
    this.model.position.copy(this.position);
    this.model.rotation.y = this.hullYaw;
    this.model.rotation.z = this.bank;
    this.model.rotation.x = Math.sin(this.age * 0.7) * 0.012;
    for (const p of this.model.userData.propellers || []) p.rotation.z += dt * 42;
    this.healthBar.sprite.visible = this.health < this.maxHealth;
    if (this.healthBar.sprite.visible) this.healthBar.update(this.health / this.maxHealth);
    this.engineSmokeTimer -= dt;
    if (this.engineSmokeTimer <= 0 && this.health < 60) {
      this.engineSmokeTimer = this.health < 30 ? 0.12 : 0.3;
      this.game.effects.damageSmoke(this.position.clone().add(new THREE.Vector3((Math.random() - 0.5) * 5, 0, (Math.random() - 0.5) * 4)), 0x2b2924, 1.8);
    }
  }

  dropBomb() {
    const player = this.game.player;
    const target = player && !player.dead ? player.position.clone() : this.target.clone();
    target.x += (Math.random() - 0.5) * 10;
    target.z += (Math.random() - 0.5) * 10;
    target.y = this.world.height(target.x, target.z);
    const start = this.position.clone();
    start.y -= 1.4;
    const fallHeight = Math.max(4, start.y - target.y);
    const t = Math.sqrt((2 * fallHeight) / 24);
    const velocity = new THREE.Vector3((target.x - start.x) / t, 0, (target.z - start.z) / t);
    const marker = this.game.createDangerMarker(target.x, target.z, 9, t + 0.4);
    this.game.spawnBomb({
      position: start,
      velocity,
      target,
      marker,
      damage: 42,
      splash: 24,
      radius: 10,
      gravity: 24,
      source: this,
    });
    this.game.audio.bombWhistle(t);
  }

  updateFalling(dt) {
    this.fallTime = (this.fallTime || 0) + dt;
    this.velocity.y -= 16 * dt;
    this.velocity.x *= 1 - dt * 0.2;
    this.velocity.z *= 1 - dt * 0.2;
    this.position.addScaledVector(this.velocity, dt);
    this.model.position.copy(this.position);
    this.model.rotation.z += dt * 2.8;
    this.model.rotation.x += dt * 1.2;
    this.healthBar.hide();
    this.engineSmokeTimer -= dt;
    if (this.engineSmokeTimer <= 0) {
      this.engineSmokeTimer = 0.07;
      this.game.effects.damageSmoke(this.position.clone(), 0x211f1b, 2.2);
      this.game.effects.fire(this.position.clone(), 1.5);
    }
    const ground = this.world.height(this.position.x, this.position.z);
    if (this.position.y <= ground + 1.5) {
      this.crash();
    }
  }

  crash() {
    this.dead = true;
    const pos = this.position.clone();
    pos.y = this.world.height(pos.x, pos.z) + 1;
    this.game.effects.explosion(pos, { size: 3.2, ground: true, debris: true });
    this.game.effects.explosion(pos.clone().add(new THREE.Vector3(3, 2, 2)), { size: 2, ground: false, debris: false });
    this.game.audio.explosion(2.2);
    this.game.shake(1.1);
    this.game.world.deformTerrain(pos.x, pos.z, 7.5, 1.8, true);
    this.game.world.addScorchDecal(pos.x, pos.z, 8);
    this.game.stats.airKills++;
    this.game.hud.toast('Bomber down', 'Crew credited with an air kill', '✈', 'capture');
    this.game.onBomberKilled?.(this);
    this.cleanup();
    this.game.stats.kills++;
  }

  leave() {
    this.dead = true;
    this.cleanup();
    this.game.onBomberLeft?.(this);
  }

  cleanup() {
    this.healthBar.hide();
    this.game.scene.remove(this.model);
    this.game.removeBomber(this);
  }

  takeDamage(amount, hitPosition, direct = false) {
    if (this.dead || this.falling) return;
    this.health -= amount;
    this.healthBar.update(Math.max(0, this.health / this.maxHealth));
    this.healthBar.sprite.visible = true;
    this.game.hud.hitMarker(true);
    this.game.effects.sparks.spawn({
      position: hitPosition ? hitPosition.clone() : this.position.clone(),
      velocity: new THREE.Vector3((Math.random() - 0.5) * 7, 3 + Math.random() * 3, (Math.random() - 0.5) * 7),
      gravity: -10,
      life: 0.5,
      scale0: 0.7,
      scale1: 0.02,
      color: 0xffd08a,
    });
    this.game.audio.metalHit();
    if (this.health <= 0) {
      this.falling = true;
      this.velocity.y = -3;
      this.game.effects.explosion(this.position.clone(), { size: 1.4, ground: false, debris: false });
      this.game.audio.explosion(0.8);
      this.game.hud.toast('Bomber crippled', 'She is going down', '✈', 'danger');
      this.game.alertEnemiesNear?.(this.position, 0);
    }
  }
}

// ---------------------------------------------------------------------------
// projectiles
// ---------------------------------------------------------------------------

export class Shell {
  constructor(game, opts) {
    this.game = game;
    this.world = game.world;
    this.owner = opts.owner || 'player';
    this.isPlayerShell = this.owner === 'player';
    this.position = opts.position.clone();
    this.velocity = opts.velocity.clone();
    this.gravity = opts.gravity ?? 26;
    this.damage = opts.damage ?? 20;
    this.splash = opts.splash ?? 10;
    this.radius = opts.radius ?? 5;
    this.color = opts.color ?? 0xffd38b;
    this.size = opts.size ?? 1;
    this.proximityAir = opts.proximityAir ?? 0;
    this.airLock = !!opts.airLock;
    this.targetPlane = opts.targetPlane || null;
    this.marker = opts.marker || null;
    this.target = opts.target || null;
    this.whistle = !!opts.whistle;
    this.source = opts.source || null;
    this.craterRadius = opts.craterRadius ?? (this.owner === 'player' ? 3.8 : 3.0);
    this.craterDepth = opts.craterDepth ?? (this.owner === 'player' ? 0.8 : 0.55);
    this.age = 0;
    this.maxAge = 12;
    this.dead = false;
    this.trailTimer = 0;
    this.substep = 0;
    this.mesh = new THREE.Group();
    const shellGeo = new THREE.CapsuleGeometry(0.09 * this.size, 0.9 * this.size, 3, 6);
    shellGeo.rotateX(Math.PI / 2);
    const mat = new THREE.MeshBasicMaterial({ color: this.color, toneMapped: false });
    this.core = new THREE.Mesh(shellGeo, mat);
    this.mesh.add(this.core);
    const glowMat = new THREE.SpriteMaterial({
      map: game.effects.sparkMap,
      color: this.color,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
    });
    this.glow = new THREE.Sprite(glowMat);
    this.glow.scale.setScalar(1.5 * this.size);
    this.mesh.add(this.glow);
    this.mesh.position.copy(this.position);
    this.mesh.renderOrder = 8;
    game.scene.add(this.mesh);
    this._stepDt = 0;
  }

  update(dt) {
    if (this.dead) return;
    this.age += dt;
    if (this.age > this.maxAge) {
      this.remove();
      return;
    }
    const speed = this.velocity.length();
    const steps = clamp(Math.ceil((speed * dt) / 1.1), 1, 8);
    const stepDt = dt / steps;
    for (let s = 0; s < steps; s++) {
      this.velocity.y -= this.gravity * stepDt;
      this.position.addScaledVector(this.velocity, stepDt);

      // plane proximity / direct collision
      if (this.isPlayerShell) {
        for (const squad of this.game.enemySquads) {
          if (squad.dead) continue;
          for (const soldier of squad.soldiers) {
            if (!soldier.alive) continue;
            if (Math.hypot(this.position.x - soldier.pos.x, this.position.z - soldier.pos.z) > 1.35) continue;
            if (Math.abs(this.position.y - (soldier.pos.y + 1.0)) > 1.7) continue;
            squad.damageSoldier(soldier, this.damage);
            this.impact(this.position.clone(), null, true);
            return;
          }
        }
        for (const b of this.game.bombers) {
          if (b.dead || b.falling) continue;
          const d = this.position.distanceTo(b.position);
          if (d < 2.8 + this.size * 0.3) {
            this.impact(b.position.clone(), b, true, true);
            return;
          }
          if (this.proximityAir > 0 && d < this.proximityAir) {
            this.impact(this.position.clone(), b, false, true);
            return;
          }
        }
        for (const e of this.game.enemies) {
          if (e.dead) continue;
          const center = e.position.clone().add(new THREE.Vector3(0, 1.45, 0));
          if (this.position.distanceTo(center) < 2.3 + this.size * 0.2) {
            this.impact(center, e, true);
            return;
          }
        }
        for (const a of this.game.artilleries) {
          if (a.dead) continue;
          const center = a.position.clone().add(new THREE.Vector3(0, 1.35, 0));
          if (this.position.distanceTo(center) < 2.6 + this.size * 0.2) {
            this.impact(center, a, true);
            return;
          }
        }
      } else {
        for (const squad of this.game.playerSquads) {
          if (squad.dead) continue;
          let hit = false;
          for (const soldier of squad.soldiers) {
            if (!soldier.alive) continue;
            if (Math.hypot(this.position.x - soldier.pos.x, this.position.z - soldier.pos.z) > 1.35) continue;
            if (Math.abs(this.position.y - (soldier.pos.y + 1.0)) > 1.7) continue;
            squad.damageSoldier(soldier, this.damage * 1.5);
            hit = true;
            break;
          }
          if (hit) {
            this.impact(this.position.clone(), null, true);
            return;
          }
        }
        const player = this.game.player;
        if (player && !player.dead) {
          const center = player.position.clone().add(new THREE.Vector3(0, 1.45, 0));
          if (this.position.distanceTo(center) < 2.25) {
            this.impact(center, player, true);
            return;
          }
        }
      }

      const ground = this.world.height(this.position.x, this.position.z);
      if (this.position.y <= ground + 0.12) {
        this.position.y = ground + 0.12;
        this.impact(this.position.clone(), null, false);
        return;
      }
      if (this.position.y < -30) {
        this.remove();
        return;
      }
    }

    this.mesh.position.copy(this.position);
    this.mesh.quaternion.setFromUnitVectors(FORWARD, _v1.copy(this.velocity).normalize());
    this.trailTimer -= dt;
    if (this.trailTimer <= 0) {
      this.trailTimer = 0.018;
      this.game.effects.shellTrail(this.position, this.color, 0.2 * this.size);
      if (this.whistle && this.age < 2.5) {
        // subtle smoke trail for big artillery rounds
        this.game.effects.smoke.spawn({
          position: this.position.clone(),
          velocity: new THREE.Vector3(0, 0.2, 0),
          life: 0.8,
          scale0: 0.2,
          scale1: 0.9,
          opacity: 0.1,
          color: 0x8f846f,
        });
      }
    }
    if (this.marker) {
      this.marker.update(dt);
      this.marker.life = Math.max(0, this.marker.life - dt);
    }
  }

  impact(position, directTarget, direct = false, airBurst = false) {
    if (this.dead) return;
    this.dead = true;
    const game = this.game;
    const isPlayer = this.owner === 'player';
    const blastSize = this.owner === 'bomb' ? 3 : this.owner === 'artillery' ? 2 : this.size;
    if (airBurst) {
      game.effects.explosion(position, { size: 1.3, ground: false, debris: false });
      game.audio.explosion(0.8);
      for (const b of game.bombers) {
        if (b.dead || b.falling) continue;
        const d = b.position.distanceTo(position);
        if (d < this.radius) b.takeDamage(this.damage, position, true);
      }
      game.shake(0.18);
      game.hud.hitMarker(true);
    } else {
      game.effects.explosion(position, { size: blastSize, ground: true, debris: true });
      game.audio.explosion(this.owner === 'bomb' ? 2.4 : this.owner === 'artillery' ? 1.8 : 1.1);
      const dp = game.player.position.distanceTo(position);
      game.shake(clamp(0.65 - dp / 180, 0.08, 0.65) * (this.owner === 'bomb' ? 1.8 : this.owner === 'artillery' ? 1.4 : 1));
      if (this.marker) {
        this.marker.remove();
        this.marker = null;
      }
      const craterR = this.craterRadius;
      const craterD = this.craterDepth;
      game.world.deformTerrain(position.x, position.z, craterR, craterD, true);

      if (isPlayer) {
        const targets = [...game.enemies, ...game.artilleries];
        for (const e of targets) {
          if (e.dead) continue;
          const d = e.position.distanceTo(position);
          if (d < this.radius) {
            const dmg = e === directTarget ? this.damage : this.splash * (1 - d / this.radius);
            if (dmg > 1) e.takeDamage(dmg, position, e === directTarget);
          }
        }
        for (const b of game.bombers) {
          if (b.dead || b.falling) continue;
          const d = b.position.distanceTo(position);
          if (d < this.radius * 0.8) b.takeDamage(b === directTarget ? this.damage : this.splash * 0.5, position, b === directTarget);
        }
        for (const squad of game.enemySquads) {
          if (!squad.dead) squad.takeSplash(position, this.radius + 1.6, this.splash * 1.15);
        }
        if (directTarget && !directTarget.dead) game.hud.hitMarker(true);
        game.flattenBarnsNear(position, this.radius + 3.5);
      } else {
        const player = game.player;
        if (player && !player.dead) {
          const d = player.position.distanceTo(position);
          if (d < this.radius) {
            const isDirect = directTarget === player || (this.owner === 'bomb' && d < 4.2) || (this.owner === 'artillery' && d < 3.0);
            const dmg = isDirect ? this.damage : this.splash * (1 - d / this.radius);
            if (dmg > 1) player.takeDamage(dmg, position, isDirect);
          }
        }
        for (const squad of game.playerSquads) {
          if (!squad.dead) squad.takeSplash(position, this.radius + 1.6, this.splash * 1.15);
        }
        if (this.owner === 'bomb' || this.owner === 'artillery') {
          game.flattenBarnsNear(position, this.radius + 2);
        }
      }
    }
    if (this.marker) {
      this.marker.remove();
      this.marker = null;
    }
    this.remove();
  }

  remove() {
    this.dead = true;
    if (this.marker) {
      this.marker.remove();
      this.marker = null;
    }
    this.game.scene.remove(this.mesh);
    this.core.geometry.dispose();
    this.core.material.dispose();
    this.glow.material.dispose();
    this.game.removeProjectile(this);
  }
}

export class Bomb extends Shell {
  constructor(game, opts) {
    super(game, { ...opts, owner: 'bomb', gravity: opts.gravity ?? 24, damage: opts.damage ?? 42, splash: opts.splash ?? 24, radius: opts.radius ?? 10 });
    this.craterRadius = opts.radius ?? 9;
    this.craterDepth = 2.1;
    this.maxAge = 16;
    this.mesh.remove(this.core);
    this.core.geometry.dispose();
    this.core.material.dispose();
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0x3d3b34, roughness: 0.55, metalness: 0.4 });
    const bodyGeo = new THREE.CapsuleGeometry(0.22, 1.25, 4, 8);
    bodyGeo.rotateX(Math.PI / 2);
    this.core = new THREE.Mesh(bodyGeo, bodyMat);
    this.mesh.add(this.core);
    for (let i = 0; i < 3; i++) {
      const fin = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.04, 0.38), bodyMat);
      fin.position.z = -0.72;
      fin.rotation.z = (i / 3) * Math.PI * 2;
      fin.castShadow = true;
      this.mesh.add(fin);
    }
    this.mesh.remove(this.glow);
    this.glow.material.dispose();
    this.glow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: game.effects.sparkMap,
      color: 0xffb060,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
    }));
    this.glow.scale.setScalar(1.2);
    this.mesh.add(this.glow);
    this.trailTimer = 0;
  }

  update(dt) {
    if (this.dead) return;
    this.age += dt;
    this.velocity.y -= this.gravity * dt;
    this.position.addScaledVector(this.velocity, dt);
    this.mesh.position.copy(this.position);
    this.mesh.rotation.z += dt * 1.2;
    this.mesh.rotation.x = 0;
    this.mesh.quaternion.setFromUnitVectors(FORWARD, _v1.copy(this.velocity).normalize());
    this.trailTimer -= dt;
    if (this.trailTimer <= 0) {
      this.trailTimer = 0.04;
      this.game.effects.smoke.spawn({
        position: this.position.clone(),
        velocity: new THREE.Vector3(0, 0.3, 0),
        life: 0.6,
        scale0: 0.25,
        scale1: 0.7,
        opacity: 0.14,
        color: 0x79705f,
      });
    }
    if (this.marker) {
      this.marker.update(dt);
      this.marker.life = Math.max(0, this.marker.life - dt);
    }
    const ground = this.world.height(this.position.x, this.position.z);
    if (this.position.y <= ground + 0.2) {
      this.position.y = ground + 0.2;
      this.impact(this.position.clone(), null, false);
      return;
    }
    if (this.age > this.maxAge) this.remove();
  }
}
