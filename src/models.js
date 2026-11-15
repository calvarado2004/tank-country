import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import {
  TAU, clamp, lerp, makeCanvas, canvasTexture, insigniaTexture, starTexture,
  makeMat, mesh, setShadow, makeRng, mergeStaticGroup,
} from './utils.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// ---------------------------------------------------------------------------
// shared materials
// ---------------------------------------------------------------------------

export const MAT = {
  olive: makeMat(0x5c6446, { roughness: 0.82 }),
  oliveDark: makeMat(0x3c412f, { roughness: 0.9 }),
  oliveLight: makeMat(0x747b56, { roughness: 0.78 }),
  track: makeMat(0x24231f, { roughness: 0.94, metalness: 0.18 }),
  rubber: makeMat(0x171613, { roughness: 0.98 }),
  steel: makeMat(0x55564b, { roughness: 0.62, metalness: 0.35 }),
  darkSteel: makeMat(0x32332c, { roughness: 0.72, metalness: 0.25 }),
  rust: makeMat(0x71412e, { roughness: 0.95 }),
  wood: makeMat(0x6b5238, { roughness: 0.94 }),
  darkWood: makeMat(0x4a3726, { roughness: 0.95 }),
  barnRed: makeMat(0x843c2c, { roughness: 0.9 }),
  barnRedDark: makeMat(0x612a20, { roughness: 0.92 }),
  roof: makeMat(0x3c3a34, { roughness: 0.9 }),
  roofRust: makeMat(0x5f4231, { roughness: 0.88 }),
  plaster: makeMat(0xc2b596, { roughness: 0.95 }),
  plasterWarm: makeMat(0xd2c2a0, { roughness: 0.94 }),
  trim: makeMat(0xd8ccb2, { roughness: 0.9 }),
  concrete: makeMat(0x9a907b, { roughness: 0.96 }),
  concreteDark: makeMat(0x6d6657, { roughness: 0.96 }),
  sandbag: makeMat(0x8f805f, { roughness: 0.98 }),
  canvas: makeMat(0x9a8b6c, { roughness: 0.98 }),
  canvasLight: makeMat(0xb2a17d, { roughness: 0.98 }),
  pine: makeMat(0x394735, { roughness: 0.98 }),
  pineLight: makeMat(0x4e5b3d, { roughness: 0.98 }),
  dryLeaf: makeMat(0x7e6e4c, { roughness: 0.98 }),
  bark: makeMat(0x4d3c2b, { roughness: 0.98 }),
  stone: makeMat(0x7e7969, { roughness: 0.98 }),
  stoneDark: makeMat(0x5b584c, { roughness: 0.98 }),
  glass: new THREE.MeshStandardMaterial({ color: 0x2f3d3a, roughness: 0.2, metalness: 0.5 }),
  windowLit: new THREE.MeshStandardMaterial({ color: 0xffcc82, emissive: 0xffa43c, emissiveIntensity: 0.6, roughness: 0.4 }),
  headlight: new THREE.MeshStandardMaterial({ color: 0xffe3a1, emissive: 0xffc76a, emissiveIntensity: 2.4, roughness: 0.25 }),
  taillight: new THREE.MeshStandardMaterial({ color: 0xff5b37, emissive: 0xff2a0d, emissiveIntensity: 1.8 }),
  black: makeMat(0x161513, { roughness: 0.8 }),
  gold: makeMat(0xb98f4d, { roughness: 0.55, metalness: 0.35 }),
  enemyPaint: makeMat(0x6d5a49, { roughness: 0.86 }),
  enemyPaintDark: makeMat(0x4a3d33, { roughness: 0.9 }),
  enemyPaintLight: makeMat(0x81705b, { roughness: 0.82 }),
  red: makeMat(0xa83828, { roughness: 0.8 }),
  teal: makeMat(0x4f7f75, { roughness: 0.8 }),
  skin: makeMat(0xa77d5c, { roughness: 0.92 }),
};

const insigniaCache = new Map();
function getInsignia(key, color, bg, star = true) {
  if (!insigniaCache.has(key)) insigniaCache.set(key, insigniaTexture(color, bg, star));
  return insigniaCache.get(key);
}

const starTextureCache = new Map();
function getStar(key, color) {
  if (!starTextureCache.has(key)) starTextureCache.set(key, starTexture(256, color));
  return starTextureCache.get(key);
}

// ---------------------------------------------------------------------------
// small helpers
// ---------------------------------------------------------------------------

function box(w, h, d, mat, x = 0, y = 0, z = 0, radius = 0) {
  const geo = radius > 0 ? new RoundedBoxGeometry(w, h, d, 2, radius) : new THREE.BoxGeometry(w, h, d);
  return mesh(geo, mat, x, y, z);
}

function cyl(rt, rb, h, mat, x = 0, y = 0, z = 0, seg = 12) {
  return mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat, x, y, z);
}

function plane(w, h, mat, x = 0, y = 0, z = 0) {
  const m = mesh(new THREE.PlaneGeometry(w, h), mat, x, y, z);
  m.castShadow = false;
  return m;
}

function decalStar(size, color, x, y, z, rotation = -Math.PI / 2) {
  const mat = new THREE.MeshBasicMaterial({
    map: getStar('star-' + color, color),
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    toneMapped: false,
    opacity: 0.9,
  });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size), mat);
  m.rotation.x = rotation;
  m.position.set(x, y, z);
  m.renderOrder = 2;
  return m;
}

function insigniaBadge(size, color, bg, x, y, z, rotY = 0) {
  const mat = new THREE.MeshBasicMaterial({
    map: getInsignia(color + bg, color, bg),
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    toneMapped: false,
  });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size), mat);
  m.position.set(x, y, z);
  m.rotation.y = rotY;
  m.renderOrder = 2;
  return m;
}

function rivetsAlong(parent, mat, count, x, y, zStart, zEnd, radius = 0.035) {
  for (let i = 0; i < count; i++) {
    const t = i / (count - 1);
    const r = mesh(new THREE.SphereGeometry(radius, 5, 4), mat, x, y, lerp(zStart, zEnd, t));
    r.castShadow = false;
    parent.add(r);
  }
}

function cableCurve(points, mat, radius = 0.035) {
  const curve = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p)));
  const m = mesh(new THREE.TubeGeometry(curve, 18, radius, 5, false), mat);
  m.castShadow = false;
  return m;
}

function mergeStatic(group) {
  return mergeStaticGroup(group, mergeGeometries);
}

function addTreadLugs(group, x, y, z, width, length, mat) {
  const lugs = [];
  for (let i = 0; i < 15; i++) {
    const lug = box(width, 0.07, 0.19, mat, 0, 0, 0, 0.015);
    lug.castShadow = false;
    group.add(lug);
    lugs.push(lug);
  }
  return lugs;
}

// ---------------------------------------------------------------------------
// tank
// ---------------------------------------------------------------------------

