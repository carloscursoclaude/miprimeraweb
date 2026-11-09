/**
 * grid.js
 * Creación y lógica de las 24 cajas de regalo: rejilla responsive, hover,
 * desenvolver (lazo + tapa + destello), emerger la sorpresa, estado abierto
 * y reinicio. Las geometrías se comparten entre todas las cajas.
 */
import * as THREE from 'three';
import { tween, wait, Ease, lerp } from './easing.js';
import { createBoxTextures, getGlowTexture, paperStyle, isLight } from './textures.js';
import { createSurprise } from './surprises.js';

// Dimensiones de la rejilla y de cada caja
const SX = 1.62; // separación horizontal
const SY = 1.9; // separación vertical
const TILT = 0.3; // inclinación hacia la cámara para que se vea la tapa
const BODY_H = 0.85;
const BODY_TOP = BODY_H / 2;
const LID_H = 0.2;
const LID_Y = BODY_TOP + LID_H / 2 - 0.04;
const BOW_Y = LID_Y + LID_H / 2;
const MINI_SIZE = 0.8;
const TAU = Math.PI * 2;

const RIBBONS = {
  gold: '#f5c96a',
  silver: '#dfe5f0',
  violet: '#8b6bd6',
  navy: '#24357a',
};

/** Sistema de partículas reutilizable para el destello al abrir. */
class Burst {
  constructor(count) {
    this.count = count;
    this.age = Infinity;
    this.velocities = new Float32Array(count * 3);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
    const colors = new Float32Array(count * 3);
    const palette = [new THREE.Color(2.4, 1.7, 0.6), new THREE.Color(2, 2, 2.2), new THREE.Color(1.4, 1.0, 2.4)];
    for (let i = 0; i < count; i++) {
      const c = palette[i % 3];
      colors.set([c.r, c.g, c.b], i * 3);
    }
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    this.material = new THREE.PointsMaterial({
      size: 0.11,
      map: getGlowTexture(),
      vertexColors: true,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.points = new THREE.Points(geometry, this.material);
    this.points.frustumCulled = false;
    this.points.visible = false;
  }

  fire(origin) {
    const pos = this.points.geometry.attributes.position.array;
    for (let i = 0; i < this.count; i++) {
      const th = Math.random() * TAU;
      const up = Math.random();
      const sp = 1.4 + Math.random() * 2.4;
      this.velocities[i * 3] = Math.cos(th) * Math.sqrt(1 - up * up) * sp;
      this.velocities[i * 3 + 1] = (up * 0.9 + 0.6) * sp;
      this.velocities[i * 3 + 2] = Math.sin(th) * Math.sqrt(1 - up * up) * sp;
      pos[i * 3] = origin.x;
      pos[i * 3 + 1] = origin.y;
      pos[i * 3 + 2] = origin.z;
    }
    this.points.geometry.attributes.position.needsUpdate = true;
    this.age = 0;
    this.points.visible = true;
  }

  update(dt) {
    if (!this.points.visible) return;
    this.age += dt;
    const life = 1.5;
    if (this.age > life) {
      this.points.visible = false;
      return;
    }
    const pos = this.points.geometry.attributes.position.array;
    const v = this.velocities;
    const drag = Math.pow(0.4, dt);
    for (let i = 0; i < this.count; i++) {
      v[i * 3 + 1] -= 3.4 * dt;
      v[i * 3] *= drag;
      v[i * 3 + 1] *= drag;
      v[i * 3 + 2] *= drag;
      pos[i * 3] += v[i * 3] * dt;
      pos[i * 3 + 1] += v[i * 3 + 1] * dt;
      pos[i * 3 + 2] += v[i * 3 + 2] * dt;
    }
    this.points.geometry.attributes.position.needsUpdate = true;
    const k = this.age / life;
    this.material.opacity = 1 - k * k;
    this.material.size = 0.11 * (1 - k * 0.6);
  }
}

export class AdventGrid {
  constructor(scene, { burstCount = 200, reduced = false } = {}) {
    this.scene = scene;
    this.reduced = reduced;
    this.group = new THREE.Group();
    scene.add(this.group);
    this.boxes = [];
    this.pickables = [];
    this.opened = new Set();
    this.hoverDay = null;
    this.focusDay = null;
    this.interactive = true;
    this.cols = 0;
    this.rows = 0;
    this._createShared();
    for (let day = 1; day <= 24; day++) this._createBox(day);
    this.burst = new Burst(burstCount);
    scene.add(this.burst.points);
  }

  /** Geometrías y materiales comunes a todas las cajas. */
  _createShared() {
    this.geo = {
      body: new THREE.BoxGeometry(1, BODY_H, 1),
      lid: new THREE.BoxGeometry(1.08, LID_H, 1.08),
      ribbonX: new THREE.BoxGeometry(1.1, LID_H + 0.012, 0.17),
      ribbonZ: new THREE.BoxGeometry(0.17, LID_H + 0.012, 1.1),
      loop: new THREE.TorusGeometry(0.15, 0.045, 10, 28),
      knot: new THREE.SphereGeometry(0.075, 16, 12),
    };
    this.ribbonMats = {};
    for (const [key, color] of Object.entries(RIBBONS)) {
      this.ribbonMats[key] = new THREE.MeshStandardMaterial({
        color,
        metalness: 0.35,
        roughness: 0.5,
        emissive: color,
        emissiveIntensity: 0.14,
      });
    }
    this.glowMat = new THREE.SpriteMaterial({
      map: getGlowTexture(),
      color: '#f5c96a',
      transparent: true,
      opacity: 0.32,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
  }

  _ribbonFor(day) {
    const { bg } = paperStyle(day);
    if (bg === '#d9a441') return this.ribbonMats.navy;
    if (isLight(bg)) return this.ribbonMats.violet;
    return day % 2 ? this.ribbonMats.gold : this.ribbonMats.silver;
  }

  _createBox(day) {
    const { paper, front } = createBoxTextures(day);
    const matOpts = { roughness: 0.6, metalness: 0.08, emissive: '#ffffff', emissiveIntensity: 0.07 };
    const paperMat = new THREE.MeshStandardMaterial({ map: paper, emissiveMap: paper, ...matOpts });
    const frontMat = new THREE.MeshStandardMaterial({ map: front, emissiveMap: front, ...matOpts });
    const ribbon = this._ribbonFor(day);

    const root = new THREE.Group();
    root.name = `caja-${day}`;
    const tilt = new THREE.Group();
    tilt.rotation.x = TILT;
    root.add(tilt);

    // Cuerpo: material distinto en la cara frontal (+z) con el número
    const body = new THREE.Mesh(this.geo.body, [paperMat, paperMat, paperMat, paperMat, frontMat, paperMat]);
    body.userData.day = day;
    tilt.add(body);

    // Tapa con cintas cruzadas
    const lid = new THREE.Group();
    lid.position.y = LID_Y;
    const lidMesh = new THREE.Mesh(this.geo.lid, paperMat);
    lidMesh.userData.day = day;
    lid.add(lidMesh, new THREE.Mesh(this.geo.ribbonX, ribbon), new THREE.Mesh(this.geo.ribbonZ, ribbon));
    tilt.add(lid);

    // Lazo: cuatro lazadas + nudo
    const bow = new THREE.Group();
    bow.position.y = BOW_Y;
    for (const [x, z, rz, ry, s] of [
      [-0.14, 0, 0.55, 0, 1],
      [0.14, 0, -0.55, 0, 1],
      [0, -0.12, 0.55, Math.PI / 2, 0.8],
      [0, 0.12, -0.55, Math.PI / 2, 0.8],
    ]) {
      const loop = new THREE.Mesh(this.geo.loop, ribbon);
      loop.position.set(x, 0.1, z);
      loop.rotation.set(0, ry, rz);
      loop.scale.setScalar(s);
      bow.add(loop);
    }
    const knot = new THREE.Mesh(this.geo.knot, ribbon);
    knot.position.y = 0.05;
    bow.add(knot);
    tilt.add(bow);

    // Soporte de la mini sorpresa: contrarresta la inclinación para quedar recta
    const holder = new THREE.Group();
    holder.position.y = BODY_TOP;
    holder.rotation.x = -TILT;
    holder.visible = false;
    const spinner = new THREE.Group();
    holder.add(spinner);
    tilt.add(holder);

    // Brillo sutil detrás de las cajas abiertas
    const glow = new THREE.Sprite(this.glowMat);
    glow.position.set(0, 0.4, -0.75);
    glow.scale.setScalar(2.4);
    glow.visible = false;
    root.add(glow);

    this.group.add(root);
    this.pickables.push(body, lidMesh);
    this.boxes.push({
      day,
      root,
      tilt,
      body,
      lid,
      bow,
      holder,
      spinner,
      glow,
      paperMat,
      frontMat,
      mini: null,
      hover: 0,
      intro: 1,
      base: new THREE.Vector3(),
      cur: new THREE.Vector3(),
      placed: false,
    });
  }

  /** Recoloca las cajas en "cols" columnas (6×4 escritorio, 4×6 móvil). */
  layout(cols) {
    this.cols = cols;
    this.rows = Math.ceil(24 / cols);
    this.boxes.forEach((b, i) => {
      const c = i % cols;
      const r = Math.floor(i / cols);
      b.base.set((c - (cols - 1) / 2) * SX, ((this.rows - 1) / 2 - r) * SY, 0);
      if (!b.placed) {
        b.cur.copy(b.base);
        b.placed = true;
      }
    });
  }

  getSize() {
    return { width: this.cols * SX, height: this.rows * SY };
  }

  /** Punto de enfoque de la cámara para una caja. */
  getFocusPoint(day, out = new THREE.Vector3()) {
    const b = this.boxes[day - 1];
    return out.set(b.base.x, b.base.y, 0);
  }

  pick(raycaster) {
    const hits = raycaster.intersectObjects(this.pickables, false);
    return hits.length ? hits[0].object.userData.day : null;
  }

  setHover(day) {
    this.hoverDay = day;
  }

  setFocusDay(day) {
    this.focusDay = day;
  }

  /** Animación de entrada: las cajas aparecen escalonadas. */
  intro() {
    if (this.reduced) return;
    this.boxes.forEach((b, i) => {
      b.intro = 0.001;
      const delay = (i % this.cols) * 0.05 + Math.floor(i / this.cols) * 0.08;
      tween({
        duration: 0.7,
        delay,
        ease: Ease.outBack,
        onUpdate: (e) => (b.intro = Math.max(0.001, e)),
      });
    });
  }

  _ensureMini(b) {
    if (!b.mini) {
      b.mini = createSurprise(b.day, MINI_SIZE);
      b.spinner.add(b.mini);
    }
  }

  _hideWrapping(b) {
    b.lid.visible = false;
    b.bow.visible = false;
    b.lid.position.set(0, LID_Y, 0);
    b.lid.rotation.set(0, 0, 0);
    b.lid.scale.setScalar(1);
    b.bow.position.set(0, BOW_Y, 0);
    b.bow.rotation.set(0, 0, 0);
    b.bow.scale.setScalar(1);
  }

  /** Marca una caja como abierta sin animación (al cargar el progreso). */
  setOpenedInstant(day) {
    const b = this.boxes[day - 1];
    this.opened.add(day);
    this._ensureMini(b);
    this._hideWrapping(b);
    b.holder.visible = true;
    b.holder.position.y = BODY_TOP;
    b.holder.scale.setScalar(1);
    b.glow.visible = true;
  }

  /** Desenvuelve: el lazo se deshace, la tapa salta y sale un destello. */
  async unwrap(day) {
    const b = this.boxes[day - 1];
    const bowAnim = tween({
      duration: 0.5,
      ease: Ease.inCubic,
      onUpdate: (e) => {
        b.bow.scale.setScalar(Math.max(0.001, 1 - e));
        b.bow.rotation.y = e * 5;
        b.bow.position.y = BOW_Y + e * 0.4;
      },
    });
    await wait(0.22);
    const p = new THREE.Vector3();
    b.lid.getWorldPosition(p);
    this.burst.fire(p);
    await tween({
      duration: 0.9,
      ease: Ease.linear,
      onUpdate: (e) => {
        const up = Ease.outCubic(Math.min(1, e / 0.45));
        const fall = Math.max(0, (e - 0.45) / 0.55);
        b.lid.position.set(fall * 0.9, LID_Y + up * 1.3 - fall * fall * 0.6, fall * 0.5);
        b.lid.rotation.set(e * 0.9, 0, -e * 1.6);
        b.lid.scale.setScalar(Math.max(0.001, 1 - Ease.inCubic(fall)));
      },
    });
    await bowAnim;
    this._hideWrapping(b);
  }

  /** La sorpresa emerge girando por encima de la caja. */
  async emerge(day) {
    const b = this.boxes[day - 1];
    const wasOpen = this.opened.has(day) && b.mini;
    this._ensureMini(b);
    this.opened.add(day);
    b.holder.visible = true;
    b.glow.visible = true;
    const fromY = wasOpen ? b.holder.position.y : BODY_TOP - 0.35;
    const fromS = wasOpen ? b.holder.scale.x : 0.15;
    const fromR = b.holder.rotation.y;
    await tween({
      duration: wasOpen ? 0.7 : 1.1,
      ease: Ease.outBack,
      onUpdate: (e) => {
        b.holder.position.y = lerp(fromY, BODY_TOP + 0.55, e);
        b.holder.scale.setScalar(Math.max(0.001, lerp(fromS, 1.45, e)));
        b.holder.rotation.y = fromR + e * TAU;
      },
    });
  }

  /** Devuelve la sorpresa a su posición de reposo sobre la caja. */
  settle(day) {
    const b = this.boxes[day - 1];
    const fromY = b.holder.position.y;
    const fromS = b.holder.scale.x;
    return tween({
      duration: 0.8,
      ease: Ease.inOutCubic,
      onUpdate: (e) => {
        b.holder.position.y = lerp(fromY, BODY_TOP, e);
        b.holder.scale.setScalar(lerp(fromS, 1, e));
      },
    });
  }

  /** Cierra todas las cajas (con un pequeño "pop" de las tapas). */
  reset() {
    let k = 0;
    for (const b of this.boxes) {
      if (!this.opened.has(b.day)) continue;
      if (b.mini) {
        b.mini.userData.dispose();
        b.mini = null;
      }
      b.holder.visible = false;
      b.holder.rotation.y = 0;
      b.spinner.rotation.y = 0;
      b.glow.visible = false;
      b.paperMat.emissiveIntensity = b.frontMat.emissiveIntensity = 0.07;
      b.lid.visible = true;
      b.bow.visible = true;
      b.lid.scale.setScalar(0.001);
      b.bow.scale.setScalar(0.001);
      tween({
        duration: 0.6,
        delay: k++ * 0.04,
        ease: Ease.outBack,
        onUpdate: (e) => {
          const s = Math.max(0.001, e);
          b.lid.scale.setScalar(s);
          b.bow.scale.setScalar(s);
        },
      });
    }
    this.opened.clear();
  }

  update(t, dt) {
    const follow = Math.min(1, dt * 9);
    for (const b of this.boxes) {
      const active = this.interactive && (b.day === this.hoverDay || b.day === this.focusDay);
      b.hover += ((active ? 1 : 0) - b.hover) * follow;
      b.cur.lerp(b.base, Math.min(1, dt * 6));
      const h = b.hover;
      const bob = this.reduced ? 0 : Math.sin(t * 2.6 + b.day) * 0.035 * h;
      b.root.position.set(b.cur.x, b.cur.y + h * 0.14 + bob, h * 0.5);
      b.tilt.rotation.y = h * (this.reduced ? 0.12 : 0.2 + Math.sin(t * 2) * 0.06);
      b.root.scale.setScalar(b.intro * (1 + h * 0.05));

      if (b.mini) {
        b.spinner.rotation.y += dt * (this.reduced ? 0.25 : 0.6);
        b.mini.userData.update(t, dt);
      }
      if (b.glow.visible) {
        const pulse = 0.5 + 0.5 * Math.sin(t * 1.6 + b.day);
        b.glow.scale.setScalar(2.3 + pulse * 0.3);
        b.paperMat.emissiveIntensity = b.frontMat.emissiveIntensity = 0.1 + pulse * 0.06;
      }
    }
    this.burst.update(dt);
  }
}
