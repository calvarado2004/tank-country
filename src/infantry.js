import * as THREE from 'three';
import { TAU, clamp, dampAngle } from './utils.js';
import { splashDamage, lineOfSight } from './combat.js';
import { createInfantry } from './models.js';

const SQUAD_SLOTS = [
  [-1.35, 0.9],
  [1.35, 0.9],
  [-1.35, -1.1],
  [1.35, -1.1],
];

export class InfantrySquad {
  constructor(game, opts = {}) {
    this.game = game;
    this.world = game.world;
    this.enemy = !!opts.enemy;
    this.isInfantrySquad = true;
    this.name = opts.name || (this.enemy ? 'Crimson rifles' : 'Able squad');
    this.position = new THREE.Vector3(opts.x, this.world.height(opts.x, opts.z), opts.z);
    this.home = this.position.clone();
    this.holdPoint = this.position.clone();
    this.moveTarget = null;
    this.order = this.enemy ? 'hold' : 'follow';
    this.speed = this.enemy ? 4.6 : 9.4;
    this.aggroRadius = opts.aggroRadius ?? (this.enemy ? 60 : 66);
    this.fireRange = this.enemy ? 56 : 64;
    this.target = null;
    this.targetTimer = 0;
    this.aliveCount = 0;
    this.dead = false;
    this.soldiers = [];
    this._goal = new THREE.Vector3();
    this._muzzle = new THREE.Vector3();
    this._heightAt = (x, z) => this.world.height(x, z);

    const count = opts.count ?? 4;
    const atCount = opts.atCount ?? 1;
    const formationRadius = opts.formationRadius ?? 0;
    for (let i = 0; i < count; i++) {
      const at = i < atCount;
      const model = createInfantry({ enemy: this.enemy, at });
      game.scene.add(model);
      let slotX;
      let slotZ;
      if (formationRadius > 0) {
        const angle = (i / count) * TAU + (opts.formationAngle ?? 0);
        slotX = Math.cos(angle) * formationRadius;
        slotZ = Math.sin(angle) * formationRadius;
      } else {
        [slotX, slotZ] = SQUAD_SLOTS[i % SQUAD_SLOTS.length];
      }
      const soldier = {
        model,
        at,
        alive: true,
        health: at ? 60 : 46,
        maxHealth: at ? 60 : 46,
        pos: new THREE.Vector3(opts.x + slotX, 0, opts.z + slotZ),
        yaw: opts.yaw ?? (this.enemy ? 0 : Math.PI),
        phase: Math.random() * TAU,
        fireTimer: 0.5 + Math.random() * 1.7,
        slot: [slotX, slotZ],
        deathTimer: 0,
        speed: 0,
      };
      this.soldiers.push(soldier);
      this.aliveCount++;
      this.placeSoldier(soldier);
    }
    if (this.enemy) game.enemySquads.push(this);
    else game.playerSquads.push(this);
  }

  placeSoldier(soldier) {
    const p = soldier.pos;
    p.y = this.world.height(p.x, p.z);
    const model = soldier.model;
    if (soldier.alive) {
      model.position.set(p.x, p.y, p.z);
      model.rotation.set(0, soldier.yaw, 0, 'YXZ');
    } else {
      model.position.set(p.x, p.y + 0.2, p.z);
      model.rotation.set(0, soldier.yaw, Math.PI / 2, 'YXZ');
    }
  }

  hasSoldierNear(x, z, radius) {
    for (const soldier of this.soldiers) {
      if (!soldier.alive) continue;
      if (Math.hypot(soldier.pos.x - x, soldier.pos.z - z) < radius) return true;
    }
    return false;
  }