export function createTank({
  enemy = false,
  heavy = false,
  color,
  accent,
  starColor,
  name = 'tank',
} = {}) {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);

  const paint = color ? makeMat(color, { roughness: 0.84 }) : enemy ? MAT.enemyPaint : MAT.olive;
  const paintDark = enemy ? MAT.enemyPaintDark : MAT.oliveDark;
  const paintLight = enemy ? MAT.enemyPaintLight : MAT.oliveLight;
  const accentMat = accent ? makeMat(accent, { roughness: 0.8 }) : enemy ? MAT.red : MAT.oliveLight;

  const hullW = heavy ? 4.15 : 3.7;
  const hullL = heavy ? 6.8 : 6.15;
  const trackW = heavy ? 0.9 : 0.78;

  // running gear -----------------------------------------------------------
  const wheels = [];
  const tracks = [];
  for (const side of [-1, 1]) {
    const trackGroup = new THREE.Group();
    trackGroup.position.set(side * (hullW * 0.43), 0.58, 0);
    body.add(trackGroup);
    tracks.push(trackGroup);

    const band = box(trackW, 0.92, hullL * 0.98, MAT.track, 0, 0, 0, 0.12);
    trackGroup.add(band);
    const upper = box(trackW * 0.92, 0.18, hullL * 0.93, MAT.darkSteel, 0, 0.42, 0, 0.06);
    trackGroup.add(upper);
    const lower = box(trackW * 0.92, 0.2, hullL * 0.93, MAT.darkSteel, 0, -0.4, 0, 0.06);
    trackGroup.add(lower);

    // road wheels
    const wheelCount = heavy ? 7 : 6;
    for (let i = 0; i < wheelCount; i++) {
      const z = -hullL * 0.38 + (i / (wheelCount - 1)) * hullL * 0.76;
      const wheelGroup = new THREE.Group();
      wheelGroup.userData.noMerge = true;
      wheelGroup.position.set(side * (trackW * 0.52), -0.13, z);
      const wheel = mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.17, 12), MAT.darkSteel, 0, 0, 0);
      wheel.rotation.z = Math.PI / 2;
      wheelGroup.add(wheel);
      const hub = mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.2, 8), MAT.steel, side * 0.02, 0, 0);
      hub.rotation.z = Math.PI / 2;
      wheelGroup.add(hub);
      trackGroup.add(wheelGroup);
      wheels.push(wheelGroup);
    }

    // drive sprocket / idler
    for (const z of [-hullL * 0.44, hullL * 0.44]) {
      const sprocket = mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.2, 10), MAT.steel, side * (trackW * 0.52), 0.12, z);
      sprocket.rotation.z = Math.PI / 2;
      trackGroup.add(sprocket);
      wheels.push(sprocket);
    }

    // fender
    const fender = box(trackW + 0.15, 0.1, hullL * 0.99, paintDark, 0, 0.5, 0, 0.04);
    body.add(fender);
    fender.position.x = side * (hullW * 0.43);

    // side skirt / armor
    if (heavy) {
      const skirt = box(0.09, 0.6, hullL * 0.7, paintDark, side * (hullW * 0.5 + 0.1), 0.6, -0.1, 0.02);
      body.add(skirt);
    }

    // track lugs
    const lugs = addTreadLugs(trackGroup, 0, 0, 0, trackW + 0.02, hullL, MAT.track);
    lugs.forEach((lug, i) => {
      const t = i / lugs.length;
      lug.userData.noMerge = true;
      lug.position.set(0, 0.49, -hullL * 0.45 + t * hullL * 0.9);
    });
    trackGroup.userData.lugs = lugs;
  }

  // hull -------------------------------------------------------------------
  const lowerHull = box(hullW, 0.8, hullL * 0.91, paint, 0, 1.02, 0, 0.14);
  body.add(lowerHull);

  const upperHull = box(hullW * 0.9, 0.56, hullL * 0.72, paintLight, 0, 1.5, -0.15, 0.12);
  body.add(upperHull);

  // sloped glacis
  const glacis = box(hullW * 0.88, 0.13, 1.5, paintLight, 0, 1.42, hullL * 0.36, 0.04);
  glacis.rotation.x = -0.68;
  body.add(glacis);

  // rear plate and engine deck
  const rear = box(hullW * 0.85, 0.5, 0.32, paintDark, 0, 1.28, -hullL * 0.43, 0.06);
  body.add(rear);
  const engineDeck = box(hullW * 0.72, 0.11, 1.55, paintDark, 0, 1.81, -1.25, 0.04);
  body.add(engineDeck);
  for (let i = 0; i < 5; i++) {
    const vent = box(hullW * 0.56, 0.04, 0.07, MAT.darkSteel, 0, 1.87, -1.78 + i * 0.25, 0.01);
    vent.castShadow = false;
    body.add(vent);
  }

  // stowage and tools
  const stowL = box(0.58, 0.36, 1.1, paintDark, -hullW * 0.39, 1.7, -1.1, 0.06);
  body.add(stowL);
  const stowR = box(0.52, 0.3, 0.7, paintDark, hullW * 0.38, 1.64, -1.5, 0.05);
  body.add(stowR);
  const toolBox = box(0.2, 0.1, 1.5, MAT.darkWood, hullW * 0.28, 1.83, 0.3, 0.02);
  toolBox.rotation.y = 0.02;
  body.add(toolBox);
  // tow cable draped along the side
  body.add(cableCurve([
    [-hullW * 0.48, 1.45, 1.7], [-hullW * 0.5, 1.2, 0.5], [-hullW * 0.48, 1.35, -0.9], [-hullW * 0.44, 1.7, -1.9],
  ], MAT.darkSteel, 0.032));
  // spare track links on glacis
  for (let i = 0; i < 4; i++) {
    const link = box(0.46, 0.09, 0.18, MAT.track, -0.35 + i * 0.23, 1.7, hullL * 0.43, 0.015);
    link.rotation.x = -0.68;
    body.add(link);
  }

  // headlights / guards
  for (const side of [-1, 1]) {
    const light = mesh(new THREE.CylinderGeometry(0.12, 0.14, 0.13, 10), MAT.headlight, side * (hullW * 0.31), 1.72, hullL * 0.46);
    light.rotation.x = Math.PI / 2;
    body.add(light);
    const guard = box(0.28, 0.05, 0.24, paintDark, side * (hullW * 0.31), 1.83, hullL * 0.46, 0.02);
    body.add(guard);
  }
  const tailL = mesh(new THREE.BoxGeometry(0.16, 0.08, 0.05), MAT.taillight, -hullW * 0.35, 1.5, -hullL * 0.46);
  const tailR = tailL.clone();
  tailR.position.x = hullW * 0.35;
  body.add(tailL, tailR);

  // driver hatch
  const driverHatch = mesh(new THREE.CylinderGeometry(0.26, 0.26, 0.08, 12), paintDark, -0.55, 1.84, hullL * 0.22);
  body.add(driverHatch);
  const periscope = box(0.16, 0.08, 0.1, MAT.darkSteel, -0.55, 1.9, hullL * 0.31);
  body.add(periscope);

  // insignia on the hull deck
  body.add(decalStar(0.9, enemy ? '#b44232' : '#e7ddc6', hullW * 0.26, 1.84, 0.52));

  // turret -----------------------------------------------------------------
  const turret = new THREE.Group();
  turret.userData.noMerge = true;
  turret.position.set(0, 1.96, -0.25);
  body.add(turret);

  const turretBase = mesh(new THREE.CylinderGeometry(1.08, 1.17, 0.22, 16), paintDark, 0, 0.11, 0);
  turret.add(turretBase);

  const turretDome = mesh(new THREE.SphereGeometry(1.0, 20, 10, 0, TAU, 0, Math.PI * 0.52), paint, 0, 0.18, 0);
  turretDome.scale.set(heavy ? 1.18 : 1.08, 0.58, heavy ? 1.34 : 1.25);
  turret.add(turretDome);

  const bustle = box(1.42, 0.48, 0.75, paint, 0, 0.36, -0.92, 0.14);
  turret.add(bustle);
  const bustleBox = box(0.95, 0.28, 0.32, paintDark, 0, 0.58, -1.13, 0.05);
  turret.add(bustleBox);

  // mantlet
  const mantlet = box(1.18, 0.54, 0.7, paintDark, 0, 0.4, 0.92, 0.12);
  mantlet.rotation.x = -0.04;
  turret.add(mantlet);
  const mantletCanvas = box(0.72, 0.48, 0.2, MAT.rubber, 0, 0.4, 1.24, 0.06);
  turret.add(mantletCanvas);

  // barrel pivot
  const barrelPivot = new THREE.Group();
  barrelPivot.userData.noMerge = true;
  barrelPivot.position.set(0, 0.4, 1.1);
  turret.add(barrelPivot);

  const barrelLength = heavy ? 4.15 : 3.65;
  const barrel = mesh(new THREE.CylinderGeometry(0.105, 0.135, barrelLength, 12), paintDark, 0, 0, barrelLength / 2);
  barrel.rotation.x = Math.PI / 2;
  barrelPivot.add(barrel);
  const fume = mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.45, 12), paintDark, 0, 0, barrelLength * 0.55);
  fume.rotation.x = Math.PI / 2;
  barrelPivot.add(fume);
  const brake = box(0.28, 0.28, 0.5, MAT.darkSteel, 0, 0, barrelLength + 0.16, 0.04);
  barrelPivot.add(brake);
  const brakeSlot = box(0.34, 0.08, 0.13, MAT.black, 0, 0, barrelLength + 0.2);
  barrelPivot.add(brakeSlot);
  // muzzle flash anchor
  const muzzle = new THREE.Object3D();
  muzzle.position.set(0, 0, barrelLength + 0.45);
  barrelPivot.add(muzzle);
  const muzzleFlash = new THREE.PointLight(0xffa84a, 0, 14, 2);
  muzzle.add(muzzleFlash);

  // cupola and hatch
  const cupola = mesh(new THREE.CylinderGeometry(0.38, 0.42, 0.27, 12), paintLight, 0.43, 0.58, -0.12);
  turret.add(cupola);
  const hatch = mesh(new THREE.CylinderGeometry(0.33, 0.33, 0.07, 12), paintDark, 0.43, 0.74, -0.12);
  turret.add(hatch);
  const hatchHandle = cableCurve([
    [0.25, 0.79, -0.12], [0.45, 0.86, -0.1], [0.63, 0.79, -0.12],
  ], MAT.steel, 0.018);
  turret.add(hatchHandle);

  // commander machine gun
  const mgBase = box(0.18, 0.13, 0.25, MAT.darkSteel, 0.45, 0.83, 0.22);
  turret.add(mgBase);
  const mgBarrel = mesh(new THREE.CylinderGeometry(0.035, 0.04, 0.9, 8), MAT.darkSteel, 0.45, 0.93, 0.6);
  mgBarrel.rotation.x = Math.PI / 2;
  turret.add(mgBarrel);
  const mgMag = box(0.13, 0.22, 0.13, MAT.darkSteel, 0.45, 0.94, 0.17);
  turret.add(mgMag);

  // smoke launchers
  for (const side of [-1, 1]) {
    for (let i = 0; i < 2; i++) {
      const tube = mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.3, 7), MAT.darkSteel, side * (0.74 + i * 0.13), 0.37, 0.48);
      tube.rotation.x = 0.4;
      tube.rotation.z = side * 0.15;
      turret.add(tube);
    }
  }

  // antenna
  const antenna = mesh(new THREE.CylinderGeometry(0.018, 0.028, 1.9, 5), MAT.darkSteel, -0.66, 1.18, -0.72);
  antenna.rotation.z = -0.12;
  turret.add(antenna);
  const antennaTip = mesh(new THREE.SphereGeometry(0.035, 5, 4), MAT.red, -0.77, 2.11, -0.72);
  turret.add(antennaTip);

  // turret star / insignia
  turret.add(decalStar(heavy ? 0.85 : 0.72, starColor || (enemy ? '#b44232' : '#e7ddc6'), 0, 0.805, 0.02));
  if (enemy) {
    turret.add(insigniaBadge(0.48, '#b44232', '#4a3d33', 0.8, 0.45, -0.35, Math.PI / 2));
  } else {
    turret.add(insigniaBadge(0.5, '#e7ddc6', '#3c412f', -0.88, 0.45, -0.35, -Math.PI / 2));
  }

  // armored collar at turret ring
  const collar = mesh(new THREE.TorusGeometry(1.05, 0.06, 6, 24), MAT.rubber, 0, 0.02, 0);
  collar.rotation.x = Math.PI / 2;
  turret.add(collar);

  mergeStatic(body);
  mergeStatic(turret);
  mergeStatic(barrelPivot);

  root.userData = {
    wheels,
    tracks,
    turret,
    barrelPivot,
    barrelLength,
    muzzle,
    muzzleFlash,
    body,
    paint,
    paintDark,
    paintLight,
    name,
    isTank: true,
  };

  setShadow(root, true, true);
  root.name = name;
  return root;
}

