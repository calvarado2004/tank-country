import * as THREE from 'three';
import {
  TAU, clamp, lerp, smoothstep, damp, makeRng, fbm2, valueNoise2, makeCanvas, canvasTexture,
  setShadow, mesh, group, randomPointInDisc, makeMat, formatTime, mergeStaticGroup,
} from './utils.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import {
  MAT, createBarn, createSilo, createFarmhouse, createChurch, createWindmill, createWaterTower,
  createTelephonePole, createTree, createRock, createFence, createSandbagWall, createTent,
  createCrateStack, createWatchtower, createHangar, createBunker, createRadarDish, createHayBale,
  createTractor, createGasPump, createRoadSign, createFlag, createFlakGun, createTank,
} from './models.js';
import { Territory } from './territory.js';

const WORLD_SIZE = 320;
const SEGMENTS = 224;
const HALF = WORLD_SIZE / 2;
const BOTTOM_Y = -16;
const UP_AXIS = new THREE.Vector3(0, 1, 0);

function makeDirtTexture() {
  const c = makeCanvas(512, 512);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#7d715c';
  ctx.fillRect(0, 0, 512, 512);
  const rng = makeRng(44);
  for (let i = 0; i < 5000; i++) {
    const x = rng.next() * 512;
    const y = rng.next() * 512;
    const r = 0.4 + rng.next() * 2.2;
    const v = rng.next();
    ctx.fillStyle = v > 0.7 ? 'rgba(65,52,37,0.22)' : v > 0.35 ? 'rgba(196,174,135,0.18)' : 'rgba(120,98,67,0.16)';
    ctx.beginPath();
    ctx.arc(x, y, r, 0, TAU);
    ctx.fill();
  }
  // faint longitudinal ruts
  ctx.strokeStyle = 'rgba(78,61,42,0.12)';
  ctx.lineWidth = 4;
  for (const x of [130, 190, 320, 380]) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.bezierCurveTo(x + 18, 170, x - 12, 350, x + 4, 512);
    ctx.stroke();
  }
  // soft, irregular shoulders so the road blends into the ground
  ctx.globalCompositeOperation = 'destination-in';
  const mask = ctx.createLinearGradient(0, 0, 512, 0);
  mask.addColorStop(0, 'rgba(0,0,0,0)');
  mask.addColorStop(0.12, 'rgba(0,0,0,0.55)');
  mask.addColorStop(0.26, 'rgba(0,0,0,1)');
  mask.addColorStop(0.74, 'rgba(0,0,0,1)');
  mask.addColorStop(0.88, 'rgba(0,0,0,0.55)');
  mask.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = mask;
  ctx.fillRect(0, 0, 512, 512);
  return canvasTexture(c, { repeat: true });
}

function makeGroundDetailTexture() {
  const size = 1024;
  const c = makeCanvas(size, size);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#d8d1c0';
  ctx.fillRect(0, 0, size, size);
  const rng = makeRng(77);
  // broad tonal patches
  for (let i = 0; i < 110; i++) {
    const x = rng.next() * size;
    const y = rng.next() * size;
    const r = 20 + rng.next() * 110;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    const dark = rng.chance(0.5);
    g.addColorStop(0, dark ? `rgba(102,94,70,${0.025 + rng.next() * 0.04})` : `rgba(255,248,224,${0.02 + rng.next() * 0.04})`);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  // clods and pebbles
  for (let i = 0; i < 12000; i++) {
    const x = rng.next() * size;
    const y = rng.next() * size;
    const r = 0.4 + rng.next() * 3.2;
    const v = rng.next();
    ctx.fillStyle = v > 0.72 ? `rgba(64,56,40,${0.12 + rng.next() * 0.22})` : v > 0.38 ? `rgba(192,174,137,${0.08 + rng.next() * 0.18})` : `rgba(255,250,232,${0.05 + rng.next() * 0.18})`;
    ctx.beginPath();
    ctx.ellipse(x, y, r, r * (0.5 + rng.next() * 0.6), rng.next() * TAU, 0, TAU);
    ctx.fill();
  }
  // dry grass strokes
  for (let i = 0; i < 1800; i++) {
    const x = rng.next() * size;
    const y = rng.next() * size;
    const a = -Math.PI / 2 + (rng.next() - 0.5) * 1.2;
    const len = 2 + rng.next() * 7;
    ctx.strokeStyle = rng.chance(0.5) ? `rgba(96,91,54,${0.08 + rng.next() * 0.16})` : `rgba(209,190,128,${0.06 + rng.next() * 0.15})`;
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len);
    ctx.stroke();
  }
  return canvasTexture(c, { repeat: true });
}

function makeGroundBumpTexture() {
  const size = 512;
  const c = makeCanvas(size, size);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#7d7d7d';
  ctx.fillRect(0, 0, size, size);
  const rng = makeRng(78);
  for (let i = 0; i < 7000; i++) {
    const x = rng.next() * size;
    const y = rng.next() * size;
    const r = 0.5 + rng.next() * 4;
    const v = rng.next();
    ctx.fillStyle = v > 0.5 ? `rgba(170,170,170,${0.08 + rng.next() * 0.2})` : `rgba(60,60,60,${0.06 + rng.next() * 0.2})`;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, TAU);
    ctx.fill();
  }
  for (let i = 0; i < 500; i++) {
    const x = rng.next() * size;
    const y = rng.next() * size;
    ctx.strokeStyle = `rgba(200,200,200,${0.05 + rng.next() * 0.12})`;
    ctx.lineWidth = 0.7;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + (rng.next() - 0.5) * 10, y + (rng.next() - 0.5) * 10);
    ctx.stroke();
  }
  const tex = canvasTexture(c);
  tex.colorSpace = THREE.NoColorSpace;
  return tex;
}

