import * as THREE from 'three';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { InfantrySquad } from '../../src/infantry.js';

function fakeTank(x, z, { isPlayer = false } = {}) {
  return {
    isPlayer,
    dead: false,
    position: new THREE.Vector3(x, 0, z),
    hullYaw: Math.PI,
    health: 100,
    damage: 0,
    chip: 0,
    takeDamage(amount) { this.damage += amount; },
    takeChipDamage(amount) { this.chip += amount; },
  };
}

function makeGame({ height = () => 0 } = {}) {
  const effects = {
    tracer: vi.fn(),
    muzzleFlash: vi.fn(),
    explosion: vi.fn(),
    smoke: { spawn: vi.fn() },
    sparks: { spawn: vi.fn() },
  };
  const audio = { rifle: vi.fn(), explosion: vi.fn() };
  const hud = { hitMarker: vi.fn() };
  const world = {
    half: 160,
    height: vi.fn(height),
    resolveCollisions: vi.fn(() => false),
  };
  const game = {
    state: 'playing',
    scene: new THREE.Scene(),
    world,
    effects,
    audio,
    hud,
    player: fakeTank(0, 0, { isPlayer: true }),
    playerSquads: [],
    enemySquads: [],
    enemies: [],
    artilleries: [],
    stats: { infantryKills: 0 },
  };
  game.playerSquad = null;
  return { game, world, effects, audio, hud };
}

function addSquad(game, opts = {}) {
  const squad = new InfantrySquad(game, { x: 0, z: 0, ...opts });
  if (!opts.enemy) game.playerSquad = squad;
  return squad;
}

describe('InfantrySquad spawning', () => {
  let harness;
  beforeEach(() => { harness = makeGame(); });

  it('spawns four player soldiers with three rifles and one bazooka', () => {
    const squad = addSquad(harness.game);
    expect(squad.soldiers).toHaveLength(4);
    expect(squad.soldiers.filter((s) => s.at)).toHaveLength(1);
    expect(squad.aliveCount).toBe(4);
    expect(squad.order).toBe('follow');
    expect(squad.enemy).toBe(false);
    expect(harness.game.playerSquads).toContain(squad);
    expect(harness.game.scene.children.length).toBe(4);
  });

  it('spawns enemy squads holding their ground', () => {
    const squad = addSquad(harness.game, { x: 5, z: 5, enemy: true });
    expect(squad.order).toBe('hold');
    expect(squad.home.x).toBeCloseTo(5, 6);
    expect(harness.game.enemySquads).toContain(squad);
  });

  it('accepts custom counts, names and an initial yaw', () => {
    const squad = addSquad(harness.game, {
      x: 2, z: 3, count: 2, atCount: 0, name: 'Scouts', yaw: 0.4, aggroRadius: 20,
    });
    expect(squad.soldiers).toHaveLength(2);
    expect(squad.name).toBe('Scouts');
    expect(squad.aggroRadius).toBe(20);
    expect(squad.soldiers[0].yaw).toBe(0.4);
  });

  it('can spread a garrison around a holding circle', () => {
    const { game } = makeGame();
    const squad = addSquad(game, {
      x: 10, z: 10, count: 3, atCount: 0, formationRadius: 6,
    });
    for (const soldier of squad.soldiers) {
      expect(Math.hypot(soldier.pos.x - 10, soldier.pos.z - 10)).toBeCloseTo(6, 6);
    }
    expect(new Set(squad.soldiers.map((s) => `${s.slot[0]}:${s.slot[1]}`)).size).toBe(3);
  });

  it('places soldiers on the terrain and exposes their animated parts', () => {
    harness = makeGame({ height: (x, z) => x * 0.1 + z * 0.01 });
    const squad = addSquad(harness.game, { x: 3, z: 4 });
    const soldier = squad.soldiers[0];
    expect(soldier.model.position.y).toBeCloseTo(harness.game.world.height(soldier.pos.x, soldier.pos.z), 6);
    expect(soldier.model.userData.legL).toBeTruthy();
    expect(soldier.model.userData.muzzle).toBeTruthy();
  });
});