export function animateTankTracks(tank, speed, dt) {
  const u = tank.userData;
  if (!u || !u.wheels) return;
  for (const wheel of u.wheels) wheel.rotation.x += speed * dt * 0.6;
  for (const track of u.tracks) {
    const lugs = track.userData.lugs;
    if (!lugs) continue;
    const span = 5.5;
    for (const lug of lugs) {
      lug.position.z += speed * dt;
      if (lug.position.z > span * 0.45) lug.position.z -= span * 0.9;
      if (lug.position.z < -span * 0.45) lug.position.z += span * 0.9;
    }
  }
}

export function setTankMaterials(tank, tint, emissive) {
  tank.traverse((o) => {
    if (o.isMesh && o.material && o.material.color) {
      if (o.material === MAT.track || o.material === MAT.rubber || o.material === MAT.glass) return;
      if (!o.material.userData._origColor) o.material.userData._origColor = o.material.color.clone();
      o.material = o.material.clone();
      o.material.color.copy(tint);
      if (emissive) {
        o.material.emissive = new THREE.Color(emissive);
        o.material.emissiveIntensity = 0.2;
      }
    }
  });
}

// ---------------------------------------------------------------------------
// infantry
// ---------------------------------------------------------------------------

export function createInfantry({ enemy = false, at = false } = {}) {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);

  const uniform = enemy ? MAT.enemyPaint : MAT.olive;
  const uniformDark = enemy ? MAT.enemyPaintDark : MAT.oliveDark;
  const helmetMat = enemy ? MAT.enemyPaintDark : MAT.oliveDark;

  // torso, belt, webbing
  body.add(box(0.44, 0.58, 0.28, uniform, 0, 1.13, 0, 0.06));
  body.add(box(0.46, 0.09, 0.3, uniformDark, 0, 0.87, 0, 0.02));
  body.add(box(0.28, 0.14, 0.06, MAT.darkSteel, 0, 1.08, 0.16, 0.01));

  // head and helmet
  body.add(mesh(new THREE.SphereGeometry(0.16, 8, 6), MAT.skin, 0, 1.52, 0));
  body.add(mesh(new THREE.SphereGeometry(0.2, 8, 5, 0, TAU, 0, Math.PI * 0.55), helmetMat, 0, 1.56, 0));

  // pack
  body.add(box(0.3, 0.4, 0.2, MAT.wood, 0, 1.15, -0.24, 0.03));

  // rifle or shoulder launcher
  if (at) {
    const tube = mesh(new THREE.CylinderGeometry(0.075, 0.075, 1.05, 6), MAT.darkSteel, 0.26, 1.3, 0.18);
    tube.rotation.x = Math.PI / 2;
    body.add(tube);
    body.add(box(0.13, 0.13, 0.18, MAT.darkSteel, 0.26, 1.3, 0.7, 0.02));
    const tip = mesh(new THREE.ConeGeometry(0.09, 0.22, 6), MAT.red, 0.26, 1.3, 0.84);
    tip.rotation.x = Math.PI / 2;
    body.add(tip);
  } else {
    body.add(box(0.055, 0.07, 0.88, MAT.darkSteel, 0.2, 1.14, 0.3, 0.01));
    body.add(box(0.08, 0.16, 0.08, MAT.wood, 0.2, 1.04, 0.12, 0.01));
  }

  // arms
  body.add(box(0.13, 0.5, 0.14, uniform, -0.3, 1.12, 0.05, 0.03));
  body.add(box(0.13, 0.5, 0.14, uniform, 0.3, 1.12, at ? 0.12 : 0.18, 0.03));

  // muzzle anchor, kept out of the merge
  const muzzle = new THREE.Object3D();
  muzzle.userData.noMerge = true;
  muzzle.position.set(at ? 0.26 : 0.2, at ? 1.3 : 1.14, at ? 0.98 : 0.78);
  body.add(muzzle);

  // legs pivot at the hips so they can swing while walking
  const legL = new THREE.Group();
  legL.position.set(-0.12, 0.84, 0);
  legL.userData.noMerge = true;
  root.add(legL);
  legL.add(box(0.15, 0.62, 0.17, uniformDark, 0, -0.3, 0, 0.02));
  legL.add(box(0.17, 0.12, 0.28, MAT.darkSteel, 0, -0.62, 0.05, 0.02));

  const legR = new THREE.Group();
  legR.position.set(0.12, 0.84, 0);
  legR.userData.noMerge = true;
  root.add(legR);
  legR.add(box(0.15, 0.62, 0.17, uniformDark, 0, -0.3, 0, 0.02));
  legR.add(box(0.17, 0.12, 0.28, MAT.darkSteel, 0, -0.62, 0.05, 0.02));

  mergeStatic(body);

  setShadow(root, true, true);
  root.name = enemy ? 'crimson-infantry' : 'rifleman';
  root.userData = { body, legL, legR, muzzle, isInfantry: true, at };
  return root;
}

// ---------------------------------------------------------------------------
// artillery
// ---------------------------------------------------------------------------