  // Captured outposts resupply the squad: every soldier returns at full health.
  reinforce() {
    const cx = this.position.x;
    const cz = this.position.z;
    this.soldiers.forEach((soldier, i) => {
      const angle = (i / this.soldiers.length) * TAU;
      soldier.alive = true;
      soldier.health = soldier.maxHealth;
      soldier.deathTimer = 0;
      soldier.pos.set(cx + Math.cos(angle) * 2.2, 0, cz + Math.sin(angle) * 2.2);
      soldier.model.visible = true;
      soldier.model.rotation.set(0, soldier.yaw, 0, 'YXZ');
      const legL = soldier.model.userData.legL;
      const legR = soldier.model.userData.legR;
      if (legL) legL.rotation.x = 0;
      if (legR) legR.rotation.x = 0;
      this.placeSoldier(soldier);
    });
    this.dead = false;
    this.aliveCount = this.soldiers.length;
  }

  update(dt) {
    if (this.dead) return;
    this.targetTimer -= dt;
    if (this.targetTimer <= 0) {
      this.targetTimer = 0.4;
      this.acquireTarget();
    }
    this.updateGoal();

    let alive = 0;
    let cx = 0;
    let cz = 0;
    for (const soldier of this.soldiers) {
      if (!soldier.alive) {
        if (soldier.deathTimer > 0) {
          soldier.deathTimer -= dt;
          if (soldier.deathTimer <= 0) soldier.model.visible = false;
        }
        continue;
      }
      alive++;
      this.updateSoldier(soldier, dt);
      cx += soldier.pos.x;
      cz += soldier.pos.z;
    }
    this.aliveCount = alive;
    if (alive > 0) {
      cx /= alive;
      cz /= alive;
      this.position.set(cx, this.world.height(cx, cz), cz);
    } else {
      this.dead = true;
      this.target = null;
    }
  }

  updateGoal() {
    if (this.enemy) {
      if (this.order === 'move' && this.moveTarget) {
        this._goal.copy(this.moveTarget);
        if (Math.hypot(this._goal.x - this.position.x, this._goal.z - this.position.z) < 3.2) {
          this.order = 'hold';
          this.holdPoint.copy(this._goal);
          this.moveTarget = null;
        }
      } else {
        this._goal.copy(this.holdPoint);
      }
      return;
    }
    const player = this.game.player;
    if (this.order === 'follow' && player && !player.dead) {
      const fx = Math.sin(player.hullYaw);
      const fz = Math.cos(player.hullYaw);
      const rx = Math.cos(player.hullYaw);
      const rz = -Math.sin(player.hullYaw);
      this._goal.set(
        player.position.x - fx * 7.5 + rx * 2.6,
        0,
        player.position.z - fz * 7.5 + rz * 2.6,
      );
      return;
    }
    if (this.order === 'move' && this.moveTarget) {
      this._goal.copy(this.moveTarget);
      if (Math.hypot(this._goal.x - this.position.x, this._goal.z - this.position.z) < 2.8) {
        this.order = 'hold';
        this.holdPoint.copy(this._goal);
        this.moveTarget = null;
      }
      return;
    }
    this._goal.copy(this.holdPoint);
  }

