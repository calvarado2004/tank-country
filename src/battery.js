import * as THREE from 'three';
import { clamp } from './utils.js';
import { solveHighArc } from './combat.js';
import {
  BATTERY_MAX_MISSIONS, BATTERY_COOLDOWN, planBarrage, validateFireMission,
} from './artillery.js';

export class PlayerBattery {
  constructor(game, opts = {}) {
    this.game = game;
    this.world = game.world;
    this.maxMissions = opts.maxMissions ?? BATTERY_MAX_MISSIONS;
    this.missions = opts.missions ?? this.maxMissions;
    this.cooldownTime = opts.cooldownTime ?? BATTERY_COOLDOWN;
    this.cooldown = 0;
    this.time = 0;
    this.queue = [];
    this.gun = 0;
    this.origins = [
      new THREE.Vector3(-20, 0, 152),
      new THREE.Vector3(-10, 0, 155),
      new THREE.Vector3(-28, 0, 148),
    ];
    this.heightAt = (x, z) => this.world.height(x, z);
  }

  get ready() {
    return this.missions > 0 && this.cooldown <= 0;
  }

  get status() {
    if (this.missions <= 0) return 'DRY';
    if (this.cooldown > 0) return 'RELOADING';
    return 'READY';
  }

  spotters() {
    const list = [];
    const player = this.game.player;
    if (player && !player.dead) {
      list.push({
        kind: 'tank',
        x: player.position.x,
        z: player.position.z,
        y: player.position.y + 1.4,
      });
    }
    for (const squad of this.game.playerSquads) {
      for (const soldier of squad.soldiers) {
        if (!soldier.alive) continue;
        list.push({
          kind: 'infantry',
          x: soldier.pos.x,
          z: soldier.pos.z,
          y: soldier.pos.y + 1.1,
        });
      }
    }
    return list;
  }

  validate(point) {
    return validateFireMission({
      point,
      player: this.game.player?.position,
      spotters: this.spotters(),
      missions: this.missions,
      cooldown: this.cooldown,
      heightAt: this.heightAt,
    });
  }

  call(point) {
    const check = this.validate(point);
    if (!check.ok) return check;
    const plans = planBarrage(point);
    for (const plan of plans) {
      this.queue.push({
        ...plan,
        at: this.time + plan.delay,
        marker: this.game.createDangerMarker(plan.x, plan.z, 7, 10),
      });
    }
    this.missions--;
    this.cooldown = this.cooldownTime;
    this.game.stats.barrages = (this.game.stats.barrages || 0) + 1;
    this.game.shake(0.12);
    return { ok: true, spotter: check.spotter, shells: plans.length };
  }

  update(dt) {
    this.time += dt;
    this.cooldown = Math.max(0, this.cooldown - dt);
    for (let i = 0; i < this.queue.length;) {
      if (this.time < this.queue[i].at) {
        i++;
        continue;
      }
      const item = this.queue.splice(i, 1)[0];
      this.fire(item);
    }
  }

  fire(item) {
    const origin = this.origins[this.gun % this.origins.length];
    this.gun++;
    const muzzle = new THREE.Vector3(
      origin.x,
      this.world.height(origin.x, origin.z) + 2.8,
      origin.z,
    );
    const target = new THREE.Vector3(item.x, this.world.height(item.x, item.z), item.z);
    const velocity = solveHighArc(muzzle, target, 88, 20);
    this.game.spawnShell({
      position: muzzle,
      velocity,
      owner: 'player',
      damage: 34,
      splash: 20,
      radius: 8,
      gravity: 20,
      color: 0xffd08b,
      size: 1.5,
      craterRadius: 5.2,
      craterDepth: 1.25,
      marker: item.marker,
      target,
      source: this,
      whistle: true,
    });
    this.game.effects.muzzleFlash(muzzle, velocity.clone().normalize(), 2.2);
    this.game.effects.smoke.spawn({
      position: muzzle.clone(),
      velocity: new THREE.Vector3(0, 1.4, 0),
      life: 1.6,
      scale0: 0.8,
      scale1: 4.5,
      opacity: 0.2,
      color: 0x8b7f68,
    });
    this.game.audio.artillery();
  }

  resupply(amount = 1) {
    this.missions = clamp(this.missions + amount, 0, this.maxMissions);
    this.cooldown = 0;
  }
}