export function createArtillery({ enemy = true } = {}) {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const paint = enemy ? MAT.enemyPaint : MAT.olive;
  const paintDark = enemy ? MAT.enemyPaintDark : MAT.oliveDark;
  const paintLight = enemy ? MAT.enemyPaintLight : MAT.oliveLight;
  const hullW = 3.6;
  const hullL = 6.2;
  const wheels = [];
  const tracks = [];

  for (const side of [-1, 1]) {
    const trackGroup = new THREE.Group();
    trackGroup.position.set(side * (hullW * 0.44), 0.55, 0);
    body.add(trackGroup);
    tracks.push(trackGroup);
    trackGroup.add(box(0.8, 0.82, hullL * 0.96, MAT.track, 0, 0, 0, 0.12));
    for (let i = 0; i < 6; i++) {
      const wheelGroup = new THREE.Group();
      wheelGroup.position.set(side * 0.42, -0.11, -2.25 + i * 0.9);
      const wheel = mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.16, 12), MAT.darkSteel, 0, 0, 0);
      wheel.rotation.z = Math.PI / 2;
      wheelGroup.add(wheel);
      trackGroup.add(wheelGroup);
      wheels.push(wheelGroup);
    }
    body.add(box(0.98, 0.09, hullL * 0.98, paintDark, side * (hullW * 0.44), 0.49, 0, 0.03));
  }

  body.add(box(hullW, 0.75, hullL * 0.88, paint, 0, 1.0, 0, 0.12));
  body.add(box(hullW * 0.86, 0.45, hullL * 0.52, paintDark, 0, 1.55, -1.1, 0.08));
  body.add(box(hullW * 0.8, 0.13, 0.8, paintLight, 0, 1.55, 2.25, 0.04));
  // outriggers / recoil spades
  for (const side of [-1, 1]) {
    body.add(box(0.18, 0.16, 1.5, MAT.darkSteel, side * (hullW * 0.38), 0.38, -2.9, 0.04));
  }

  // gun mount
  const turret = new THREE.Group();
  turret.userData.noMerge = true;
  turret.position.set(0, 1.7, 0.1);
  body.add(turret);
  turret.add(mesh(new THREE.CylinderGeometry(0.9, 1.1, 0.4, 14), paintDark, 0, 0.15, 0));
  const shield = box(1.8, 1.15, 0.14, paint, 0, 0.75, 0.55, 0.04);
  shield.rotation.x = -0.14;
  turret.add(shield);
  // shield side wings
  for (const side of [-1, 1]) {
    const wing = box(0.7, 0.9, 0.12, paint, side * 0.98, 0.6, 0.48, 0.03);
    wing.rotation.y = side * 0.3;
    turret.add(wing);
  }

  const barrelPivot = new THREE.Group();
  barrelPivot.userData.noMerge = true;
  barrelPivot.position.set(0, 0.75, 0.35);
  turret.add(barrelPivot);
  const barrelLength = 5.4;
  const barrel = mesh(new THREE.CylinderGeometry(0.095, 0.14, barrelLength, 10), paintDark, 0, 0, barrelLength / 2);
  barrel.rotation.x = Math.PI / 2;
  barrelPivot.add(barrel);
  const cradle = box(0.4, 0.3, 1.2, paintDark, 0, -0.02, 0.7, 0.05);
  barrelPivot.add(cradle);
  const brake = box(0.3, 0.3, 0.5, MAT.darkSteel, 0, 0, barrelLength + 0.18, 0.04);
  barrelPivot.add(brake);
  const muzzle = new THREE.Object3D();
  muzzle.position.set(0, 0, barrelLength + 0.48);
  barrelPivot.add(muzzle);
  const muzzleFlash = new THREE.PointLight(0xffa84a, 0, 18, 2);
  muzzle.add(muzzleFlash);
  barrelPivot.rotation.x = -0.45;

  // seat / controls
  const seat = box(0.3, 0.4, 0.3, MAT.darkWood, -0.85, 0.75, -0.3);
  turret.add(seat);
  turret.add(box(0.18, 0.1, 0.24, MAT.darkSteel, -0.85, 0.58, 0.2));

  mergeStatic(body);
  mergeStatic(turret);
  mergeStatic(barrelPivot);

  mergeStatic(body);
  mergeStatic(turret);
  mergeStatic(barrelPivot);
  root.userData = {
    wheels,
    tracks,
    turret,
    barrelPivot,
    barrelLength,
    muzzle,
    muzzleFlash,
    body,
    paint,
    name: 'artillery',
    isArtillery: true,
  };
  setShadow(root);
  return root;
}

// ---------------------------------------------------------------------------
// bomber
// ---------------------------------------------------------------------------

export function createBomber({ enemy = true } = {}) {
  const root = new THREE.Group();
  const paint = enemy ? MAT.enemyPaintLight : MAT.steel;
  const dark = enemy ? MAT.enemyPaintDark : MAT.darkSteel;
  const accent = enemy ? MAT.red : MAT.oliveDark;

  // fuselage
  const fuselage = mesh(new THREE.CylinderGeometry(0.9, 0.55, 11.5, 12), paint, 0, 0, 0);
  fuselage.rotation.x = Math.PI / 2;
  root.add(fuselage);
  const nose = mesh(new THREE.SphereGeometry(0.92, 14, 10, 0, TAU, 0, Math.PI / 2), paint, 0, 0, 5.7);
  nose.rotation.x = Math.PI / 2;
  root.add(nose);
  const tailCone = mesh(new THREE.ConeGeometry(0.58, 3.2, 10), paint, 0, 0.2, -6.8);
  tailCone.rotation.x = -Math.PI / 2;
  root.add(tailCone);

  // cockpit glass
  const cockpit = mesh(new THREE.SphereGeometry(0.58, 12, 8, 0, TAU, 0, Math.PI / 2), MAT.glass, 0, 0.58, 4.35);
  cockpit.scale.set(1.05, 0.8, 1.5);
  root.add(cockpit);

  // wings
  const wing = box(22, 0.3, 2.4, paint, 0, 0.08, 0.2, 0.07);
  root.add(wing);
  const wingRoot = box(7.5, 0.55, 3.4, paint, 0, 0.02, 0.1, 0.1);
  root.add(wingRoot);
  // wing tips angled
  for (const side of [-1, 1]) {
    const tip = box(2.2, 0.24, 2.1, dark, side * 11.2, 0.07, 0.18, 0.05);
    tip.rotation.y = side * 0.08;
    root.add(tip);
    const tipLight = mesh(new THREE.SphereGeometry(0.09, 6, 5), side < 0 ? MAT.red : new THREE.MeshBasicMaterial({ color: 0x7ad2a0, toneMapped: false }), side * 11.9, 0.12, 0.2);
    root.add(tipLight);
  }

  // engines + props
  const propellers = [];
  const engineOffsets = [-7.1, -3.8, 3.8, 7.1];
  for (const x of engineOffsets) {
    const nacelle = mesh(new THREE.CylinderGeometry(0.38, 0.5, 2.7, 10), dark, x, -0.08, 0.3);
    nacelle.rotation.x = Math.PI / 2;
    root.add(nacelle);
    const intake = mesh(new THREE.CylinderGeometry(0.44, 0.4, 0.4, 10), MAT.black, x, -0.08, 1.7);
    intake.rotation.x = Math.PI / 2;
    root.add(intake);
    const propGroup = new THREE.Group();
    propGroup.userData.noMerge = true;
    propGroup.position.set(x, -0.08, 1.96);
    for (let i = 0; i < 4; i++) {
      const blade = box(0.18, 1.7, 0.06, MAT.darkSteel, 0, 0, 0);
      blade.rotation.z = (i / 4) * TAU;
      blade.position.set(Math.sin((i / 4) * TAU) * 0.65, Math.cos((i / 4) * TAU) * 0.65, 0);
      propGroup.add(blade);
    }
    const spinner = mesh(new THREE.ConeGeometry(0.16, 0.38, 8), MAT.steel, 0, 0, 0.08);
    spinner.rotation.x = Math.PI / 2;
    propGroup.add(spinner);
    root.add(propGroup);
    propellers.push(propGroup);
  }

  // tail
  const tailPlane = box(6.8, 0.22, 1.35, paint, 0, 0.32, -6.2, 0.05);
  root.add(tailPlane);
  const fin = box(0.22, 2.4, 1.9, paint, 0, 1.25, -6.55, 0.06);
  fin.rotation.x = -0.15;
  root.add(fin);
  const rudder = box(0.18, 1.7, 0.6, accent, 0, 1.1, -7.5, 0.04);
  root.add(rudder);

  // bomb bay doors
  const bay = box(2.1, 0.16, 4.3, MAT.darkSteel, 0, -0.82, -0.5, 0.03);
  root.add(bay);
  // fuselage stripe / star
  const star = decalStar(1.9, enemy ? '#b44232' : '#e7ddc6', 0, 0.93, 0.4, -Math.PI / 2);
  root.add(star);
  const sideStar = insigniaBadge(1.3, enemy ? '#b44232' : '#e7ddc6', enemy ? '#4a3d33' : '#55564b', 0.9, 0.35, 0.4, Math.PI / 2);
  root.add(sideStar);

  // bomb racks
  for (const x of [-1.3, 1.3]) {
    for (let i = 0; i < 3; i++) {
      const bomb = mesh(new THREE.CapsuleGeometry(0.15, 0.6, 4, 6), MAT.darkSteel, x, -1.1, 0.6 - i * 0.9);
      bomb.rotation.x = Math.PI / 2;
      root.add(bomb);
    }
  }

  // nav lights
  const bellyLight = new THREE.PointLight(0xff5b37, 0.7, 8, 2);
  bellyLight.position.set(0, -1.3, 0);
  root.add(bellyLight);

  mergeStatic(root);
  root.userData = {
    propellers,
    isBomber: true,
    name: 'bomber',
  };
  setShadow(root, true, false);
  return root;
}

// ---------------------------------------------------------------------------
// flak gun
// ---------------------------------------------------------------------------