  updateSoldier(soldier, dt) {
    const goalX = this._goal.x + soldier.slot[0];
    const goalZ = this._goal.z + soldier.slot[1];
    const dx = goalX - soldier.pos.x;
    const dz = goalZ - soldier.pos.z;
    const dist = Math.hypot(dx, dz);
    let moving = false;
    if (dist > 0.75) {
      const step = clamp((dist - 0.4) * 2.4, 0, this.speed);
      soldier.pos.x += (dx / dist) * step * dt;
      soldier.pos.z += (dz / dist) * step * dt;
      soldier.speed = step;
      moving = true;
      this.world.resolveCollisions(soldier.pos, 0.42, false);
    } else {
      soldier.speed = 0;
    }

    const fireTarget = soldier.at ? (this.findTankTarget(soldier.pos) || this.target) : this.target;
    let faceX = goalX;
    let faceZ = goalZ;
    if (fireTarget) {
      const tp = this.targetPoint(fireTarget);
      faceX = tp.x;
      faceZ = tp.z;
    }
    if (moving || fireTarget) {
      const desiredYaw = Math.atan2(faceX - soldier.pos.x, faceZ - soldier.pos.z);
      soldier.yaw = dampAngle(soldier.yaw, desiredYaw, 7, dt);
    }

    if (moving) soldier.phase += dt * (5.5 + soldier.speed * 1.1);
    const swing = moving ? Math.sin(soldier.phase) * 0.62 : 0;
    const legL = soldier.model.userData.legL;
    const legR = soldier.model.userData.legR;
    if (legL) legL.rotation.x = swing;
    if (legR) legR.rotation.x = -swing;
    const body = soldier.model.userData.body;
    if (body) body.position.y = moving ? Math.abs(Math.sin(soldier.phase)) * 0.035 : 0;

    soldier.pos.y = this.world.height(soldier.pos.x, soldier.pos.z);
    soldier.model.position.set(soldier.pos.x, soldier.pos.y, soldier.pos.z);
    soldier.model.rotation.y = soldier.yaw;

    soldier.fireTimer -= dt;
    if (!fireTarget || soldier.fireTimer > 0) return;
    const point = this.targetPoint(fireTarget);
    const range = this.fireRange;
    if (Math.hypot(point.x - soldier.pos.x, point.z - soldier.pos.z) > range) return;
    const muzzle = this.muzzleFor(soldier, this._muzzle);
    if (!this.hasLineOfSight(muzzle, point)) {
      soldier.fireTimer = 0.35;
      return;
    }
    if (soldier.at) this.fireAT(soldier, fireTarget, point, muzzle);
    else this.fireRifle(soldier, fireTarget, point, muzzle);
  }

  acquireTarget() {
    let best = null;
    let bestDist = Infinity;
    if (this.enemy) {
      for (const squad of this.game.playerSquads) {
        if (squad.dead) continue;
        for (const soldier of squad.soldiers) {
          if (!soldier.alive) continue;
          const d = Math.hypot(soldier.pos.x - this.position.x, soldier.pos.z - this.position.z);
          if (d < bestDist && d < this.aggroRadius) {
            bestDist = d;
            best = { kind: 'soldier', soldier, squad };
          }
        }
      }
      const player = this.game.player;
      if (player && !player.dead) {
        const d = this.position.distanceTo(player.position);
        if (d < bestDist && d < this.aggroRadius + 12) {
          bestDist = d;
          best = { kind: 'tank', entity: player };
        }
      }
    } else {
      for (const squad of this.game.enemySquads) {
        if (squad.dead) continue;
        for (const soldier of squad.soldiers) {
          if (!soldier.alive) continue;
          const d = Math.hypot(soldier.pos.x - this.position.x, soldier.pos.z - this.position.z);
          if (d < bestDist && d < this.aggroRadius) {
            bestDist = d;
            best = { kind: 'soldier', soldier, squad };
          }
        }
      }
      if (!best) {
        for (const list of [this.game.enemies, this.game.artilleries]) {
          for (const entity of list) {
            if (entity.dead) continue;
            const d = this.position.distanceTo(entity.position);
            if (d < bestDist && d < this.aggroRadius) {
              bestDist = d;
              best = { kind: 'tank', entity };
            }
          }
        }
      }
    }
    this.target = best;
  }

  findTankTarget(origin) {
    let best = null;
    let bestDist = 58;
    if (this.enemy) {
      const player = this.game.player;
      if (player && !player.dead) {
        const d = Math.hypot(player.position.x - origin.x, player.position.z - origin.z);
        if (d < bestDist) {
          bestDist = d;
          best = { kind: 'tank', entity: player };
        }
      }
      return best;
    }
    for (const list of [this.game.enemies, this.game.artilleries]) {
      for (const entity of list) {
        if (entity.dead) continue;
        const d = Math.hypot(entity.position.x - origin.x, entity.position.z - origin.z);
        if (d < bestDist) {
          bestDist = d;
          best = { kind: 'tank', entity };
        }
      }
    }
    return best;
  }

  targetPoint(target) {
    if (target.kind === 'soldier') {
      return new THREE.Vector3(target.soldier.pos.x, target.soldier.pos.y + 1.05, target.soldier.pos.z);
    }
    return new THREE.Vector3(target.entity.position.x, target.entity.position.y + 1.25, target.entity.position.z);
  }