describe('InfantrySquad orders and movement', () => {
  it('follows behind the tank', () => {
    const { game } = makeGame();
    game.player.position.set(0, 0, 0);
    game.player.hullYaw = Math.PI;
    const squad = addSquad(game, { x: 20, z: 20 });
    const before = squad.soldiers[0].pos.distanceTo(new THREE.Vector3(2.6, 0, -7.5));
    squad.update(0.5);
    const after = squad.soldiers[0].pos.distanceTo(new THREE.Vector3(2.6, 0, -7.5));
    expect(after).toBeLessThan(before);
    expect(game.world.resolveCollisions).toHaveBeenCalled();
  });

  it('walks to a move order and then holds', () => {
    const { game } = makeGame();
    const squad = addSquad(game);
    squad.order = 'move';
    squad.moveTarget = new THREE.Vector3(3, 0, 0);
    squad.update(0.05);
    expect(squad.order).toBe('move');
    squad.position.set(3, 0, 0);
    squad.soldiers.forEach((s) => s.pos.set(3, 0, 0));
    squad.update(0.05);
    expect(squad.order).toBe('hold');
    expect(squad.holdPoint.x).toBeCloseTo(3, 6);
    expect(squad.moveTarget).toBeNull();
  });

  it('holds the last position when the order is hold', () => {
    const { game } = makeGame();
    const squad = addSquad(game);
    squad.order = 'hold';
    squad.holdPoint.set(7, 0, 7);
    squad.update(0.1);
    expect(squad._goal.x).toBeCloseTo(7, 6);
    expect(squad._goal.z).toBeCloseTo(7, 6);
  });

  it('falls back to the hold point when the tank is gone', () => {
    const { game } = makeGame();
    game.player.dead = true;
    const squad = addSquad(game);
    squad.holdPoint.set(4, 0, 4);
    squad.update(0.05);
    expect(squad._goal.x).toBeCloseTo(4, 6);
  });

  it('lets enemy squads march to a move order and hold there', () => {
    const { game } = makeGame();
    const squad = addSquad(game, { enemy: true });
    squad.order = 'move';
    squad.moveTarget = new THREE.Vector3(12, 0, 0);
    squad.update(0.05);
    expect(squad.order).toBe('move');
    squad.position.set(12, 0, 0);
    squad.soldiers.forEach((s) => s.pos.set(12, 0, 0));
    squad.update(0.05);
    expect(squad.order).toBe('hold');
    expect(squad.holdPoint.x).toBeCloseTo(12, 6);
  });

  it('animates legs and body while walking', () => {
    const { game } = makeGame();
    const squad = addSquad(game, { x: 20, z: 20 });
    const soldier = squad.soldiers[0];
    soldier.phase = 0.2;
    squad.update(0.2);
    expect(soldier.model.userData.legL.rotation.x).not.toBe(0);
    expect(soldier.model.userData.body.position.y).toBeGreaterThanOrEqual(0);
  });
});

