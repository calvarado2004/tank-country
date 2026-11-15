import * as THREE from 'three';
import { clamp, formatTime } from './utils.js';

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => [...document.querySelectorAll(sel)];

export class HUD {
  constructor() {
    this.hud = $('#hud');
    this.clock = $('#sector-clock');
    this.healthFill = $('#health-fill');
    this.healthValue = $('#health-value');
    this.hullState = $('#hull-state');
    this.gunState = $('#gun-state');
    this.reloadFill = $('#reload-fill');
    this.speedValue = $('#speed-value');
    this.throttle = $$('.throttle-ticks i');
    this.captureCount = $('#capture-count');
    this.territoryValue = $('#territory-value');
    this.territoryPlayerFill = $('#territory-player-fill');
    this.territoryEnemyFill = $('#territory-enemy-fill');
    this.territoryState = $('#territory-state');
    this.territoryHostile = $('#territory-hostile');
    this.territoryMeter = $('.territory-meter');
    this.lastTerritory = { player: -1, enemy: -1, state: '' };
    this.squadBlock = $('#squad-block');
    this.squadOrder = $('#squad-order');
    this.squadStrength = $('#squad-strength');
    this.squadPips = $$('#squad-pips i');
    this.lastSquadAlive = -1;
    this.lastSquadOrder = '';
    this.batteryBlock = $('#battery-block');
    this.batteryStatus = $('#battery-status');
    this.batteryMissions = $('#battery-missions');
    this.batteryHint = $('#battery-hint');
    this.batteryPips = $$('#battery-pips i');
    this.lastBattery = { status: '', missions: -1, cooldown: -1, hint: '' };
    this.barragePanel = $('#barrage-panel');
    this.damageNote = $('#damage-note');
    this.crosshair = $('#crosshair');
    this.toasts = $('#toasts');
    this.alertEl = $('#alert-banner');
    this.alertText = $('#alert-text');
    this.capturePanel = $('#capture-panel');
    this.captureName = $('#capture-name');
    this.capturePercent = $('#capture-percent');
    this.captureFill = $('#capture-fill');
    this.captureHint = $('#capture-hint');
    this.map = $('#minimap');
    this.mapCtx = this.map.getContext('2d');
    this.mapCoords = $('#map-coords');
    this.flash = $('#fx-flash');
    this.markersRoot = $('#objective-markers');
    this.objectiveCards = new Map();
    $$('.obj-card').forEach((el) => this.objectiveCards.set(el.dataset.outpost, el));
    this.markerEls = new Map();
    this.mapBg = null;
    this.lastHealth = -1;
    this.lastObjectiveState = new Map();
    this.alertTimer = null;
    this.flashTimer = null;
    this.hitTimer = null;
    this.lastReload = -1;
    this.lastSpeed = -1;
    this.toastCount = 0;
    this.clockText = '';
  }

  initOutposts(outposts) {
    for (const o of outposts) {
      const el = document.createElement('div');
      el.className = 'world-marker';
      el.innerHTML = `
        <div class="marker-label"><b>${o.name}</b><span>0m</span></div>
        <div class="marker-stem"></div>
        <div class="marker-flag"></div>
      `;
      this.markersRoot.appendChild(el);
      this.markerEls.set(o.id, el);
      this.lastObjectiveState.set(o.id, '');
      const card = this.objectiveCards.get(o.id);
      if (card) {
        card.querySelector('.obj-state').textContent = 'Hostile';
        card.classList.remove('captured', 'contested');
      }
    }
  }

  setObjective(outpost, playerDistance = 0) {
    const state = outpost.owner === 'player' ? 'captured' : outpost.contested ? 'contested' : 'hostile';
    const last = this.lastObjectiveState.get(outpost.id);
    if (last !== state) {
      this.lastObjectiveState.set(outpost.id, state);
      const card = this.objectiveCards.get(outpost.id);
      if (card) {
        card.classList.toggle('captured', state === 'captured');
        card.classList.toggle('contested', state === 'contested');
        const el = card.querySelector('.obj-state');
        if (el) el.textContent = state === 'captured' ? 'Secured' : state === 'contested' ? 'Contested' : 'Hostile';
      }
      const marker = this.markerEls.get(outpost.id);
      if (marker) {
        marker.classList.toggle('captured', state === 'captured');
        marker.classList.toggle('contested', state === 'contested');
      }
    }
    const marker = this.markerEls.get(outpost.id);
    if (marker) {
      const span = marker.querySelector('.marker-label span');
      if (span) {
        span.textContent = state === 'captured' ? 'SECURED' : state === 'contested' ? 'CONTESTED' : `${Math.round(playerDistance)}m`;
      }
    }
  }

