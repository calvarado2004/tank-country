import * as THREE from 'three';
import { clamp } from './utils.js';
import { NEUTRAL, PLAYER, ENEMY, influenceAt, computeOwnership } from './territory-core.js';

export { NEUTRAL, PLAYER, ENEMY } from './territory-core.js';

const GRID = 80;

const PLAYER_TINT = new THREE.Color(0x4f9f8b);
const ENEMY_TINT = new THREE.Color(0xa83828);
const CONTESTED_TINT = new THREE.Color(0xd98b3a);
const PLAYER_BORDER = new THREE.Color(0x8fe0c8);
const ENEMY_BORDER = new THREE.Color(0xe06a45);
const CONTESTED_BORDER = new THREE.Color(0xffc46b);

export class Territory {
  constructor(world) {
    this.world = world;
    this.n = GRID;
    this.cell = world.size / GRID;
    this.owner = new Uint8Array(GRID * GRID);
    this.contested = new Uint8Array(GRID * GRID);
    this.sources = [];
    this.playerShare = 0;
    this.enemyShare = 0;
    this.contestedShare = 0;
    this.lastPlayerShare = -1;
    this.lastEnemyShare = -1;
    this.buildSources();
    this.buildOverlay();
    this.buildBorders();
    this.buildMinimap();
    this.refresh();
  }

  // -------------------------------------------------------------------------
  // influence
  // -------------------------------------------------------------------------

  buildSources() {
    const { world } = this;
    this.sources = [
      {
        faction: 'player',
        kind: 'base',
        x: world.playerBase.x,
        z: world.playerBase.z,
        radius: 70,
        strength: 1.12,
      },
      {
        faction: 'enemy',
        kind: 'rear',
        x: 0,
        z: -152,
        radius: 96,
        strength: 1.05,
      },
    ];
    for (const o of world.outposts) {
      this.sources.push({
        faction: o.owner === 'player' ? 'player' : 'enemy',
        kind: 'outpost',
        id: o.id,
        x: o.x,
        z: o.z,
        radius: 56,
        strength: 1.0,
      });
    }
  }

  scoreAt(x, z) {
    return influenceAt(this.sources, x, z);
  }

  cellIndexAt(x, z) {
    const i = clamp(Math.floor((x + this.world.half) / this.cell), 0, this.n - 1);
    const j = clamp(Math.floor((z + this.world.half) / this.cell), 0, this.n - 1);
    return j * this.n + i;
  }

  factionAt(x, z) {
    const owner = this.owner[this.cellIndexAt(x, z)];
    return owner === PLAYER ? 'player' : owner === ENEMY ? 'enemy' : 'neutral';
  }

  isContestedAt(x, z) {
    return this.contested[this.cellIndexAt(x, z)] === 1;
  }

  // -------------------------------------------------------------------------
  // ownership
  // -------------------------------------------------------------------------

  refresh() {
    this.buildSources();
    const ownership = computeOwnership({
      sources: this.sources,
      half: this.world.half,
      n: this.n,
    });
    this.owner = ownership.owner;
    this.contested = ownership.contested;
    this.playerShare = ownership.playerShare;
    this.enemyShare = ownership.enemyShare;
    this.contestedShare = ownership.contestedShare;
    this.updateOverlay();
    this.updateBorders();
    this.updateMinimap();
  }

  // -------------------------------------------------------------------------
  // ground tint
  // -------------------------------------------------------------------------

  buildOverlay() {
    const terrainGeo = this.world.terrainGeo;
    const geo = new THREE.BufferGeometry();
    // share the live terrain attributes so the tint follows shell craters
    geo.setAttribute('position', terrainGeo.attributes.position);
    geo.setIndex(terrainGeo.index);
    this.overlayColor = new Float32Array(terrainGeo.attributes.position.count * 4);
    geo.setAttribute('color', new THREE.BufferAttribute(this.overlayColor, 4));
    const material = new THREE.MeshBasicMaterial({
      vertexColors: true,
      transparent: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
      toneMapped: false,
    });
    this.overlay = new THREE.Mesh(geo, material);
    this.overlay.name = 'territory-overlay';
    this.overlay.renderOrder = 1;
    this.overlay.frustumCulled = false;
    this.world.scene.add(this.overlay);
  }

  updateOverlay() {
    const positions = this.world.terrainGeo.attributes.position.array;
    const colors = this.overlayColor;
    const n = this.world.n;
    for (let v = 0; v < n * n; v++) {
      const x = positions[v * 3];
      const z = positions[v * 3 + 2];
      const idx = this.cellIndexAt(x, z);
      const owner = this.owner[idx];
      const out = v * 4;
      if (owner === NEUTRAL) {
        colors[out + 3] = 0;
        continue;
      }
      const tint = this.contested[idx] ? CONTESTED_TINT : owner === PLAYER ? PLAYER_TINT : ENEMY_TINT;
      colors[out] = tint.r;
      colors[out + 1] = tint.g;
      colors[out + 2] = tint.b;
      colors[out + 3] = this.contested[idx] ? 0.2 : owner === PLAYER ? 0.19 : 0.16;
    }
    this.overlay.geometry.attributes.color.needsUpdate = true;
  }

