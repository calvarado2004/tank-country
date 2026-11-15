import './style.css';
import * as THREE from 'three';
import { World } from './world.js';
import { Effects } from './effects.js';
import { AudioManager } from './audio.js';
import { HUD } from './hud.js';
import { PlayerTank, EnemyTank, EnemyArtillery, Bomber, Shell, Bomb, createDangerMarker } from './entities.js';
import { InfantrySquad } from './infantry.js';
import { PlayerBattery } from './battery.js';
import { setTankMaterials } from './models.js';
import { advanceCapture } from './capture.js';
import {
  TAU, clamp, lerp, damp, dampAngle, shortestAngle, makeRng, radialSpriteTexture,
} from './utils.js';

const $ = (sel) => document.querySelector(sel);

class Game {
  constructor() {
    this.state = 'intro';
    this.elapsed = 0;
    this.introTime = 0;
    this.stats = { kills: 0, barns: 0, airKills: 0, infantryKills: 0, shots: 0, captures: 0, barrages: 0 };
    this.projectiles = [];
    this.enemies = [];
    this.artilleries = [];
    this.bombers = [];
    this.playerSquads = [];
    this.enemySquads = [];
    this.playerSquad = null;
    this.waveIndex = 0;
    this.waveTimer = 38;
    this.bomberTimer = 48;
    this.captureInfo = null;
    this.scheduledSpawns = [];
    this.counterattackTimer = 0;
    this.victoryTimer = 0;
    this.endDelay = 0;
    this.endShown = false;
    this.shakeAmt = 0;
    this.rng = makeRng(1957);
    this.cameraYaw = Math.PI * 0.25;
    this.cameraYawTarget = this.cameraYaw;
    this.cameraPitch = 0.84;
    this.cameraDistance = 130;
    this.cameraTarget = new THREE.Vector3(0, 8, -10);
    this.viewSize = 160;
    this.targetViewSize = 160;
    this.raycaster = new THREE.Raycaster();
    this.aimRayHit = new THREE.Vector3();
    this.overUI = false;
    this.lastFrame = performance.now();
    this.firstRender = true;
    this.audioStarted = false;
    this._sunOffset = new THREE.Vector3(78, 112, 52);
    this._v = new THREE.Vector3();
    this._v2 = new THREE.Vector3();
    this._v3 = new THREE.Vector3();

    this.initThree();
    this.initInput();
    this.initUI();
    this.initWorld();
    this.initCamera();
    this.animate = this.animate.bind(this);
    requestAnimationFrame(this.animate);
  }

  // -------------------------------------------------------------------------
  // setup
  // -------------------------------------------------------------------------