  setCaptureCount(count) {
    this.captureCount.textContent = String(count);
  }

  updateHealth(health, max = 100) {
    const f = clamp(health / max, 0, 1);
    if (Math.abs(f - this.lastHealth) < 0.002) return;
    this.lastHealth = f;
    this.healthFill.style.transform = `scaleX(${f})`;
    this.healthValue.textContent = `${Math.round(f * 100)}%`;
    const meter = this.healthFill.parentElement;
    meter.classList.toggle('low', f <= 0.55 && f > 0.28);
    meter.classList.toggle('critical', f <= 0.28);
    if (f > 0.55) {
      this.hullState.textContent = 'OPERATIONAL';
      this.hullState.classList.remove('danger');
    } else if (f > 0.28) {
      this.hullState.textContent = 'DAMAGED';
      this.hullState.classList.add('danger');
    } else {
      this.hullState.textContent = 'CRITICAL';
      this.hullState.classList.add('danger');
    }
    this.damageNote.classList.toggle('hidden', f > 0.34);
  }

  update(player, game) {
    const reloadFrac = player.reload > 0 ? 1 - player.reload / player.reloadTime : 1;
    if (Math.abs(reloadFrac - this.lastReload) > 0.01) {
      this.lastReload = reloadFrac;
      this.reloadFill.style.transform = `scaleX(${clamp(reloadFrac, 0, 1)})`;
      this.gunState.textContent = player.reload > 0 ? 'RELOADING' : 'READY';
      this.gunState.style.color = player.reload > 0 ? 'rgba(244,234,213,0.5)' : '';
      this.crosshair.classList.toggle('reloading', player.reload > 0.3);
    }
    const kmh = Math.round(player.speed * 4.15);
    if (kmh !== this.lastSpeed) {
      this.lastSpeed = kmh;
      this.speedValue.textContent = `${kmh} km/h`;
      const lit = Math.round((player.speed / player.maxSpeed) * this.throttle.length);
      this.throttle.forEach((el, i) => el.classList.toggle('on', i < lit));
    }
    const timeText = formatTime(game.elapsed);
    if (timeText !== this.clockText) {
      this.clockText = timeText;
      this.clock.textContent = timeText;
    }
    const ex = Math.round(player.position.x);
    const ez = Math.round(-player.position.z);
    this.mapCoords.textContent = `E ${ex >= 0 ? '+' : ''}${ex} · N ${ez >= 0 ? '+' : ''}${ez}`;

    for (const o of game.world.outposts) {
      const dist = player.position.distanceTo(new THREE.Vector3(o.x, o.y, o.z));
      this.setObjective(o, dist);
    }
    this.updateTerritory(game, player);
    this.updateSquad(game);
    this.updateBattery(game);
    this.updateMarkers(game, player);
    this.drawMinimap(game, player);
    this.updateCapture(game.captureInfo);
  }

  updateSquad(game) {
    const squad = game.playerSquad;
    if (!this.squadBlock) return;
    if (!squad) {
      this.squadBlock.classList.add('hidden');
      return;
    }
    this.squadBlock.classList.remove('hidden');
    const alive = squad.soldiers.filter((s) => s.alive).length;
    if (alive !== this.lastSquadAlive) {
      this.lastSquadAlive = alive;
      this.squadStrength.textContent = `${alive} / ${squad.soldiers.length}`;
      this.squadPips.forEach((el, i) => el.classList.toggle('down', !squad.soldiers[i]?.alive));
      this.squadBlock.classList.toggle('wiped', alive === 0);
    }
    const order = squad.dead ? 'WIPED OUT' : squad.order === 'follow' ? 'FOLLOWING' : squad.order === 'move' ? 'MOVING' : 'HOLDING';
    if (order !== this.lastSquadOrder) {
      this.lastSquadOrder = order;
      this.squadOrder.textContent = order;
      this.squadOrder.classList.toggle('danger', squad.dead);
    }
  }