  // -------------------------------------------------------------------------
  // border
  // -------------------------------------------------------------------------

  buildBorders() {
    this.borderGeo = new THREE.BufferGeometry();
    this.borderMat = new THREE.MeshBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.5,
      depthWrite: false,
      side: THREE.DoubleSide,
      toneMapped: false,
      blending: THREE.AdditiveBlending,
    });
    this.borders = new THREE.Mesh(this.borderGeo, this.borderMat);
    this.borders.name = 'territory-border';
    this.borders.renderOrder = 2;
    this.borders.frustumCulled = false;
    this.world.scene.add(this.borders);
  }

  updateBorders() {
    const positions = [];
    const colors = [];
    const indices = [];
    const n = this.n;
    const half = this.world.half;
    const cell = this.cell;
    const halfWidth = 0.34;
    let vertBase = 0;

    const pushEdge = (x1, z1, x2, z2, a, b, contested) => {
      if (a === b) return;
      if (a === NEUTRAL && b === NEUTRAL) return;
      let color;
      let dim = 1;
      if ((a === PLAYER && b === ENEMY) || (a === ENEMY && b === PLAYER)) {
        color = CONTESTED_BORDER;
      } else if (contested) {
        color = CONTESTED_BORDER;
      } else if (a === PLAYER || b === PLAYER) {
        color = PLAYER_BORDER;
      } else {
        color = ENEMY_BORDER;
      }
      if (a === NEUTRAL || b === NEUTRAL) dim = 0.45;
      const dx = x2 - x1;
      const dz = z2 - z1;
      const len = Math.hypot(dx, dz) || 1;
      const px = (-dz / len) * halfWidth;
      const pz = (dx / len) * halfWidth;
      const ax = x1 + px;
      const az = z1 + pz;
      const bx = x1 - px;
      const bz = z1 - pz;
      const cx = x2 + px;
      const cz = z2 + pz;
      const dx2 = x2 - px;
      const dz2 = z2 - pz;
      positions.push(
        ax, this.world.height(ax, az) + 0.2, az,
        bx, this.world.height(bx, bz) + 0.2, bz,
        cx, this.world.height(cx, cz) + 0.2, cz,
        dx2, this.world.height(dx2, dz2) + 0.2, dz2,
      );
      const r = color.r * dim;
      const g = color.g * dim;
      const bl = color.b * dim;
      colors.push(r, g, bl, r, g, bl, r, g, bl, r, g, bl);
      indices.push(vertBase, vertBase + 1, vertBase + 2, vertBase + 1, vertBase + 3, vertBase + 2);
      vertBase += 4;
    };

    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        const idx = j * n + i;
        const owner = this.owner[idx];
        const contested = this.contested[idx];
        const x0 = -half + i * cell;
        const x1 = x0 + cell;
        const z0 = -half + j * cell;
        const z1 = z0 + cell;
        if (i < n - 1) {
          const other = this.owner[idx + 1];
          if (other !== owner) {
            pushEdge(x1, z0, x1, z1, owner, other, contested || this.contested[idx + 1]);
          }
        }
        if (j < n - 1) {
          const other = this.owner[idx + n];
          if (other !== owner) {
            pushEdge(x0, z1, x1, z1, owner, other, contested || this.contested[idx + n]);
          }
        }
      }
    }

    if (!positions.length) {
      this.borders.visible = false;
      return;
    }
    this.borders.visible = true;
    this.borderGeo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    this.borderGeo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    this.borderGeo.setIndex(indices);
    this.borderGeo.computeBoundingSphere();
  }

  // -------------------------------------------------------------------------
  // minimap
  // -------------------------------------------------------------------------

  buildMinimap() {
    this.minimapCanvas = document.createElement('canvas');
    this.minimapCanvas.width = this.n;
    this.minimapCanvas.height = this.n;
    this.minimapCtx = this.minimapCanvas.getContext('2d');
  }

  updateMinimap() {
    const img = this.minimapCtx.createImageData(this.n, this.n);
    for (let i = 0; i < this.owner.length; i++) {
      const owner = this.owner[i];
      const out = i * 4;
      if (owner === NEUTRAL) {
        img.data[out + 3] = 0;
        continue;
      }
      const tint = this.contested[i] ? CONTESTED_TINT : owner === PLAYER ? PLAYER_TINT : ENEMY_TINT;
      img.data[out] = Math.round(tint.r * 255);
      img.data[out + 1] = Math.round(tint.g * 255);
      img.data[out + 2] = Math.round(tint.b * 255);
      img.data[out + 3] = this.contested[i] ? 118 : 96;
    }
    this.minimapCtx.putImageData(img, 0, 0);
  }

  update(dt, elapsed) {
    if (this.borderMat) {
      this.borderMat.opacity = 0.62 + Math.sin(elapsed * 1.9) * 0.14;
    }
  }

  stats() {
    return {
      player: this.playerShare,
      enemy: this.enemyShare,
      contested: this.contestedShare,
    };
  }
}