  muzzleFor(soldier, out) {
    out.set(
      soldier.pos.x + Math.sin(soldier.yaw) * 0.4,
      soldier.pos.y + (soldier.at ? 1.32 : 1.12),
      soldier.pos.z + Math.cos(soldier.yaw) * 0.4,
    );
    return out;
  }

  hasLineOfSight(from, to) {
    return lineOfSight(this._heightAt, from, to);
  }

  fireRifle(soldier, target, point, muzzle) {
    const missed = new THREE.Vector3(
      point.x + (Math.random() - 0.5) * 1.2,
      point.y + (Math.random() - 0.5) * 0.9,
      point.z + (Math.random() - 0.5) * 1.2,
    );
    this.game.effects.tracer(muzzle, missed, this.enemy ? 0xff9a6a : 0xffe6b0, 0.42);
    this.game.effects.muzzleFlash(muzzle, missed.clone().sub(muzzle).normalize(), 0.22);
    if (this.game.player.position.distanceToSquared(muzzle) < 70 * 70) this.game.audio.rifle();

    if (target.kind === 'soldier') {
      target.squad.damageSoldier(target.soldier, 8 + Math.random() * 4);
    } else {
      const entity = target.entity;
      if (entity.isPlayer) entity.takeChipDamage(1.0);
      else if (entity.takeChipDamage) entity.takeChipDamage(0.5);
    }
    soldier.fireTimer = 0.95 + Math.random() * 0.8;
  }

  fireAT(soldier, target, point, muzzle) {
    const end = new THREE.Vector3(
      point.x + (Math.random() - 0.5) * 1.4,
      point.y + (Math.random() - 0.5) * 1.0,
      point.z + (Math.random() - 0.5) * 1.4,
    );
    this.game.effects.tracer(muzzle, end, 0xffc07a, 1.1);
    this.game.effects.explosion(end, { size: 0.55, ground: false, debris: false });
    if (this.game.player.position.distanceToSquared(muzzle) < 90 * 90) this.game.audio.explosion(0.6);

    if (target.kind === 'soldier') {
      target.squad.takeSplash(end, 3.4, 26);
    } else {
      const entity = target.entity;
      if (entity.isPlayer) {
        entity.takeDamage(8.5, end, false);
      } else if (entity.takeDamage) {
        entity.takeDamage(22, end, false);
      }
    }
    soldier.fireTimer = 5.6 + Math.random() * 2.2;
  }

  damageSoldier(soldier, amount) {
    if (!soldier.alive) return;
    soldier.health -= amount;
    if (soldier.health > 0) return;
    soldier.alive = false;
    soldier.health = 0;
    soldier.deathTimer = 18;
    soldier.model.rotation.set(0, soldier.yaw, Math.PI / 2, 'YXZ');
    soldier.model.position.set(soldier.pos.x, soldier.pos.y + 0.2, soldier.pos.z);
    const legL = soldier.model.userData.legL;
    const legR = soldier.model.userData.legR;
    if (legL) legL.rotation.x = 0;
    if (legR) legR.rotation.x = 0;
    this.game.effects.smoke.spawn({
      position: new THREE.Vector3(soldier.pos.x, soldier.pos.y + 0.5, soldier.pos.z),
      velocity: new THREE.Vector3(0, 0.8, 0),
      life: 1.1,
      scale0: 0.35,
      scale1: 1.3,
      opacity: 0.22,
      color: 0x6b5a44,
    });
    if (this.enemy) {
      this.game.stats.infantryKills++;
      this.game.hud.hitMarker(true);
    }
  }

  takeSplash(position, radius, damage) {
    if (this.dead) return;
    for (const soldier of this.soldiers) {
      if (!soldier.alive) continue;
      const d = Math.hypot(soldier.pos.x - position.x, soldier.pos.z - position.z);
      const amount = splashDamage(damage, d, radius);
      if (amount > 0) this.damageSoldier(soldier, amount);
    }
  }
}