  updateBattery(game) {
    const battery = game.battery;
    if (!this.batteryBlock) return;
    if (!battery) {
      this.batteryBlock.classList.add('hidden');
      return;
    }
    this.batteryBlock.classList.remove('hidden');
    const status = battery.status;
    const missions = battery.missions;
    const cooldown = Math.ceil(battery.cooldown);
    const hint = battery.ready
      ? 'F fire mission'
      : status === 'DRY'
        ? 'Capture to resupply'
        : `${cooldown}s`;

    if (status !== this.lastBattery.status) {
      this.lastBattery.status = status;
      this.batteryStatus.textContent = status;
      this.batteryStatus.classList.toggle('ready', status === 'READY');
      this.batteryStatus.classList.toggle('danger', status === 'DRY');
    }
    if (missions !== this.lastBattery.missions) {
      this.lastBattery.missions = missions;
      this.batteryMissions.textContent = `${missions} ${missions === 1 ? 'mission' : 'missions'}`;
      this.batteryPips.forEach((pip, i) => pip.classList.toggle('spent', i >= missions));
    }
    if (hint !== this.lastBattery.hint) {
      this.lastBattery.hint = hint;
      this.batteryHint.textContent = hint;
    }
  }

  setBarrageMode(on) {
    if (this.barragePanel) this.barragePanel.classList.toggle('hidden', !on);
    this.crosshair.classList.toggle('barrage', !!on);
  }

  updateTerritory(game, player) {
    const territory = game.world.territory;
    if (!territory) return;
    const playerPct = Math.round(territory.playerShare * 100);
    const enemyPct = Math.round(territory.enemyShare * 100);
    if (playerPct !== this.lastTerritory.player) {
      this.lastTerritory.player = playerPct;
      this.territoryValue.textContent = String(playerPct);
    }
    if (enemyPct !== this.lastTerritory.enemy) {
      this.lastTerritory.enemy = enemyPct;
      this.territoryHostile.textContent = `${enemyPct}% hostile`;
      if (this.territoryMeter) {
        this.territoryMeter.title = `Crimson Corps holds ${enemyPct}% · contested ${Math.round(territory.contestedShare * 100)}%`;
      }
    }
    this.territoryPlayerFill.style.transform = `scaleX(${clamp(territory.playerShare, 0, 1)})`;
    this.territoryEnemyFill.style.transform = `scaleX(${clamp(territory.enemyShare, 0, 1)})`;
    const contested = territory.isContestedAt(player.position.x, player.position.z);
    const ground = territory.factionAt(player.position.x, player.position.z);
    const label = contested
      ? 'Contested ground'
      : ground === 'player'
        ? 'Friendly ground · supply'
        : ground === 'enemy'
          ? 'Enemy ground'
          : 'Neutral ground';
    if (label !== this.lastTerritory.state) {
      this.lastTerritory.state = label;
      this.territoryState.textContent = label;
      this.territoryState.classList.remove('friendly', 'hostile', 'contested');
      if (contested) this.territoryState.classList.add('contested');
      else if (ground === 'player') this.territoryState.classList.add('friendly');
      else if (ground === 'enemy') this.territoryState.classList.add('hostile');
    }
  }

  updateMarkers(game, player) {
    const { camera, renderer } = game;
    const w = renderer.domElement.clientWidth;
    const h = renderer.domElement.clientHeight;
    const v = new THREE.Vector3();
    const padX = 64;
    const topSafe = Math.min(150, h * 0.26);
    const bottomSafe = h - 96;
    const items = [];
    for (const o of game.world.outposts) {
      const el = this.markerEls.get(o.id);
      if (!el) continue;
      v.set(o.x, o.y + 7.6, o.z);
      v.project(camera);
      let x = (v.x * 0.5 + 0.5) * w;
      let y = (-v.y * 0.5 + 0.5) * h;
      let off = false;
      if (v.z > 1 || x < padX || x > w - padX || y < topSafe || y > bottomSafe) {
        off = true;
        x = clamp(x, padX, w - padX);
        y = clamp(y, topSafe, bottomSafe);
      }
      if (game.state === 'intro') {
        el.style.opacity = '0';
      } else {
        el.style.opacity = '';
      }
      items.push({ el, x, y, off });
    }
    // markers pinned to the same edge would otherwise sit on top of each other
    const edge = items.filter((it) => it.off).sort((a, b) => a.y - b.y || a.x - b.x);
    for (let i = 1; i < edge.length; i++) {
      const prev = edge[i - 1];
      const cur = edge[i];
      if (Math.abs(cur.x - prev.x) < 96 && cur.y - prev.y < 30) {
        cur.y = Math.min(bottomSafe, prev.y + 30);
      }
    }
    for (const it of items) {
      it.el.style.left = `${it.x}px`;
      it.el.style.top = `${it.y}px`;
      it.el.classList.toggle('off-screen', it.off);
    }
  }