export function createFlakGun() {
  const root = new THREE.Group();
  const base = mesh(new THREE.CylinderGeometry(1.15, 1.4, 0.4, 12), MAT.concreteDark, 0, 0.2, 0);
  root.add(base);
  const mount = mesh(new THREE.CylinderGeometry(0.55, 0.75, 0.7, 10), MAT.steel, 0, 0.72, 0);
  root.add(mount);
  const yawGroup = new THREE.Group();
  yawGroup.userData.noMerge = true;
  yawGroup.position.set(0, 1.05, 0);
  root.add(yawGroup);
  const cradle = box(0.85, 0.55, 0.8, MAT.steel, 0, 0, 0, 0.08);
  yawGroup.add(cradle);
  const barrels = new THREE.Group();
  barrels.position.set(0, 0.15, 0.3);
  yawGroup.add(barrels);
  for (const side of [-1, 1]) {
    const barrel = mesh(new THREE.CylinderGeometry(0.055, 0.075, 2.5, 8), MAT.darkSteel, side * 0.17, 0, 1.2);
    barrel.rotation.x = Math.PI / 2;
    barrels.add(barrel);
  }
  const shield = box(1.5, 0.9, 0.1, MAT.enemyPaintDark, 0, 0.1, 0.75, 0.03);
  shield.rotation.x = -0.2;
  yawGroup.add(shield);
  const muzzle = new THREE.Object3D();
  muzzle.position.set(0, 0, 2.5);
  barrels.add(muzzle);
  const muzzleFlash = new THREE.PointLight(0xffc766, 0, 10, 2);
  muzzle.add(muzzleFlash);
  // seat
  yawGroup.add(box(0.32, 0.35, 0.32, MAT.darkWood, -0.75, 0.1, -0.45));
  mergeStatic(root);
  root.userData = { yawGroup, barrels, muzzle, muzzleFlash, isFlak: true };
  setShadow(root);
  return root;
}

// ---------------------------------------------------------------------------
// flags
// ---------------------------------------------------------------------------

const flagGeoCache = new Map();
export function createFlag(color = 0x4f7f75, height = 5.6) {
  const group = new THREE.Group();
  const pole = mesh(new THREE.CylinderGeometry(0.055, 0.075, height, 8), MAT.steel, 0, height / 2, 0);
  group.add(pole);
  const base = mesh(new THREE.CylinderGeometry(0.28, 0.36, 0.28, 8), MAT.concreteDark, 0, 0.14, 0);
  group.add(base);
  const ball = mesh(new THREE.SphereGeometry(0.11, 8, 6), MAT.gold, 0, height + 0.04, 0);
  group.add(ball);
  let geo = flagGeoCache.get(height);
  if (!geo) {
    geo = new THREE.PlaneGeometry(2.35, 1.45, 14, 7);
    geo.translate(1.18, 0, 0);
    flagGeoCache.set(height, geo);
  }
  const mat = new THREE.MeshStandardMaterial({
    color,
    side: THREE.DoubleSide,
    roughness: 0.94,
    metalness: 0,
  });
  const cloth = new THREE.Mesh(geo.clone(), mat);
  cloth.userData.noMerge = true;
  cloth.position.set(0, height - 0.92, 0);
  cloth.castShadow = true;
  group.add(cloth);
  const starMat = new THREE.MeshBasicMaterial({
    map: getStar('flag-star', '#efe3c9'),
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    toneMapped: false,
  });
  const star = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.7), starMat);
  star.position.set(0.85, 0, 0.01);
  cloth.add(star);
  mergeStatic(group);
  group.userData = {
    cloth,
    star,
    basePositions: cloth.geometry.attributes.position.array.slice(),
    phase: Math.random() * TAU,
    isFlag: true,
  };
  return group;
}

export function updateFlag(flag, time) {
  const u = flag.userData;
  if (!u || !u.cloth) return;
  const pos = u.cloth.geometry.attributes.position;
  const base = u.basePositions;
  for (let i = 0; i < pos.count; i++) {
    const x = base[i * 3];
    const y = base[i * 3 + 1];
    const wave = Math.sin(x * 3.4 + time * 4.4 + u.phase) * 0.16 * (x / 2.35);
    const wave2 = Math.cos(x * 2.1 - time * 2.7 + u.phase) * 0.07 * (x / 2.35);
    pos.setXYZ(i, x, y + wave2, wave);
  }
  pos.needsUpdate = true;
  u.cloth.geometry.computeVertexNormals();
}

export function setFlagColor(flag, color) {
  if (flag?.userData?.cloth) flag.userData.cloth.material.color.set(color);
}

// ---------------------------------------------------------------------------
// buildings & props
// ---------------------------------------------------------------------------

export function createBarn() {
  const root = new THREE.Group();
  const intact = new THREE.Group();
  const debris = new THREE.Group();
  debris.visible = false;
  root.add(intact, debris);

  const W = 7.4;
  const D = 10.2;
  const H = 4.0;

  // stone foundation
  intact.add(box(W + 0.35, 0.5, D + 0.35, MAT.stoneDark, 0, 0.25, 0, 0.05));
  // main body
  intact.add(box(W, H, D, MAT.barnRed, 0, 0.5 + H / 2, 0, 0.04));

  // vertical battens
  for (let i = 0; i < 9; i++) {
    const z = -D / 2 + 0.55 + i * ((D - 1.1) / 8);
    intact.add(box(0.08, H * 0.94, 0.08, MAT.barnRedDark, W / 2 + 0.02, 0.5 + H / 2, z));
    intact.add(box(0.08, H * 0.94, 0.08, MAT.barnRedDark, -W / 2 - 0.02, 0.5 + H / 2, z));
  }
  for (let i = 0; i < 6; i++) {
    const x = -W / 2 + 0.7 + i * ((W - 1.4) / 5);
    intact.add(box(0.08, H * 0.94, 0.08, MAT.barnRedDark, x, 0.5 + H / 2, D / 2 + 0.02));
  }

  // gambrel roof - two lower slopes + upper ridge
  const roofY = 0.5 + H;
  for (const side of [-1, 1]) {
    const lower = box(W / 2 + 0.8, 0.16, D + 1.2, MAT.roof, side * (W / 4 + 0.1), roofY + 0.9, 0, 0.03);
    lower.rotation.z = side * -0.56;
    intact.add(lower);
    const upper = box(W / 4 + 0.4, 0.15, D + 1.1, MAT.roofRust, side * (W * 0.34), roofY + 2.35, 0, 0.03);
    upper.rotation.z = side * -0.72;
    intact.add(upper);
  }
  intact.add(box(0.18, 0.12, D + 1.1, MAT.trim, 0, roofY + 3.35, 0));
  // cupola
  const cupola = box(1.15, 1.1, 1.15, MAT.barnRedDark, 0, roofY + 3.65, -D * 0.16, 0.03);
  intact.add(cupola);
  const cupolaRoof = mesh(new THREE.ConeGeometry(0.9, 0.7, 4), MAT.roof, 0, roofY + 4.55, -D * 0.16);
  cupolaRoof.rotation.y = Math.PI / 4;
  intact.add(cupolaRoof);

  // front doors
  intact.add(box(3.4, 3.0, 0.16, MAT.darkWood, 0, 2.0, D / 2 + 0.09, 0.02));
  intact.add(box(0.14, 3.15, 0.18, MAT.trim, 0, 2.0, D / 2 + 0.18));
  intact.add(box(3.55, 0.14, 0.18, MAT.trim, 0, 3.5, D / 2 + 0.18));
  // X braces
  for (const side of [-1, 1]) {
    const brace = box(0.12, 3.7, 0.12, MAT.trim, side * 0.85, 2.0, D / 2 + 0.24);
    brace.rotation.z = side * 0.72;
    intact.add(brace);
  }
  // hayloft door
  intact.add(box(1.4, 1.3, 0.12, MAT.darkWood, 0, roofY + 0.85, D / 2 + 0.14));
  intact.add(box(0.1, 1.35, 0.15, MAT.trim, 0, roofY + 0.85, D / 2 + 0.2));
  // side windows
  for (const side of [-1, 1]) {
    for (const z of [-2.8, 0.2, 3.0]) {
      const win = box(0.13, 0.9, 1.1, MAT.glass, side * (W / 2 + 0.05), 2.5, z, 0.02);
      intact.add(win);
      intact.add(box(0.16, 0.1, 1.25, MAT.trim, side * (W / 2 + 0.08), 2.5, z));
    }
  }
  // lean-to
  const lean = box(2.1, 2.1, 4.5, MAT.barnRedDark, W / 2 + 1.0, 1.55, -2.2, 0.04);
  intact.add(lean);
  const leanRoof = box(2.8, 0.14, 5.0, MAT.roofRust, W / 2 + 0.9, 2.75, -2.2, 0.03);
  leanRoof.rotation.z = -0.18;
  intact.add(leanRoof);
  // gutters / trim
  intact.add(box(W + 0.4, 0.12, 0.12, MAT.trim, 0, roofY + 0.05, D / 2 + 0.55));
  intact.add(box(W + 0.4, 0.12, 0.12, MAT.trim, 0, roofY + 0.05, -D / 2 - 0.55));

  // hay bales & crates
  for (let i = 0; i < 3; i++) {
    const bale = box(0.9, 0.55, 0.65, MAT.gold, -W / 2 - 0.7, 0.28, D / 2 - 1.2 - i * 0.9, 0.08);
    bale.rotation.y = 0.2 * i;
    intact.add(bale);
  }
  for (let i = 0; i < 2; i++) {
    intact.add(box(0.7, 0.7, 0.7, MAT.wood, W / 2 + 0.3 + i * 0.55, 0.85, 2.8, 0.03));
  }

  // flattened wreck: boards and roof panels lying in a pile
  const rng = makeRng(1234);
  for (let i = 0; i < 20; i++) {
    const x = (rng.next() - 0.5) * W * 1.15;
    const z = (rng.next() - 0.5) * D * 1.05;
    const len = 1.2 + rng.next() * 4.2;
    const plank = box(0.22 + rng.next() * 0.2, 0.08 + rng.next() * 0.08, len, i % 4 === 0 ? MAT.darkWood : MAT.barnRedDark, x, 0.14 + rng.next() * 0.2, z, 0.02);
    plank.rotation.y = rng.next() * TAU;
    plank.rotation.z = (rng.next() - 0.5) * 0.16;
    debris.add(plank);
  }
  for (let i = 0; i < 4; i++) {
    const panel = box(2.4, 0.1, 2.8, MAT.roof, (rng.next() - 0.5) * 4.4, 0.22, (rng.next() - 0.5) * 5.5, 0.02);
    panel.rotation.y = rng.next() * TAU;
    panel.rotation.x = (rng.next() - 0.5) * 0.18;
    debris.add(panel);
  }
  for (let i = 0; i < 7; i++) {
    const chunk = box(0.4 + rng.next() * 0.8, 0.3 + rng.next() * 0.4, 0.4 + rng.next() * 0.8, i % 2 ? MAT.barnRed : MAT.barnRedDark, (rng.next() - 0.5) * 7, 0.2, (rng.next() - 0.5) * 8, 0.03);
    chunk.rotation.set(rng.next() * 0.5, rng.next() * TAU, rng.next() * 0.5);
    debris.add(chunk);
  }
  // dark scorched center
  const scorch = new THREE.Mesh(new THREE.CircleGeometry(4.2, 24), new THREE.MeshBasicMaterial({
    color: 0x17140f, transparent: true, opacity: 0.55, depthWrite: false,
  }));
  scorch.rotation.x = -Math.PI / 2;
  scorch.position.y = 0.06;
  debris.add(scorch);

  mergeStatic(intact);
  mergeStatic(debris);
  setShadow(intact);
  setShadow(debris);
  root.userData = { intact, debris, isBarn: true, width: W, depth: D };
  return root;
}