describe('InfantrySquad targeting', () => {
  it('enemy squads prefer nearby player infantry', () => {
    const { game } = makeGame();
    game.player.position.set(60, 0, 60);
    const playerSquad = addSquad(game, { x: 0, z: 10 });
    const enemy = addSquad(game, { x: 0, z: 0, enemy: true });
    enemy.update(0.05);
    expect(enemy.target.kind).toBe('soldier');
    expect(enemy.target.squad).toBe(playerSquad);
  });

  it('enemy squads can target a garrison when Able squad is elsewhere', () => {
    const { game } = makeGame();
    game.player.position.set(120, 0, 120);
    const able = addSquad(game, { x: 100, z: 100 });
    const garrison = new InfantrySquad(game, { x: 0, z: 10 });
    game.playerSquad = able;
    const enemy = addSquad(game, { x: 0, z: 0, enemy: true });
    enemy.update(0.05);
    expect(enemy.target.kind).toBe('soldier');
    expect(enemy.target.squad).toBe(garrison);
  });

  it('enemy squads switch to the tank when no infantry is near', () => {
    const { game } = makeGame();
    game.player.position.set(0, 0, 10);
    const enemy = addSquad(game, { x: 0, z: 0, enemy: true });
    enemy.update(0.05);
    expect(enemy.target.kind).toBe('tank');
    expect(enemy.target.entity).toBe(game.player);
  });

  it('enemy squads ignore dead player infantry', () => {
    const { game } = makeGame();
    const playerSquad = addSquad(game, { x: 0, z: 10 });
    playerSquad.soldiers.forEach((s) => { s.alive = false; });
    playerSquad.dead = true;
    game.player.position.set(0, 0, 10);
    const enemy = addSquad(game, { x: 0, z: 0, enemy: true });
    enemy.update(0.05);
    expect(enemy.target.kind).toBe('tank');
  });

  it('player squads target enemy infantry first', () => {
    const { game } = makeGame();
    const playerSquad = addSquad(game, { x: 0, z: 0 });
    const enemy = addSquad(game, { x: 0, z: 10, enemy: true });
    playerSquad.update(0.05);
    expect(playerSquad.target.kind).toBe('soldier');
    expect(playerSquad.target.squad).toBe(enemy);
  });

  it('player squads fall back to vehicles when no infantry is in range', () => {
    const { game } = makeGame();
    const tank = fakeTank(0, 10);
    game.enemies.push(tank);
    const playerSquad = addSquad(game);
    playerSquad.update(0.05);
    expect(playerSquad.target.kind).toBe('tank');
    expect(playerSquad.target.entity).toBe(tank);
  });

  it('ignores dead vehicles when scanning', () => {
    const { game } = makeGame();
    const dead = fakeTank(0, 10);
    dead.dead = true;
    const live = fakeTank(0, 15);
    game.enemies.push(dead, live);
    const playerSquad = addSquad(game);
    playerSquad.update(0.05);
    expect(playerSquad.target.entity).toBe(live);
  });

  it('finds the nearest tank for a bazooka', () => {
    const { game } = makeGame();
    const near = fakeTank(0, 20);
    const far = fakeTank(0, 40);
    game.enemies.push(far, near);
    const squad = addSquad(game);
    expect(squad.findTankTarget(new THREE.Vector3(0, 0, 0)).entity).toBe(near);
    near.dead = true;
    expect(squad.findTankTarget(new THREE.Vector3(0, 0, 0)).entity).toBe(far);
  });

  it('returns no tank target when everything is out of range', () => {
    const { game } = makeGame();
    game.enemies.push(fakeTank(0, 90));
    const squad = addSquad(game);
    expect(squad.findTankTarget(new THREE.Vector3(0, 0, 0))).toBeNull();
  });

  it('enemy bazookas look for the player tank only', () => {
    const { game } = makeGame();
    const squad = addSquad(game, { enemy: true });
    game.player.position.set(0, 0, 30);
    const target = squad.findTankTarget(new THREE.Vector3(0, 0, 0));
    expect(target.kind).toBe('tank');
    expect(target.entity).toBe(game.player);
    game.player.dead = true;
    expect(squad.findTankTarget(new THREE.Vector3(0, 0, 0))).toBeNull();
  });

  it('builds target points for soldiers and tanks', () => {
    const { game } = makeGame();
    const squad = addSquad(game);
    const tank = fakeTank(3, 4);
    expect(squad.targetPoint({ kind: 'soldier', soldier: squad.soldiers[0] }).y).toBeCloseTo(1.05, 6);
    expect(squad.targetPoint({ kind: 'tank', entity: tank }).y).toBeCloseTo(1.25, 6);
  });

  it('puts the bazooka muzzle higher than a rifle muzzle', () => {
    const { game } = makeGame();
    const squad = addSquad(game);
    const rifle = squad.soldiers.find((s) => !s.at);
    const at = squad.soldiers.find((s) => s.at);
    const a = squad.muzzleFor(rifle, new THREE.Vector3());
    const b = squad.muzzleFor(at, new THREE.Vector3());
    expect(b.y - a.y).toBeCloseTo(0.2, 6);
  });
});

