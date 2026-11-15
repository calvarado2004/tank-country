import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { PlayerBattery } from '../../src/battery.js';

function makeGame({ height = () => 0 } = {}) {
  const shells = [];
  const markers = [];
  const game = {
    world: { height: vi.fn(height) },
    player: { position: new THREE.Vector3(0, 0, 0), dead: false },
    playerSquads: [],
    stats: { barrages: 0 },
    effects: {
      muzzleFlash: vi.fn(),
      smoke: { spawn: vi.fn() },
    },
    audio: { artillery: vi.fn() },
    shake: vi.fn(),
    createDangerMarker: vi.fn((x, z, radius, life) => {
      const marker = { x, z, radius, life, remove: vi.fn() };
      markers.push(marker);
      return marker;
    }),
    spawnShell: vi.fn((opts) => {
      shells.push(opts);
      return opts;
    }),
  };
  return { game, shells, markers };
}

function addSquad(game, { x = 0, z = 0, dead = false } = {}) {
  const squad = {
    dead,
    soldiers: [
      { alive: true, pos: new THREE.Vector3(x, 0, z) },
      { alive: false, pos: new THREE.Vector3(x + 1, 0, z) },
    ],
  };
  game.playerSquads.push(squad);
  return squad;
}

describe('PlayerBattery missions', () => {
  it('accepts a spotted mission and queues three shells', () => {
    const { game, markers } = makeGame();
    const battery = new PlayerBattery(game);
    const result = battery.call({ x: 40, z: 0 });
    expect(result.ok).toBe(true);
    expect(result.shells).toBe(3);
    expect(battery.missions).toBe(2);
    expect(battery.cooldown).toBe(24);
    expect(battery.queue).toHaveLength(3);
    expect(markers).toHaveLength(3);
    expect(game.stats.barrages).toBe(1);
    expect(game.shake).toHaveBeenCalled();
  });

  it('rejects an unspotted target without spending a mission', () => {
    const { game } = makeGame();
    game.player.position.set(120, 0, 0);
    const battery = new PlayerBattery(game);
    const result = battery.call({ x: 0, z: 0 });
    expect(result).toMatchObject({ ok: false, reason: 'unspotted' });
    expect(battery.missions).toBe(3);
    expect(battery.queue).toHaveLength(0);
  });

  it('rejects danger-close and dry/cooldown calls', () => {
    const { game } = makeGame();
    const battery = new PlayerBattery(game);
    expect(battery.call({ x: 10, z: 0 }).reason).toBe('danger-close');
    battery.cooldown = 5;
    expect(battery.call({ x: 40, z: 0 }).reason).toBe('cooldown');
    battery.cooldown = 0;
    battery.missions = 0;
    expect(battery.call({ x: 40, z: 0 }).reason).toBe('no-missions');
    expect(battery.call(null).reason).toBe('no-target');
  });

  it('reports status and readiness', () => {
    const { game } = makeGame();
    const battery = new PlayerBattery(game);
    expect(battery.status).toBe('READY');
    expect(battery.ready).toBe(true);
    battery.cooldown = 12;
    expect(battery.status).toBe('RELOADING');
    expect(battery.ready).toBe(false);
    battery.missions = 0;
    expect(battery.status).toBe('DRY');
  });

  it('resupplies up to the cap and clears the cooldown', () => {
    const { game } = makeGame();
    const battery = new PlayerBattery(game);
    battery.missions = 1;
    battery.cooldown = 15;
    battery.resupply(1);
    expect(battery.missions).toBe(2);
    expect(battery.cooldown).toBe(0);
    battery.resupply(10);
    expect(battery.missions).toBe(3);
  });

  it('builds a spotter list from the tank and living infantry', () => {
    const { game } = makeGame();
    addSquad(game, { x: 10, z: 0 });
    const battery = new PlayerBattery(game);
    const spotters = battery.spotters();
    expect(spotters.some((s) => s.kind === 'tank')).toBe(true);
    expect(spotters.filter((s) => s.kind === 'infantry')).toHaveLength(1);
    game.player.dead = true;
    expect(battery.spotters().some((s) => s.kind === 'tank')).toBe(false);
  });

  it('can spot from infantry when the tank is far away', () => {
    const { game } = makeGame();
    addSquad(game, { x: 10, z: 0 });
    game.player.position.set(150, 0, 0);
    const battery = new PlayerBattery(game);
    const result = battery.call({ x: 40, z: 0 });
    expect(result.ok).toBe(true);
    expect(result.spotter.kind).toBe('infantry');
  });
});

describe('PlayerBattery firing', () => {
  it('fires queued shells on schedule from the battery origins', () => {
    const { game, shells } = makeGame();
    const battery = new PlayerBattery(game);
    battery.call({ x: 40, z: 0 });
    expect(shells).toHaveLength(0);

    battery.update(0.01);
    expect(shells).toHaveLength(1);
    battery.update(0.65);
    expect(shells).toHaveLength(2);
    battery.update(0.65);
    expect(shells).toHaveLength(3);
    expect(battery.queue).toHaveLength(0);

    const first = shells[0];
    expect(first.owner).toBe('player');
    expect(first.damage).toBe(34);
    expect(first.splash).toBe(20);
    expect(first.radius).toBe(8);
    expect(first.whistle).toBe(true);
    expect(first.marker).toBeTruthy();
    expect(first.position.z).toBeGreaterThan(140);
    expect(first.position.y).toBeCloseTo(2.8, 6);
    expect(game.effects.muzzleFlash).toHaveBeenCalledTimes(3);
    expect(game.effects.smoke.spawn).toHaveBeenCalledTimes(3);
    expect(game.audio.artillery).toHaveBeenCalledTimes(3);
  });

  it('cycles through three gun origins', () => {
    const { game, shells } = makeGame();
    const battery = new PlayerBattery(game);
    battery.call({ x: 40, z: 0 });
    battery.update(5);
    expect(shells).toHaveLength(3);
    const xs = shells.map((s) => s.position.x);
    expect(new Set(xs).size).toBe(3);
  });

  it('does nothing when the queue is empty', () => {
    const { game, shells } = makeGame();
    const battery = new PlayerBattery(game);
    battery.update(10);
    expect(shells).toHaveLength(0);
    expect(battery.cooldown).toBe(0);
  });

  it('counts down the cooldown as time passes', () => {
    const { game } = makeGame();
    const battery = new PlayerBattery(game);
    battery.call({ x: 40, z: 0 });
    battery.update(6);
    expect(battery.cooldown).toBeCloseTo(18, 6);
  });

  it('uses the terrain height for the muzzle and the impact point', () => {
    const { game, shells } = makeGame({ height: (x, z) => x * 0.1 + z * 0.01 });
    const battery = new PlayerBattery(game);
    battery.call({ x: 40, z: 0 });
    battery.update(0.01);
    const shell = shells[0];
    expect(shell.position.y).toBeCloseTo(game.world.height(shell.position.x, shell.position.z) + 2.8, 6);
    expect(shell.target.y).toBeCloseTo(game.world.height(shell.target.x, shell.target.z), 6);
  });
});