export function createSilo(height = 9) {
  const group = new THREE.Group();
  const radius = 2.1;
  const body = mesh(new THREE.CylinderGeometry(radius, radius, height, 18), MAT.concrete, 0, height / 2, 0);
  group.add(body);
  for (let i = 0; i < 4; i++) {
    const band = mesh(new THREE.TorusGeometry(radius + 0.03, 0.055, 5, 24), MAT.concreteDark, 0, 0.8 + i * 2.4, 0);
    band.rotation.x = Math.PI / 2;
    group.add(band);
  }
  const dome = mesh(new THREE.SphereGeometry(radius, 18, 8, 0, TAU, 0, Math.PI / 2), MAT.roofRust, 0, height, 0);
  dome.scale.y = 0.55;
  group.add(dome);
  const ladder = box(0.12, height * 0.9, 0.5, MAT.darkSteel, radius + 0.1, height * 0.45, 0);
  group.add(ladder);
  for (let i = 0; i < 10; i++) {
    const rung = box(0.08, 0.06, 0.45, MAT.darkSteel, radius + 0.13, 0.9 + i * (height * 0.075), 0);
    group.add(rung);
  }
  mergeStatic(group);
  setShadow(group);
  return group;
}

export function createFarmhouse({ color = 0xc2b596, roof = 0x4a4138 } = {}) {
  const group = new THREE.Group();
  const W = 6.4;
  const D = 7.2;
  const H = 3.0;
  group.add(box(W + 0.2, 0.35, D + 0.2, MAT.stoneDark, 0, 0.18, 0, 0.03));
  group.add(box(W, H, D, makeMat(color, { roughness: 0.95 }), 0, 0.35 + H / 2, 0, 0.03));
  // gable roof
  const roofMat = makeMat(roof, { roughness: 0.9 });
  for (const side of [-1, 1]) {
    const panel = box(W / 2 + 0.7, 0.18, D + 1.0, roofMat, side * (W / 4), H + 1.0, 0, 0.02);
    panel.rotation.z = side * -0.66;
    group.add(panel);
  }
  // gable ends
  for (const side of [-1, 1]) {
    const tri = mesh(new THREE.CylinderGeometry(0.02, W * 0.42, 1.8, 3), makeMat(color, { roughness: 0.95 }), 0, H + 0.9, side * (D / 2 + 0.02));
    tri.rotation.z = Math.PI;
    tri.scale.z = 0.08;
    group.add(tri);
  }
  // windows and door
  const door = box(1.15, 2.1, 0.13, MAT.darkWood, -1.3, 1.4, D / 2 + 0.05, 0.02);
  group.add(door);
  group.add(box(1.45, 0.12, 0.5, MAT.trim, -1.3, 2.65, D / 2 + 0.25));
  for (const x of [1.0, 2.3]) {
    group.add(box(0.9, 1.0, 0.1, MAT.windowLit, x, 1.9, D / 2 + 0.05, 0.02));
    group.add(box(1.05, 0.1, 0.14, MAT.trim, x, 2.45, D / 2 + 0.08));
    group.add(box(1.05, 0.1, 0.14, MAT.trim, x, 1.35, D / 2 + 0.08));
  }
  for (const side of [-1, 1]) {
    for (const z of [-1.8, 1.2]) {
      group.add(box(0.1, 1.0, 1.1, MAT.glass, side * (W / 2 + 0.03), 2.0, z, 0.02));
    }
  }
  // porch
  group.add(box(3.2, 0.12, 1.8, MAT.wood, 1.6, 0.12, D / 2 + 0.9));
  for (const x of [0.15, 3.0]) {
    group.add(box(0.13, 2.5, 0.13, MAT.trim, x, 1.3, D / 2 + 1.7));
  }
  const porchRoof = box(3.7, 0.13, 2.1, roofMat, 1.6, 2.65, D / 2 + 0.9);
  porchRoof.rotation.x = 0.08;
  group.add(porchRoof);
  // chimney
  group.add(box(0.65, 2.2, 0.65, MAT.stone, -2.0, H + 1.3, -1.4, 0.03));
  // steps
  group.add(box(1.6, 0.12, 0.45, MAT.concrete, -1.3, 0.1, D / 2 + 0.5));
  mergeStatic(group);
  setShadow(group);
  return group;
}

export function createChurch() {
  const group = new THREE.Group();
  const W = 6;
  const D = 10;
  group.add(box(W, 3.6, D, MAT.plasterWarm, 0, 1.8, 0, 0.03));
  // roof
  for (const side of [-1, 1]) {
    const panel = box(W / 2 + 0.5, 0.16, D + 0.8, MAT.roof, side * (W / 4), 4.2, 0, 0.02);
    panel.rotation.z = side * -0.72;
    group.add(panel);
  }
  // tower
  group.add(box(3.1, 7.2, 3.1, MAT.plasterWarm, 0, 3.6, D / 2 + 1.1, 0.03));
  group.add(box(3.5, 0.2, 3.5, MAT.trim, 0, 7.2, D / 2 + 1.1));
  const spire = mesh(new THREE.ConeGeometry(2.2, 4.4, 4), MAT.roof, 0, 9.4, D / 2 + 1.1);
  spire.rotation.y = Math.PI / 4;
  group.add(spire);
  group.add(mesh(new THREE.CylinderGeometry(0.06, 0.06, 1.4, 5), MAT.gold, 0, 12.1, D / 2 + 1.1));
  group.add(mesh(new THREE.BoxGeometry(0.6, 0.12, 0.12), MAT.gold, 0, 12.4, D / 2 + 1.1));
  // door and windows
  group.add(box(1.4, 2.3, 0.14, MAT.darkWood, 0, 1.3, D / 2 + 0.06, 0.02));
  group.add(box(1.1, 1.5, 0.14, MAT.glass, 0, 4.0, D / 2 + 1.14, 0.02));
  for (const z of [-3.2, -1.2, 1.0, 3.0]) {
    group.add(box(0.1, 1.6, 0.8, MAT.windowLit, W / 2 + 0.03, 2.2, z));
  }
  mergeStatic(group);
  setShadow(group);
  return group;
}

export function createWindmill() {
  const root = new THREE.Group();
  const base = mesh(new THREE.CylinderGeometry(0.9, 1.4, 8, 8), MAT.plaster, 0, 4, 0);
  root.add(base);
  const cap = mesh(new THREE.CylinderGeometry(0.2, 1.0, 1.2, 8), MAT.roofRust, 0, 8.5, 0);
  root.add(cap);
  const blades = new THREE.Group();
  blades.userData.noMerge = true;
  blades.position.set(0, 8.6, 1.0);
  root.add(blades);
  const hub = mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.3, 8), MAT.darkSteel, 0, 0, 0);
  hub.rotation.x = Math.PI / 2;
  blades.add(hub);
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * TAU;
    const blade = box(0.24, 2.8, 0.06, MAT.trim, Math.sin(a) * 1.45, Math.cos(a) * 1.45, 0, 0.01);
    blade.rotation.z = -a;
    blades.add(blade);
  }
  const tail = box(0.08, 0.08, 1.8, MAT.darkSteel, 0, 8.6, -1.1);
  root.add(tail);
  mergeStatic(root);
  root.userData = { blades, isWindmill: true };
  setShadow(root);
  return root;
}