describe('InfantrySquad weapons', () => {
  it('rifle fire damages an enemy soldier and plays effects', () => {
    const { game, effects, audio } = makeGame();
    const playerSquad = addSquad(game, { x: 0, z: 0 });
    const enemy = addSquad(game, { x: 0, z: 10, enemy: true });
    playerSquad.target = { kind: 'soldier', soldier: enemy.soldiers[0], squad: enemy };
    const before = enemy.soldiers[0].health;
    playerSquad.fireRifle(playerSquad.soldiers[0], playerSquad.target, playerSquad.targetPoint(playerSquad.target), new THREE.Vector3());
    expect(enemy.soldiers[0].health).toBeLessThan(before);
    expect(effects.tracer).toHaveBeenCalled();
    expect(effects.muzzleFlash).toHaveBeenCalled();
    expect(audio.rifle).toHaveBeenCalled();
  });

  it('rifle fire chips the player tank', () => {
    const { game } = makeGame();
    const enemy = addSquad(game, { enemy: true });
    const target = { kind: 'tank', entity: game.player };
    enemy.fireRifle(enemy.soldiers[0], target, new THREE.Vector3(0, 1, 10), new THREE.Vector3());
    expect(game.player.chip).toBe(1);
  });

  it('rifle fire chips an enemy tank that has no infantry target', () => {
    const { game } = makeGame();
    const playerSquad = addSquad(game);
    const tank = fakeTank(0, 10);
    playerSquad.fireRifle(playerSquad.soldiers[0], { kind: 'tank', entity: tank }, new THREE.Vector3(0, 1, 10), new THREE.Vector3());
    expect(tank.chip).toBe(0.5);
  });

  it('rifle fire tolerates targets without a chip-damage method', () => {
    const { game } = makeGame();
    const playerSquad = addSquad(game);
    const tank = { dead: false, position: new THREE.Vector3(0, 0, 10) };
    expect(() => playerSquad.fireRifle(
      playerSquad.soldiers[0],
      { kind: 'tank', entity: tank },
      new THREE.Vector3(0, 1, 10),
      new THREE.Vector3(),
    )).not.toThrow();
  });

  it('bazooka fire damages an enemy tank', () => {
    const { game, effects, audio } = makeGame();
    const playerSquad = addSquad(game);
    const tank = fakeTank(0, 10);
    const at = playerSquad.soldiers.find((s) => s.at);
    playerSquad.fireAT(at, { kind: 'tank', entity: tank }, new THREE.Vector3(0, 1, 10), new THREE.Vector3());
    expect(tank.damage).toBe(22);
    expect(effects.explosion).toHaveBeenCalled();
    expect(audio.explosion).toHaveBeenCalled();
    expect(at.fireTimer).toBeGreaterThan(5);
  });

  it('a bazooka hit on infantry splashes the squad', () => {
    const { game } = makeGame();
    const playerSquad = addSquad(game);
    const enemy = addSquad(game, { x: 0, z: 10, enemy: true });
    const at = playerSquad.soldiers.find((s) => s.at);
    playerSquad.fireAT(at, { kind: 'soldier', soldier: enemy.soldiers[0], squad: enemy }, new THREE.Vector3(0, 1, 10), new THREE.Vector3());
    expect(enemy.soldiers.some((s) => s.health < s.maxHealth)).toBe(true);
  });

  it('enemy bazooka fire damages the player tank', () => {
    const { game } = makeGame();
    const enemy = addSquad(game, { enemy: true });
    const at = enemy.soldiers.find((s) => s.at);
    enemy.fireAT(at, { kind: 'tank', entity: game.player }, new THREE.Vector3(0, 1, 10), new THREE.Vector3());
    expect(game.player.damage).toBe(8.5);
  });

  it('bazooka fire tolerates vehicles without takeDamage', () => {
    const { game } = makeGame();
    const playerSquad = addSquad(game);
    const at = playerSquad.soldiers.find((s) => s.at);
    expect(() => playerSquad.fireAT(
      at,
      { kind: 'tank', entity: { dead: false } },
      new THREE.Vector3(0, 1, 10),
      new THREE.Vector3(),
    )).not.toThrow();
  });

  it('does not fire through a hill', () => {
    const { game } = makeGame({ height: (x, z) => (Math.abs(z - 10) < 2 ? 12 : 0) });
    const playerSquad = addSquad(game, { x: 0, z: 0 });
    const enemy = addSquad(game, { x: 0, z: 20, enemy: true });
    playerSquad.target = { kind: 'soldier', soldier: enemy.soldiers[0], squad: enemy };
    playerSquad.soldiers.forEach((s) => { s.fireTimer = 0; s.pos.set(0, 0, 0); });
    const before = enemy.soldiers[0].health;
    playerSquad.update(0.016);
    expect(enemy.soldiers[0].health).toBe(before);
    expect(playerSquad.soldiers[0].fireTimer).toBeGreaterThan(0);
  });

  it('waits for the fire timer before shooting', () => {
    const { game, effects } = makeGame();
    const playerSquad = addSquad(game, { x: 0, z: 0 });
    const enemy = addSquad(game, { x: 0, z: 10, enemy: true });
    playerSquad.target = { kind: 'soldier', soldier: enemy.soldiers[0], squad: enemy };
    playerSquad.soldiers.forEach((s) => { s.fireTimer = 5; s.pos.set(0, 0, 0); });
    playerSquad.updateSoldier(playerSquad.soldiers[0], 0.016);
    expect(effects.tracer).not.toHaveBeenCalled();
  });

  it('fires a rifle through the soldier update path', () => {
    const { game, effects } = makeGame();
    const playerSquad = addSquad(game, { x: 0, z: 0 });
    const enemy = addSquad(game, { x: 0, z: 10, enemy: true });
    playerSquad.target = { kind: 'soldier', soldier: enemy.soldiers[0], squad: enemy };
    const rifleman = playerSquad.soldiers.find((s) => !s.at);
    rifleman.pos.set(0, 0, 0);
    rifleman.fireTimer = 0;
    const before = enemy.soldiers[0].health;
    playerSquad.updateSoldier(rifleman, 0.016);
    expect(enemy.soldiers[0].health).toBeLessThan(before);
    expect(effects.tracer).toHaveBeenCalled();
  });

  it('fires a bazooka through the soldier update path', () => {
    const { game, effects } = makeGame();
    const playerSquad = addSquad(game, { x: 0, z: 0 });
    const tank = fakeTank(0, 10);
    game.enemies.push(tank);
    const at = playerSquad.soldiers.find((s) => s.at);
    at.pos.set(0, 0, 0);
    at.fireTimer = 0;
    playerSquad.updateSoldier(at, 0.016);
    expect(tank.damage).toBe(22);
    expect(effects.explosion).toHaveBeenCalled();
  });

  it('holds fire when the target is beyond rifle range', () => {
    const { game, effects } = makeGame();
    const playerSquad = addSquad(game, { x: 0, z: 0 });
    const enemy = addSquad(game, { x: 0, z: 80, enemy: true });
    playerSquad.target = { kind: 'soldier', soldier: enemy.soldiers[0], squad: enemy };
    const rifleman = playerSquad.soldiers.find((s) => !s.at);
    rifleman.pos.set(0, 0, 0);
    rifleman.fireTimer = 0;
    playerSquad.updateSoldier(rifleman, 0.016);
    expect(effects.tracer).not.toHaveBeenCalled();
  });

  it('idles when there is no target and the soldier is in position', () => {
    const { game, effects } = makeGame();
    const squad = addSquad(game, { x: 0, z: 0 });
    squad.order = 'hold';
    squad.holdPoint.set(0, 0, 0);
    const soldier = squad.soldiers[0];
    soldier.pos.set(soldier.slot[0], 0, soldier.slot[1]);
    soldier.fireTimer = 0;
    squad.updateSoldier(soldier, 0.016);
    expect(effects.tracer).not.toHaveBeenCalled();
  });

  it('sees a clear line to the target', () => {
    const { game } = makeGame();
    const squad = addSquad(game);
    expect(squad.hasLineOfSight(
      new THREE.Vector3(0, 1.2, 0),
      new THREE.Vector3(0, 1.2, 20),
    )).toBe(true);
  });
});