  setCrosshair(x, y, { airLock = false, overUI = false, barrage = false } = {}) {
    this.crosshair.style.transform = `translate3d(${x - 60}px, ${y - 60}px, 0)`;
    this.crosshair.classList.toggle('air-lock', airLock);
    this.crosshair.classList.toggle('over-ui', overUI);
    this.crosshair.classList.toggle('barrage', barrage);
  }

  hitMarker(kill = false) {
    this.crosshair.classList.add('hit');
    clearTimeout(this.hitTimer);
    this.hitTimer = setTimeout(() => this.crosshair.classList.remove('hit'), kill ? 220 : 100);
  }

  updateCapture(info) {
    if (!info) {
      this.capturePanel.classList.add('hidden');
      return;
    }
    this.capturePanel.classList.remove('hidden');
    this.captureName.textContent = `Outpost ${info.outpost.name}`;
    const pct = Math.round(info.progress * 100);
    this.capturePercent.textContent = `${pct}%`;
    this.captureFill.style.transform = `scaleX(${clamp(info.progress, 0, 1)})`;
    this.capturePanel.classList.toggle('contested', info.contested);
    if (info.contested) {
      this.captureHint.textContent = 'CONTESTED — clear hostile armor and infantry from the ring';
      this.capturePanel.querySelector('.capture-kicker').textContent = 'Capture contested';
    } else if (info.squadInZone && !info.tankInZone) {
      this.captureHint.textContent = 'Able squad is holding the zone — bring the tank in to speed it up';
      this.capturePanel.querySelector('.capture-kicker').textContent = 'Infantry holding';
    } else {
      this.captureHint.textContent = 'Hold the zone — keep hostile armor and infantry out';
      this.capturePanel.querySelector('.capture-kicker').textContent = 'Securing position';
    }
  }

  damageFlash(strength = 1) {
    this.flash.style.opacity = String(clamp(strength, 0, 1));
    this.flash.classList.add('active');
    clearTimeout(this.flashTimer);
    this.flashTimer = setTimeout(() => {
      this.flash.classList.remove('active');
      this.flash.style.opacity = '0';
    }, 100);
  }

  toast(title, text = '', icon = '★', type = '') {
    const el = document.createElement('div');
    el.className = `toast ${type}`;
    el.innerHTML = `<div class="toast-icon">${icon}</div><div class="toast-copy"><strong></strong><span></span></div>`;
    el.querySelector('strong').textContent = title;
    el.querySelector('span').textContent = text;
    this.toasts.appendChild(el);
    while (this.toasts.children.length > 4) this.toasts.firstElementChild.remove();
    setTimeout(() => {
      el.classList.add('out');
      setTimeout(() => el.remove(), 420);
    }, 4600);
  }

  alert(title, text, duration = 4) {
    this.alertEl.classList.remove('hidden');
    this.alertEl.querySelector('.alert-kicker').textContent = title;
    this.alertText.textContent = text;
    clearTimeout(this.alertTimer);
    this.alertTimer = setTimeout(() => this.alertEl.classList.add('hidden'), duration * 1000);
  }

