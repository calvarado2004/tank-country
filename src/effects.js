import * as THREE from 'three';
import {
  TAU, clamp, lerp, makeRng, radialSpriteTexture, smokeSpriteTexture, flashSpriteTexture,
  sparkTexture,
} from './utils.js';

function makeRingTexture(size = 256) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(size / 2, size / 2, size * 0.2, size / 2, size / 2, size * 0.5);
  g.addColorStop(0, 'rgba(255,255,255,0)');
  g.addColorStop(0.58, 'rgba(255,255,255,0)');
  g.addColorStop(0.72, 'rgba(255,255,255,0.9)');
  g.addColorStop(0.8, 'rgba(255,255,255,0.35)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

class SpritePool {
  constructor(scene, count, map, blending, toneMapped = true) {
    this.items = [];
    this.cursor = 0;
    for (let i = 0; i < count; i++) {
      const mat = new THREE.SpriteMaterial({
        map,
        transparent: true,
        depthWrite: false,
        blending,
        opacity: 0,
        toneMapped,
      });
      const sprite = new THREE.Sprite(mat);
      sprite.visible = false;
      sprite.frustumCulled = false;
      sprite.renderOrder = blending === THREE.AdditiveBlending ? 6 : 5;
      scene.add(sprite);
      this.items.push({
        sprite,
        mat,
        active: false,
        life: 0,
        maxLife: 1,
        vel: new THREE.Vector3(),
        gravity: 0,
        drag: 1,
        scale0: 1,
        scale1: 2,
        opacity0: 1,
        fadeIn: 0.05,
        rotation: 0,
        rotSpeed: 0,
      });
    }
  }

  spawn(opts) {
    let item = null;
    for (let i = 0; i < this.items.length; i++) {
      const idx = (this.cursor + i) % this.items.length;
      if (!this.items[idx].active) {
        item = this.items[idx];
        this.cursor = (idx + 1) % this.items.length;
        break;
      }
    }
    if (!item) {
      item = this.items[this.cursor];
      this.cursor = (this.cursor + 1) % this.items.length;
    }
    item.active = true;
    item.life = 0;
    item.maxLife = opts.life ?? 1;
    item.vel.copy(opts.velocity || new THREE.Vector3());
    item.gravity = opts.gravity ?? 0;
    item.drag = opts.drag ?? 1;
    item.scale0 = opts.scale0 ?? 1;
    item.scale1 = opts.scale1 ?? item.scale0 * 2;
    item.opacity0 = opts.opacity ?? 1;
    item.fadeIn = opts.fadeIn ?? 0.03;
    item.rotation = opts.rotation ?? Math.random() * TAU;
    item.rotSpeed = opts.rotSpeed ?? 0;
    item.sprite.position.copy(opts.position);
    item.sprite.scale.setScalar(item.scale0);
    item.mat.color.set(opts.color ?? 0xffffff);
    item.mat.opacity = 0;
    item.mat.rotation = item.rotation;
    item.sprite.visible = true;
    return item;
  }

  update(dt) {
    for (const it of this.items) {
      if (!it.active) continue;
      it.life += dt;
      const t = it.life / it.maxLife;
      if (t >= 1) {
        it.active = false;
        it.sprite.visible = false;
        it.mat.opacity = 0;
        continue;
      }
      it.vel.y += it.gravity * dt;
      it.vel.multiplyScalar(Math.pow(it.drag, dt * 60));
      it.sprite.position.addScaledVector(it.vel, dt);
      const scale = lerp(it.scale0, it.scale1, t);
      it.sprite.scale.setScalar(scale);
      const fadeIn = it.fadeIn > 0 ? clamp(it.life / it.fadeIn, 0, 1) : 1;
      const fadeOut = 1 - Math.pow(t, 1.55);
      it.mat.opacity = it.opacity0 * fadeIn * fadeOut;
      it.rotation += it.rotSpeed * dt;
      it.mat.rotation = it.rotation;
    }
  }
}

export class Effects {
  constructor(scene) {
    this.scene = scene;
    this.rng = makeRng(31415);
    this.heightAt = () => 0;
    this.smokeMap = smokeSpriteTexture(128);
    this.flashMap = flashSpriteTexture(128);
    this.sparkMap = sparkTexture(64);
    this.ringMap = makeRingTexture(256);
    this.smoke = new SpritePool(scene, 190, this.smokeMap, THREE.NormalBlending, false);
    this.glow = new SpritePool(scene, 150, this.flashMap, THREE.AdditiveBlending, false);
    this.sparks = new SpritePool(scene, 120, this.sparkMap, THREE.AdditiveBlending, false);
    this.dust = new SpritePool(scene, 90, this.smokeMap, THREE.NormalBlending, false);

    this.rings = [];
    this.ringGeo = new THREE.RingGeometry(0.8, 1.0, 48);
    for (let i = 0; i < 12; i++) {
      const mat = new THREE.MeshBasicMaterial({
        color: 0xffb366,
        transparent: true,
        opacity: 0,
        side: THREE.DoubleSide,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
      });
      const mesh = new THREE.Mesh(this.ringGeo, mat);
      mesh.rotation.x = -Math.PI / 2;
      mesh.visible = false;
      mesh.renderOrder = 4;
      scene.add(mesh);
      this.rings.push({ mesh, mat, active: false, life: 0, maxLife: 0.8, scale0: 1, scale1: 8, opacity: 0.8, y: 0 });
    }

    this.lights = [];
    for (let i = 0; i < 4; i++) {
      const light = new THREE.PointLight(0xffa050, 0, 30, 2);
      scene.add(light);
      this.lights.push({ light, life: 0, maxLife: 0.3, intensity: 0 });
    }
    this.lightCursor = 0;

    this.debris = [];
    this.debrisGeos = [
      new THREE.BoxGeometry(0.22, 0.16, 0.42),
      new THREE.BoxGeometry(0.3, 0.1, 0.22),
      new THREE.BoxGeometry(0.16, 0.2, 0.18),
      new THREE.TetrahedronGeometry(0.22, 0),
    ];
    this.debrisMats = [
      new THREE.MeshStandardMaterial({ color: 0x5e4a34, roughness: 0.95 }),
      new THREE.MeshStandardMaterial({ color: 0x3d3932, roughness: 0.9 }),
      new THREE.MeshStandardMaterial({ color: 0x7a392b, roughness: 0.95 }),
      new THREE.MeshStandardMaterial({ color: 0x544c3c, roughness: 0.95 }),
    ];

    this.tracers = [];
    this.emitters = [];
    this.bursts = [];
  }

  // -------------------------------------------------------------------------

  addLight(position, intensity = 30, color = 0xffa050, duration = 0.28) {
    const item = this.lights[this.lightCursor];
    this.lightCursor = (this.lightCursor + 1) % this.lights.length;
    item.light.position.copy(position);
    item.light.color.set(color);
    item.light.intensity = intensity;
    item.intensity = intensity;
    item.life = 0;
    item.maxLife = duration;
  }

  addRing(position, { color = 0xffb366, scale0 = 1, scale1 = 8, life = 0.8, opacity = 0.8 } = {}) {
    let item = this.rings.find((r) => !r.active);
    if (!item) item = this.rings[0];
    item.active = true;
    item.life = 0;
    item.maxLife = life;
    item.scale0 = scale0;
    item.scale1 = scale1;
    item.opacity = opacity;
    item.mat.color.set(color);
    item.mat.opacity = opacity;
    item.mesh.position.set(position.x, position.y + 0.08, position.z);
    item.mesh.scale.setScalar(scale0);
    item.mesh.visible = true;
    return item;
  }

  explosion(position, opts = {}) {
    const size = opts.size ?? 1;
    const ground = opts.ground ?? true;
    const color = opts.color ?? 0xffa04a;
    const pos = position.clone();
    const rng = this.rng;

    this.glow.spawn({
      position: pos.clone().add(new THREE.Vector3(0, 0.5 * size, 0)),
      life: 0.34 + size * 0.06,
      scale0: 2.2 * size,
      scale1: 8.5 * size,
      opacity: 0.95,
      color: 0xffd9a0,
      velocity: new THREE.Vector3(0, 1.4, 0),
      drag: 0.94,
    });
    this.glow.spawn({
      position: pos.clone().add(new THREE.Vector3(0, 0.8 * size, 0)),
      life: 0.22,
      scale0: 1.2 * size,
      scale1: 4.5 * size,
      opacity: 0.85,
      color: 0xff8a38,
      velocity: new THREE.Vector3(0, 2, 0),
    });

    const sparkCount = Math.floor(12 * size);
    for (let i = 0; i < sparkCount; i++) {
      const a = rng.next() * TAU;
      const up = rng.range(0.2, 1);
      const speed = rng.range(5, 16) * size;
      this.sparks.spawn({
        position: pos.clone().add(new THREE.Vector3(rng.range(-0.4, 0.4), rng.range(0.1, 0.8), rng.range(-0.4, 0.4))),
        velocity: new THREE.Vector3(Math.cos(a) * speed * 0.6, up * speed, Math.sin(a) * speed * 0.6),
        gravity: -19,
        drag: 0.985,
        life: rng.range(0.35, 0.9),
        scale0: rng.range(0.12, 0.32) * size,
        scale1: 0.03,
        opacity: 0.95,
        color: rng.chance(0.5) ? 0xffd38b : 0xff8a3d,
      });
    }

    const smokeCount = ground ? Math.floor(6 * size) : Math.floor(3 * size);
    for (let i = 0; i < smokeCount; i++) {
      const a = rng.next() * TAU;
      const speed = rng.range(0.5, 3.5) * size;
      this.smoke.spawn({
        position: pos.clone().add(new THREE.Vector3(Math.cos(a) * rng.range(0, 1.3), rng.range(0.3, 1.8) * size, Math.sin(a) * rng.range(0, 1.3))),
        velocity: new THREE.Vector3(Math.cos(a) * speed, rng.range(1.4, 4) * size, Math.sin(a) * speed),
        gravity: 0.6,
        drag: 0.985,
        life: rng.range(1.1, 2.6) * Math.sqrt(size),
        scale0: rng.range(1.1, 2.2) * size,
        scale1: rng.range(3.2, 6) * size,
        opacity: rng.range(0.18, 0.34),
        color: rng.chance(0.35) ? 0x4a4238 : 0x796c5a,
        rotSpeed: rng.range(-0.5, 0.5),
        fadeIn: 0.08,
      });
    }
    // dark lingering smoke
    for (let i = 0; i < Math.floor(3 * size); i++) {
      const a = rng.next() * TAU;
      this.smoke.spawn({
        position: pos.clone().add(new THREE.Vector3(Math.cos(a) * 1.2, 1.4, Math.sin(a) * 1.2)),
        velocity: new THREE.Vector3(rng.range(-0.8, 0.8), rng.range(1.2, 2.6), rng.range(-0.8, 0.8)),
        life: rng.range(2, 4),
        scale0: 2.4 * size,
        scale1: 6.5 * size,
        opacity: 0.16,
        color: 0x38342d,
        fadeIn: 0.2,
        rotSpeed: rng.range(-0.3, 0.3),
      });
    }

    if (ground) {
      this.addRing(pos, {
        color: 0xffb36b,
        scale0: 1.4 * size,
        scale1: 8 * size,
        life: 0.55 + 0.15 * size,
        opacity: 0.7,
      });
      // dust skirt
      for (let i = 0; i < 5 * size; i++) {
        const a = rng.next() * TAU;
        this.dust.spawn({
          position: pos.clone().add(new THREE.Vector3(Math.cos(a) * 0.7, 0.25, Math.sin(a) * 0.7)),
          velocity: new THREE.Vector3(Math.cos(a) * rng.range(3, 8), rng.range(0.4, 1.4), Math.sin(a) * rng.range(3, 8)),
          gravity: -1.2,
          drag: 0.96,
          life: rng.range(0.7, 1.6),
          scale0: 0.8 * size,
          scale1: 3.8 * size,
          opacity: 0.22,
          color: 0x9e8867,
          rotSpeed: rng.range(-0.5, 0.5),
        });
      }
    }

    if (opts.debris !== false) this.spawnDebris(pos, size, opts.debrisColor);
    this.addLight(pos.clone().add(new THREE.Vector3(0, 1, 0)), 60 * size, color, 0.3);
  }

  spawnDebris(pos, size = 1, color = null) {
    const count = Math.floor(4 + 4 * size);
    for (let i = 0; i < count; i++) {
      const geo = this.debrisGeos[Math.floor(this.rng.next() * this.debrisGeos.length)];
      let mat;
      if (color) {
        mat = new THREE.MeshStandardMaterial({ color, roughness: 0.95 });
      } else {
        mat = this.debrisMats[Math.floor(this.rng.next() * this.debrisMats.length)];
      }
      const m = new THREE.Mesh(geo, mat);
      m.castShadow = true;
      m.position.copy(pos);
      m.position.y += this.rng.range(0.2, 1.2);
      const a = this.rng.next() * TAU;
      const speed = this.rng.range(2, 8) * size;
      m.scale.setScalar(this.rng.range(0.7, 1.8) * Math.min(size, 2));
      this.scene.add(m);
      this.debris.push({
        mesh: m,
        life: 0,
        maxLife: this.rng.range(3, 6),
        vel: new THREE.Vector3(Math.cos(a) * speed, this.rng.range(3, 10) * size, Math.sin(a) * speed),
        spin: new THREE.Vector3(this.rng.range(-5, 5), this.rng.range(-5, 5), this.rng.range(-5, 5)),
        matOwned: !!color,
        bounced: false,
      });
    }
  }

  muzzleFlash(position, direction, size = 1, color = 0xffb05a) {
    this.glow.spawn({
      position: position.clone(),
      life: 0.12,
      scale0: 0.7 * size,
      scale1: 2.6 * size,
      opacity: 1,
      color,
    });
    const back = direction.clone().multiplyScalar(-1.5);
    for (let i = 0; i < 4; i++) {
      const v = direction.clone().multiplyScalar(this.rng.range(2, 8) * size);
      v.x += this.rng.range(-2, 2);
      v.y += this.rng.range(-0.5, 1.2);
      v.z += this.rng.range(-2, 2);
      this.sparks.spawn({
        position: position.clone(),
        velocity: v,
        gravity: -10,
        life: this.rng.range(0.12, 0.28),
        scale0: 0.2 * size,
        scale1: 0.03,
        color: 0xffd08a,
      });
    }
    this.smoke.spawn({
      position: position.clone().add(back),
      velocity: direction.clone().multiplyScalar(2).add(new THREE.Vector3(0, 1.2, 0)),
      life: 0.9,
      scale0: 0.7 * size,
      scale1: 2.6 * size,
      opacity: 0.25,
      color: 0x93866f,
      fadeIn: 0.02,
    });
    this.addLight(position, 35 * size, color, 0.12);
  }

  tankDust(position, forward, strength = 1) {
    const side = this.rng.chance(0.5) ? 1 : -1;
    const right = new THREE.Vector3(-forward.z, 0, forward.x);
    const p = position.clone().addScaledVector(right, side * 1.3);
    p.y = this.heightAt(p.x, p.z) + 0.2;
    this.dust.spawn({
      position: p,
      velocity: new THREE.Vector3(-forward.x * 1.2 + this.rng.range(-0.5, 0.5), this.rng.range(0.4, 1.2), -forward.z * 1.2 + this.rng.range(-0.5, 0.5)),
      gravity: -0.4,
      drag: 0.98,
      life: this.rng.range(0.6, 1.2),
      scale0: 0.5,
      scale1: this.rng.range(1.6, 2.8) * strength,
      opacity: 0.16,
      color: 0xa58e6b,
      rotSpeed: this.rng.range(-0.4, 0.4),
      fadeIn: 0.03,
    });
  }

  damageSmoke(position, color = 0x3a3830, scale = 1) {
    this.smoke.spawn({
      position: position.clone().add(new THREE.Vector3(this.rng.range(-0.3, 0.3), this.rng.range(0.3, 0.8), this.rng.range(-0.3, 0.3))),
      velocity: new THREE.Vector3(this.rng.range(-0.4, 0.4), this.rng.range(1.2, 2.4), this.rng.range(-0.4, 0.4)),
      life: this.rng.range(1.1, 2.1),
      scale0: 0.45 * scale,
      scale1: 1.8 * scale,
      opacity: 0.26,
      color,
      rotSpeed: this.rng.range(-0.4, 0.4),
      fadeIn: 0.1,
    });
  }

  fire(position, scale = 1) {
    this.glow.spawn({
      position: position.clone(),
      velocity: new THREE.Vector3(0, this.rng.range(0.5, 1.5), 0),
      life: this.rng.range(0.25, 0.55),
      scale0: 0.35 * scale,
      scale1: 1.2 * scale,
      opacity: 0.7,
      color: 0xff7a2a,
    });
    if (this.rng.chance(0.5)) {
      this.smoke.spawn({
        position: position.clone().add(new THREE.Vector3(0, 0.5, 0)),
        velocity: new THREE.Vector3(0, 1.5, 0),
        life: 1.2,
        scale0: 0.4 * scale,
        scale1: 1.4 * scale,
        opacity: 0.16,
        color: 0x2f2c27,
      });
    }
  }

  tracer(start, end, color = 0xffd08a, width = 1.6) {
    const geo = new THREE.BufferGeometry().setFromPoints([start, end]);
    const mat = new THREE.LineBasicMaterial({
      color,
      transparent: true,
      opacity: 0.95,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
    });
    const line = new THREE.Line(geo, mat);
    this.scene.add(line);
    this.tracers.push({ line, life: 0, maxLife: 0.16 });
    // spark at the muzzle
    this.sparks.spawn({
      position: start.clone(),
      life: 0.1,
      scale0: 0.2,
      scale1: 0.02,
      color,
    });
  }

  shellTrail(position, color = 0xffb060, size = 0.16) {
    this.glow.spawn({
      position: position.clone(),
      life: 0.22,
      scale0: size,
      scale1: 0.02,
      opacity: 0.75,
      color,
    });
  }

  barnCollapse(position, barn) {
    const pos = position.clone();
    this.addRing(pos, { color: 0xd0b184, scale0: 2, scale1: 14, life: 1.2, opacity: 0.3 });
    for (let i = 0; i < 22; i++) {
      const a = this.rng.next() * TAU;
      const r = this.rng.range(0, 5);
      this.dust.spawn({
        position: pos.clone().add(new THREE.Vector3(Math.cos(a) * r, this.rng.range(-1.5, 2.5), Math.sin(a) * r)),
        velocity: new THREE.Vector3(Math.cos(a) * this.rng.range(1, 5), this.rng.range(0.5, 3), Math.sin(a) * this.rng.range(1, 5)),
        gravity: -0.2,
        drag: 0.97,
        life: this.rng.range(1.8, 4),
        scale0: this.rng.range(1.2, 2.2),
        scale1: this.rng.range(4, 8),
        opacity: this.rng.range(0.13, 0.3),
        color: this.rng.chance(0.4) ? 0x6e5b42 : 0x9d8a6b,
        rotSpeed: this.rng.range(-0.4, 0.4),
        fadeIn: 0.1,
      });
    }
    // wooden planks
    for (let i = 0; i < 18; i++) {
      const geo = this.debrisGeos[Math.floor(this.rng.next() * this.debrisGeos.length)];
      const mat = this.rng.chance(0.55) ? this.debrisMats[2] : this.debrisMats[0];
      const m = new THREE.Mesh(geo, mat);
      m.castShadow = true;
      m.scale.set(this.rng.range(1, 2.5), this.rng.range(0.6, 1.3), this.rng.range(1.5, 4));
      m.position.copy(pos).add(new THREE.Vector3(this.rng.range(-3, 3), this.rng.range(-1, 3), this.rng.range(-3, 3)));
      this.scene.add(m);
      const a = this.rng.next() * TAU;
      const speed = this.rng.range(2, 9);
      this.debris.push({
        mesh: m,
        life: 0,
        maxLife: this.rng.range(3, 5),
        vel: new THREE.Vector3(Math.cos(a) * speed, this.rng.range(2, 8), Math.sin(a) * speed),
        spin: new THREE.Vector3(this.rng.range(-6, 6), this.rng.range(-6, 6), this.rng.range(-6, 6)),
        matOwned: false,
        bounced: false,
      });
    }
    this.addLight(pos.clone().add(new THREE.Vector3(0, 1.5, 0)), 25, 0xffd0a0, 0.2);
  }

  addSmokeEmitter(opts) {
    this.emitters.push({
      position: opts.position.clone(),
      follow: opts.follow || null,
      offset: opts.offset ? opts.offset.clone() : new THREE.Vector3(),
      duration: opts.duration ?? 10,
      elapsed: 0,
      rate: opts.rate ?? 3,
      accum: 0,
      scale: opts.scale ?? 2,
      color: opts.color ?? 0x3b3831,
      rise: opts.rise ?? 1.6,
      spread: opts.spread ?? 0.7,
      opacity: opts.opacity ?? 0.22,
    });
  }

  addEmitter(position, opts = {}) {
    this.addSmokeEmitter({ position, ...opts });
  }

  // -------------------------------------------------------------------------

  update(dt) {
    this.smoke.update(dt);
    this.glow.update(dt);
    this.sparks.update(dt);
    this.dust.update(dt);

    for (const r of this.rings) {
      if (!r.active) continue;
      r.life += dt;
      const t = r.life / r.maxLife;
      if (t >= 1) {
        r.active = false;
        r.mesh.visible = false;
        continue;
      }
      const scale = lerp(r.scale0, r.scale1, 1 - Math.pow(1 - t, 2.2));
      r.mesh.scale.setScalar(scale);
      r.mat.opacity = r.opacity * (1 - t) * (1 - t);
    }

    for (const l of this.lights) {
      if (l.life >= l.maxLife) {
        l.light.intensity = 0;
        continue;
      }
      l.life += dt;
      const t = clamp(1 - l.life / l.maxLife, 0, 1);
      l.light.intensity = l.intensity * t * t;
    }

    for (let i = this.debris.length - 1; i >= 0; i--) {
      const d = this.debris[i];
      d.life += dt;
      d.vel.y -= 22 * dt;
      d.mesh.position.addScaledVector(d.vel, dt);
      d.mesh.rotation.x += d.spin.x * dt;
      d.mesh.rotation.y += d.spin.y * dt;
      d.mesh.rotation.z += d.spin.z * dt;
      const gy = this.heightAt(d.mesh.position.x, d.mesh.position.z);
      if (d.mesh.position.y < gy + 0.12 && !d.bounced) {
        d.mesh.position.y = gy + 0.12;
        d.vel.y *= -0.22;
        d.vel.x *= 0.55;
        d.vel.z *= 0.55;
        d.spin.multiplyScalar(0.5);
        d.bounced = true;
      }
      if (d.life > d.maxLife || d.mesh.position.y < -30) {
        this.scene.remove(d.mesh);
        if (d.matOwned) d.mesh.material.dispose();
        this.debris.splice(i, 1);
      }
    }

    for (let i = this.tracers.length - 1; i >= 0; i--) {
      const t = this.tracers[i];
      t.life += dt;
      const k = t.life / t.maxLife;
      t.line.material.opacity = Math.max(0, 1 - k);
      if (k >= 1) {
        this.scene.remove(t.line);
        t.line.geometry.dispose();
        t.line.material.dispose();
        this.tracers.splice(i, 1);
      }
    }

    for (let i = this.emitters.length - 1; i >= 0; i--) {
      const e = this.emitters[i];
      e.elapsed += dt;
      if (e.elapsed > e.duration) {
        this.emitters.splice(i, 1);
        continue;
      }
      const base = e.follow ? e.follow() : e.position;
      if (!base) continue;
      const p = base.clone().add(e.offset);
      e.accum += e.rate * dt;
      while (e.accum >= 1) {
        e.accum -= 1;
        const a = this.rng.next() * TAU;
        const r = this.rng.next() * e.spread;
        this.smoke.spawn({
          position: new THREE.Vector3(p.x + Math.cos(a) * r, p.y + this.rng.range(0, 0.6), p.z + Math.sin(a) * r),
          velocity: new THREE.Vector3(this.rng.range(-0.3, 0.3), e.rise * this.rng.range(0.7, 1.3), this.rng.range(-0.3, 0.3)),
          gravity: 0.2,
          drag: 0.99,
          life: this.rng.range(2.2, 4.2),
          scale0: e.scale * this.rng.range(0.5, 0.9),
          scale1: e.scale * this.rng.range(1.8, 3.0),
          opacity: e.opacity * this.rng.range(0.65, 1),
          color: e.color,
          rotSpeed: this.rng.range(-0.3, 0.3),
          fadeIn: 0.3,
        });
      }
    }
  }
}
