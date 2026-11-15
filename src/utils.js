import * as THREE from 'three';

export const TAU = Math.PI * 2;
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const invLerp = (a, b, v) => clamp((v - a) / (b - a), 0, 1);
export const smoothstep = (a, b, v) => {
  const t = invLerp(a, b, v);
  return t * t * (3 - 2 * t);
};
export const damp = (current, target, lambda, dt) => lerp(current, target, 1 - Math.exp(-lambda * dt));
export const dampAngle = (current, target, lambda, dt) => current + shortestAngle(current, target) * (1 - Math.exp(-lambda * dt));
export const shortestAngle = (a, b) => {
  let d = (b - a + Math.PI) % TAU;
  if (d < 0) d += TAU;
  return d - Math.PI;
};
export const wrap = (v, min, max) => {
  const span = max - min;
  return min + ((((v - min) % span) + span) % span);
};

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function random() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function makeRng(seed) {
  const r = mulberry32(seed);
  return {
    next: r,
    range: (a, b) => a + r() * (b - a),
    int: (a, b) => Math.floor(a + r() * (b - a + 1)),
    pick: (arr) => arr[Math.floor(r() * arr.length)],
    chance: (p) => r() < p,
    sign: () => (r() < 0.5 ? -1 : 1),
  };
}

function hash2(ix, iy) {
  let h = Math.imul(ix, 374761393) + Math.imul(iy, 668265263);
  h = (h ^ (h >>> 13)) * 1274126177;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

export function valueNoise2(x, y) {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);
  const a = hash2(ix, iy);
  const b = hash2(ix + 1, iy);
  const c = hash2(ix, iy + 1);
  const d = hash2(ix + 1, iy + 1);
  return lerp(lerp(a, b, ux), lerp(c, d, ux), uy) * 2 - 1;
}

export function fbm2(x, y, octaves = 4, lacunarity = 2.03, gain = 0.5) {
  let sum = 0;
  let amp = 0.5;
  let freq = 1;
  let norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += valueNoise2(x * freq, y * freq) * amp;
    norm += amp;
    amp *= gain;
    freq *= lacunarity;
  }
  return sum / norm;
}

export function makeCanvas(width, height) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

export function canvasTexture(canvas, { repeat = false, colorSpace = THREE.SRGBColorSpace } = {}) {
  const tex = new THREE.CanvasTexture(canvas);
  if (repeat) {
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
  }
  tex.colorSpace = colorSpace;
  tex.anisotropy = 8;
  return tex;
}