  buildMinimap(world) {
    const size = 440;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    const img = ctx.createImageData(size, size);
    const n = world.n;
    const light = new THREE.Vector3(-0.55, 0.72, -0.42).normalize();
    for (let py = 0; py < size; py++) {
      for (let px = 0; px < size; px++) {
        const wx = (px / size) * world.size - world.half;
        const wz = (py / size) * world.size - world.half;
        const i = clamp(Math.floor((wx + world.half) / world.cell), 0, n - 1);
        const j = clamp(Math.floor((wz + world.half) / world.cell), 0, n - 1);
        const idx = j * n + i;
        const h = world.heights[idx];
        const hx = world.heights[j * n + Math.min(n - 1, i + 1)] - world.heights[j * n + Math.max(0, i - 1)];
        const hz = world.heights[Math.min(n - 1, j + 1) * n + i] - world.heights[Math.max(0, j - 1) * n + i];
        const nx = -hx * 0.8;
        const ny = 2.2;
        const nz = -hz * 0.8;
        const inv = 1 / Math.hypot(nx, ny, nz);
        const shade = clamp(0.62 + (nx * light.x + ny * light.y + nz * light.z) * inv * 0.55, 0.4, 1.22);
        const r = world.terrainBaseColors[idx * 3] * 255 * shade;
        const g = world.terrainBaseColors[idx * 3 + 1] * 255 * shade;
        const b = world.terrainBaseColors[idx * 3 + 2] * 255 * shade;
        const o = (py * size + px) * 4;
        img.data[o] = clamp(r, 0, 255);
        img.data[o + 1] = clamp(g, 0, 255);
        img.data[o + 2] = clamp(b, 0, 255);
        img.data[o + 3] = 255;
        // subtle contour banding
        if (h > 0 && Math.abs((h % 5) - 0) < 0.06) {
          img.data[o] *= 0.86;
          img.data[o + 1] *= 0.86;
          img.data[o + 2] *= 0.86;
        }
      }
    }
    ctx.putImageData(img, 0, 0);

    // roads
    const drawRoad = (samples, width) => {
      ctx.beginPath();
      samples.forEach((s, i) => {
        const x = ((s.x + world.half) / world.size) * size;
        const y = ((s.z + world.half) / world.size) * size;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.strokeStyle = 'rgba(175,148,105,0.7)';
      ctx.lineWidth = width;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.stroke();
      ctx.strokeStyle = 'rgba(90,72,50,0.35)';
      ctx.lineWidth = Math.max(1, width * 0.22);
      ctx.stroke();
    };
    if (world.mainRoad) drawRoad(world.mainRoad.samples, 8);
    if (world.westRoad) drawRoad(world.westRoad.samples, 5);
    if (world.eastRoad) drawRoad(world.eastRoad.samples, 5);

    // map border and grid
    ctx.strokeStyle = 'rgba(244,234,213,0.12)';
    ctx.lineWidth = 1;
    for (let i = 1; i < 4; i++) {
      ctx.beginPath();
      ctx.moveTo((i / 4) * size, 0);
      ctx.lineTo((i / 4) * size, size);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, (i / 4) * size);
      ctx.lineTo(size, (i / 4) * size);
      ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(244,234,213,0.25)';
    ctx.lineWidth = 2;
    ctx.strokeRect(1, 1, size - 2, size - 2);
    this.mapBg = canvas;
  }

  drawMinimap(game, player) {
    const ctx = this.mapCtx;
    const size = 440;
    const world = game.world;
    ctx.clearRect(0, 0, size, size);
    if (this.mapBg) ctx.drawImage(this.mapBg, 0, 0, size, size);
    if (world.territory?.minimapCanvas) {
      ctx.globalAlpha = 0.85;
      ctx.drawImage(world.territory.minimapCanvas, 0, 0, size, size);
      ctx.globalAlpha = 1;
    }
    const toMap = (x, z) => [((x + world.half) / world.size) * size, ((z + world.half) / world.size) * size];

    // outposts
    for (const o of world.outposts) {
      const [x, y] = toMap(o.x, o.z);
      const col = o.owner === 'player' ? '#7fa89b' : o.contested ? '#e66a2c' : '#d85e3d';
      ctx.beginPath();
      ctx.arc(x, y, 17, 0, Math.PI * 2);
      ctx.strokeStyle = col;
      ctx.globalAlpha = 0.75;
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.fillStyle = col;
      ctx.fillRect(x - 1.5, y - 22, 3, 18);
      ctx.beginPath();
      ctx.moveTo(x + 1.5, y - 22);
      ctx.lineTo(x + 16, y - 17);
      ctx.lineTo(x + 1.5, y - 11);
      ctx.fill();
      ctx.font = '600 16px "DM Mono", monospace';
      ctx.fillStyle = 'rgba(244,234,213,0.9)';
      ctx.fillText(o.id, x - 5, y + 33);
    }

    // enemies
    for (const e of game.enemies) {
      if (e.dead) continue;
      const [x, y] = toMap(e.position.x, e.position.z);
      ctx.beginPath();
      ctx.arc(x, y, e.heavy ? 7 : 5, 0, Math.PI * 2);
      ctx.fillStyle = '#e56b4a';
      ctx.fill();
      ctx.strokeStyle = 'rgba(30,20,16,0.7)';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
    for (const a of game.artilleries) {
      if (a.dead) continue;
      const [x, y] = toMap(a.position.x, a.position.z);
      ctx.fillStyle = '#d89b45';
      ctx.fillRect(x - 4, y - 4, 8, 8);
      ctx.strokeStyle = 'rgba(30,20,16,0.7)';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(x - 4, y - 4, 8, 8);
    }
    for (const squad of game.enemySquads) {
      for (const soldier of squad.soldiers) {
        if (!soldier.alive) continue;
        const [x, y] = toMap(soldier.pos.x, soldier.pos.z);
        ctx.beginPath();
        ctx.arc(x, y, 2.6, 0, Math.PI * 2);
        ctx.fillStyle = '#f08a68';
        ctx.fill();
      }
    }
    for (const squad of game.playerSquads) {
      for (const soldier of squad.soldiers) {
        if (!soldier.alive) continue;
        const [x, y] = toMap(soldier.pos.x, soldier.pos.z);
        ctx.beginPath();
        ctx.arc(x, y, 2.6, 0, Math.PI * 2);
        ctx.fillStyle = '#b9e7d2';
        ctx.fill();
      }
    }
    for (const b of game.bombers) {
      if (b.dead) continue;
      const [x, y] = toMap(b.position.x, b.position.z);
      ctx.strokeStyle = '#f2c179';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x - 8, y - 8);
      ctx.lineTo(x + 8, y + 8);
      ctx.moveTo(x + 8, y - 8);
      ctx.lineTo(x - 8, y + 8);
      ctx.stroke();
    }

    // player wedge
    const [px, py] = toMap(player.position.x, player.position.z);
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(player.hullYaw + Math.PI);
    ctx.beginPath();
    ctx.moveTo(0, -10);
    ctx.lineTo(7, 7);
    ctx.lineTo(0, 3);
    ctx.lineTo(-7, 7);
    ctx.closePath();
    ctx.fillStyle = '#f4ead5';
    ctx.fill();
    ctx.strokeStyle = '#1c1b18';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();

    // camera facing wedge
    ctx.globalAlpha = 0.35;
    ctx.beginPath();
    ctx.arc(px, py, 26, 0, Math.PI * 2);
    ctx.strokeStyle = '#f4ead5';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  showEnd(victory, stats, elapsed) {
    const end = $('#end-screen');
    end.classList.remove('hidden');
    const card = end.querySelector('.end-card');
    card.classList.toggle('defeat', !victory);
    $('#end-badge').textContent = victory ? '★' : '✕';
    $('#end-kicker').textContent = victory ? 'After-action report' : 'Field report';
    $('#end-title').textContent = victory ? 'Ridgeline secured.' : 'Tank lost.';
    $('#end-copy').textContent = victory
      ? 'Three flags over the valley. The Crimson Corps is pulling back over the pass. For now, the ridge is yours.'
      : 'The valley holds — for the wrong side. The ridge is still hostile. Reload, refit, and run it again.';
    $('#stat-time').textContent = formatTime(elapsed);
    $('#stat-kills').textContent = String(stats.kills);
    $('#stat-barns').textContent = String(stats.barns);
    $('#stat-air').textContent = String(stats.airKills);
    $('#btn-redeploy').textContent = victory ? 'Run it again' : 'Redeploy';
  }

  showPause(show) {
    $('#pause').classList.toggle('hidden', !show);
  }

  showHelp(show) {
    $('#help').classList.toggle('hidden', !show);
  }

  hideEnd() {
    $('#end-screen').classList.add('hidden');
  }
}