function makeScorchTexture() {
  const c = makeCanvas(256, 256);
  const ctx = c.getContext('2d');
  const rng = makeRng(10);
  const g = ctx.createRadialGradient(128, 128, 8, 128, 128, 124);
  g.addColorStop(0, 'rgba(21,18,13,0.9)');
  g.addColorStop(0.42, 'rgba(36,30,20,0.62)');
  g.addColorStop(0.72, 'rgba(56,45,29,0.24)');
  g.addColorStop(1, 'rgba(56,45,29,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 140; i++) {
    const a = rng.next() * TAU;
    const r = 10 + rng.next() * 108;
    const x = 128 + Math.cos(a) * r;
    const y = 128 + Math.sin(a) * r;
    ctx.fillStyle = `rgba(20,16,11,${rng.next() * 0.24})`;
    ctx.beginPath();
    ctx.arc(x, y, 1 + rng.next() * 8, 0, TAU);
    ctx.fill();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function makeFieldTexture() {
  const c = makeCanvas(256, 512);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#8b6f48';
  ctx.fillRect(0, 0, 256, 512);
  const rng = makeRng(99);
  for (let y = 0; y < 512; y += 16) {
    ctx.fillStyle = y % 32 === 0 ? 'rgba(194,165,96,0.62)' : 'rgba(107,83,50,0.54)';
    ctx.fillRect(0, y, 256, 8);
    for (let i = 0; i < 45; i++) {
      const x = rng.next() * 256;
      ctx.fillStyle = 'rgba(212,184,113,0.35)';
      ctx.fillRect(x, y + 2 + rng.next() * 5, 1.2, 5);
    }
  }
  return canvasTexture(c, { repeat: true });
}

function makeGrassGeometry() {
  const positions = [];
  const uvs = [];
  const colors = [];
  const rng = makeRng(818);
  for (let b = 0; b < 7; b++) {
    const a = rng.next() * TAU;
    const height = 0.3 + rng.next() * 0.7;
    const width = 0.035 + rng.next() * 0.035;
    const bend = (rng.next() - 0.5) * 0.38;
    const x = Math.cos(a) * 0.08;
    const z = Math.sin(a) * 0.08;
    const dx = Math.cos(a + Math.PI / 2) * width;
    const dz = Math.sin(a + Math.PI / 2) * width;
    const tipX = x + Math.cos(a) * bend;
    const tipZ = z + Math.sin(a) * bend;
    positions.push(x - dx, 0, z - dz, x + dx, 0, z + dz, tipX, height, tipZ);
    uvs.push(0, 0, 1, 0, 0.5, 1);
    const shade = 0.72 + rng.next() * 0.28;
    colors.push(0.58 * shade, 0.6 * shade, 0.36 * shade, 0.58 * shade, 0.6 * shade, 0.36 * shade, 0.8 * shade, 0.75 * shade, 0.46 * shade);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  return geo;
}

function makePebbleGeometry() {
  const geo = new THREE.DodecahedronGeometry(0.5, 0);
  const p = geo.attributes.position;
  const rng = makeRng(99);
  for (let i = 0; i < p.count; i++) {
    p.setXYZ(i, p.getX(i) * (0.7 + rng.next() * 0.5), p.getY(i) * (0.4 + rng.next() * 0.3), p.getZ(i) * (0.7 + rng.next() * 0.5));
  }
  geo.computeVertexNormals();
  return geo;
}

export class World {
  constructor(scene, effects, audio) {
    this.scene = scene;
    this.effects = effects;
    this.audio = audio;
    this.size = WORLD_SIZE;
    this.half = HALF;
    this.segments = SEGMENTS;
    this.cell = WORLD_SIZE / SEGMENTS;
    this.colliders = [];
    this.barns = [];
    this.outposts = [];
    this.flags = [];
    this.windmills = [];
    this.radars = [];
    this.roadSamples = [];
    this.staticProps = [];
    this.time = 0;
    this.playerStart = new THREE.Vector3(0, 0, 106);
    this.playerBase = { x: 0, z: 112 };
    this.rng = makeRng(1957);
    this.scorchTexture = makeScorchTexture();
    this.fieldTexture = makeFieldTexture();
    this.groundDetail = makeGroundDetailTexture();
    this.groundDetail.wrapS = THREE.RepeatWrapping;
    this.groundDetail.wrapT = THREE.RepeatWrapping;
    this.groundDetail.repeat.set(36, 36);

    this.defineLayout();
    this.buildHeightfield();
    this.buildTerrainMesh();
    this.buildDioramaSides();
    this.buildRoads();
    this.buildGroundDetails();
    this.buildOutposts();
    this.buildBarns();
    this.buildVillage();
    this.buildPlayerBase();
    this.territory = new Territory(this);
    this.buildFields();
    this.scatterNature();
    this.buildTelephoneLine();
    this.seedBattleScars();
    this.playerStart.y = this.height(this.playerStart.x, this.playerStart.z);
  }

  // -------------------------------------------------------------------------
  // layout + terrain
  // -------------------------------------------------------------------------

  defineLayout() {
    this.outpostDefs = [
      { id: 'A', name: 'Alpha', subtitle: 'West ridge', x: -80, z: -84, rotation: 0.12 },
      { id: 'B', name: 'Bravo', subtitle: 'High pass', x: 0, z: -112, rotation: -0.06 },
      { id: 'C', name: 'Charlie', subtitle: 'East ridge', x: 82, z: -86, rotation: -0.15 },
    ];

    this.barnDefs = [
      { x: -57, z: 27, rotation: 0.35, name: 'Hollis Barn' },
      { x: 55, z: 34, rotation: -0.48, name: 'Kessler Barn' },
      { x: -22, z: -31, rotation: 0.08, name: 'Meadow Barn' },
      { x: 86, z: 4, rotation: 0.85, name: 'East Field Barn' },
    ];

    this.pads = [
      { x: 0, z: 112, radius: 27, feather: 16, target: null },
      { x: 36, z: 70, radius: 19, feather: 11, target: null },
      ...this.outpostDefs.map((o) => ({ x: o.x, z: o.z, radius: 17, feather: 11, target: null })),
      ...this.barnDefs.map((b) => ({ x: b.x, z: b.z, radius: 12, feather: 9, target: null })),
    ];

    // outpost pads are high terraces; barns and base sit at their own local height
    for (const pad of this.pads) pad.target = this.rawHeight(pad.x, pad.z);

    this.clearZones = [
      { x: 0, z: 112, r: 38 },
      { x: 36, z: 70, r: 27 },
      ...this.outpostDefs.map((o) => ({ x: o.x, z: o.z, r: 25 })),
      ...this.barnDefs.map((b) => ({ x: b.x, z: b.z, r: 18 })),
    ];
  }

  rawHeight(x, z) {
    let h = fbm2(x * 0.014 + 11.7, z * 0.014 - 4.1, 4, 2.03, 0.5) * 2.7;
    h += fbm2(x * 0.045 - 3.2, z * 0.045 + 8.9, 3, 2.1, 0.52) * 0.55;
    const ridge = smoothstep(-14, -118, z);
    h += ridge * 17.2;
    h += ridge * 2.8 * Math.sin((x + 36) * 0.026) + ridge * 1.5 * Math.cos(x * 0.061 + 1.7);
    h += ridge * fbm2(x * 0.023 + 9, z * 0.023, 3) * 4.5;
    // three shoulders for the ridgeline outposts
    for (const o of this.outpostDefs || []) {
      const d2 = (x - o.x) ** 2 + (z - o.z) ** 2;
      h += 3.7 * Math.exp(-d2 / (2 * 31 * 31));
    }
    // east / west rim rises a little, making the valley feel enclosed
    h += smoothstep(112, 156, Math.abs(x)) * 3.2;
    // dry wash through the lowlands
    const wash = Math.exp(-((z - 51 + Math.sin(x * 0.03) * 9) ** 2) / (2 * 9 * 9));
    h -= wash * 1.15;
    return h;
  }

  heightAtRaw(x, z) {
    let h = this.rawHeight(x, z);
    for (const pad of this.pads) {
      const d = Math.hypot(x - pad.x, z - pad.z);
      if (d < pad.radius + pad.feather) {
        const t = 1 - smoothstep(pad.radius, pad.radius + pad.feather, d);
        h = lerp(h, pad.target, t);
      }
    }
    return h;
  }

  buildHeightfield() {
    this.n = SEGMENTS + 1;
    this.heights = new Float32Array(this.n * this.n);
    this.baseHeights = new Float32Array(this.n * this.n);
    for (let j = 0; j < this.n; j++) {
      for (let i = 0; i < this.n; i++) {
        const x = -HALF + i * this.cell;
        const z = -HALF + j * this.cell;
        const h = this.heightAtRaw(x, z);
        this.heights[j * this.n + i] = h;
        this.baseHeights[j * this.n + i] = h;
      }
    }
    this.minHeight = Infinity;
    this.maxHeight = -Infinity;
    for (let i = 0; i < this.heights.length; i++) {
      const h = this.heights[i];
      if (h < this.minHeight) this.minHeight = h;
      if (h > this.maxHeight) this.maxHeight = h;
    }
  }

  height(x, z) {
    const fx = clamp((x + HALF) / this.cell, 0, SEGMENTS - 0.0001);
    const fz = clamp((z + HALF) / this.cell, 0, SEGMENTS - 0.0001);
    const i = Math.floor(fx);
    const j = Math.floor(fz);
    const tx = fx - i;
    const tz = fz - j;
    const n = this.n;
    const h00 = this.heights[j * n + i];
    const h10 = this.heights[j * n + i + 1];
    const h01 = this.heights[(j + 1) * n + i];
    const h11 = this.heights[(j + 1) * n + i + 1];
    return lerp(lerp(h00, h10, tx), lerp(h01, h11, tx), tz);
  }

  normal(x, z, e = 0.9) {
    const hl = this.height(x - e, z);
    const hr = this.height(x + e, z);
    const hd = this.height(x, z - e);
    const hu = this.height(x, z + e);
    return new THREE.Vector3(hl - hr, 2 * e, hd - hu).normalize();
  }

  slope(x, z) {
    const n = this.normal(x, z);
    return 1 - n.y;
  }

  buildTerrainMesh() {
    const n = this.n;
    const geo = new THREE.BufferGeometry();
    const positions = new Float32Array(n * n * 3);
    const colors = new Float32Array(n * n * 3);
    const uvs = new Float32Array(n * n * 2);
    this.terrainBaseColors = new Float32Array(n * n * 3);
    const palette = {
      grass: new THREE.Color(0x8a8b5d),
      dry: new THREE.Color(0xa28c63),
      ridge: new THREE.Color(0xb0a173),
      rock: new THREE.Color(0x746d5d),
      darkGrass: new THREE.Color(0x67704b),
      dust: new THREE.Color(0xb8a279),
      meadow: new THREE.Color(0x97935f),
    };
    const tmp = new THREE.Color();
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        const idx = j * n + i;
        const x = -HALF + i * this.cell;
        const z = -HALF + j * this.cell;
        const h = this.heights[idx];
        positions[idx * 3] = x;
        positions[idx * 3 + 1] = h;
        positions[idx * 3 + 2] = z;
        uvs[idx * 2] = (x + HALF) / WORLD_SIZE;
        uvs[idx * 2 + 1] = (z + HALF) / WORLD_SIZE;

        const slope = this.slope(x, z);
        const v = valueNoise2(x * 0.06 + 2, z * 0.06 - 4) * 0.5 + 0.5;
        const big = fbm2(x * 0.017 + 7, z * 0.017 - 2, 3) * 0.5 + 0.5;
        const hFactor = smoothstep(-2, 20, h);
        tmp.copy(palette.dry).lerp(palette.grass, big * 0.72);
        tmp.lerp(palette.meadow, smoothstep(0.48, 0.82, big) * 0.35);
        tmp.lerp(palette.darkGrass, smoothstep(0.55, 0.9, v) * 0.3);
        tmp.lerp(palette.ridge, hFactor * 0.58);
        tmp.lerp(palette.rock, smoothstep(0.18, 0.65, slope) * 0.82);
        tmp.lerp(palette.dust, smoothstep(0.35, 0.7, fbm2(x * 0.03 - 4, z * 0.03 + 9, 2) * 0.5 + 0.5) * 0.24);
        tmp.offsetHSL(0, 0.015, (v - 0.5) * 0.06);
        colors[idx * 3] = tmp.r;
        colors[idx * 3 + 1] = tmp.g;
        colors[idx * 3 + 2] = tmp.b;
        this.terrainBaseColors[idx * 3] = tmp.r;
        this.terrainBaseColors[idx * 3 + 1] = tmp.g;
        this.terrainBaseColors[idx * 3 + 2] = tmp.b;
      }
    }
    const indices = [];
    for (let j = 0; j < SEGMENTS; j++) {
      for (let i = 0; i < SEGMENTS; i++) {
        const a = j * n + i;
        const b = a + 1;
        const c = a + n;
        const d = c + 1;
        indices.push(a, c, b, b, c, d);
      }
    }
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    geo.setIndex(indices);
    geo.computeVertexNormals();
    geo.computeBoundingSphere();

    const detail = this.groundDetail;
    detail.anisotropy = 8;
    detail.repeat.set(14, 14);
    const bump = makeGroundBumpTexture();
    bump.anisotropy = 8;
    bump.repeat.set(22, 22);
    const mat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      map: detail,
      bumpMap: bump,
      bumpScale: 0.16,
      roughness: 1,
      metalness: 0,
    });
    this.terrain = new THREE.Mesh(geo, mat);
    this.terrain.receiveShadow = true;
    this.terrain.castShadow = true;
    this.terrain.name = 'terrain';
    this.scene.add(this.terrain);
    this.terrainGeo = geo;
    this.terrainPositions = positions;
    this.terrainColors = colors;
  }

  buildDioramaSides() {
    const n = this.n;
    const wallMat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.98,
      metalness: 0,
    });
    const sideColors = [
      new THREE.Color(0x746047), // topsoil
      new THREE.Color(0x8f6c4a),
      new THREE.Color(0x79513a),
      new THREE.Color(0x5c4433),
      new THREE.Color(0x433a31),
      new THREE.Color(0x2e2b27),
    ];
    const edges = [
      { name: 'north', fixed: -HALF, along: 'x', out: new THREE.Vector3(0, 0, -1) },
      { name: 'south', fixed: HALF, along: 'x', out: new THREE.Vector3(0, 0, 1) },
      { name: 'west', fixed: -HALF, along: 'z', out: new THREE.Vector3(-1, 0, 0) },
      { name: 'east', fixed: HALF, along: 'z', out: new THREE.Vector3(1, 0, 0) },
    ];
    const groupAll = new THREE.Group();
    for (const edge of edges) {
      const positions = [];
      const colors = [];
      const indices = [];
      const count = SEGMENTS;
      const levels = 14;
      for (let k = 0; k <= count; k++) {
        const a = -HALF + k * this.cell;
        let x, z, top;
        if (edge.along === 'x') {
          x = a;
          z = edge.fixed;
          top = this.height(x, z);
        } else {
          x = edge.fixed;
          z = a;
          top = this.height(x, z);
        }
        for (let l = 0; l <= levels; l++) {
          const t = l / levels;
          const y = lerp(top, BOTTOM_Y, t);
          positions.push(x, y, z);
          let c;
          if (t < 0.13) c = sideColors[0];
          else if (t < 0.36) c = sideColors[1];
          else if (t < 0.56) c = sideColors[2];
          else if (t < 0.76) c = sideColors[3];
          else if (t < 0.9) c = sideColors[4];
          else c = sideColors[5];
          const noise = valueNoise2(a * 0.13, t * 9 + k * 0.3) * 0.04;
          colors.push(c.r + noise, c.g + noise, c.b + noise);
        }
      }
      const stride = levels + 1;
      for (let k = 0; k < count; k++) {
        for (let l = 0; l < levels; l++) {
          const a = k * stride + l;
          const b = (k + 1) * stride + l;
          const c = a + 1;
          const d = b + 1;
          if (edge.along === 'x') {
            if (edge.fixed < 0) indices.push(a, b, c, b, d, c);
            else indices.push(a, c, b, b, c, d);
          } else {
            if (edge.fixed < 0) indices.push(a, c, b, b, c, d);
            else indices.push(a, b, c, b, d, c);
          }
        }
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
      geo.setIndex(indices);
      geo.computeVertexNormals();
      const wall = new THREE.Mesh(geo, wallMat);
      wall.receiveShadow = true;
      wall.castShadow = false;
      groupAll.add(wall);
    }

    // soil base plinth
    const plinthMat = makeMat(0x2d2a25, { roughness: 0.82, metalness: 0.1 });
    const plinth = mesh(new THREE.BoxGeometry(WORLD_SIZE + 7, 2.4, WORLD_SIZE + 7), plinthMat, 0, BOTTOM_Y - 1.2, 0);
    plinth.castShadow = false;
    plinth.receiveShadow = true;
    groupAll.add(plinth);
    const trimMat = makeMat(0x6e5b3f, { roughness: 0.6, metalness: 0.25 });
    const trim = mesh(new THREE.BoxGeometry(WORLD_SIZE + 8.2, 0.16, WORLD_SIZE + 8.2), trimMat, 0, BOTTOM_Y - 2.3, 0);
    groupAll.add(trim);
    this.scene.add(groupAll);
    this.dioramaSides = groupAll;
  }

  // -------------------------------------------------------------------------
  // roads
  // -------------------------------------------------------------------------

  buildRoads() {
    this.roadMat = new THREE.MeshStandardMaterial({
      map: makeDirtTexture(),
      color: 0xc7b89c,
      roughness: 1,
      metalness: 0,
      transparent: true,
      opacity: 0.96,
      depthWrite: false,
      side: THREE.DoubleSide,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    });
    this.roadMat.map.repeat.set(1, 1);
    this.trackMat = new THREE.MeshStandardMaterial({
      color: 0x5c513e,
      roughness: 1,
      transparent: true,
      opacity: 0.5,
      depthWrite: false,
      side: THREE.DoubleSide,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    });

    const mainPts = [
      [2, 140], [1, 108], [-2, 78], [4, 48], [-3, 16], [3, -16], [10, -43], [7, -71], [0, -101], [0, -126],
    ];
    const westPts = [[7, -46], [-20, -55], [-49, -63], [-70, -78], [-80, -88]];
    const eastPts = [[9, -52], [34, -59], [58, -69], [79, -83]];
    this.mainRoad = this.createRoad(mainPts, 4.8);
    this.westRoad = this.createRoad(westPts, 3.4);
    this.eastRoad = this.createRoad(eastPts, 3.4);
    this.roadSamples = [...this.mainRoad.samples, ...this.westRoad.samples, ...this.eastRoad.samples];
  }

  createRoad(points, width) {
    const curve = new THREE.CatmullRomCurve3(points.map(([x, z]) => new THREE.Vector3(x, 0, z)), false, 'catmullrom', 0.4);
    const sampleCount = 170;
    const pts = curve.getPoints(sampleCount);
    const samples = [];
    const positions = [];
    const uvs = [];
    const indices = [];
    let dist = 0;
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i];
      const prev = pts[Math.max(0, i - 1)];
      const next = pts[Math.min(pts.length - 1, i + 1)];
      const tx = next.x - prev.x;
      const tz = next.z - prev.z;
      const len = Math.hypot(tx, tz) || 1;
      const nx = -tz / len;
      const nz = tx / len;
      if (i > 0) dist += Math.hypot(p.x - pts[i - 1].x, p.z - pts[i - 1].z);
      for (const side of [-1, 1]) {
        const x = p.x + nx * width * 0.5 * side;
        const z = p.z + nz * width * 0.5 * side;
        const y = this.height(x, z) + 0.075;
        positions.push(x, y, z);
        uvs.push(side > 0 ? 1 : 0, dist / 5.5);
      }
      samples.push({ x: p.x, z: p.z, dist });
      if (i < pts.length - 1) {
        const a = i * 2;
        indices.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geo.setIndex(indices);
    geo.computeVertexNormals();
    const road = new THREE.Mesh(geo, this.roadMat);
    road.receiveShadow = true;
    road.castShadow = false;
    this.scene.add(road);

    // tire tracks
    for (const offset of [-1.15, 1.15]) {
      const trackPositions = [];
      const trackIndices = [];
      for (let i = 0; i < pts.length; i++) {
        const p = pts[i];
        const prev = pts[Math.max(0, i - 1)];
        const next = pts[Math.min(pts.length - 1, i + 1)];
        const tx = next.x - prev.x;
        const tz = next.z - prev.z;
        const len = Math.hypot(tx, tz) || 1;
        const nx = -tz / len;
        const nz = tx / len;
        for (const s of [-0.22, 0.22]) {
          const x = p.x + nx * (offset + s);
          const z = p.z + nz * (offset + s);
          const y = this.height(x, z) + 0.09;
          trackPositions.push(x, y, z);
        }
        if (i < pts.length - 1) {
          const a = i * 2;
          trackIndices.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
        }
      }
      const tGeo = new THREE.BufferGeometry();
      tGeo.setAttribute('position', new THREE.Float32BufferAttribute(trackPositions, 3));
      tGeo.setIndex(trackIndices);
      tGeo.computeVertexNormals();
      const tracks = new THREE.Mesh(tGeo, this.trackMat);
      tracks.receiveShadow = true;
      tracks.castShadow = false;
      this.scene.add(tracks);
    }
    return { curve, samples, width };
  }

  buildGroundDetails() {
    const grassGeo = makeGrassGeometry();
    const grassMat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 1,
      metalness: 0,
      side: THREE.DoubleSide,
    });
    const grassCount = 3600;
    const grass = new THREE.InstancedMesh(grassGeo, grassMat, grassCount);
    grass.castShadow = false;
    grass.receiveShadow = true;
    grass.frustumCulled = false;
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const s = new THREE.Vector3();
    const p = new THREE.Vector3();
    const col = new THREE.Color();
    const rng = makeRng(2024);
    const palette = [0x8d8d5a, 0x7a7d4e, 0xa29a68, 0x6f7547, 0xb0a477, 0x8e8057];
    let placed = 0;
    let attempts = 0;
    while (placed < grassCount && attempts < grassCount * 8) {
      attempts++;
      let cx = (rng.next() - 0.5) * 300;
      let cz = (rng.next() - 0.5) * 300;
      if (!this.isClear(cx, cz, -4.5)) continue;
      if (this.slope(cx, cz) > 0.36) continue;
      const cluster = 1 + Math.floor(rng.next() * 4);
      for (let i = 0; i < cluster && placed < grassCount; i++) {
        const x = cx + (rng.next() - 0.5) * 4.5;
        const z = cz + (rng.next() - 0.5) * 4.5;
        if (!this.isClear(x, z, -4.2)) continue;
        const y = this.height(x, z);
        const scale = 0.55 + rng.next() * 1.15;
        p.set(x, y, z);
        q.setFromAxisAngle(UP_AXIS, rng.next() * TAU);
        s.set(scale, scale * (0.7 + rng.next() * 0.65), scale);
        m.compose(p, q, s);
        grass.setMatrixAt(placed, m);
        col.setHex(palette[Math.floor(rng.next() * palette.length)]);
        grass.setColorAt(placed, col);
        placed++;
      }
    }
    grass.count = placed;
    grass.instanceMatrix.needsUpdate = true;
    if (grass.instanceColor) grass.instanceColor.needsUpdate = true;
    this.scene.add(grass);
    this.grass = grass;

    const pebbleGeo = makePebbleGeometry();
    const pebbleMat = new THREE.MeshStandardMaterial({ color: 0x8a826c, roughness: 0.98, metalness: 0 });
    const pebbleCount = 520;
    const pebbles = new THREE.InstancedMesh(pebbleGeo, pebbleMat, pebbleCount);
    pebbles.castShadow = false;
    pebbles.receiveShadow = true;
    pebbles.frustumCulled = false;
    const prng = makeRng(3030);
    let pc = 0;
    attempts = 0;
    while (pc < pebbleCount && attempts < pebbleCount * 8) {
      attempts++;
      const x = (prng.next() - 0.5) * 300;
      const z = (prng.next() - 0.5) * 300;
      if (!this.isClear(x, z, -3)) continue;
      const y = this.height(x, z);
      const size = 0.12 + prng.next() * 0.38;
      p.set(x, y + size * 0.18, z);
      q.setFromEuler(new THREE.Euler(prng.next() * 0.5, prng.next() * TAU, prng.next() * 0.5));
      s.set(size, size * (0.4 + prng.next() * 0.4), size);
      m.compose(p, q, s);
      pebbles.setMatrixAt(pc, m);
      pc++;
    }
    pebbles.count = pc;
    pebbles.instanceMatrix.needsUpdate = true;
    this.scene.add(pebbles);
    this.pebbles = pebbles;
  }

  // -------------------------------------------------------------------------
  // outposts
  // -------------------------------------------------------------------------

  buildOutposts() {
    this.outpostGroup = new THREE.Group();
    this.scene.add(this.outpostGroup);
    const flagColors = { enemy: 0xa83828, player: 0x4f7f75, neutral: 0x9a8d72 };
    for (const def of this.outpostDefs) {
      const x = def.x;
      const z = def.z;
      const y = this.height(x, z);
      const root = new THREE.Group();
      root.position.set(x, y, z);
      root.rotation.y = def.rotation || 0;
      this.outpostGroup.add(root);

      // capture ring
      const ringMat = new THREE.MeshBasicMaterial({
        color: 0xa83828,
        transparent: true,
        opacity: 0.6,
        side: THREE.DoubleSide,
        depthWrite: false,
        toneMapped: false,
      });
      const ring = new THREE.Mesh(new THREE.RingGeometry(10.5, 11.5, 64), ringMat);
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.09;
      ring.renderOrder = 1;
      root.add(ring);
      const ringInnerMat = new THREE.MeshBasicMaterial({
        color: 0xa83828,
        transparent: true,
        opacity: 0.06,
        side: THREE.DoubleSide,
        depthWrite: false,
        toneMapped: false,
      });
      const inner = new THREE.Mesh(new THREE.CircleGeometry(10.4, 48), ringInnerMat);
      inner.rotation.x = -Math.PI / 2;
      inner.position.y = 0.08;
      root.add(inner);
      // dashed outer markers
      const markerGroup = new THREE.Group();
      for (let i = 0; i < 16; i++) {
        const a = (i / 16) * TAU;
        const dash = boxSmall(0.18, 0.05, 1.0, 0xefe3c9, Math.cos(a) * 12.4, 0.11, Math.sin(a) * 12.4, a);
        dash.material.transparent = true;
        dash.material.opacity = 0.6;
        markerGroup.add(dash);
      }
      root.add(markerGroup);

      // concrete pad and bunker
      const pad = mesh(new THREE.CylinderGeometry(7.3, 7.8, 0.25, 24), MAT.concreteDark, 0, 0.1, 0);
      root.add(pad);
      const bunker = createBunker();
      bunker.position.set(-1.4, 0.2, -2.4);
      root.add(bunker);
      this.addCollider(x - 1.4, z - 2.4, 3.7, 'bunker', root);

      const tower = createWatchtower();
      tower.position.set(5.8, 0.15, -2.4);
      tower.rotation.y = -0.3;
      root.add(tower);
      this.addCollider(x + 5.8, z - 2.4, 1.8, 'tower', root);

      const radar = createRadarDish();
      radar.position.set(-5.5, 0.2, 2.2);
      radar.rotation.y = 0.8;
      root.add(radar);
      this.radars.push(radar);

      const tent = createTent({ color: 0x8f8064 });
      tent.position.set(3.8, 0.15, 4.2);
      tent.rotation.y = 0.45;
      root.add(tent);

      const sandbags1 = createSandbagWall(5.4, 2, 3);
      sandbags1.position.set(0.6, 0.2, 4.0);
      root.add(sandbags1);
      const sandbags2 = createSandbagWall(4.2, 2, 2);
      sandbags2.position.set(-4.8, 0.2, 0.5);
      sandbags2.rotation.y = Math.PI / 2;
      root.add(sandbags2);

      const crates = createCrateStack(makeRng(400 + def.id.charCodeAt(0)));
      crates.position.set(2.6, 0.2, -0.2);
      root.add(crates);

      const flak = createFlakGun();
      flak.position.set(5.2, 0.2, 3.4);
      flak.rotation.y = 0.2;
      root.add(flak);
      this.addCollider(x + 5.2, z + 3.4, 1.5, 'flak', root);

      const flag = createFlag(flagColors.enemy, 6.2);
      flag.position.set(-0.4, 0.2, 0.3);
      root.add(flag);
      this.flags.push(flag);
      this.addCollider(x - 0.4, z + 0.3, 0.5, 'flag', root);

      // ammo boxes and smaller set dressing
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * TAU + 0.3;
        const b = boxSmall(0.65, 0.35, 0.4, 0x4b4b36, Math.cos(a) * 7.4, 0.35, Math.sin(a) * 7.4, a + 0.2);
        root.add(b);
      }

      // everything that moves or is recolored at runtime stays separate
      ring.userData.noMerge = true;
      inner.userData.noMerge = true;
      markerGroup.userData.noMerge = true;
      flag.userData.noMerge = true;
      flak.userData.noMerge = true;
      radar.userData.noMerge = true;
      mergeStaticGroup(root, mergeGeometries);

      const light = new THREE.PointLight(0xff5b37, 0.9, 18, 2);
      light.position.set(0, 2.5, 0);
      root.add(light);

      const outpost = {
        id: def.id,
        name: def.name,
        subtitle: def.subtitle,
        x,
        z,
        y,
        rotation: def.rotation,
        radius: 12.4,
        captureRadius: 12.4,
        owner: 'enemy',
        progress: 0,
        contested: false,
        root,
        ring,
        ringMat,
        inner,
        innerMat: ringInnerMat,
        markerGroup,
        flag,
        flagColors,
        flak,
        light,
        bunker,
        tower,
        radar,
        lastContested: false,
        capturePulse: 0,
      };
      flak.userData.outpost = outpost;
      flak.userData.owner = 'enemy';
      this.outposts.push(outpost);
    }
  }

  setOutpostOwner(outpost, owner) {
    outpost.owner = owner;
    const color = owner === 'player' ? outpost.flagColors.player : outpost.flagColors.enemy;
    outpost.ringMat.color.setHex(color);
    outpost.innerMat.color.setHex(color);
    outpost.light.color.setHex(owner === 'player' ? 0x7ac7b0 : 0xff5b37);
    outpost.light.intensity = owner === 'player' ? 1.3 : 0.9;
    outpost.flak.userData.owner = owner;
    const flag = outpost.flag;
    if (flag?.userData?.cloth) flag.userData.cloth.material.color.setHex(color);
    if (flag?.userData?.star) flag.userData.star.visible = true;
    // re-color marker dashes subtly
    outpost.markerGroup.children.forEach((m) => {
      m.material.color.setHex(owner === 'player' ? 0x7fa89b : 0xefe3c9);
    });
    this.territory?.refresh();
  }

  // -------------------------------------------------------------------------
  // barns / farmsteads
  // -------------------------------------------------------------------------

  buildBarns() {
    this.barnGroup = new THREE.Group();
    this.scene.add(this.barnGroup);
    for (let i = 0; i < this.barnDefs.length; i++) {
      const def = this.barnDefs[i];
      const y = this.height(def.x, def.z);
      const root = new THREE.Group();
      root.position.set(def.x, y, def.z);
      root.rotation.y = def.rotation;
      const barn = createBarn();
      root.add(barn);

      const silo = createSilo(8.5 + (i % 2) * 2);
      silo.position.set(-6.4, 0, 3.4);
      root.add(silo);
      this.addCollider(
        def.x + Math.cos(def.rotation) * -6.4 + Math.sin(def.rotation) * 3.4,
        def.z - Math.sin(def.rotation) * -6.4 + Math.cos(def.rotation) * 3.4,
        2.4, 'silo', root,
      );

      const fence1 = createFence(7);
      fence1.position.set(5.7, 0.05, 5.2);
      fence1.rotation.y = 0.1;
      root.add(fence1);
      const fence2 = createFence(5);
      fence2.position.set(8.5, 0.05, 1.6);
      fence2.rotation.y = Math.PI / 2;
      root.add(fence2);

      const bales = createHayBale();
      bales.position.set(7.2, 0.1, -2.8);
      bales.rotation.y = 0.6;
      root.add(bales);
      const bales2 = createHayBale();
      bales2.position.set(6.0, 0.1, -4.1);
      bales2.rotation.y = 1.2;
      root.add(bales2);

      const crates = createCrateStack(makeRng(90 + i));
      crates.position.set(-7.3, 0.1, -3.1);
      root.add(crates);

      this.barnGroup.add(root);
      const collider = this.addCollider(def.x, def.z, 7.1, 'barn', root);
      const barnObj = {
        ...def,
        index: i,
        y,
        root,
        model: barn,
        collider,
        destroyed: false,
        intact: barn.userData.intact,
        debris: barn.userData.debris,
        smokeTimer: 0,
      };
      collider.barn = barnObj;
      this.barns.push(barnObj);
    }
  }

  destroyBarn(barn, game) {
    if (!barn || barn.destroyed) return;
    barn.destroyed = true;
    barn.intact.visible = false;
    barn.debris.visible = true;
    barn.collider.active = false;
    const p = new THREE.Vector3(barn.x, barn.y + 2.0, barn.z);
    this.effects.barnCollapse(p, barn);
    this.audio?.barnCollapse();
    if (game) {
      game.stats.barns++;
      game.hud.toast('Barn flattened', 'Enemy supply dump destroyed', '★', 'danger');
      game.shake(0.75);
    }
    // a lasting low smoke column
    this.effects.addSmokeEmitter({
      position: new THREE.Vector3(barn.x, barn.y + 0.7, barn.z),
      duration: 26,
      rate: 4.2,
      scale: 4.8,
      color: 0x554b40,
      rise: 2.1,
      spread: 2.2,
    });
  }

  // -------------------------------------------------------------------------
  // village & player base
  // -------------------------------------------------------------------------

  buildVillage() {
    const village = new THREE.Group();
    this.scene.add(village);
    const y1 = this.height(37, 71);
    const house1 = createFarmhouse({ color: 0xc8b795, roof: 0x49443a });
    house1.position.set(37, y1, 71);
    house1.rotation.y = -0.2;
    village.add(house1);
    this.addCollider(37, 71, 5.1, 'house', house1);

    const y2 = this.height(-33, 80);
    const house2 = createFarmhouse({ color: 0xbaa987, roof: 0x3e3b34 });
    house2.position.set(-33, y2, 80);
    house2.rotation.y = 1.1;
    house2.scale.setScalar(0.92);
    village.add(house2);
    this.addCollider(-33, 80, 4.7, 'house', house2);

    const y3 = this.height(50, 56);
    const church = createChurch();
    church.position.set(50, y3, 56);
    church.rotation.y = -0.35;
    village.add(church);
    this.addCollider(50, 56, 4.6, 'church', church);

    const y4 = this.height(-15, 67);
    const tower = createWaterTower();
    tower.position.set(-15, y4, 67);
    village.add(tower);
    this.addCollider(-15, 67, 2.5, 'watertower', tower);

    const y5 = this.height(32, 85);
    const pump = createGasPump();
    pump.position.set(32, y5, 85);
    pump.rotation.y = -0.4;
    village.add(pump);

    const y6 = this.height(29, 74);
    const tractor = createTractor();
    tractor.position.set(29, y6, 74);
    tractor.rotation.y = 0.9;
    village.add(tractor);

    const windmill = createWindmill();
    windmill.position.set(53, this.height(53, 78), 78);
    windmill.scale.setScalar(0.92);
    village.add(windmill);
    this.windmills.push(windmill);

    const sign = createRoadSign('RIDGE 12');
    sign.position.set(9, this.height(9, 74), 74);
    sign.rotation.y = -0.25;
    village.add(sign);

    // fences and yard clutter
    for (const [x, z, ry, len] of [
      [42, 65, 0.3, 7], [45, 78, 1.4, 6], [29, 63, -0.2, 5], [-27, 74, 1.2, 6],
    ]) {
      const f = createFence(len);
      f.position.set(x, this.height(x, z) + 0.03, z);
      f.rotation.y = ry;
      village.add(f);
    }
    const hay = createHayBale();
    hay.position.set(-28, this.height(-28, 85), 85);
    hay.rotation.y = 0.3;
    village.add(hay);

    // dirt driveways to the road
    this.createRoad([[4, 74], [18, 72], [29, 70], [37, 70]], 3.2);
  }

  buildPlayerBase() {
    const base = new THREE.Group();
    this.scene.add(base);
    const y = this.height(0, 112);
    const hangar = createHangar();
    hangar.position.set(-12, this.height(-12, 123), 123);
    hangar.rotation.y = 0.08;
    base.add(hangar);
    this.addCollider(-12, 123, 7.2, 'hangar', hangar);

    const tent1 = createTent({ color: 0x8b7e62 });
    tent1.position.set(12, this.height(12, 121), 121);
    tent1.rotation.y = -0.35;
    base.add(tent1);
    const tent2 = createTent({ color: 0x998a6b });
    tent2.position.set(18, this.height(18, 116), 116);
    tent2.rotation.y = 0.25;
    base.add(tent2);

    const sandbag = createSandbagWall(9, 2, 3);
    sandbag.position.set(0, this.height(0, 119), 119);
    sandbag.rotation.y = 0;
    base.add(sandbag);
    const sandbag2 = createSandbagWall(6, 2, 2);
    sandbag2.position.set(-4, this.height(-4, 99), 99);
    sandbag2.rotation.y = -0.2;
    base.add(sandbag2);

    const crates = createCrateStack(makeRng(777));
    crates.position.set(7, this.height(7, 125), 125);
    base.add(crates);
    const crates2 = createCrateStack(makeRng(778));
    crates2.position.set(-3, this.height(-3, 126), 126);
    base.add(crates2);

    const radar = createRadarDish();
    radar.position.set(-24, this.height(-24, 114), 114);
    radar.rotation.y = -1.4;
    base.add(radar);
    this.radars.push(radar);

    const tower = createWatchtower();
    tower.position.set(23, this.height(23, 125), 125);
    tower.rotation.y = -0.5;
    base.add(tower);

    const flag = createFlag(0x4f7f75, 6.4);
    flag.position.set(4, this.height(4, 118) + 0.05, 118);
    base.add(flag);
    this.flags.push(flag);
    this.playerFlag = flag;

    const sign = createRoadSign('CAMP LIBERTY');
    sign.position.set(-2, this.height(-2, 100), 100);
    sign.rotation.y = 0.12;
    base.add(sign);

    // a couple of fuel drums
    for (let i = 0; i < 4; i++) {
      const drum = mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.9, 10), MAT.rust, -2 + (i % 2) * 0.75, this.height(-2, 129) + 0.45, 129 - Math.floor(i / 2) * 0.75);
      base.add(drum);
    }

    this.base = base;
  }

  buildFields() {
    this.fieldGroup = new THREE.Group();
    this.scene.add(this.fieldGroup);
    const fields = [
      { x: 24, z: 46, w: 22, d: 15, r: -0.18 },
      { x: -42, z: 44, w: 17, d: 12, r: 0.22 },
      { x: 66, z: 23, w: 15, d: 10, r: -0.4 },
    ];
    for (const f of fields) {
      const geo = new THREE.PlaneGeometry(f.w, f.d, 8, 8);
      geo.rotateX(-Math.PI / 2);
      const pos = geo.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        const lx = pos.getX(i);
        const lz = pos.getZ(i);
        const wx = f.x + Math.cos(f.r) * lx - Math.sin(f.r) * lz;
        const wz = f.z + Math.sin(f.r) * lx + Math.cos(f.r) * lz;
        pos.setY(i, this.height(wx, wz) + 0.08);
        pos.setX(i, wx);
        pos.setZ(i, wz);
      }
      geo.computeVertexNormals();
      const mat = new THREE.MeshStandardMaterial({
        map: this.fieldTexture,
        color: 0xbda97d,
        roughness: 1,
        polygonOffset: true,
        polygonOffsetFactor: -1,
        polygonOffsetUnits: -1,
      });
      const field = new THREE.Mesh(geo, mat);
      field.receiveShadow = true;
      this.fieldGroup.add(field);
      const fence = createFence(f.w);
      fence.position.set(f.x, this.height(f.x, f.z + f.d / 2) + 0.05, f.z + f.d / 2);
      fence.rotation.y = f.r;
      this.fieldGroup.add(fence);
    }
  }

  // -------------------------------------------------------------------------
  // nature / set dressing
  // -------------------------------------------------------------------------

  isClear(x, z, pad = 0) {
    if (Math.abs(x) > HALF - 5 || Math.abs(z) > HALF - 5) return false;
    for (const zone of this.clearZones) {
      if (Math.hypot(x - zone.x, z - zone.z) < zone.r + pad) return false;
    }
    // don't put trees on top of roads
    for (let i = 0; i < this.roadSamples.length; i += 7) {
      const s = this.roadSamples[i];
      if (Math.hypot(x - s.x, z - s.z) < 6 + pad) return false;
    }
    return true;
  }

  scatterNature() {
    const nature = new THREE.Group();
    this.scene.add(nature);
    const rng = makeRng(1957 * 3 + 7);
    let placed = 0;
    let attempts = 0;
    while (placed < 52 && attempts < 900) {
      attempts++;
      const x = (rng.next() - 0.5) * 300;
      const z = (rng.next() - 0.5) * 300;
      if (!this.isClear(x, z, 1.5)) continue;
      const y = this.height(x, z);
      let variant = 'pine';
      const r = rng.next();
      if (z > 30) variant = r < 0.4 ? 'dead' : r < 0.75 ? 'scrub' : 'pine';
      else variant = r < 0.55 ? 'pine' : r < 0.8 ? 'scrub' : 'dead';
      const tree = createTree(variant, rng);
      tree.position.set(x, y, z);
      tree.rotation.y = rng.next() * TAU;
      const scale = 0.8 + rng.next() * 0.55;
      tree.scale.setScalar(scale);
      nature.add(tree);
      if (variant !== 'scrub') this.addCollider(x, z, 0.55 * scale, 'tree', tree);
      placed++;
    }

    let rocks = 0;
    attempts = 0;
    while (rocks < 30 && attempts < 600) {
      attempts++;
      const x = (rng.next() - 0.5) * 300;
      const z = (rng.next() - 0.5) * 300;
      if (!this.isClear(x, z, 0.5)) continue;
      if (rng.chance(0.3) && z > 30) continue;
      const size = 0.55 + rng.next() * 1.9;
      const rock = createRock(size, rng);
      rock.position.set(x, this.height(x, z) + size * 0.15, z);
      nature.add(rock);
      if (size > 1.1) this.addCollider(x, z, size * 0.8, 'rock', rock);
      rocks++;
    }

    // low scrub / bushes
    for (let i = 0; i < 75; i++) {
      const x = (rng.next() - 0.5) * 300;
      const z = (rng.next() - 0.5) * 300;
      if (!this.isClear(x, z, 0.2)) continue;
      if (Math.abs(x) > HALF - 6 || Math.abs(z) > HALF - 6) continue;
      const bush = mesh(new THREE.IcosahedronGeometry(0.45 + rng.next() * 0.65, 0), rng.chance(0.4) ? MAT.dryLeaf : MAT.pine, x, this.height(x, z) + 0.2, z);
      bush.scale.y = 0.55;
      bush.rotation.y = rng.next() * TAU;
      nature.add(bush);
    }
    this.nature = nature;
  }

  buildTelephoneLine() {
    const lineGroup = new THREE.Group();
    this.scene.add(lineGroup);
    const curve = this.mainRoad.curve;
    const pts = curve.getPoints(60);
    const poles = [];
    for (let i = 1; i < 10; i++) {
      const t = i / 10;
      const idx = Math.floor(t * (pts.length - 1));
      const p = pts[idx];
      const prev = pts[Math.max(0, idx - 1)];
      const next = pts[Math.min(pts.length - 1, idx + 1)];
      const tx = next.x - prev.x;
      const tz = next.z - prev.z;
      const len = Math.hypot(tx, tz) || 1;
      const nx = -tz / len;
      const nz = tx / len;
      const x = p.x + nx * 7.5;
      const z = p.z + nz * 7.5;
      if (Math.abs(x) > HALF - 8 || Math.abs(z) > HALF - 8) continue;
      const y = this.height(x, z);
      const pole = createTelephonePole();
      pole.position.set(x, y, z);
      pole.rotation.y = Math.atan2(tx, tz);
      lineGroup.add(pole);
      poles.push({ x, y, z });
    }
    for (let i = 0; i < poles.length - 1; i++) {
      const a = poles[i];
      const b = poles[i + 1];
      for (const off of [-0.85, -0.3, 0.3, 0.85]) {
        const ptsWire = [];
        for (let k = 0; k <= 12; k++) {
          const t = k / 12;
          const x = lerp(a.x, b.x, t);
          const z = lerp(a.z, b.z, t);
          const sag = Math.sin(t * Math.PI) * 0.8;
          const y = lerp(a.y, b.y, t) + 7.05 - sag;
          ptsWire.push(new THREE.Vector3(x, y, z));
        }
        const geo = new THREE.BufferGeometry().setFromPoints(ptsWire);
        const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0x2d2a23, transparent: true, opacity: 0.8 }));
        lineGroup.add(line);
      }
    }
  }

  seedBattleScars() {
    const scars = [
      { x: -5, z: 36, r: 5.2, d: 1.2 },
      { x: 42, z: 12, r: 4.2, d: 0.9 },
      { x: -47, z: -8, r: 6.2, d: 1.6 },
      { x: 20, z: -77, r: 3.4, d: 0.7 },
      { x: -36, z: -58, r: 4.6, d: 1.0 },
    ];
    for (const s of scars) this.deformTerrain(s.x, s.z, s.r, s.d, true, false);
  }

  // -------------------------------------------------------------------------
  // terrain damage / decals
  // -------------------------------------------------------------------------

  deformTerrain(x, z, radius, depth = 1.0, addScorch = true, updateNormals = true) {
    const n = this.n;
    const positions = this.terrainPositions;
    const colors = this.terrainColors;
    const baseColors = this.terrainBaseColors;
    const minI = Math.max(0, Math.floor((x - radius * 1.35 + HALF) / this.cell));
    const maxI = Math.min(SEGMENTS, Math.ceil((x + radius * 1.35 + HALF) / this.cell));
    const minJ = Math.max(0, Math.floor((z - radius * 1.35 + HALF) / this.cell));
    const maxJ = Math.min(SEGMENTS, Math.ceil((z + radius * 1.35 + HALF) / this.cell));
    const dark = new THREE.Color(0x3a3225);
    const rimLight = new THREE.Color(0xb39c76);
    for (let j = minJ; j <= maxJ; j++) {
      for (let i = minI; i <= maxI; i++) {
        const idx = j * n + i;
        const px = positions[idx * 3];
        const pz = positions[idx * 3 + 2];
        const d = Math.hypot(px - x, pz - z);
        const t = d / radius;
        if (t > 1.32) continue;
        let dh = 0;
        let colorMix = 0;
        if (t < 1) {
          const bowl = (1 - t * t);
          dh -= depth * bowl * bowl;
          colorMix = Math.min(1, (1 - t) * 0.8 + 0.18);
        }
        if (t > 0.72 && t < 1.3) {
          const rim = Math.sin(clamp((t - 0.72) / 0.58, 0, 1) * Math.PI);
          dh += depth * 0.17 * rim;
        }
        // small noise in the crater
        dh += (valueNoise2(px * 1.7, pz * 1.7) * 0.05) * Math.max(0, 1 - t);
        const oldH = this.heights[idx];
        const newH = oldH + dh;
        this.heights[idx] = newH;
        positions[idx * 3 + 1] = newH;
        const c = new THREE.Color(baseColors[idx * 3], baseColors[idx * 3 + 1], baseColors[idx * 3 + 2]);
        if (colorMix > 0) c.lerp(dark, colorMix * 0.86);
        if (t > 0.72 && t < 1.05) c.lerp(rimLight, 0.12);
        colors[idx * 3] = c.r;
        colors[idx * 3 + 1] = c.g;
        colors[idx * 3 + 2] = c.b;
      }
    }
    this.terrainGeo.attributes.position.needsUpdate = true;
    this.terrainGeo.attributes.color.needsUpdate = true;
    if (updateNormals) this.terrainGeo.computeVertexNormals();
    if (addScorch) this.addScorchDecal(x, z, radius * 1.18);
  }

  addScorchDecal(x, z, radius) {
    const segs = 10;
    const geo = new THREE.PlaneGeometry(radius * 2, radius * 2, segs, segs);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const px = pos.getX(i) + x;
      const pz = pos.getZ(i) + z;
      pos.setX(i, px);
      pos.setZ(i, pz);
      pos.setY(i, this.height(px, pz) + 0.055);
    }
    geo.computeVertexNormals();
    const mat = new THREE.MeshBasicMaterial({
      map: this.scorchTexture,
      transparent: true,
      opacity: 0.82,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -3,
      polygonOffsetUnits: -3,
    });
    const decal = new THREE.Mesh(geo, mat);
    decal.renderOrder = 1;
    this.scene.add(decal);
    if (!this.scorchDecals) this.scorchDecals = [];
    this.scorchDecals.push(decal);
    if (this.scorchDecals.length > 46) {
      const old = this.scorchDecals.shift();
      old.geometry.dispose();
      old.material.dispose();
      this.scene.remove(old);
    }
  }

  addCollider(x, z, r, type, ref) {
    const c = { x, z, r, type, ref, active: true };
    this.colliders.push(c);
    return c;
  }

  resolveCollisions(position, radius = 1.8, isPlayer = false) {
    let hit = false;
    for (const c of this.colliders) {
      if (!c.active) continue;
      const dx = position.x - c.x;
      const dz = position.z - c.z;
      const min = c.r + radius;
      const d2 = dx * dx + dz * dz;
      if (d2 < min * min && d2 > 0.0001) {
        const d = Math.sqrt(d2);
        const push = (min - d) / d;
        position.x += dx * push;
        position.z += dz * push;
        hit = true;
      }
    }
    const edge = HALF - 7;
    position.x = clamp(position.x, -edge, edge);
    position.z = clamp(position.z, -edge, edge);
    return hit;
  }

  // -------------------------------------------------------------------------
  // update
  // -------------------------------------------------------------------------

  update(dt, elapsed) {
    this.time = elapsed;
    for (const flag of this.flags) {
      // flags imported function is inside models; avoid importing again by local wave update
      const u = flag.userData;
      if (!u || !u.cloth) continue;
      const pos = u.cloth.geometry.attributes.position;
      const base = u.basePositions;
      for (let i = 0; i < pos.count; i++) {
        const x = base[i * 3];
        const y = base[i * 3 + 1];
        const wave = Math.sin(x * 3.4 + elapsed * 4.2 + u.phase) * 0.16 * (x / 2.35);
        const wave2 = Math.cos(x * 2.1 - elapsed * 2.6 + u.phase) * 0.07 * (x / 2.35);
        pos.setXYZ(i, x, y + wave2, wave);
      }
      pos.needsUpdate = true;
    }
    for (const w of this.windmills) {
      if (w.userData.blades) w.userData.blades.rotation.z += dt * 0.7;
    }
    for (const r of this.radars) {
      if (r.userData.dish) {
        r.userData.dish.rotation.y += dt * 0.3;
        if (r.userData.light) r.userData.light.visible = Math.sin(elapsed * 4) > 0;
      }
    }
    for (const o of this.outposts) {
      const pulse = 0.5 + Math.sin(elapsed * 2.2 + o.x * 0.1) * 0.13;
      o.ringMat.opacity = o.owner === 'player' ? 0.48 + pulse * 0.16 : 0.4 + pulse * 0.2;
      o.innerMat.opacity = o.owner === 'player' ? 0.04 + pulse * 0.03 : 0.03 + pulse * 0.04;
      o.markerGroup.rotation.y = elapsed * 0.08;
      if (o.capturePulse > 0) {
        o.capturePulse = Math.max(0, o.capturePulse - dt);
        const s = 1 + (1 - o.capturePulse / 0.8) * 0.14;
        o.ring.scale.setScalar(s);
      } else {
        o.ring.scale.setScalar(1);
      }
      if (o.owner === 'player' && o.flak.userData.owner === 'player') {
        // slow idle sweep of the flak mount; combat aim is handled by the game
        if (!o.flak.userData.targeting) o.flak.userData.yawGroup.rotation.y += dt * 0.15;
      }
    }
    this.territory?.update(dt, elapsed);
  }
}

// local helper because imported mesh() sets shadows already; this makes tiny marker dashes
function boxSmall(w, h, d, color, x, y, z, rot = 0) {
  const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.7, metalness: 0.1 });
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  m.rotation.y = rot;
  m.castShadow = false;
  m.receiveShadow = true;
  return m;
}