describe('InfantrySquad damage and recovery', () => {
  it('kills a soldier, drops the body and counts the kill for enemy squads', () => {
    const { game, effects, hud } = makeGame();
    const enemy = addSquad(game, { enemy: true });
    const soldier = enemy.soldiers[0];
    enemy.damageSoldier(soldier, 999);
    expect(soldier.alive).toBe(false);
    expect(soldier.health).toBe(0);
    expect(soldier.deathTimer).toBe(18);
    expect(soldier.model.rotation.z).toBeCloseTo(Math.PI / 2, 6);
    expect(effects.smoke.spawn).toHaveBeenCalled();
    expect(game.stats.infantryKills).toBe(1);
    expect(hud.hitMarker).toHaveBeenCalledWith(true);
  });

  it('does not count player casualties as kills', () => {
    const { game, hud } = makeGame();
    const playerSquad = addSquad(game);
    playerSquad.damageSoldier(playerSquad.soldiers[0], 999);
    expect(game.stats.infantryKills).toBe(0);
    expect(hud.hitMarker).not.toHaveBeenCalled();
  });

  it('ignores damage to an already dead soldier', () => {
    const { game } = makeGame();
    const enemy = addSquad(game, { enemy: true });
    const soldier = enemy.soldiers[0];
    enemy.damageSoldier(soldier, 999);
    expect(() => enemy.damageSoldier(soldier, 999)).not.toThrow();
    expect(game.stats.infantryKills).toBe(1);
  });

  it('hides a corpse after its timer', () => {
    const { game } = makeGame();
    const enemy = addSquad(game, { enemy: true });
    const soldier = enemy.soldiers[0];
    enemy.damageSoldier(soldier, 999);
    soldier.deathTimer = 0.01;
    enemy.update(0.05);
    expect(soldier.model.visible).toBe(false);
  });

  it('applies splash falloff and skips soldiers outside the radius', () => {
    const { game } = makeGame();
    const enemy = addSquad(game, { x: 0, z: 0, enemy: true });
    const health = enemy.soldiers.map((s) => s.health);
    enemy.takeSplash(new THREE.Vector3(0, 0, 0), 4.5, 20);
    expect(enemy.soldiers[0].health).toBeLessThan(health[0]);
    expect(enemy.soldiers[3].health).toBeLessThan(health[3]);
    const far = addSquad(game, { x: 50, z: 50, enemy: true });
    const farHealth = far.soldiers[0].health;
    far.takeSplash(new THREE.Vector3(0, 0, 0), 4, 20);
    expect(far.soldiers[0].health).toBe(farHealth);
  });

  it('ignores splash on a wiped squad', () => {
    const { game } = makeGame();
    const enemy = addSquad(game, { enemy: true });
    enemy.dead = true;
    expect(() => enemy.takeSplash(new THREE.Vector3(0, 0, 0), 10, 100)).not.toThrow();
  });

  it('marks the squad dead when the last soldier falls and then idles', () => {
    const { game } = makeGame();
    const enemy = addSquad(game, { enemy: true });
    enemy.soldiers.forEach((s) => enemy.damageSoldier(s, 999));
    enemy.update(0.016);
    expect(enemy.dead).toBe(true);
    expect(enemy.aliveCount).toBe(0);
    expect(() => enemy.update(0.016)).not.toThrow();
  });

  it('reinforces every soldier at full health', () => {
    const { game } = makeGame();
    const playerSquad = addSquad(game);
    playerSquad.soldiers.forEach((s) => playerSquad.damageSoldier(s, 999));
    playerSquad.update(0.016);
    expect(playerSquad.dead).toBe(true);
    playerSquad.reinforce();
    expect(playerSquad.dead).toBe(false);
    expect(playerSquad.aliveCount).toBe(4);
    expect(playerSquad.soldiers.every((s) => s.alive && s.health === s.maxHealth)).toBe(true);
    expect(playerSquad.soldiers.every((s) => s.model.visible)).toBe(true);
    expect(playerSquad.soldiers[0].model.rotation.z).toBe(0);
  });

  it('reports whether a live soldier is inside a radius', () => {
    const { game } = makeGame();
    const squad = addSquad(game, { x: 0, z: 0 });
    expect(squad.hasSoldierNear(0, 0, 3)).toBe(true);
    expect(squad.hasSoldierNear(100, 100, 3)).toBe(false);
    squad.soldiers.forEach((s) => { s.alive = false; });
    expect(squad.hasSoldierNear(0, 0, 3)).toBe(false);
  });

  it('places a dead soldier flat on the ground', () => {
    const { game } = makeGame();
    const squad = addSquad(game);
    squad.soldiers[0].alive = false;
    squad.placeSoldier(squad.soldiers[0]);
    expect(squad.soldiers[0].model.rotation.z).toBeCloseTo(Math.PI / 2, 6);
    expect(squad.soldiers[0].model.position.y).toBeGreaterThan(0);
  });
});