export function createWaterTower() {
  const group = new THREE.Group();
  const legH = 7.5;
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * TAU + Math.PI / 4;
    const leg = box(0.16, legH, 0.16, MAT.darkSteel, Math.cos(a) * 1.5, legH / 2, Math.sin(a) * 1.5);
    leg.rotation.z = Math.cos(a) * -0.13;
    leg.rotation.x = Math.sin(a) * 0.13;
    group.add(leg);
  }
  for (let i = 0; i < 3; i++) {
    const ring = mesh(new THREE.TorusGeometry(1.3 - i * 0.18, 0.035, 4, 16), MAT.darkSteel, 0, 2 + i * 2.1, 0);
    ring.rotation.x = Math.PI / 2;
    group.add(ring);
  }
  const tank = mesh(new THREE.CylinderGeometry(2.0, 2.0, 2.2, 16), MAT.concrete, 0, legH + 1.1, 0);
  group.add(tank);
  const roof = mesh(new THREE.ConeGeometry(2.3, 1.0, 16), MAT.roofRust, 0, legH + 2.7, 0);
  group.add(roof);
  group.add(box(0.1, 1.2, 0.1, MAT.darkSteel, 1.9, legH + 1.8, 0));
  mergeStatic(group);
  setShadow(group);
  return group;
}

export function createTelephonePole() {
  const group = new THREE.Group();
  group.add(mesh(new THREE.CylinderGeometry(0.12, 0.17, 7.5, 7), MAT.wood, 0, 3.75, 0));
  group.add(box(2.2, 0.14, 0.14, MAT.darkWood, 0, 6.9, 0));
  for (const x of [-0.85, -0.3, 0.3, 0.85]) {
    const insulator = mesh(new THREE.CylinderGeometry(0.06, 0.07, 0.18, 6), MAT.glass, x, 7.05, 0);
    group.add(insulator);
  }
  mergeStatic(group);
  setShadow(group);
  return group;
}

export function createTree(variant = 'pine', rng = makeRng(1)) {
  const group = new THREE.Group();
  if (variant === 'pine') {
    const h = 4.5 + rng.next() * 4;
    group.add(mesh(new THREE.CylinderGeometry(0.16, 0.26, h * 0.7, 6), MAT.bark, 0, h * 0.35, 0));
    for (let i = 0; i < 3; i++) {
      const y = h * 0.3 + i * h * 0.2;
      const r = 1.8 - i * 0.42;
      const cone = mesh(new THREE.ConeGeometry(r, h * 0.42, 7), i % 2 ? MAT.pine : MAT.pineLight, 0, y + 0.6, 0);
      cone.rotation.y = rng.next() * TAU;
      group.add(cone);
    }
  } else if (variant === 'dead') {
    const h = 4 + rng.next() * 3.5;
    const trunk = mesh(new THREE.CylinderGeometry(0.12, 0.3, h, 6), MAT.bark, 0, h / 2, 0);
    trunk.rotation.z = (rng.next() - 0.5) * 0.12;
    group.add(trunk);
    for (let i = 0; i < 6; i++) {
      const a = rng.next() * TAU;
      const len = 1.0 + rng.next() * 2.2;
      const branch = box(0.1, len, 0.1, MAT.bark, 0, 0, 0);
      branch.position.set(Math.cos(a) * 0.3, h * (0.45 + rng.next() * 0.5), Math.sin(a) * 0.3);
      branch.rotation.z = Math.cos(a) * (0.6 + rng.next() * 0.5);
      branch.rotation.x = -Math.sin(a) * (0.6 + rng.next() * 0.5);
      group.add(branch);
    }
  } else {
    // scrub oak
    const h = 3.5 + rng.next() * 3;
    group.add(mesh(new THREE.CylinderGeometry(0.2, 0.35, h * 0.65, 6), MAT.bark, 0, h * 0.32, 0));
    const crown = mesh(new THREE.IcosahedronGeometry(1.7 + rng.next() * 0.9, 1), rng.chance(0.5) ? MAT.dryLeaf : MAT.pineLight, 0, h * 0.78, 0);
    crown.scale.set(1.2, 0.8, 1.15);
    group.add(crown);
    const crown2 = mesh(new THREE.IcosahedronGeometry(1.0 + rng.next() * 0.6, 1), MAT.dryLeaf, 0.7, h * 0.62, 0.3);
    group.add(crown2);
  }
  mergeStatic(group);
  setShadow(group);
  return group;
}

export function createRock(size = 1.5, rng = makeRng(2)) {
  const geo = new THREE.DodecahedronGeometry(size, 0);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    pos.setXYZ(i, pos.getX(i) * (0.75 + rng.next() * 0.4), pos.getY(i) * (0.45 + rng.next() * 0.35), pos.getZ(i) * (0.8 + rng.next() * 0.35));
  }
  geo.computeVertexNormals();
  const rock = mesh(geo, rng.chance(0.4) ? MAT.stone : MAT.stoneDark, 0, size * 0.3, 0);
  rock.rotation.set(rng.next() * 0.4, rng.next() * TAU, rng.next() * 0.2);
  setShadow(rock);
  return rock;
}

export function createFence(length = 6) {
  const group = new THREE.Group();
  const posts = Math.max(2, Math.round(length / 2));
  for (let i = 0; i < posts; i++) {
    const x = -length / 2 + (i / (posts - 1)) * length;
    const post = box(0.12, 1.1, 0.12, MAT.wood, x, 0.55, 0);
    group.add(post);
  }
  for (const y of [0.4, 0.82]) {
    group.add(box(length, 0.08, 0.06, MAT.darkWood, 0, y, 0));
  }
  mergeStatic(group);
  setShadow(group);
  return group;
}

export function createSandbagWall(length = 5, height = 2, rows = 3) {
  const group = new THREE.Group();
  const bagLen = 0.62;
  const count = Math.max(1, Math.floor(length / bagLen));
  for (let row = 0; row < rows; row++) {
    for (let i = 0; i < count; i++) {
      const x = -length / 2 + bagLen / 2 + i * bagLen + (row % 2) * bagLen * 0.5;
      if (x > length / 2) continue;
      const bag = box(bagLen * 0.94, 0.28, 0.48, MAT.sandbag, x, 0.16 + row * 0.27, 0, 0.1);
      bag.rotation.y = (i * 0.37 + row) % 0.18;
      bag.rotation.z = 0.02 * (i % 3);
      group.add(bag);
    }
  }
  mergeStatic(group);
  setShadow(group);
  return group;
}

export function createTent({ color = 0x9a8b6c } = {}) {
  const group = new THREE.Group();
  const mat = makeMat(color, { roughness: 0.98 });
  const shape = new THREE.Shape();
  shape.moveTo(-1.9, 0);
  shape.lineTo(0, 2.0);
  shape.lineTo(1.9, 0);
  shape.lineTo(-1.9, 0);
  const geo = new THREE.ExtrudeGeometry(shape, { depth: 3.4, bevelEnabled: false });
  geo.translate(0, 0, -1.7);
  const tent = new THREE.Mesh(geo, mat);
  tent.castShadow = true;
  tent.receiveShadow = true;
  group.add(tent);
  const flap = box(0.06, 1.5, 0.8, MAT.canvasLight, 0, 0.8, 1.72, 0.01);
  flap.rotation.z = 0.18;
  group.add(flap);
  group.add(box(0.07, 0.07, 3.4, MAT.darkWood, 0, 2.05, 0));
  mergeStatic(group);
  setShadow(group);
  return group;
}

export function createCrateStack(rng = makeRng(3)) {
  const group = new THREE.Group();
  const count = 2 + Math.floor(rng.next() * 4);
  for (let i = 0; i < count; i++) {
    const s = 0.6 + rng.next() * 0.4;
    const crate = box(s, s, s, rng.chance(0.3) ? MAT.oliveDark : MAT.wood, (rng.next() - 0.5) * 1.8, s / 2 + (i > 2 ? 0.7 : 0), (rng.next() - 0.5) * 1.6, 0.02);
    crate.rotation.y = rng.next() * 0.4;
    group.add(crate);
    if (rng.chance(0.5)) {
      group.add(box(s + 0.02, 0.06, 0.06, MAT.darkWood, crate.position.x, crate.position.y + s * 0.18, crate.position.z + s / 2 + 0.01));
    }
  }
  mergeStatic(group);
  setShadow(group);
  return group;
}