export function radialSpriteTexture(inner = 'rgba(255,255,255,1)', outer = 'rgba(255,255,255,0)', size = 128, falloff = 1.6) {
  const c = makeCanvas(size, size);
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, inner);
  g.addColorStop(0.25, inner);
  g.addColorStop(1, outer);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  // soften the rim a little more than a linear gradient
  if (falloff !== 1) {
    ctx.globalCompositeOperation = 'destination-in';
    const m = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    m.addColorStop(0, 'rgba(0,0,0,1)');
    m.addColorStop(0.65, 'rgba(0,0,0,0.92)');
    m.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = m;
    ctx.fillRect(0, 0, size, size);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function smokeSpriteTexture(size = 128) {
  const c = makeCanvas(size, size);
  const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, size, size);
  const rng = makeRng(31);
  for (let i = 0; i < 18; i++) {
    const x = size * (0.3 + rng.next() * 0.4);
    const y = size * (0.3 + rng.next() * 0.4);
    const r = size * (0.12 + rng.next() * 0.24);
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, 'rgba(255,255,255,0.24)');
    g.addColorStop(0.6, 'rgba(255,255,255,0.1)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
  }
  // soft circular mask
  ctx.globalCompositeOperation = 'destination-in';
  const mask = ctx.createRadialGradient(size / 2, size / 2, size * 0.05, size / 2, size / 2, size * 0.5);
  mask.addColorStop(0, 'rgba(0,0,0,1)');
  mask.addColorStop(0.62, 'rgba(0,0,0,0.82)');
  mask.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = mask;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function flashSpriteTexture(size = 128) {
  const c = makeCanvas(size, size);
  const ctx = c.getContext('2d');
  const cx = size / 2;
  const cy = size / 2;
  const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, size / 2);
  g.addColorStop(0, 'rgba(255,255,235,1)');
  g.addColorStop(0.12, 'rgba(255,232,150,0.98)');
  g.addColorStop(0.35, 'rgba(255,142,48,0.62)');
  g.addColorStop(0.7, 'rgba(210,60,20,0.16)');
  g.addColorStop(1, 'rgba(120,20,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  // a few hot streaks
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU + 0.2;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(a);
    const len = size * (0.2 + (i % 3) * 0.1);
    const sg = ctx.createLinearGradient(0, 0, len, 0);
    sg.addColorStop(0, 'rgba(255,230,170,0.6)');
    sg.addColorStop(1, 'rgba(255,110,20,0)');
    ctx.fillStyle = sg;
    ctx.fillRect(0, -1.2, len, 2.4);
    ctx.restore();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function sparkTexture(size = 32) {
  const c = makeCanvas(size, size);
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(255,255,230,1)');
  g.addColorStop(0.28, 'rgba(255,216,130,0.95)');
  g.addColorStop(0.7, 'rgba(255,110,30,0.4)');
  g.addColorStop(1, 'rgba(255,60,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function starTexture(size = 256, color = '#f4ead5') {
  const c = makeCanvas(size, size);
  const ctx = c.getContext('2d');
  ctx.translate(size / 2, size / 2);
  ctx.fillStyle = color;
  ctx.beginPath();
  const points = 5;
  const outer = size * 0.43;
  const inner = size * 0.18;
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 === 0 ? outer : inner;
    const a = -Math.PI / 2 + (i * Math.PI) / points;
    const x = Math.cos(a) * r;
    const y = Math.sin(a) * r;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.28)';
  ctx.lineWidth = size * 0.015;
  ctx.stroke();
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function insigniaTexture(color = '#f2e7cd', bg = '#3f4630', star = true) {
  const size = 256;
  const c = makeCanvas(size, size);
  const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, size, size);
  ctx.fillStyle = bg;
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, size * 0.47, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = color;
  ctx.lineWidth = size * 0.035;
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, size * 0.39, 0, TAU);
  ctx.stroke();
  if (star) {
    ctx.translate(size / 2, size / 2 + 3);
    ctx.fillStyle = color;
    ctx.beginPath();
    const outer = size * 0.29;
    const inner = size * 0.12;
    for (let i = 0; i < 10; i++) {
      const r = i % 2 === 0 ? outer : inner;
      const a = -Math.PI / 2 + (i * Math.PI) / 5;
      const x = Math.cos(a) * r;
      const y = Math.sin(a) * r;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fill();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

export function stripeTexture(colorA = '#e66a2c', colorB = '#1c1b18', stripes = 8) {
  const c = makeCanvas(256, 256);
  const ctx = c.getContext('2d');
  ctx.fillStyle = colorA;
  ctx.fillRect(0, 0, 256, 256);
  ctx.fillStyle = colorB;
  for (let i = -8; i < 20; i += 2) {
    ctx.save();
    ctx.translate(i * 32, 0);
    ctx.rotate(Math.PI / 4);
    ctx.fillRect(0, -256, 32, 768);
    ctx.restore();
  }
  return canvasTexture(c, { repeat: true });
}

export function textSprite(text, { color = '#f4ead5', bg = 'rgba(24,23,20,0.82)', border = 'rgba(244,234,213,0.3)', font = '600 42px "DM Mono", monospace', pad = 26, height = 128 } = {}) {
  const c = makeCanvas(512, height);
  const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, 512, height);
  ctx.fillStyle = bg;
  roundRect(ctx, 2, 2, 508, height - 4, 12);
  ctx.fill();
  ctx.strokeStyle = border;
  ctx.lineWidth = 2;
  roundRect(ctx, 2, 2, 508, height - 4, 12);
  ctx.stroke();
  ctx.fillStyle = color;
  ctx.font = font;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 256, height / 2 + 2, 480);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function roundRect(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

export function setShadow(obj, cast = true, receive = true) {
  obj.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = cast;
      o.receiveShadow = receive;
    }
  });
  return obj;
}

export function disposeObject(obj) {
  obj.traverse((o) => {
    if (o.geometry) o.geometry.dispose();
    if (o.material) {
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      mats.forEach((m) => {
        if (m.map) m.map.dispose();
        m.dispose();
      });
    }
  });
}

export function terrainNormal(heightFn, x, z, e = 0.8) {
  const hL = heightFn(x - e, z);
  const hR = heightFn(x + e, z);
  const hD = heightFn(x, z - e);
  const hU = heightFn(x, z + e);
  return new THREE.Vector3(hL - hR, 2 * e, hD - hU).normalize();
}

export function makeMat(color, opts = {}) {
  return new THREE.MeshStandardMaterial({
    color,
    roughness: 0.86,
    metalness: 0.04,
    ...opts,
  });
}

export function mesh(geo, mat, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

export function group(...children) {
  const g = new THREE.Group();
  children.forEach((c) => c && g.add(c));
  return g;
}

export function randomPointInDisc(rng, radius) {
  const a = rng.next() * TAU;
  const r = Math.sqrt(rng.next()) * radius;
  return [Math.cos(a) * r, Math.sin(a) * r];
}

export function formatTime(seconds) {
  const m = Math.floor(seconds / 60).toString().padStart(2, '0');
  const s = Math.floor(seconds % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

// Merge every static mesh in a group into one mesh per material. This is the
// single biggest draw-call win in the diorama. Animated subtrees can be opted
// out by setting `userData.noMerge = true` on any ancestor.
export async function mergeStaticGroupAsync(group) {
  const { mergeGeometries } = await import('three/addons/utils/BufferGeometryUtils.js');
  return mergeStaticGroup(group, mergeGeometries);
}

export function mergeStaticGroup(group, mergeGeometries) {
  if (!group || !mergeGeometries) return group;
  group.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(group.matrixWorld).invert();
  const buckets = new Map();
  const remove = [];
  const isExcluded = (obj) => {
    let o = obj;
    while (o && o !== group) {
      if (o.userData?.noMerge) return true;
      o = o.parent;
    }
    return false;
  };
  group.traverse((o) => {
    if (!o.isMesh || o.isSkinnedMesh || o.isInstancedMesh) return;
    if (!o.visible || Array.isArray(o.material)) return;
    if (o.userData.noMerge || isExcluded(o)) return;
    const mat = o.material;
    if (!mat || mat.isShaderMaterial || mat.isSpriteMaterial) return;
    // everything is normalised to non-indexed triangles with position/normal/uv
    let geo = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
    for (const name of Object.keys(geo.attributes)) {
      if (!['position', 'normal', 'uv'].includes(name)) geo.deleteAttribute(name);
    }
    if (!geo.attributes.normal) geo.computeVertexNormals();
    if (!geo.attributes.uv) {
      const count = geo.attributes.position.count;
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(count * 2), 2));
    }
    geo.clearGroups();
    geo.morphAttributes = {};
    const m = new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld);
    geo.applyMatrix4(m);
    const key = mat.uuid;
    if (!buckets.has(key)) buckets.set(key, { mat, geos: [], cast: false, receive: false });
    const bucket = buckets.get(key);
    bucket.geos.push(geo);
    bucket.cast = bucket.cast || o.castShadow;
    bucket.receive = bucket.receive || o.receiveShadow;
    remove.push(o);
  });
  if (!remove.length) return group;
  for (const o of remove) {
    if (o.parent) o.parent.remove(o);
    o.geometry.dispose();
  }
  for (const bucket of buckets.values()) {
    const merged = mergeGeometries(bucket.geos, false);
    for (const g of bucket.geos) g.dispose();
    if (!merged) continue;
    merged.computeBoundingSphere();
    const mesh = new THREE.Mesh(merged, bucket.mat);
    mesh.castShadow = bucket.cast;
    mesh.receiveShadow = bucket.receive;
    group.add(mesh);
  }
  return group;
}