  initThree() {
    this.canvas = $('#game-canvas');
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.8));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.14;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.scene = new THREE.Scene();
    this.camera = new THREE.OrthographicCamera(-50, 50, 30, -30, 0.1, 500);
    this.scene.add(this.camera);

    this.hemi = new THREE.HemisphereLight(0xe8d7b4, 0x3a382c, 0.82);
    this.scene.add(this.hemi);

    this.sun = new THREE.DirectionalLight(0xffd8a3, 3.15);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.camera.left = -105;
    this.sun.shadow.camera.right = 105;
    this.sun.shadow.camera.top = 105;
    this.sun.shadow.camera.bottom = -105;
    this.sun.shadow.camera.near = 10;
    this.sun.shadow.camera.far = 360;
    this.sun.shadow.bias = -0.00035;
    this.sun.shadow.normalBias = 0.045;
    this.scene.add(this.sun);
    this.scene.add(this.sun.target);

    this.fill = new THREE.DirectionalLight(0x93aaa8, 0.26);
    this.fill.position.set(-60, 50, 80);
    this.scene.add(this.fill);

    this.effects = new Effects(this.scene);
    this.audio = new AudioManager();
    this.hud = new HUD();

    // soft contact shadow under the floating diorama
    const shadowTex = radialSpriteTexture('rgba(8,8,6,0.9)', 'rgba(8,8,6,0)', 256);
    const shadowMat = new THREE.MeshBasicMaterial({
      map: shadowTex,
      transparent: true,
      opacity: 0.72,
      depthWrite: false,
      toneMapped: false,
    });
    const shadowPlane = new THREE.Mesh(new THREE.PlaneGeometry(460, 460), shadowMat);
    shadowPlane.rotation.x = -Math.PI / 2;
    shadowPlane.position.y = -22.5;
    shadowPlane.renderOrder = -2;
    this.scene.add(shadowPlane);

    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  initWorld() {
    this.world = new World(this.scene, this.effects, this.audio);
    this.effects.heightAt = (x, z) => this.world.height(x, z);
    this.hud.buildMinimap(this.world);
    this.hud.initOutposts(this.world.outposts);
    this.player = new PlayerTank(this);
    this.battery = new PlayerBattery(this);
    this.input.aimPoint.set(this.player.position.x, this.player.position.y, this.player.position.z - 30);
    this.spawnInitialDefenders();
    this.initDust();
    this.updateSun();
  }

  initDust() {
    const count = 180;
    const geo = new THREE.BufferGeometry();
    const positions = new Float32Array(count * 3);
    const rng = makeRng(4242);
    for (let i = 0; i < count; i++) {
      const x = (rng.next() - 0.5) * 290;
      const z = (rng.next() - 0.5) * 290;
      const y = this.world.height(x, z) + 1 + rng.next() * 13;
      positions[i * 3] = x;
      positions[i * 3 + 1] = y;
      positions[i * 3 + 2] = z;
    }
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const mat = new THREE.PointsMaterial({
      color: 0xd6c3a1,
      size: 0.17,
      transparent: true,
      opacity: 0.34,
      depthWrite: false,
      sizeAttenuation: true,
      toneMapped: false,
    });
    this.dustMotes = new THREE.Points(geo, mat);
    this.dustMotes.frustumCulled = false;
    this.scene.add(this.dustMotes);
  }

  initCamera() {
    this.cameraTarget.set(0, 6, 0);
    this.cameraYaw = Math.PI * 0.25;
    this.cameraYawTarget = this.cameraYaw;
    this.viewSize = 238;
    this.targetViewSize = 238;
    this.updateCamera(1, true);
  }

  initInput() {
    this.input = {
      keys: new Set(),
      mouse: { x: window.innerWidth / 2, y: window.innerHeight / 2, nx: 0, ny: 0 },
      mouseDown: false,
      cameraYaw: this.cameraYaw,
      aimPoint: new THREE.Vector3(),
      airTarget: null,
      overUI: false,
      aimMode: 'pointer',
      barrageMode: false,
    };
    this.ndc = new THREE.Vector2();
    this.canvas.addEventListener('pointerdown', (e) => {
      if (this.state !== 'playing') return;
      if (e.button === 0) {
        this.audio.init();
        this.audio.resume();
        this.input.mouse.x = e.clientX;
        this.input.mouse.y = e.clientY;
        this.input.mouse.nx = (e.clientX / window.innerWidth) * 2 - 1;
        this.input.mouse.ny = -(e.clientY / window.innerHeight) * 2 + 1;
        this.input.aimMode = 'pointer';
        if (this.input.barrageMode) {
          this.updateAim();
          this.callBarrage();
          e.preventDefault();
          return;
        }
        this.input.mouseDown = true;
        e.preventDefault();
      }
      if (e.button === 2) {
        if (this.input.barrageMode) {
          this.cancelBarrage();
          e.preventDefault();
          return;
        }
        this.input.mouse.x = e.clientX;
        this.input.mouse.y = e.clientY;
        this.input.mouse.nx = (e.clientX / window.innerWidth) * 2 - 1;
        this.input.mouse.ny = -(e.clientY / window.innerHeight) * 2 + 1;
        this.input.aimMode = 'pointer';
        this.updateAim();
        this.orderSquad(this.input.aimPoint.clone());
        e.preventDefault();
      }
    });
    window.addEventListener('pointerup', () => {
      this.input.mouseDown = false;
    });
    window.addEventListener('pointermove', (e) => {
      this.input.mouse.x = e.clientX;
      this.input.mouse.y = e.clientY;
      this.input.mouse.nx = (e.clientX / window.innerWidth) * 2 - 1;
      this.input.mouse.ny = -(e.clientY / window.innerHeight) * 2 + 1;
      this.input.overUI = e.target !== this.canvas;
      this.input.aimMode = 'pointer';
    });
    this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('wheel', (e) => {
      if (this.state !== 'playing' || e.target !== this.canvas) return;
      e.preventDefault();
      this.targetViewSize = clamp(this.targetViewSize + e.deltaY * 0.03, 30, 96);
    }, { passive: false });
    window.addEventListener('keydown', (e) => {
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
      this.input.keys.add(e.code);
      if (e.code === 'Escape') {
        if (this.input.barrageMode) {
          this.cancelBarrage();
          return;
        }
        if (!this.helpOpen) {
          if (this.state === 'playing') this.pause();
          else if (this.state === 'paused' && !$('#pause').classList.contains('hidden')) this.resume();
        } else {
          this.closeHelp();
        }
      }
      if (e.code === 'KeyM') this.toggleSound();
      if (e.code === 'KeyG' && this.state === 'playing') this.regroupSquad();
      if (e.code === 'KeyF' && this.state === 'playing') this.toggleBarrage();
      if (e.code === 'KeyH') {
        if (this.state === 'playing' || this.state === 'paused') this.openHelp();
      }
      if (e.code === 'Enter' && this.state === 'intro') this.deploy();
    });
    window.addEventListener('keyup', (e) => {
      this.input.keys.delete(e.code);
    });
    window.addEventListener('blur', () => {
      this.input.keys.clear();
      this.input.mouseDown = false;
      if (this.state === 'playing') this.pause();
    });
    this.canvas.addEventListener('pointerenter', () => {
      this.input.overUI = false;
    });
    this.canvas.addEventListener('pointerleave', () => {
      this.input.overUI = true;
    });
  }

  initUI() {
    $('#btn-deploy').addEventListener('click', () => this.deploy());
    $('#btn-pause').addEventListener('click', () => this.pause());
    $('#btn-resume').addEventListener('click', () => this.resume());
    $('#btn-help').addEventListener('click', () => this.openHelp());
    $('#btn-help-close').addEventListener('click', () => this.closeHelp());
    $('#btn-help-ok').addEventListener('click', () => this.closeHelp());
    $('#btn-sound').addEventListener('click', () => this.toggleSound());
    $('#btn-restart-pause').addEventListener('click', () => location.reload());
    $('#btn-redeploy').addEventListener('click', () => location.reload());
    this.updateSoundIcon();
    setTimeout(() => {
      $('#loading').classList.add('done');
      setTimeout(() => $('#loading').remove(), 600);
    }, 350);
  }

  // -------------------------------------------------------------------------
  // state / UI flow
  // -------------------------------------------------------------------------

  deploy() {
    if (this.state !== 'intro') return;
    this.audio.init();
    this.audio.resume();
    this.audio.ui();
    this.audioStarted = true;
    this.state = 'playing';
    this.input.aimMode = 'forward';
    this.input.barrageMode = false;
    this.hud.setBarrageMode(false);
    this.introTime = 0;
    $('#intro').classList.add('hidden');
    $('#hud').classList.remove('hidden');
    this.targetViewSize = 53;
    this.cameraYawTarget = this.cameraYaw;
    this.hud.toast('Operation Iron Harvest', 'Take Alpha, Bravo and Charlie on the ridgeline', '★', 'capture');
    setTimeout(() => {
      if (this.state === 'playing') this.hud.alert('Ridgeline offensive', 'Capture all three outposts', 4.5);
    }, 1000);
    this.audio.setEngine(0, true, 1);
    this.audio.warning();
  }

  pause() {
    if (this.state !== 'playing') return;
    this.state = 'paused';
    this.input.mouseDown = false;
    this.cancelBarrage();
    this.audio.setEngine(0, false, 1);
    this.hud.showPause(true);
    this.hud.crosshair.style.opacity = '0';
  }

  resume() {
    if (this.state !== 'paused') return;
    this.state = 'playing';
    this.input.aimMode = 'hold';
    this.hud.showPause(false);
    this.hud.crosshair.style.opacity = '';
    this.audio.init();
    this.audio.resume();
    this.audio.ui();
  }

  openHelp() {
    if (this.helpOpen) return;
    this.helpOpen = true;
    this.cancelBarrage();
    this.helpResume = this.state === 'playing';
    this.helpWasPaused = this.state === 'paused';
    if (this.state === 'playing') {
      this.state = 'paused';
      this.input.mouseDown = false;
      this.audio.setEngine(0, false, 1);
    }
    this.hud.showPause(false);
    this.hud.showHelp(true);
    this.hud.crosshair.style.opacity = '0';
  }

  closeHelp() {
    if (!this.helpOpen) return;
    this.helpOpen = false;
    this.hud.showHelp(false);
    this.audio.ui();
    if (this.helpResume) {
      this.state = 'playing';
      this.input.aimMode = 'hold';
      this.audio.resume();
      this.hud.crosshair.style.opacity = '';
    } else if (this.helpWasPaused) {
      this.state = 'paused';
      this.hud.showPause(true);
    }
    this.helpResume = false;
    this.helpWasPaused = false;
  }

  toggleSound() {
    this.audio.init();
    const muted = this.audio.toggleMuted();
    this.audio.ui();
    this.updateSoundIcon();
  }

  updateSoundIcon() {
    const on = document.querySelector('.icon-sound-on');
    const off = document.querySelector('.icon-sound-off');
    if (!on || !off) return;
    on.classList.toggle('hidden', this.audio.muted);
    off.classList.toggle('hidden', !this.audio.muted);
  }

  endGame(victory) {
    if (this.state === 'ended' || this.endShown) return;
    this.state = 'ended';
    this.endShown = true;
    this.input.mouseDown = false;
    this.cancelBarrage();
    this.hud.updateCapture(null);
    this.hud.crosshair.style.opacity = '0';
    this.audio.setEngine(0, false, 1);
    this.endDelay = victory ? 1.4 : 1.7;
    this.victory = victory;
    if (victory) this.audio.victory();
    else this.audio.defeat();
    if (victory) {
      this.targetViewSize = 86;
      this.hud.toast('Ridge secured', 'All three outposts are flying your colors', '★', 'capture');
    }
  }

  playerDestroyed() {
    if (this.state === 'ended') return;
    this.cancelBarrage();
    const p = this.player;
    p.dead = true;
    const pos = p.position.clone().add(new THREE.Vector3(0, 1.3, 0));
    this.effects.explosion(pos, { size: 3.2, ground: true, debris: true });
    this.effects.explosion(pos.clone().add(new THREE.Vector3(1.5, 0.6, 0.5)), { size: 1.8, ground: false, debris: false });
    this.audio.explosion(2.4);
    this.shake(1.4);
    setTankMaterials(p.model, new THREE.Color(0x2b2721), 0x190d06);
    if (p.model.userData.turret) {
      p.model.userData.turret.rotation.z = 0.2;
      p.model.userData.turret.position.y -= 0.12;
    }
    if (p.model.userData.barrelPivot) p.model.userData.barrelPivot.rotation.x = 0.22;
    this.effects.addSmokeEmitter({
      position: p.position.clone().add(new THREE.Vector3(0, 1.5, 0)),
      duration: 60,
      rate: 3.5,
      scale: 2.6,
      color: 0x2b2822,
      rise: 1.8,
      spread: 1.2,
      opacity: 0.24,
    });
    this.effects.fire(p.position.clone().add(new THREE.Vector3(0, 1.4, 0)), 1.6);
    this.world.deformTerrain(p.position.x, p.position.z, 5.5, 1.0, true);
    this.hud.damageFlash(1);
    setTimeout(() => this.endGame(false), 600);
  }

  // -------------------------------------------------------------------------
  // input / aim / camera
  // -------------------------------------------------------------------------

  updateCameraKeys(dt) {
    if (this.input.keys.has('KeyQ')) this.cameraYawTarget -= dt * 1.55;
    if (this.input.keys.has('KeyE')) this.cameraYawTarget += dt * 1.55;
  }

  updateAim() {
    if (this.state !== 'playing' && this.state !== 'paused') return;
    if (this.input.aimMode === 'forward') {
      const p = this.player.position;
      const ax = clamp(p.x + Math.sin(this.player.hullYaw) * 24, -this.world.half + 3, this.world.half - 3);
      const az = clamp(p.z + Math.cos(this.player.hullYaw) * 24, -this.world.half + 3, this.world.half - 3);
      this.input.aimPoint.set(ax, this.world.height(ax, az), az);
      this.input.airTarget = null;
      return;
    }
    if (this.input.aimMode === 'hold') {
      this.input.airTarget = null;
      return;
    }
    this.ndc.set(this.input.mouse.nx, this.input.mouse.ny);
    this.raycaster.setFromCamera(this.ndc, this.camera);
    const activeBombers = this.bombers.filter((b) => !b.dead && !b.falling);
    let airTarget = null;
    if (activeBombers.length) {
      const models = activeBombers.map((b) => b.model);
      const hits = this.raycaster.intersectObjects(models, true);
      if (hits.length) {
        const obj = hits[0].object;
        airTarget = obj.userData.bomberEntity || null;
        if (airTarget) {
          this.input.aimPoint.copy(hits[0].point);
          this.aimRayHit.copy(hits[0].point);
        }
      }
    }
    this.input.airTarget = airTarget;
    if (airTarget) return;

    const ray = this.raycaster.ray;
    const origin = ray.origin;
    const dir = ray.direction;
    let hit = null;
    let prev = origin.clone();
    let prevAbove = true;
    for (let t = 0; t < 700; t += 2.0) {
      const p = this._v.copy(origin).addScaledVector(dir, t);
      const h = this.world.height(p.x, p.z);
      if (p.y <= h) {
        // binary refine between previous sample and this one
        let a = Math.max(0, t - 2.0);
        let b = t;
        for (let i = 0; i < 7; i++) {
          const m = (a + b) * 0.5;
          const q = this._v2.copy(origin).addScaledVector(dir, m);
          if (q.y <= this.world.height(q.x, q.z)) b = m;
          else a = m;
        }
        hit = this._v2.copy(origin).addScaledVector(dir, b);
        break;
      }
      prev.copy(p);
      prevAbove = p.y > h;
    }
    if (!hit) {
      // ground-plane fallback for rays that miss the diorama
      if (Math.abs(dir.y) > 0.0001) {
        const t = (0 - origin.y) / dir.y;
        if (t > 0) hit = this._v.copy(origin).addScaledVector(dir, t);
      }
    }
    if (!hit) hit = this._v.set(this.player.position.x, this.player.position.y, this.player.position.z - 20);
    hit.x = clamp(hit.x, -this.world.half + 3, this.world.half - 3);
    hit.z = clamp(hit.z, -this.world.half + 3, this.world.half - 3);
    hit.y = this.world.height(hit.x, hit.z);
    this.input.aimPoint.copy(hit);
  }

  updateCamera(dt, snap = false) {
    if (this.state === 'intro') {
      this.introTime += dt;
      this.cameraYaw += dt * 0.032;
      this.cameraYawTarget = this.cameraYaw;
      this.cameraTarget.lerp(this._v.set(0, 6, 0), snap ? 1 : 1 - Math.exp(-2 * dt));
      this.viewSize = damp(this.viewSize, 238, 1.6, dt);
      this.targetViewSize = this.viewSize;
    } else {
      const player = this.player;
      const aimLead = this._v.copy(this.input.aimPoint).sub(player.position);
      aimLead.y = 0;
      const len = aimLead.length();
      if (len > 0.01) aimLead.multiplyScalar(Math.min(9, len * 0.12) / len);
      const desired = this._v2.set(player.position.x + aimLead.x, player.position.y + 2.2, player.position.z + aimLead.z);
      this.cameraTarget.lerp(desired, snap ? 1 : 1 - Math.exp(-4.5 * dt));
      this.cameraYaw = dampAngle(this.cameraYaw, this.cameraYawTarget, snap ? 1000 : 3.8, dt);
      this.viewSize = damp(this.viewSize, this.targetViewSize, snap ? 1000 : 4.2, dt);
    }
    this.input.cameraYaw = this.cameraYaw;

    this.shakeAmt = Math.max(0, this.shakeAmt - dt * 2.8);
    const shake = this.shakeAmt;
    const sx = (Math.random() - 0.5) * shake * 1.3;
    const sy = (Math.random() - 0.5) * shake * 1.1;
    const sz = (Math.random() - 0.5) * shake * 1.3;
    const cosP = Math.cos(this.cameraPitch);
    const sinP = Math.sin(this.cameraPitch);
    const offset = this._v3.set(
      Math.sin(this.cameraYaw) * cosP * this.cameraDistance,
      sinP * this.cameraDistance,
      Math.cos(this.cameraYaw) * cosP * this.cameraDistance,
    );
    this.camera.position.copy(this.cameraTarget).add(offset);
    this.camera.position.x += sx;
    this.camera.position.y += sy;
    this.camera.position.z += sz;
    this.camera.lookAt(this.cameraTarget);
    this.updateProjection();
  }

  updateProjection() {
    const aspect = window.innerWidth / window.innerHeight;
    const halfH = this.viewSize * 0.5;
    const halfW = halfH * aspect;
    this.camera.left = -halfW;
    this.camera.right = halfW;
    this.camera.top = halfH;
    this.camera.bottom = -halfH;
    this.camera.updateProjectionMatrix();
  }

  resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.8));
    this.renderer.setSize(w, h);
    if (this.camera) this.updateProjection();
  }

  shake(amount) {
    this.shakeAmt = Math.max(this.shakeAmt, amount);
  }

  updateSun() {
    const p = this.player ? this.player.position : this._v.set(0, 0, 0);
    this.sun.position.copy(p).add(this._sunOffset);
    this.sun.target.position.copy(p);
    this.sun.target.updateMatrixWorld();
    this.fill.position.set(p.x - 70, p.y + 60, p.z + 90);
  }

  // -------------------------------------------------------------------------
  // spawning / battle systems
  // -------------------------------------------------------------------------

  spawnInitialDefenders() {
    const outposts = this.world.outposts;
    const a = outposts.find((o) => o.id === 'A');
    const b = outposts.find((o) => o.id === 'B');
    const c = outposts.find((o) => o.id === 'C');
    this.spawnEnemyTank(a.x + 12, a.z + 13, a, { yaw: 0.2, alertRadius: 68 });
    this.spawnEnemyTank(b.x - 11, b.z + 16, b, { yaw: -0.1, alertRadius: 70 });
    this.spawnEnemyTank(b.x + 12, b.z + 8, b, { yaw: 0.4, alertRadius: 68 });
    this.spawnEnemyTank(c.x - 13, c.z + 12, c, { yaw: -0.3, alertRadius: 68 });
    this.spawnArtillery(a.x - 12, a.z - 12, a);
    this.spawnArtillery(c.x + 11, c.z - 13, c);
    // a lone patrol tank in the lowlands, near the central farm
    this.spawnEnemyTank(-15, -36, null, { yaw: Math.PI * 0.8, alertRadius: 52, alerted: false });

    this.playerSquad = this.spawnInfantry(7, 109, { count: 4, atCount: 1 });
    this.spawnEnemyInfantry(a.x + 6, a.z + 8, { count: 4, atCount: 1 });
    this.spawnEnemyInfantry(b.x - 7, b.z + 7, { count: 4, atCount: 1 });
    this.spawnEnemyInfantry(c.x + 6, c.z + 8, { count: 3, atCount: 1 });
  }

  spawnInfantry(x, z, opts = {}) {
    return new InfantrySquad(this, { x, z, ...opts, enemy: false });
  }

  spawnEnemyInfantry(x, z, opts = {}) {
    if (this.enemySquads.filter((s) => !s.dead).length >= 6) return null;
    return new InfantrySquad(this, { x, z, ...opts, enemy: true });
  }

  spawnGarrison(outpost) {
    if (outpost.garrison && !outpost.garrison.dead) {
      outpost.garrison.reinforce();
      return outpost.garrison;
    }
    const squad = new InfantrySquad(this, {
      x: outpost.x + 4,
      z: outpost.z + 4,
      count: 3,
      atCount: 0,
      name: `${outpost.name} garrison`,
      aggroRadius: 58,
      formationRadius: 7.2,
      formationAngle: Math.PI / 2,
    });
    squad.order = 'hold';
    squad.holdPoint.set(outpost.x, this.world.height(outpost.x, outpost.z), outpost.z);
    squad.home.copy(squad.holdPoint);
    outpost.garrison = squad;
    return squad;
  }

  spawnEnemyTank(x, z, outpost = null, opts = {}) {
    if (this.enemies.filter((e) => !e.dead).length >= 12) return null;
    const tank = new EnemyTank(this, { x, z, outpost, ...opts });
    this.enemies.push(tank);
    return tank;
  }

  spawnArtillery(x, z, outpost = null) {
    if (this.artilleries.filter((a) => !a.dead).length >= 5) return null;
    const art = new EnemyArtillery(this, { x, z, outpost });
    this.artilleries.push(art);
    return art;
  }

  spawnBomber(opts = {}) {
    if (this.bombers.filter((b) => !b.dead && !b.falling).length >= 2) return null;
    const target = opts.target || this.player.position;
    let angle;
    let dist = 210;
    if (opts.edge === 'west') angle = Math.PI;
    else if (opts.edge === 'east') angle = 0;
    else angle = -Math.PI / 2 + (Math.random() - 0.5) * 0.6;
    if (!opts.edge && Math.random() < 0.5) angle = Math.PI + (Math.random() - 0.5) * 0.6;
    const startX = clamp(target.x + Math.cos(angle) * dist, -this.world.half + 10, this.world.half - 10);
    const startZ = clamp(target.z + Math.sin(angle) * dist, -this.world.half + 10, this.world.half - 10);
    const b = new Bomber(this, {
      x: startX,
      z: startZ,
      y: 52,
      targetX: target.x + (Math.random() - 0.5) * 14,
      targetZ: target.z + (Math.random() - 0.5) * 14,
    });
    b.model.traverse((o) => { o.userData.bomberEntity = b; });
    this.bombers.push(b);
    this.hud.alert('Air raid warning', 'Enemy bomber inbound — keep moving', 4.5);
    this.hud.toast('Bomber inbound', 'Aim at the aircraft to lock the main gun', '✈', 'danger');
    this.audio.warning();
    return b;
  }

  spawnWave(extra = false) {
    this.waveIndex++;
    const count = extra ? 2 : 1 + Math.min(3, Math.floor(this.waveIndex / 2));
    const player = this.player;
    const gates = [
      { x: 0, z: -145, yaw: 0 },
      { x: -140, z: -58, yaw: 0.8 },
      { x: 140, z: -48, yaw: -0.8 },
      { x: -130, z: 60, yaw: -0.6 },
      { x: 128, z: 72, yaw: 0.6 },
      { x: 5, z: 148, yaw: Math.PI },
    ];
    for (let i = 0; i < count; i++) {
      let gate = gates[Math.floor(Math.random() * gates.length)];
      let attempts = 0;
      while (Math.hypot(gate.x - player.position.x, gate.z - player.position.z) < 85 && attempts < 10) {
        gate = gates[Math.floor(Math.random() * gates.length)];
        attempts++;
      }
      const heavy = this.waveIndex >= 3 && Math.random() < 0.3;
      const tank = this.spawnEnemyTank(gate.x + (Math.random() - 0.5) * 14, gate.z + (Math.random() - 0.5) * 14, null, {
        yaw: gate.yaw,
        alerted: true,
        alertRadius: 200,
        heavy,
      });
      if (tank) tank.alerted = true;
    }
    if (this.waveIndex >= 4 && Math.random() < 0.5) {
      const ridge = this.world.outposts[Math.floor(Math.random() * 3)];
      this.spawnArtillery(ridge.x + (Math.random() - 0.5) * 24, ridge.z - 16);
    }
    if (this.waveIndex % 2 === 0 && this.enemySquads.filter((s) => !s.dead).length < 6) {
      const gate = gates[Math.floor(Math.random() * gates.length)];
      const squad = this.spawnEnemyInfantry(gate.x + (Math.random() - 0.5) * 10, gate.z + (Math.random() - 0.5) * 10, {
        count: 3,
        atCount: 1,
      });
      if (squad) {
        squad.order = 'move';
        squad.moveTarget = new THREE.Vector3(player.position.x, this.world.height(player.position.x, player.position.z), player.position.z);
      }
    }
    this.hud.alert('Enemy counterattack', `Wave ${this.waveIndex} is moving up the valley`, 4);
    this.hud.toast('Enemy armor inbound', 'They are trying to retake the ridge', '⚑', 'danger');
    this.audio.warning();
    this.waveTimer = Math.max(24, 38 - this.waveIndex * 1.4);
  }

  triggerCounterattack(outpost) {
    this.scheduledSpawns.push({
      timer: 6.5,
      x: outpost.x + (Math.random() - 0.5) * 20,
      z: outpost.z + 20 + Math.random() * 12,
      heavy: true,
    });
    this.bomberTimer = Math.min(this.bomberTimer, 7);
    this.hud.alert('Counterattack ordered', 'Enemy armor is converging on the captured outpost', 4.5);
    this.hud.toast('Counterattack inbound', 'Hold what you have taken', '⚑', 'danger');
  }

  updateSpawns(dt) {
    this.waveTimer -= dt;
    if (this.waveTimer <= 0) this.spawnWave();
    this.bomberTimer -= dt;
    if (this.bomberTimer <= 0) {
      this.spawnBomber();
      this.bomberTimer = 52 + Math.random() * 18;
    }
    for (let i = this.scheduledSpawns.length - 1; i >= 0; i--) {
      const s = this.scheduledSpawns[i];
      s.timer -= dt;
      if (s.timer <= 0) {
        this.spawnEnemyTank(s.x, s.z, null, { alerted: true, alertRadius: 200, heavy: s.heavy, yaw: Math.PI });
        this.scheduledSpawns.splice(i, 1);
      }
    }
  }

  toggleBarrage() {
    if (this.input.barrageMode) {
      this.cancelBarrage();
      return;
    }
    if (!this.battery || !this.battery.ready) {
      this.hud.alert('Battery unavailable', this.barrageReason(this.battery?.status === 'DRY' ? 'no-missions' : 'cooldown'), 3);
      this.audio.warning();
      return;
    }
    this.input.barrageMode = true;
    this.input.aimMode = 'pointer';
    this.input.mouseDown = false;
    this.hud.setBarrageMode(true);
    this.audio.ui();
  }

  cancelBarrage() {
    if (!this.input.barrageMode) return;
    this.input.barrageMode = false;
    this.hud.setBarrageMode(false);
  }

  callBarrage() {
    if (!this.battery) return;
    const point = this.input.aimPoint.clone();
    const result = this.battery.call(point);
    if (!result.ok) {
      this.hud.alert('Fire mission denied', this.barrageReason(result.reason), 3);
      this.audio.warning();
      if (result.reason === 'no-missions' || result.reason === 'cooldown') this.cancelBarrage();
      return;
    }
    this.cancelBarrage();
    this.effects.addRing(
      new THREE.Vector3(point.x, this.world.height(point.x, point.z), point.z),
      { color: 0xffc46b, scale0: 2, scale1: 11, life: 1.3, opacity: 0.7 },
    );
    this.hud.toast('Fire mission', 'Battery One — three guns, rounds inbound', '✷', 'capture');
    this.audio.ui();
  }

  barrageReason(reason) {
    switch (reason) {
      case 'no-missions': return 'Battery dry — capture an outpost to resupply';
      case 'cooldown': return `Battery reloading — ${Math.ceil(this.battery?.cooldown ?? 0)}s`;
      case 'danger-close': return 'Target is too close to the tank';
      case 'unspotted': return 'No spotter with line of sight';
      default: return 'No valid target';
    }
  }

  orderSquad(point) {
    const squad = this.playerSquad;
    if (!squad || squad.dead) return;
    squad.order = 'move';
    squad.moveTarget = new THREE.Vector3(point.x, this.world.height(point.x, point.z), point.z);
    squad.holdPoint.copy(squad.moveTarget);
    this.effects.addRing(new THREE.Vector3(point.x, this.world.height(point.x, point.z), point.z), {
      color: 0x8fe0c8, scale0: 1.2, scale1: 6.5, life: 0.9, opacity: 0.65,
    });
    this.audio.ui();
  }

  regroupSquad() {
    const squad = this.playerSquad;
    if (!squad || squad.dead) return;
    squad.order = 'follow';
    squad.moveTarget = null;
    this.audio.ui();
    if (!this._regroupAt || this.elapsed - this._regroupAt > 4) {
      this._regroupAt = this.elapsed;
      this.hud.toast('Squad regrouped', 'Able squad is falling in behind the tank', '▲', 'capture');
    }
  }

  updateCapture(dt) {
    this.captureInfo = null;
    if (this.player.dead) return;
    for (const o of this.world.outposts) {
      if (o.owner === 'player') {
        o.contested = false;
        continue;
      }
      const dx = this.player.position.x - o.x;
      const dz = this.player.position.z - o.z;
      const dist = Math.hypot(dx, dz);
      const squad = this.playerSquad;
      const tankInZone = dist < o.captureRadius;
      const squadInZone = !!squad && !squad.dead && squad.hasSoldierNear(o.x, o.z, o.captureRadius);
      const inZone = tankInZone || squadInZone;
      const enemyInfantryNear = this.enemySquads.some((s) => !s.dead && s.hasSoldierNear(o.x, o.z, o.captureRadius + 2));
      const enemiesNear = this.enemies.some((e) => !e.dead && Math.hypot(e.position.x - o.x, e.position.z - o.z) < 31)
        || this.artilleries.some((a) => !a.dead && Math.hypot(a.position.x - o.x, a.position.z - o.z) < 34)
        || enemyInfantryNear;
      o.contested = inZone && enemiesNear;
      o.ringMat.color.setHex(o.contested ? 0xe66a2c : 0xa83828);
      o.innerMat.color.setHex(o.contested ? 0xe66a2c : 0xa83828);
      o.progress = advanceCapture(o.progress, dt, { inZone, enemiesNear, tankInZone, squadInZone });
      if (inZone) {
        this.captureInfo = {
          outpost: o,
          progress: o.progress,
          contested: enemiesNear,
          tankInZone,
          squadInZone,
        };
        if (o.progress >= 1) this.captureOutpost(o);
      }
    }
  }

  captureOutpost(o) {
    if (o.owner === 'player') return;
    o.owner = 'player';
    o.progress = 1;
    o.contested = false;
    o.capturePulse = 0.8;
    this.world.setOutpostOwner(o, 'player');
    this.stats.captures++;
    this.hud.setCaptureCount(this.stats.captures);
    const held = Math.round(this.world.territory.playerShare * 100);
    this.hud.toast(`Outpost ${o.name} secured`, `Garrison deployed · squad resupplied — flak online · ${held}% held`, '⚑', 'capture');
    this.hud.alert(`Outpost ${o.name} captured`, 'Garrison holding the ring — push to the next outpost', 4);
    this.audio.capture();
    this.player.repair(38);
    this.playerSquad?.reinforce();
    this.battery?.resupply(1);
    this.spawnGarrison(o);
    this.effects.explosion(new THREE.Vector3(o.x, o.y + 5, o.z), { size: 0.6, ground: false, debris: false });
    this.effects.addRing(new THREE.Vector3(o.x, o.y, o.z), { color: 0x7ac7b0, scale0: 2, scale1: 20, life: 1.4, opacity: 0.7 });
    for (let i = 0; i < 10; i++) {
      const a = Math.random() * TAU;
      this.effects.glow.spawn({
        position: new THREE.Vector3(o.x + Math.cos(a) * 2, o.y + 4 + Math.random() * 4, o.z + Math.sin(a) * 2),
        velocity: new THREE.Vector3(Math.cos(a) * 2, 3 + Math.random() * 4, Math.sin(a) * 2),
        gravity: -2,
        life: 1.4 + Math.random(),
        scale0: 0.25,
        scale1: 0.02,
        color: 0x9be2cb,
      });
    }
    this.triggerCounterattack(o);
    if (this.world.outposts.every((out) => out.owner === 'player')) {
      this.victoryTimer = 1.8;
    }
  }

  updateFlak(dt) {
    for (const o of this.world.outposts) {
      if (o.owner !== 'player') continue;
      const flak = o.flak;
      const u = flak.userData;
      let target = null;
      let best = 150;
      for (const b of this.bombers) {
        if (b.dead || b.falling) continue;
        const d = b.position.distanceTo(new THREE.Vector3(o.x, o.y + 2, o.z));
        if (d < best) {
          best = d;
          target = b;
        }
      }
      if (!target) {
        u.targeting = false;
        u.barrels.rotation.x = damp(u.barrels.rotation.x, 0, 2, dt);
        u.muzzleFlash.intensity = 0;
        continue;
      }
      u.targeting = true;
      const flakWorld = flak.getWorldPosition(this._v);
      const dx = target.position.x - flakWorld.x;
      const dz = target.position.z - flakWorld.z;
      const dist = Math.hypot(dx, dz);
      const desiredWorldYaw = Math.atan2(dx, dz);
      const baseYaw = o.rotation + flak.rotation.y;
      u.yawGroup.rotation.y = dampAngle(u.yawGroup.rotation.y, shortestAngle(baseYaw, desiredWorldYaw), 5, dt);
      const pitch = Math.atan2(target.position.y - (o.y + 1.8), Math.max(8, dist));
      u.barrels.rotation.x = damp(u.barrels.rotation.x, -pitch, 5, dt);
      u.fireTimer = (u.fireTimer ?? Math.random() * 0.8) - dt;
      if (u.fireTimer <= 0 && dist < 145) {
        u.fireTimer = 0.55 + Math.random() * 0.45;
        const muzzlePos = u.muzzle.getWorldPosition(this._v2.clone());
        this.effects.muzzleFlash(muzzlePos, target.position.clone().sub(muzzlePos).normalize(), 0.55);
        this.effects.tracer(muzzlePos, target.position.clone().add(new THREE.Vector3((Math.random() - 0.5) * 3, (Math.random() - 0.5) * 3, (Math.random() - 0.5) * 3)), 0xffd18a, 1.2);
        // flak puff
        this.effects.smoke.spawn({
          position: target.position.clone().add(new THREE.Vector3((Math.random() - 0.5) * 7, (Math.random() - 0.5) * 7, (Math.random() - 0.5) * 7)),
          velocity: new THREE.Vector3(0, 0.4, 0),
          life: 1.3,
          scale0: 1.1,
          scale1: 3.4,
          opacity: 0.3,
          color: 0x2b2823,
        });
        if (Math.random() < 0.62) {
          target.takeDamage(8 + Math.random() * 4, target.position.clone(), false);
        }
        if (this.player.position.distanceTo(flakWorld) < 90) this.audio.flak();
      }
      u.muzzleFlash.intensity = 0;
    }
  }

  updateOutpostVisuals(dt) {
    for (const o of this.world.outposts) {
      if (o.owner === 'player') continue;
      // enemies inside ring make the marker glow orange via world update, handled in updateCapture
    }
  }

  flattenBarnsNear(position, radius) {
    for (const barn of this.world.barns) {
      if (barn.destroyed) continue;
      const d = Math.hypot(barn.x - position.x, barn.z - position.z);
      if (d < radius + 4.8) this.world.destroyBarn(barn, this);
    }
  }

  alertEnemiesNear(position, radius) {
    if (radius <= 0) return;
    for (const e of this.enemies) {
      if (!e.dead && e.position.distanceTo(position) < radius) e.alerted = true;
    }
    for (const a of this.artilleries) {
      if (!a.dead && a.position.distanceTo(position) < radius + 40) a.alerted = true;
    }
  }

  // -------------------------------------------------------------------------
  // projectile helpers
  // -------------------------------------------------------------------------

  spawnShell(opts) {
    const shell = new Shell(this, opts);
    this.projectiles.push(shell);
    return shell;
  }

  spawnBomb(opts) {
    const bomb = new Bomb(this, opts);
    this.projectiles.push(bomb);
    return bomb;
  }

  createDangerMarker(x, z, radius, life) {
    return createDangerMarker(this.scene, this.world, x, z, radius, life);
  }

  removeProjectile(p) {
    const idx = this.projectiles.indexOf(p);
    if (idx >= 0) this.projectiles.splice(idx, 1);
  }

  removeBomber(b) {
    const idx = this.bombers.indexOf(b);
    if (idx >= 0) this.bombers.splice(idx, 1);
  }

  onEnemyKilled() {}
  onBomberKilled() {}
  onBomberLeft() {}

  // -------------------------------------------------------------------------
  // update / render
  // -------------------------------------------------------------------------

  update(dt) {
    if (this.state === 'intro') {
      this.world.update(dt, this.introTime);
      this.effects.update(dt);
      this.updateCamera(dt);
      this.updateSun();
      this.updateDust(dt);
      return;
    }
    if (this.state === 'paused') {
      return;
    }
    if (this.state === 'playing') {
      this.elapsed += dt;
      this.updateCameraKeys(dt);
      this.updateAim();
      this.player.update(dt);
      this.battery?.update(dt);
      for (const squad of this.playerSquads) squad.update(dt);
      for (const squad of this.enemySquads) squad.update(dt);
      for (const e of this.enemies) e.update(dt);
      for (const a of this.artilleries) a.update(dt);
      for (let i = this.bombers.length - 1; i >= 0; i--) {
        const b = this.bombers[i];
        b.update(dt);
      }
      for (let i = this.projectiles.length - 1; i >= 0; i--) {
        const p = this.projectiles[i];
        if (p) p.update(dt);
      }
      this.updateSpawns(dt);
      this.updateCapture(dt);
      this.updateFlak(dt);
      this.effects.update(dt);
      this.world.update(dt, this.elapsed);
      this.updateDust(dt);
      this.updateCamera(dt);
      this.updateSun();
      this.hud.update(this.player, this);
      if (this.input.aimMode === 'pointer') {
        this.hud.setCrosshair(this.input.mouse.x, this.input.mouse.y, {
          airLock: !!this.input.airTarget,
          overUI: this.input.overUI,
          barrage: this.input.barrageMode,
        });
      } else {
        this.camera.updateMatrixWorld();
        this._v.copy(this.input.aimPoint).project(this.camera);
        this.hud.setCrosshair(
          (this._v.x * 0.5 + 0.5) * window.innerWidth,
          (-this._v.y * 0.5 + 0.5) * window.innerHeight,
          { airLock: false, overUI: false, barrage: this.input.barrageMode },
        );
      }
      if (this.victoryTimer > 0) {
        this.victoryTimer -= dt;
        if (this.victoryTimer <= 0) this.endGame(true);
      }
      return;
    }
    if (this.state === 'ended') {
      this.effects.update(dt);
      this.world.update(dt, this.elapsed);
      this.updateDust(dt);
      this.updateCamera(dt);
      this.updateSun();
      this.endDelay -= dt;
      if (this.endDelay <= 0 && !this.endVisible) {
        this.endVisible = true;
        this.hud.showEnd(this.victory, this.stats, this.elapsed);
      }
    }
  }

  updateDust(dt) {
    if (!this.dustMotes) return;
    const pos = this.dustMotes.geometry.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      let x = pos.getX(i);
      let y = pos.getY(i);
      let z = pos.getZ(i);
      x += Math.sin(this.elapsed * 0.2 + i * 0.7) * dt * 0.35;
      y += Math.cos(this.elapsed * 0.17 + i * 0.3) * dt * 0.08;
      z += Math.cos(this.elapsed * 0.16 + i * 0.4) * dt * 0.2;
      if (x > this.world.half) x -= this.world.size;
      if (x < -this.world.half) x += this.world.size;
      if (z > this.world.half) z -= this.world.size;
      if (z < -this.world.half) z += this.world.size;
      const h = this.world.height(x, z);
      if (y < h + 1) y = h + 1 + Math.random() * 8;
      pos.setXYZ(i, x, y, z);
    }
    pos.needsUpdate = true;
  }

  animate(now) {
    requestAnimationFrame(this.animate);
    const dt = Math.min(0.05, Math.max(0.0001, (now - this.lastFrame) / 1000));
    this.lastFrame = now;
    this.update(dt);
    this.renderer.render(this.scene, this.camera);
    if (this.firstRender) {
      this.firstRender = false;
    }
  }
}

window.__tankCountry = new Game();