export function createWatchtower() {
  const group = new THREE.Group();
  const H = 5.2;
  for (const x of [-1.1, 1.1]) {
    for (const z of [-1.1, 1.1]) {
      group.add(box(0.16, H, 0.16, MAT.wood, x, H / 2, z));
    }
  }
  for (let i = 0; i < 2; i++) {
    const y = 1.5 + i * 2.3;
    group.add(box(2.3, 0.1, 0.1, MAT.darkWood, 0, y, -1.1));
    group.add(box(2.3, 0.1, 0.1, MAT.darkWood, 0, y, 1.1));
    group.add(box(0.1, 0.1, 2.3, MAT.darkWood, -1.1, y, 0));
    group.add(box(0.1, 0.1, 2.3, MAT.darkWood, 1.1, y, 0));
  }
  group.add(box(2.6, 0.16, 2.6, MAT.wood, 0, H, 0));
  // railing
  for (const side of [-1, 1]) {
    group.add(box(2.6, 0.5, 0.08, MAT.darkWood, 0, H + 0.4, side * 1.25));
    group.add(box(0.08, 0.5, 2.6, MAT.darkWood, side * 1.25, H + 0.4, 0));
  }
  // roof
  for (const side of [-1, 1]) {
    const panel = box(2.0, 0.1, 3.0, MAT.roofRust, side * 0.8, H + 2.0, 0, 0.02);
    panel.rotation.z = side * -0.5;
    group.add(panel);
  }
  const ladder = box(0.1, H, 0.4, MAT.darkSteel, -1.3, H / 2, 0);
  group.add(ladder);
  mergeStatic(group);
  setShadow(group);
  return group;
}

export function createHangar() {
  const group = new THREE.Group();
  const W = 12;
  const D = 10;
  const H = 4.5;
  group.add(box(W + 0.5, 0.4, D + 0.5, MAT.concrete, 0, 0.2, 0, 0.03));
  group.add(box(W, H, D, MAT.oliveDark, 0, H / 2 + 0.3, 0, 0.04));
  // arched roof approximation
  const roof = mesh(new THREE.CylinderGeometry(W / 2, W / 2, D + 0.8, 20, 1, false, 0, Math.PI), MAT.oliveDark, 0, H + 0.25, 0);
  roof.rotation.z = Math.PI / 2;
  roof.rotation.y = Math.PI / 2;
  roof.scale.y = 0.55;
  group.add(roof);
  // door
  group.add(box(6.5, 3.7, 0.2, MAT.darkSteel, 0, 2.15, D / 2 + 0.06, 0.02));
  for (let i = 0; i < 4; i++) {
    group.add(box(6.5, 0.06, 0.06, MAT.steel, 0, 0.7 + i * 0.9, D / 2 + 0.18));
  }
  // signage
  group.add(box(4.2, 0.8, 0.1, MAT.enemyPaintDark, 0, 4.0, D / 2 + 0.14));
  mergeStatic(group);
  setShadow(group);
  return group;
}

export function createBunker() {
  const group = new THREE.Group();
  const W = 5.4;
  const D = 4.5;
  group.add(box(W + 0.6, 0.5, D + 0.6, MAT.concreteDark, 0, 0.25, 0, 0.03));
  group.add(box(W, 1.5, D, MAT.concrete, 0, 1.0, 0, 0.04));
  const roof = box(W + 0.7, 0.35, D + 0.7, MAT.concreteDark, 0, 1.85, 0, 0.03);
  group.add(roof);
  // slit
  group.add(box(3.6, 0.3, 0.12, MAT.black, 0, 1.35, D / 2 + 0.03));
  // hatch and periscope
  group.add(mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.1, 10), MAT.darkSteel, -1.2, 2.08, 0.5));
  group.add(mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.8, 6), MAT.darkSteel, 1.3, 2.4, 0.5));
  group.add(mesh(new THREE.BoxGeometry(0.4, 0.2, 0.1), MAT.glass, 1.3, 2.8, 0.5));
  // sandbags around front
  const bags = createSandbagWall(5, 2, 2);
  bags.position.set(0, 0, D / 2 + 0.8);
  group.add(bags);
  mergeStatic(group);
  setShadow(group);
  return group;
}

export function createRadarDish() {
  const group = new THREE.Group();
  group.add(mesh(new THREE.CylinderGeometry(0.3, 0.5, 1.2, 8), MAT.concreteDark, 0, 0.6, 0));
  const mount = box(0.7, 0.7, 0.7, MAT.steel, 0, 1.35, 0);
  group.add(mount);
  const dish = mesh(new THREE.SphereGeometry(1.4, 16, 8, 0, TAU, 0, Math.PI / 2), MAT.steel, 0, 2.2, 0);
  dish.userData.noMerge = true;
  dish.scale.y = 0.35;
  dish.rotation.x = -0.9;
  group.add(dish);
  const feed = mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.4, 5), MAT.darkSteel, 0, 2.3, 0.8);
  feed.rotation.x = 0.9;
  group.add(feed);
  const light = mesh(new THREE.SphereGeometry(0.07, 6, 5), new THREE.MeshBasicMaterial({ color: 0xff5b37, toneMapped: false }), 0, 2.9, 1.3);
  light.userData.noMerge = true;
  group.add(light);
  mergeStatic(group);
  group.userData = { dish, light, isRadar: true };
  setShadow(group);
  return group;
}

export function createHayBale() {
  const group = new THREE.Group();
  const bale = mesh(new THREE.CylinderGeometry(0.75, 0.75, 1.2, 12), MAT.gold, 0, 0.75, 0);
  bale.rotation.z = Math.PI / 2;
  group.add(bale);
  for (let i = 0; i < 3; i++) {
    const band = mesh(new THREE.TorusGeometry(0.78, 0.025, 4, 12), MAT.darkWood, 0, 0.75, 0);
    band.rotation.y = Math.PI / 2;
    band.position.x = -0.4 + i * 0.4;
    group.add(band);
  }
  mergeStatic(group);
  setShadow(group);
  return group;
}

export function createTractor() {
  const group = new THREE.Group();
  group.add(box(1.2, 0.7, 2.3, MAT.rust, 0, 0.7, 0, 0.05));
  group.add(box(0.9, 0.6, 1.0, MAT.darkWood, 0, 1.35, -0.1, 0.03));
  // big rear wheels
  for (const side of [-1, 1]) {
    const wheel = mesh(new THREE.CylinderGeometry(0.72, 0.72, 0.25, 14), MAT.rubber, side * 0.8, 0.72, -0.55);
    wheel.rotation.z = Math.PI / 2;
    group.add(wheel);
    const rim = mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.27, 10), MAT.rust, side * 0.8, 0.72, -0.55);
    rim.rotation.z = Math.PI / 2;
    group.add(rim);
  }
  // front wheels
  for (const side of [-1, 1]) {
    const wheel = mesh(new THREE.CylinderGeometry(0.35, 0.35, 0.18, 10), MAT.rubber, side * 0.65, 0.38, 0.85);
    wheel.rotation.z = Math.PI / 2;
    group.add(wheel);
  }
  group.add(box(0.12, 1.2, 0.12, MAT.darkSteel, 0, 1.9, -0.2));
  group.add(box(0.7, 0.12, 0.12, MAT.darkSteel, 0, 2.5, -0.2));
  mergeStatic(group);
  setShadow(group);
  return group;
}

export function createGasPump() {
  const group = new THREE.Group();
  group.add(box(1.3, 0.2, 1.0, MAT.concrete, 0, 0.1, 0));
  group.add(box(0.7, 1.8, 0.55, MAT.trim, 0, 1.05, 0, 0.04));
  group.add(box(0.4, 0.45, 0.1, MAT.windowLit, 0, 1.55, 0.3, 0.01));
  group.add(box(0.55, 0.2, 0.5, MAT.red, 0, 1.95, 0, 0.02));
  group.add(box(0.08, 0.5, 0.08, MAT.darkSteel, 0.45, 1.4, 0.2));
  mergeStatic(group);
  setShadow(group);
  return group;
}

export function createRoadSign(text = 'RIDGE 12') {
  const group = new THREE.Group();
  group.add(mesh(new THREE.CylinderGeometry(0.06, 0.08, 2.4, 5), MAT.wood, 0, 1.2, 0));
  const c = makeCanvas(512, 128);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#d8ccb2';
  ctx.fillRect(0, 0, 512, 128);
  ctx.strokeStyle = '#1c1b18';
  ctx.lineWidth = 10;
  ctx.strokeRect(5, 5, 502, 118);
  ctx.fillStyle = '#1c1b18';
  ctx.font = 'bold 48px "DM Mono", monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 256, 68);
  const tex = canvasTexture(c);
  const board = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.65, 0.08), [
    MAT.wood, MAT.wood, MAT.wood, MAT.wood,
    new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9 }),
    new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9 }),
  ]);
  board.position.set(0, 2.2, 0);
  board.castShadow = true;
  group.add(board);
  setShadow(group);
  return group;
}
