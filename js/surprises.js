/**
 * surprises.js
 * Las 24 mini sorpresas 3D, cada una en su propia función que devuelve un
 * THREE.Group construido solo con geometrías de Three.js.
 *
 * Rendimiento: geometrías y materiales se guardan en cachés y se reutilizan
 * entre la miniatura de la rejilla y la vista ampliada. Las animaciones de cada
 * sorpresa viven en group.userData.update(t, dt) y solo mueven sus hijos.
 */
import * as THREE from 'three';
import { createCandyTexture, getGlowTexture, createSnowflakeTexture } from './textures.js';

const TAU = Math.PI * 2;

// Calidad (nº de partículas) ajustable desde main.js según el dispositivo
let QUALITY = { explosion: 300, globeSnow: 140, sparkles: 80, reduced: false };
export function setSurpriseQuality(q) {
  QUALITY = { ...QUALITY, ...q };
}

// ---------------------------------------------------------------------------
// Cachés y utilidades
// ---------------------------------------------------------------------------
const geoCache = new Map();
const matCache = new Map();
const frameGuard = new Map();

/** Geometría cacheada por clave. */
function geo(key, make) {
  if (!geoCache.has(key)) geoCache.set(key, make());
  return geoCache.get(key);
}

/** Material cacheado por clave (definición en MATERIALS o fábrica propia). */
function mat(key, make) {
  if (!matCache.has(key)) {
    const factory = make || MATERIALS[key];
    if (!factory) throw new Error(`Material desconocido: ${key}`);
    matCache.set(key, factory());
  }
  return matCache.get(key);
}

/**
 * Ejecuta fn una sola vez por fotograma aunque la sorpresa esté instanciada
 * dos veces (miniatura + vista ampliada) y comparta geometría dinámica.
 */
function oncePerFrame(key, t, fn) {
  if (frameGuard.get(key) === t) return;
  frameGuard.set(key, t);
  fn();
}

function std(color, opts = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.55, metalness: 0.05, ...opts });
}
function additive(color, opts = {}) {
  return new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    ...opts,
  });
}
function spriteMat(color, opacity = 0.6, blending = THREE.AdditiveBlending) {
  return new THREE.SpriteMaterial({
    map: getGlowTexture(),
    color,
    transparent: true,
    opacity,
    blending,
    depthWrite: false,
  });
}

// Colores > 1 en espacio lineal: brillan con el bloom
const MATERIALS = {
  gold: () => std('#f5c96a', { metalness: 0.85, roughness: 0.28, emissive: '#6e4a0e', emissiveIntensity: 0.5 }),
  goldBright: () => std('#ffd98a', { metalness: 0.7, roughness: 0.25, emissive: '#f5b84a', emissiveIntensity: 0.9 }),
  goldDouble: () =>
    std('#f5c96a', { metalness: 0.85, roughness: 0.3, emissive: '#6e4a0e', emissiveIntensity: 0.5, side: THREE.DoubleSide }),
  silver: () => std('#dfe5f0', { metalness: 0.6, roughness: 0.3, emissive: '#7d89b8', emissiveIntensity: 0.55 }),
  snow: () => std('#f6f8ff', { roughness: 0.9, emissive: '#8ea4dd', emissiveIntensity: 0.2 }),
  ice: () => std('#e3f3ff', { metalness: 0.35, roughness: 0.15, emissive: '#6aa8ff', emissiveIntensity: 0.6 }),
  red: () => std('#c62f3b', { roughness: 0.55, emissive: '#3d0710', emissiveIntensity: 0.35 }),
  green: () => std('#2a7a52', { roughness: 0.7, emissive: '#06261a', emissiveIntensity: 0.35 }),
  darkGreen: () => std('#1b5a3e', { roughness: 0.75, emissive: '#041a12', emissiveIntensity: 0.35 }),
  wood: () => std('#7a4b2c', { roughness: 0.85, emissive: '#1a0c04', emissiveIntensity: 0.3 }),
  gingerbread: () => std('#b86a32', { roughness: 0.9, emissive: '#2e1405', emissiveIntensity: 0.35 }),
  icing: () => std('#fffaf2', { roughness: 0.5, emissive: '#ffffff', emissiveIntensity: 0.2 }),
  black: () => std('#1c1f2e', { roughness: 0.6 }),
  carrot: () => std('#f08a24', { roughness: 0.6, emissive: '#5a2a00', emissiveIntensity: 0.35 }),
  violet: () => std('#7b5cc4', { metalness: 0.7, roughness: 0.25, emissive: '#2a1660', emissiveIntensity: 0.5 }),
  candleViolet: () => std('#6b4fb0', { roughness: 0.6, emissive: '#22124a', emissiveIntensity: 0.5 }),
  pink: () => std('#d98bb8', { roughness: 0.5, emissive: '#3a1028', emissiveIntensity: 0.4 }),
  cream: () => std('#f6ead0', { roughness: 0.7, emissive: '#3a2c10', emissiveIntensity: 0.25 }),
  navy: () => std('#2f3f8f', { metalness: 0.3, roughness: 0.45, emissive: '#0b1026', emissiveIntensity: 0.3 }),
  mug: () => std('#2f3f8f', { metalness: 0.2, roughness: 0.35, emissive: '#101a48', emissiveIntensity: 0.4, side: THREE.DoubleSide }),
  wall: () => std('#e2c29a', { roughness: 0.85, emissive: '#2a1a08', emissiveIntensity: 0.3 }),
  roof: () => std('#8e2f3a', { roughness: 0.7, emissive: '#200508', emissiveIntensity: 0.3 }),
  reindeer: () => std('#8b5a3a', { roughness: 0.8, emissive: '#1f0e04', emissiveIntensity: 0.35 }),
  skin: () => std('#f2d6c0', { roughness: 0.7, emissive: '#3a2010', emissiveIntensity: 0.25 }),
  hair: () => std('#e8c06a', { metalness: 0.4, roughness: 0.45, emissive: '#5a3a08', emissiveIntensity: 0.4 }),
  robe: () => std('#f3f5ff', { roughness: 0.55, emissive: '#9aa8e0', emissiveIntensity: 0.3 }),
  wing: () =>
    std('#eef2ff', { metalness: 0.3, roughness: 0.35, emissive: '#b9c6ff', emissiveIntensity: 0.4, side: THREE.DoubleSide }),
  moon: () => std('#fff0c2', { roughness: 0.6, emissive: '#e8c66e', emissiveIntensity: 0.65 }),
  chocolate: () => std('#4a2616', { roughness: 0.3, emissive: '#120502', emissiveIntensity: 0.4 }),
  iron: () => std('#2a2f45', { metalness: 0.7, roughness: 0.4, emissive: '#0b1026', emissiveIntensity: 0.3 }),
  glass: () =>
    new THREE.MeshStandardMaterial({
      color: '#cfe3ff',
      transparent: true,
      opacity: 0.2,
      roughness: 0.05,
      metalness: 0.2,
      depthWrite: false,
    }),
  glassSphere: () =>
    new THREE.MeshStandardMaterial({
      color: '#d8ebff',
      transparent: true,
      opacity: 0.16,
      roughness: 0.02,
      metalness: 0.3,
      depthWrite: false,
      emissive: '#3a5aa0',
      emissiveIntensity: 0.3,
    }),
  windowLight: () => new THREE.MeshBasicMaterial({ color: new THREE.Color(2.4, 1.6, 0.6) }),
  flame: () => additive(new THREE.Color(2.4, 1.3, 0.35), { opacity: 0.9 }),
  flameCore: () => additive(new THREE.Color(2.5, 2.3, 1.6), { opacity: 0.95 }),
  noseGlow: () => new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 0.25, 0.25) }),
  candy: () => {
    const map = createCandyTexture();
    return std('#ffffff', { map, roughness: 0.3, metalness: 0.05, emissive: '#ffffff', emissiveMap: map, emissiveIntensity: 0.12 });
  },
  ray: () => additive(new THREE.Color(1.2, 0.8, 0.25), { opacity: 0.16, side: THREE.DoubleSide }),
  bulbRed: () => std('#ff6a6a', { emissive: '#ff3030', emissiveIntensity: 1 }),
  bulbGold: () => std('#ffe08a', { emissive: '#ffb830', emissiveIntensity: 1 }),
  bulbBlue: () => std('#8ab8ff', { emissive: '#3a7cff', emissiveIntensity: 1 }),
  bulbViolet: () => std('#c4a8ff', { emissive: '#8a5aff', emissiveIntensity: 1 }),
  glowWarm: () => spriteMat(new THREE.Color(1.0, 0.65, 0.25), 0.75),
  glowGold: () => spriteMat('#f5c96a', 0.5),
  glowCool: () => spriteMat('#8fb4ff', 0.45),
  glowRed: () => spriteMat('#ff5050', 0.7),
  bounds: () => new THREE.MeshBasicMaterial({ visible: false }),
};

/** Crea una malla posicionada. */
function mesh(geometry, material, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geometry, material);
  m.position.set(x, y, z);
  return m;
}

/** Sprite de brillo aditivo (no cuenta para el tamaño de la sorpresa). */
function glowSprite(key, scale = 1, x = 0, y = 0, z = 0) {
  const s = new THREE.Sprite(mat(key));
  s.scale.setScalar(scale);
  s.position.set(x, y, z);
  s.userData.noBounds = true;
  return s;
}

/** Caja invisible que fija el tamaño de sorpresas con elementos etéreos. */
function boundsBox(w, h, d, x = 0, y = 0, z = 0) {
  const m = mesh(geo('unitBox', () => new THREE.BoxGeometry(1, 1, 1)), mat('bounds'), x, y, z);
  m.scale.set(w, h, d);
  m.visible = false;
  return m;
}

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Geometrías comunes
const sphereGeo = () => geo('sphere', () => new THREE.SphereGeometry(1, 32, 24));
const smallSphereGeo = () => geo('sphereLow', () => new THREE.SphereGeometry(1, 12, 10));

function starShape(outer = 1, inner = 0.45, points = 5) {
  const s = new THREE.Shape();
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 ? inner : outer;
    const a = Math.PI / 2 + (i / (points * 2)) * TAU;
    if (i === 0) s.moveTo(Math.cos(a) * r, Math.sin(a) * r);
    else s.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  s.closePath();
  return s;
}

/** Estrella de 5 puntas extruida y biselada (radio 1, centrada). */
function starGeometry() {
  return geo('star', () => {
    const g = new THREE.ExtrudeGeometry(starShape(1, 0.45), {
      depth: 0.28,
      bevelEnabled: true,
      bevelThickness: 0.12,
      bevelSize: 0.08,
      bevelSegments: 3,
    });
    g.center();
    return g;
  });
}

function starMesh(scale, material = 'goldBright') {
  const m = mesh(starGeometry(), mat(material));
  m.scale.setScalar(scale);
  return m;
}

/** Llama de vela con núcleo, halo y parpadeo. */
function makeFlame(size = 1) {
  const g = new THREE.Group();
  const outer = mesh(
    geo('flameOuter', () => {
      const s = new THREE.SphereGeometry(0.1, 16, 12);
      s.scale(1, 2.1, 1);
      s.translate(0, 0.19, 0);
      return s;
    }),
    mat('flame')
  );
  const inner = mesh(
    geo('flameInner', () => {
      const s = new THREE.SphereGeometry(0.05, 12, 10);
      s.scale(1, 1.9, 1);
      s.translate(0, 0.13, 0);
      return s;
    }),
    mat('flameCore')
  );
  const glow = glowSprite('glowWarm', 0.9, 0, 0.2, 0);
  g.add(outer, inner, glow);
  g.scale.setScalar(size);
  g.userData.flicker = (t, seed = 0) => {
    const k = QUALITY.reduced ? 0.4 : 1;
    const f = 1 + (Math.sin(t * 13 + seed) * 0.07 + Math.sin(t * 23.7 + seed * 2.1) * 0.05) * k;
    outer.scale.set(1 / Math.sqrt(f), f, 1 / Math.sqrt(f));
    outer.rotation.z = Math.sin(t * 5.3 + seed) * 0.09 * k;
    inner.scale.set(1, 0.9 + (f - 1) * 1.5, 1);
    glow.scale.setScalar(0.9 * (0.88 + 0.12 * f));
  };
  return g;
}

/** Árbol base (tres conos y tronco), reutilizado por varios días. */
const TREE_CONES = [
  [1.0, 1.1, 0.85],
  [0.8, 1.0, 1.45],
  [0.58, 0.9, 2.0],
];
function buildTree(material = 'green') {
  const t = new THREE.Group();
  TREE_CONES.forEach(([r, h, y], i) => {
    t.add(mesh(geo(`treeCone${i}`, () => new THREE.ConeGeometry(r, h, 28)), mat(material), 0, y, 0));
  });
  t.add(mesh(geo('trunk', () => new THREE.CylinderGeometry(0.15, 0.19, 0.45, 16)), mat('wood'), 0, 0.22, 0));
  return t;
}
/** Radio exterior del árbol a una altura y (para colocar adornos). */
function treeRadius(y) {
  let r = 0;
  for (const [cr, h, cy] of TREE_CONES) {
    const base = cy - h / 2;
    if (y >= base && y <= base + h) r = Math.max(r, cr * (1 - (y - base) / h));
  }
  return r;
}

/** Pequeño lazo (dos lazadas + nudo). */
function makeBow(material, scale = 1) {
  const g = new THREE.Group();
  const loop = geo('bowLoop', () => new THREE.TorusGeometry(0.15, 0.045, 10, 24));
  const l = mesh(loop, mat(material), -0.14, 0.06, 0);
  l.rotation.z = 0.55;
  const r = mesh(loop, mat(material), 0.14, 0.06, 0);
  r.rotation.z = -0.55;
  const knot = mesh(smallSphereGeo(), mat(material), 0, 0.03, 0);
  knot.scale.setScalar(0.07);
  g.add(l, r, knot);
  g.scale.setScalar(scale);
  return g;
}

// ---------------------------------------------------------------------------
// LAS 24 SORPRESAS
// Cada función devuelve un THREE.Group. Las animaciones usan el grupo "rig".
// ---------------------------------------------------------------------------

/** 1 · Estrella dorada con chispas orbitando. */
function crearEstrella() {
  const g = new THREE.Group();
  const rig = new THREE.Group();
  const star = starMesh(1);
  const halo = glowSprite('glowGold', 3.4);
  const orbit = new THREE.Group();
  const spark = geo('sparkle', () => new THREE.OctahedronGeometry(0.07));
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * TAU;
    orbit.add(mesh(spark, mat('goldBright'), Math.cos(a) * 1.35, Math.sin(a) * 1.35, 0));
  }
  rig.add(halo, star, orbit);
  g.add(rig);
  g.userData.update = (t) => {
    star.rotation.y = t * 0.9;
    rig.position.y = Math.sin(t * 1.6) * 0.06;
    orbit.rotation.z = -t * 0.4;
    halo.scale.setScalar(3.4 + Math.sin(t * 2) * 0.15);
  };
  return g;
}

/** 2 · Copo de nieve cristalino de seis brazos. */
function crearCopoNieve() {
  const g = new THREE.Group();
  const flake = new THREE.Group();
  const m = mat('ice');
  const arm = geo('flakeArm', () => new THREE.BoxGeometry(0.07, 1.0, 0.05));
  const branch = geo('flakeBranch', () => new THREE.BoxGeometry(0.05, 0.32, 0.04));
  const tip = geo('flakeTip', () => new THREE.OctahedronGeometry(0.07));
  for (let i = 0; i < 6; i++) {
    const a = new THREE.Group();
    a.rotation.z = (i * TAU) / 6;
    a.add(mesh(arm, m, 0, 0.5, 0));
    for (const [y, len] of [
      [0.42, 1],
      [0.7, 0.7],
    ]) {
      for (const side of [-1, 1]) {
        const b = mesh(branch, m, side * 0.113 * len, y + 0.113 * len, 0);
        b.scale.y = len;
        b.rotation.z = -side * (Math.PI / 4);
        a.add(b);
      }
    }
    a.add(mesh(tip, m, 0, 1.02, 0));
    flake.add(a);
  }
  const hex = mesh(
    geo('flakeHex', () => {
      const c = new THREE.CylinderGeometry(0.17, 0.17, 0.08, 6);
      c.rotateX(Math.PI / 2);
      return c;
    }),
    m
  );
  flake.add(hex);
  g.add(glowSprite('glowCool', 3), flake);
  g.userData.update = (t) => {
    flake.rotation.z = t * 0.35;
    flake.rotation.y = Math.sin(t * 0.8) * 0.5;
  };
  return g;
}

/** 3 · Muñeco de nieve con bufanda y sombrero. */
function crearMunecoNieve() {
  const g = new THREE.Group();
  const rig = new THREE.Group();
  const snow = mat('snow');
  const s = sphereGeo();
  const add = (o) => rig.add(o);
  const body = mesh(s, snow, 0, 0.55, 0);
  body.scale.setScalar(0.55);
  const mid = mesh(s, snow, 0, 1.28, 0);
  mid.scale.setScalar(0.4);
  const head = mesh(s, snow, 0, 1.86, 0);
  head.scale.setScalar(0.3);
  add(body);
  add(mid);
  add(head);

  const small = smallSphereGeo();
  for (const side of [-1, 1]) {
    const e = mesh(small, mat('black'), side * 0.1, 1.93, 0.26);
    e.scale.setScalar(0.035);
    add(e);
  }
  // Sonrisa de carbón (puntos sobre la superficie de la cabeza)
  for (let i = 0; i < 5; i++) {
    const x = (i - 2) * 0.06;
    const y = 1.77 + (i - 2) * (i - 2) * 0.012;
    const z = Math.sqrt(Math.max(0, 0.3 * 0.3 - x * x - (y - 1.86) * (y - 1.86)));
    const d = mesh(small, mat('black'), x, y, z);
    d.scale.setScalar(0.022);
    add(d);
  }
  const nose = mesh(
    geo('carrot', () => {
      const c = new THREE.ConeGeometry(0.05, 0.3, 12);
      c.rotateX(Math.PI / 2);
      c.translate(0, 0, 0.15);
      return c;
    }),
    mat('carrot'),
    0,
    1.86,
    0.27
  );
  add(nose);
  for (const y of [1.42, 1.28, 1.14]) {
    const b = mesh(small, mat('black'), 0, y, Math.sqrt(0.4 * 0.4 - (y - 1.28) ** 2));
    b.scale.setScalar(0.04);
    add(b);
  }
  const scarf = mesh(geo('scarf', () => new THREE.TorusGeometry(0.27, 0.07, 10, 28)), mat('red'), 0, 1.6, 0);
  scarf.rotation.x = Math.PI / 2;
  add(scarf);
  const tail = mesh(geo('scarfTail', () => new THREE.BoxGeometry(0.12, 0.38, 0.05)), mat('red'), 0.15, 1.42, 0.3);
  tail.rotation.z = 0.2;
  add(tail);
  // Brazos de rama
  for (const side of [-1, 1]) {
    const a = mesh(geo('twig', () => new THREE.CylinderGeometry(0.022, 0.03, 0.6, 8)), mat('wood'), side * 0.6, 1.45, 0);
    a.rotation.z = -side * 1.0;
    add(a);
  }
  // Sombrero de copa
  const hat = new THREE.Group();
  hat.position.set(0, 2.12, 0);
  hat.rotation.z = 0.12;
  hat.add(mesh(geo('hatBrim', () => new THREE.CylinderGeometry(0.3, 0.3, 0.04, 24)), mat('black')));
  hat.add(mesh(geo('hatTop', () => new THREE.CylinderGeometry(0.19, 0.2, 0.36, 24)), mat('black'), 0, 0.2, 0));
  hat.add(mesh(geo('hatBand', () => new THREE.CylinderGeometry(0.205, 0.205, 0.07, 24)), mat('red'), 0, 0.06, 0));
  add(hat);
  g.add(rig);
  g.userData.update = (t) => {
    rig.rotation.z = Math.sin(t * 1.2) * 0.04;
    rig.rotation.y = Math.sin(t * 0.6) * 0.3;
  };
  return g;
}

/** 4 · Árbol de Navidad con bolas y estrella. */
function crearArbol() {
  const g = new THREE.Group();
  const rig = new THREE.Group();
  rig.add(buildTree());
  const star = starMesh(0.26);
  star.position.y = 2.6;
  rig.add(star, glowSprite('glowGold', 1.2, 0, 2.6, 0));
  const rand = mulberry32(4);
  const colors = ['red', 'gold', 'silver', 'violet'];
  for (let i = 0; i < 16; i++) {
    const y = 0.5 + rand() * 1.75;
    const a = rand() * TAU;
    const r = treeRadius(y) * 0.88 + 0.06;
    const o = mesh(smallSphereGeo(), mat(colors[i % 4]), Math.cos(a) * r, y, Math.sin(a) * r);
    o.scale.setScalar(0.075);
    rig.add(o);
  }
  g.add(rig);
  g.userData.update = (t) => {
    rig.rotation.y = t * 0.4;
    star.rotation.y = t * 1.2;
  };
  return g;
}

/** 5 · Bola de Navidad violeta con bandas doradas. */
function crearBola() {
  const g = new THREE.Group();
  const rig = new THREE.Group();
  const ball = mesh(sphereGeo(), mat('violet'));
  ball.scale.setScalar(0.8);
  rig.add(ball);
  const band = mesh(geo('ballBand', () => new THREE.TorusGeometry(0.8, 0.04, 10, 64)), mat('gold'));
  band.rotation.x = Math.PI / 2;
  rig.add(band);
  for (const y of [-0.3, 0.3]) {
    const b = mesh(geo('ballBandSmall', () => new THREE.TorusGeometry(0.742, 0.018, 8, 64)), mat('gold'), 0, y, 0);
    b.rotation.x = Math.PI / 2;
    rig.add(b);
  }
  // Estrellitas pegadas a la superficie
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * TAU;
    const lat = i % 2 ? 0.55 : -0.55;
    const p = new THREE.Vector3(Math.cos(lat) * Math.cos(a), Math.sin(lat), Math.cos(lat) * Math.sin(a)).multiplyScalar(0.82);
    const s = starMesh(0.07);
    s.position.copy(p);
    s.lookAt(p.clone().multiplyScalar(2));
    rig.add(s);
  }
  rig.add(mesh(geo('ballCap', () => new THREE.CylinderGeometry(0.16, 0.19, 0.2, 20)), mat('gold'), 0, 0.86, 0));
  rig.add(mesh(geo('ballHook', () => new THREE.TorusGeometry(0.09, 0.022, 8, 20)), mat('gold'), 0, 1.03, 0));
  g.add(glowSprite('glowGold', 2.6), rig);
  g.userData.update = (t) => {
    rig.rotation.y = t * 0.6;
    rig.rotation.z = Math.sin(t * 1.3) * 0.08;
  };
  return g;
}

/** 6 · Bastón de caramelo a rayas. */
class CaneCurve extends THREE.Curve {
  getPoint(t, target = new THREE.Vector3()) {
    const straight = 0.56;
    if (t < straight) return target.set(0, (t / straight) * 1.6, 0);
    const a = ((t - straight) / (1 - straight)) * Math.PI * 1.15;
    const ang = Math.PI - a;
    return target.set(0.35 + Math.cos(ang) * 0.35, 1.6 + Math.sin(ang) * 0.35, 0);
  }
}
function crearBaston() {
  const g = new THREE.Group();
  const rig = new THREE.Group();
  const curve = new CaneCurve();
  const tube = mesh(geo('cane', () => new THREE.TubeGeometry(curve, 96, 0.11, 16, false)), mat('candy'));
  const capA = mesh(smallSphereGeo(), mat('red'), 0, 0, 0);
  capA.scale.setScalar(0.11);
  const end = curve.getPoint(1);
  const capB = mesh(smallSphereGeo(), mat('red'), end.x, end.y, end.z);
  capB.scale.setScalar(0.11);
  const bow = makeBow('darkGreen', 0.8);
  bow.position.set(0, 1.25, 0.12);
  rig.add(tube, capA, capB, bow);
  rig.position.x = -0.35;
  const pivot = new THREE.Group();
  pivot.add(rig);
  pivot.rotation.z = 0.12;
  g.add(glowSprite('glowWarm', 2.2, 0, 1, -0.2), pivot);
  g.userData.update = (t) => {
    pivot.rotation.y = t * 0.7;
  };
  return g;
}

/** 7 · Campana dorada que se balancea. */
function crearCampana() {
  const g = new THREE.Group();
  const pivot = new THREE.Group();
  pivot.position.y = 1.15;
  const bell = new THREE.Group();
  bell.position.y = -1.15;
  pivot.add(bell);
  const profile = [
    [0.001, 1.0],
    [0.18, 0.99],
    [0.3, 0.92],
    [0.36, 0.75],
    [0.4, 0.55],
    [0.46, 0.35],
    [0.56, 0.17],
    [0.68, 0.06],
    [0.72, 0.0],
    [0.66, 0.0],
  ].map(([x, y]) => new THREE.Vector2(x, y));
  bell.add(mesh(geo('bell', () => new THREE.LatheGeometry(profile, 48)), mat('goldDouble')));
  const clapper = mesh(smallSphereGeo(), mat('gold'), 0, 0.06, 0);
  clapper.scale.setScalar(0.11);
  bell.add(clapper);
  bell.add(mesh(geo('bellLoop', () => new THREE.TorusGeometry(0.1, 0.03, 8, 20)), mat('gold'), 0, 1.08, 0));
  const bow = makeBow('red', 0.9);
  bow.position.set(0, 0.88, 0.3);
  bell.add(bow);
  // Hojas de acebo y bayas
  for (const side of [-1, 1]) {
    const leaf = mesh(sphereGeo(), mat('green'), side * 0.2, 0.84, 0.3);
    leaf.scale.set(0.16, 0.06, 0.03);
    leaf.rotation.z = side * -0.5;
    bell.add(leaf);
  }
  g.add(glowSprite('glowGold', 2.4, 0, 0.5, -0.3), pivot);
  g.userData.update = (t) => {
    const k = QUALITY.reduced ? 0.4 : 1;
    pivot.rotation.z = Math.sin(t * 2.2) * 0.22 * k;
    clapper.position.x = -Math.sin(t * 2.2 - 0.6) * 0.07 * k;
  };
  return g;
}

/** 8 · Vela con llama animada. */
function crearVela() {
  const g = new THREE.Group();
  g.add(mesh(geo('candlePlate', () => new THREE.CylinderGeometry(0.55, 0.6, 0.08, 32)), mat('gold'), 0, 0.04, 0));
  g.add(mesh(geo('candleRing', () => new THREE.CylinderGeometry(0.33, 0.35, 0.12, 32)), mat('gold'), 0, 0.12, 0));
  g.add(mesh(geo('candleBody', () => new THREE.CylinderGeometry(0.26, 0.28, 1.2, 32)), mat('cream'), 0, 0.72, 0));
  const drip = geo('drip', () => new THREE.CapsuleGeometry(0.04, 0.16, 4, 8));
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * TAU + 0.4;
    g.add(mesh(drip, mat('cream'), Math.cos(a) * 0.265, 1.2 - (i % 2) * 0.1, Math.sin(a) * 0.265));
  }
  g.add(mesh(geo('wick', () => new THREE.CylinderGeometry(0.012, 0.012, 0.12, 6)), mat('black'), 0, 1.38, 0));
  const flame = makeFlame(1.25);
  flame.position.y = 1.4;
  g.add(flame, glowSprite('glowWarm', 2.6, 0, 1.6, -0.2));
  g.userData.update = (t) => flame.userData.flicker(t, 1);
  return g;
}

/** 9 · Calcetín navideño. */
function crearCalcetin() {
  const g = new THREE.Group();
  const rig = new THREE.Group();
  const sock = geo('sock', () => {
    const s = new THREE.Shape();
    s.moveTo(-0.4, 1.5);
    s.lineTo(0.3, 1.5);
    s.lineTo(0.3, 0.6);
    s.quadraticCurveTo(0.35, 0.35, 0.75, 0.3);
    s.quadraticCurveTo(1.05, 0.25, 1.0, 0.0);
    s.quadraticCurveTo(0.95, -0.25, 0.6, -0.25);
    s.lineTo(-0.1, -0.25);
    s.quadraticCurveTo(-0.45, -0.25, -0.42, 0.15);
    s.lineTo(-0.4, 1.5);
    return new THREE.ExtrudeGeometry(s, {
      depth: 0.3,
      bevelEnabled: true,
      bevelThickness: 0.06,
      bevelSize: 0.06,
      bevelSegments: 3,
      curveSegments: 16,
    });
  });
  rig.add(mesh(sock, mat('red')));
  rig.add(mesh(geo('sockCuff', () => new THREE.BoxGeometry(0.95, 0.38, 0.52)), mat('snow'), -0.05, 1.55, 0.15));
  // Talón y puntera nevados
  const heel = mesh(sphereGeo(), mat('snow'), -0.28, -0.05, 0.15);
  heel.scale.set(0.2, 0.2, 0.2);
  const toe = mesh(sphereGeo(), mat('snow'), 0.86, 0.0, 0.15);
  toe.scale.set(0.18, 0.2, 0.2);
  rig.add(heel, toe);
  const star = starMesh(0.15);
  star.position.set(0, 0.85, 0.4);
  const star2 = starMesh(0.08);
  star2.position.set(0.5, 0.15, 0.4);
  rig.add(star, star2);
  rig.add(mesh(geo('sockLoop', () => new THREE.TorusGeometry(0.1, 0.025, 8, 20)), mat('gold'), -0.32, 1.84, 0.15));
  g.add(glowSprite('glowWarm', 2.4, 0.2, 0.7, -0.3), rig);
  g.userData.update = (t) => {
    rig.rotation.z = Math.sin(t * 1.5) * 0.06;
    rig.rotation.y = Math.sin(t * 0.7) * 0.45;
  };
  return g;
}

/** 10 · Gorro de Papá Noel. */
function crearGorro() {
  const g = new THREE.Group();
  const rig = new THREE.Group();
  const cone = mesh(
    geo('hatCone', () => {
      const c = new THREE.ConeGeometry(0.6, 1.4, 32);
      c.translate(0, 0.7, 0);
      return c;
    }),
    mat('red')
  );
  cone.rotation.z = -0.3;
  const brim = mesh(geo('hatFur', () => new THREE.TorusGeometry(0.6, 0.17, 16, 40)), mat('snow'), 0, 0.05, 0);
  brim.rotation.x = Math.PI / 2;
  const pom = mesh(sphereGeo(), mat('snow'), 1.4 * Math.sin(0.3), 1.4 * Math.cos(0.3), 0);
  pom.scale.setScalar(0.2);
  rig.add(cone, brim, pom);
  g.add(glowSprite('glowWarm', 2.4, 0, 0.7, -0.3), rig);
  g.userData.update = (t) => {
    rig.rotation.y = t * 0.5;
    pom.position.y = 1.4 * Math.cos(0.3) + Math.sin(t * 3) * 0.02;
  };
  return g;
}

/** 11 · Regalo pequeño cuya tapa da saltitos. */
function crearRegalo() {
  const g = new THREE.Group();
  const rig = new THREE.Group();
  rig.add(mesh(geo('giftBody', () => new THREE.BoxGeometry(1, 0.8, 1)), mat('violet'), 0, 0.4, 0));
  rig.add(mesh(geo('giftRibA', () => new THREE.BoxGeometry(1.02, 0.82, 0.16)), mat('gold'), 0, 0.4, 0));
  rig.add(mesh(geo('giftRibB', () => new THREE.BoxGeometry(0.16, 0.82, 1.02)), mat('gold'), 0, 0.4, 0));
  const lid = new THREE.Group();
  lid.position.y = 0.9;
  lid.add(mesh(geo('giftLid', () => new THREE.BoxGeometry(1.08, 0.2, 1.08)), mat('violet')));
  lid.add(mesh(geo('giftLidA', () => new THREE.BoxGeometry(1.1, 0.21, 0.17)), mat('gold')));
  lid.add(mesh(geo('giftLidB', () => new THREE.BoxGeometry(0.17, 0.21, 1.1)), mat('gold')));
  const bow = makeBow('gold', 1.3);
  bow.position.y = 0.1;
  lid.add(bow);
  rig.add(lid);
  g.add(glowSprite('glowGold', 2.4, 0, 0.6, -0.4), rig);
  g.userData.update = (t) => {
    rig.rotation.y = t * 0.6;
    const hop = QUALITY.reduced ? 0 : Math.max(0, Math.sin(t * 3.2));
    lid.position.y = 0.9 + hop * hop * 0.08;
    lid.rotation.z = hop * 0.05;
  };
  return g;
}

/** 12 · Casita con tejado nevado y ventanas encendidas. */
function crearCasita() {
  const g = new THREE.Group();
  const rig = new THREE.Group();
  rig.add(mesh(geo('houseGround', () => new THREE.CylinderGeometry(1.1, 1.15, 0.12, 40)), mat('snow'), 0, 0.06, 0));
  rig.add(mesh(geo('houseWalls', () => new THREE.BoxGeometry(1.2, 0.85, 1)), mat('wall'), 0, 0.545, 0));
  const roof = mesh(
    geo('houseRoof', () => {
      const s = new THREE.Shape();
      s.moveTo(-0.78, 0);
      s.lineTo(0.78, 0);
      s.lineTo(0, 0.62);
      s.closePath();
      const e = new THREE.ExtrudeGeometry(s, { depth: 1.2, bevelEnabled: false });
      e.translate(0, 0, -0.6);
      return e;
    }),
    mat('roof'),
    0,
    0.97,
    0
  );
  rig.add(roof);
  const ang = Math.atan2(0.62, 0.78);
  const slab = geo('roofSnow', () => new THREE.BoxGeometry(1.04, 0.09, 1.3));
  for (const side of [-1, 1]) {
    const s = mesh(slab, mat('snow'), side * (0.39 + 0.03), 0.97 + 0.31 + 0.04, 0);
    s.rotation.z = -side * ang;
    rig.add(s);
  }
  rig.add(mesh(geo('chimney', () => new THREE.BoxGeometry(0.18, 0.4, 0.18)), mat('roof'), 0.36, 1.38, -0.2));
  rig.add(mesh(geo('chimneySnow', () => new THREE.BoxGeometry(0.24, 0.06, 0.24)), mat('snow'), 0.36, 1.6, -0.2));
  rig.add(mesh(geo('door', () => new THREE.BoxGeometry(0.26, 0.45, 0.04)), mat('wood'), 0, 0.345, 0.51));
  const knob = mesh(smallSphereGeo(), mat('gold'), 0.08, 0.34, 0.54);
  knob.scale.setScalar(0.025);
  rig.add(knob);
  const win = geo('window', () => new THREE.BoxGeometry(0.22, 0.22, 0.03));
  const barV = geo('winBarV', () => new THREE.BoxGeometry(0.025, 0.24, 0.04));
  const barH = geo('winBarH', () => new THREE.BoxGeometry(0.24, 0.025, 0.04));
  const addWindow = (x, y, z, ry) => {
    const w = new THREE.Group();
    w.position.set(x, y, z);
    w.rotation.y = ry;
    w.add(mesh(win, mat('windowLight')), mesh(barV, mat('wood')), mesh(barH, mat('wood')));
    w.add(glowSprite('glowWarm', 0.55, 0, 0, 0.05));
    rig.add(w);
  };
  addWindow(-0.36, 0.65, 0.51, 0);
  addWindow(0.36, 0.65, 0.51, 0);
  addWindow(0.61, 0.6, 0, Math.PI / 2);
  addWindow(-0.61, 0.6, 0, -Math.PI / 2);
  g.add(rig);
  g.userData.update = (t) => {
    rig.rotation.y = Math.sin(t * 0.5) * 0.6;
  };
  return g;
}

/** 13 · Trineo con patines dorados y un regalo. */
function crearTrineo() {
  const g = new THREE.Group();
  const rig = new THREE.Group();
  const runnerCurve = new THREE.CatmullRomCurve3(
    [
      [-0.95, 0.06, 0],
      [-0.5, 0, 0],
      [0.5, 0, 0],
      [0.9, 0.05, 0],
      [1.08, 0.25, 0],
      [1.0, 0.42, 0],
      [0.85, 0.38, 0],
    ].map(([x, y, z]) => new THREE.Vector3(x, y, z))
  );
  const runner = geo('runner', () => new THREE.TubeGeometry(runnerCurve, 64, 0.04, 8, false));
  const strut = geo('strut', () => new THREE.CylinderGeometry(0.03, 0.03, 0.3, 8));
  for (const z of [-0.33, 0.33]) {
    rig.add(mesh(runner, mat('gold'), 0, 0, z));
    for (const x of [-0.5, 0.45]) rig.add(mesh(strut, mat('gold'), x, 0.15, z));
  }
  const body = mesh(
    geo('sleighBody', () => {
      const s = new THREE.Shape();
      s.moveTo(-0.9, 0.25);
      s.lineTo(0.6, 0.25);
      s.quadraticCurveTo(0.95, 0.3, 0.92, 0.72);
      s.lineTo(0.55, 0.62);
      s.lineTo(-0.5, 0.62);
      s.lineTo(-0.72, 1.0);
      s.quadraticCurveTo(-0.95, 1.02, -0.92, 0.7);
      s.lineTo(-0.9, 0.25);
      const e = new THREE.ExtrudeGeometry(s, {
        depth: 0.6,
        bevelEnabled: true,
        bevelThickness: 0.05,
        bevelSize: 0.04,
        bevelSegments: 2,
        curveSegments: 12,
      });
      e.translate(0, 0, -0.3);
      return e;
    }),
    mat('red')
  );
  rig.add(body);
  const trim = geo('sleighTrim', () => new THREE.BoxGeometry(1.45, 0.05, 0.02));
  for (const z of [-0.36, 0.36]) rig.add(mesh(trim, mat('gold'), -0.1, 0.45, z));
  rig.add(mesh(geo('sleighSeat', () => new THREE.BoxGeometry(0.55, 0.1, 0.55)), mat('violet'), -0.45, 0.7, 0));
  const gift = new THREE.Group();
  gift.position.set(0.15, 0.8, 0);
  gift.rotation.y = 0.4;
  gift.add(mesh(geo('miniGift', () => new THREE.BoxGeometry(0.34, 0.32, 0.34)), mat('navy')));
  gift.add(mesh(geo('miniGiftA', () => new THREE.BoxGeometry(0.35, 0.33, 0.07)), mat('gold')));
  gift.add(mesh(geo('miniGiftB', () => new THREE.BoxGeometry(0.07, 0.33, 0.35)), mat('gold')));
  rig.add(gift);
  g.add(glowSprite('glowGold', 2.4, 0, 0.5, -0.4), rig);
  g.userData.update = (t) => {
    rig.position.y = Math.sin(t * 2) * 0.04;
    rig.rotation.y = Math.sin(t * 0.6) * 0.6;
    rig.rotation.z = Math.sin(t * 2 + 1) * 0.03;
  };
  return g;
}

/** 14 · Reno estilizado con nariz brillante y astas doradas. */
function crearReno() {
  const g = new THREE.Group();
  const rig = new THREE.Group();
  const fur = mat('reindeer');
  const body = mesh(geo('deerBody', () => new THREE.CapsuleGeometry(0.32, 0.7, 8, 16)), fur, 0, 1.0, 0);
  body.rotation.z = Math.PI / 2;
  rig.add(body);
  const neck = mesh(geo('deerNeck', () => new THREE.CylinderGeometry(0.13, 0.16, 0.5, 12)), fur, 0.48, 1.3, 0);
  neck.rotation.z = -0.7;
  rig.add(neck);
  const leg = geo('deerLeg', () => new THREE.CylinderGeometry(0.06, 0.05, 0.75, 10));
  const hoof = geo('deerHoof', () => new THREE.CylinderGeometry(0.065, 0.07, 0.07, 10));
  for (const x of [-0.33, 0.33]) {
    for (const z of [-0.17, 0.17]) {
      rig.add(mesh(leg, fur, x, 0.42, z));
      rig.add(mesh(hoof, mat('black'), x, 0.035, z));
    }
  }
  const tail = mesh(smallSphereGeo(), mat('cream'), -0.66, 1.12, 0);
  tail.scale.setScalar(0.08);
  rig.add(tail);
  const collar = mesh(geo('deerCollar', () => new THREE.TorusGeometry(0.16, 0.035, 8, 20)), mat('red'), 0.4, 1.2, 0);
  collar.rotation.set(Math.PI / 2, 0.7, 0);
  rig.add(collar);
  const jingle = mesh(smallSphereGeo(), mat('gold'), 0.48, 1.08, 0);
  jingle.scale.setScalar(0.055);
  rig.add(jingle);

  // Cabeza (grupo con pivote para un leve cabeceo)
  const head = new THREE.Group();
  head.position.set(0.64, 1.5, 0);
  const skull = mesh(sphereGeo(), fur, 0.08, 0.08, 0);
  skull.scale.set(0.26, 0.22, 0.22);
  const snout = mesh(sphereGeo(), fur, 0.28, 0.02, 0);
  snout.scale.set(0.16, 0.13, 0.14);
  const nose = mesh(smallSphereGeo(), mat('noseGlow'), 0.42, 0.03, 0);
  nose.scale.setScalar(0.07);
  const noseGlow = glowSprite('glowRed', 0.6, 0.44, 0.03, 0);
  head.add(skull, snout, nose, noseGlow);
  for (const side of [-1, 1]) {
    const eye = mesh(smallSphereGeo(), mat('black'), 0.18, 0.16, side * 0.13);
    eye.scale.setScalar(0.03);
    const ear = mesh(geo('deerEar', () => new THREE.ConeGeometry(0.06, 0.18, 8)), fur, -0.02, 0.28, side * 0.17);
    ear.rotation.x = side * 0.6;
    head.add(eye, ear);
    const antler = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0.02, 0.25, side * 0.08),
      new THREE.Vector3(-0.04, 0.55, side * 0.18),
      new THREE.Vector3(-0.19, 0.8, side * 0.28),
    ]);
    const tine = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-0.04, 0.5, side * 0.17),
      new THREE.Vector3(0.1, 0.68, side * 0.21),
      new THREE.Vector3(0.12, 0.78, side * 0.23),
    ]);
    head.add(mesh(geo(`antler${side}`, () => new THREE.TubeGeometry(antler, 20, 0.03, 6, false)), mat('gold')));
    head.add(mesh(geo(`tine${side}`, () => new THREE.TubeGeometry(tine, 12, 0.022, 6, false)), mat('gold')));
  }
  rig.add(head);
  g.add(rig);
  g.userData.update = (t) => {
    head.rotation.z = Math.sin(t * 1.5) * 0.06;
    rig.rotation.y = Math.sin(t * 0.5) * 0.7;
    const pulse = 0.6 + Math.sin(t * 3) * 0.12;
    noseGlow.scale.setScalar(pulse);
  };
  return g;
}

/** 15 · Corona de Adviento con cuatro velas encendidas. */
function crearCorona() {
  const g = new THREE.Group();
  const rig = new THREE.Group();
  const ring = mesh(geo('wreathRing', () => new THREE.TorusGeometry(0.85, 0.2, 16, 64)), mat('darkGreen'), 0, 0.2, 0);
  ring.rotation.x = Math.PI / 2;
  rig.add(ring);
  // Hojas y bayas con InstancedMesh (una sola llamada de dibujo cada una)
  const rand = mulberry32(15);
  const dummy = new THREE.Object3D();
  const leaves = new THREE.InstancedMesh(
    geo('leaf', () => new THREE.SphereGeometry(0.16, 8, 6)),
    mat('green'),
    52
  );
  for (let i = 0; i < 52; i++) {
    const a = (i / 52) * TAU + rand() * 0.1;
    const r = 0.85 + (rand() - 0.5) * 0.32;
    dummy.position.set(Math.cos(a) * r, 0.24 + rand() * 0.16, Math.sin(a) * r);
    dummy.rotation.set(rand() * TAU, rand() * TAU, rand() * TAU);
    const s = 0.9 + rand() * 0.3;
    dummy.scale.set(s, s * 0.38, s * 0.55);
    dummy.updateMatrix();
    leaves.setMatrixAt(i, dummy.matrix);
  }
  const berries = new THREE.InstancedMesh(smallSphereGeo(), mat('red'), 18);
  for (let i = 0; i < 18; i++) {
    const a = (i / 18) * TAU + 0.2;
    const r = 0.85 + (rand() - 0.5) * 0.3;
    dummy.position.set(Math.cos(a) * r, 0.38 + rand() * 0.06, Math.sin(a) * r);
    dummy.rotation.set(0, 0, 0);
    dummy.scale.setScalar(0.055);
    dummy.updateMatrix();
    berries.setMatrixAt(i, dummy.matrix);
  }
  rig.add(leaves, berries);
  const candle = geo('adventCandle', () => new THREE.CylinderGeometry(0.1, 0.1, 0.7, 20));
  const flames = [];
  for (let i = 0; i < 4; i++) {
    const a = Math.PI / 4 + (i * Math.PI) / 2;
    const x = Math.cos(a) * 0.85;
    const z = Math.sin(a) * 0.85;
    rig.add(mesh(candle, mat(i === 2 ? 'pink' : 'candleViolet'), x, 0.73, z));
    const f = makeFlame(0.75);
    f.position.set(x, 1.09, z);
    flames.push(f);
    rig.add(f);
  }
  g.add(rig);
  g.userData.update = (t) => {
    flames.forEach((f, i) => f.userData.flicker(t, i * 1.7));
    rig.rotation.y = t * 0.25;
  };
  return g;
}

/** 16 · Galleta de jengibre con glaseado. */
function crearGalleta() {
  const g = new THREE.Group();
  const rig = new THREE.Group();
  const cookie = geo('ginger', () => {
    const s = new THREE.Shape();
    s.moveTo(-0.18, 0.93);
    s.lineTo(-0.75, 0.82);
    s.quadraticCurveTo(-0.95, 0.7, -0.75, 0.55);
    s.lineTo(-0.32, 0.6);
    s.lineTo(-0.33, 0.25);
    s.lineTo(-0.5, -0.35);
    s.quadraticCurveTo(-0.45, -0.55, -0.25, -0.42);
    s.lineTo(0, 0.05);
    s.lineTo(0.25, -0.42);
    s.quadraticCurveTo(0.45, -0.55, 0.5, -0.35);
    s.lineTo(0.33, 0.25);
    s.lineTo(0.32, 0.6);
    s.lineTo(0.75, 0.55);
    s.quadraticCurveTo(0.95, 0.7, 0.75, 0.82);
    s.lineTo(0.18, 0.93);
    s.absarc(0, 1.25, 0.36, Math.atan2(-0.32, 0.18), Math.atan2(-0.32, -0.18) + TAU, false);
    s.closePath();
    return new THREE.ExtrudeGeometry(s, {
      depth: 0.2,
      bevelEnabled: true,
      bevelThickness: 0.06,
      bevelSize: 0.06,
      bevelSegments: 3,
      curveSegments: 24,
    });
  });
  rig.add(mesh(cookie, mat('gingerbread')));
  const front = 0.27;
  for (const side of [-1, 1]) {
    const eye = mesh(smallSphereGeo(), mat('icing'), side * 0.12, 1.32, front);
    eye.scale.setScalar(0.045);
    rig.add(eye);
  }
  const smile = mesh(geo('smile', () => new THREE.TorusGeometry(0.13, 0.022, 8, 20, Math.PI)), mat('icing'), 0, 1.22, front);
  smile.rotation.z = Math.PI;
  rig.add(smile);
  ['red', 'gold', 'pink'].forEach((m, i) => {
    const b = mesh(smallSphereGeo(), mat(m), 0, 0.78 - i * 0.17, front);
    b.scale.setScalar(0.055);
    rig.add(b);
  });
  // Zigzags de glaseado en muñecas y tobillos
  const zig = (key, pts) =>
    geo(key, () => new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0.1), 40, 0.02, 6, false));
  const zigArm = (x) => {
    const pts = [];
    for (let i = 0; i <= 6; i++) pts.push(new THREE.Vector3(x + (i % 2 ? 0.04 : -0.04), 0.58 + i * 0.04, front));
    return pts;
  };
  const zigLeg = (x0) => {
    const pts = [];
    for (let i = 0; i <= 6; i++) pts.push(new THREE.Vector3(x0 + i * 0.035, -0.28 + (i % 2 ? 0.04 : -0.04), front));
    return pts;
  };
  rig.add(mesh(zig('zigL', zigArm(-0.66)), mat('icing')));
  rig.add(mesh(zig('zigR', zigArm(0.66)), mat('icing')));
  rig.add(mesh(zig('zigFL', zigLeg(-0.5)), mat('icing')));
  rig.add(mesh(zig('zigFR', zigLeg(0.29)), mat('icing')));
  g.add(glowSprite('glowWarm', 2.6, 0, 0.5, -0.3), rig);
  g.userData.update = (t) => {
    rig.rotation.y = Math.sin(t) * 0.4;
    rig.position.y = QUALITY.reduced ? 0 : Math.abs(Math.sin(t * 2.4)) * 0.06;
  };
  return g;
}

/** 17 · Taza de chocolate caliente con vapor. */
function crearTaza() {
  const g = new THREE.Group();
  const rig = new THREE.Group();
  const profile = [
    [0.0, 0.0],
    [0.48, 0.0],
    [0.54, 0.04],
    [0.56, 0.9],
    [0.57, 1.0],
    [0.52, 1.0],
    [0.5, 0.92],
    [0.49, 0.12],
    [0.0, 0.12],
  ].map(([x, y]) => new THREE.Vector2(x, y));
  rig.add(mesh(geo('mug', () => new THREE.LatheGeometry(profile, 48)), mat('mug')));
  const rim = mesh(geo('mugRim', () => new THREE.TorusGeometry(0.545, 0.022, 8, 48)), mat('gold'), 0, 1.0, 0);
  rim.rotation.x = Math.PI / 2;
  const band = mesh(geo('mugBand', () => new THREE.TorusGeometry(0.562, 0.014, 8, 48)), mat('gold'), 0, 0.2, 0);
  band.rotation.x = Math.PI / 2;
  rig.add(rim, band);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * TAU;
    const p = new THREE.Vector3(Math.cos(a) * 0.575, 0.55, Math.sin(a) * 0.575);
    const s = starMesh(0.07);
    s.position.copy(p);
    s.lookAt(p.x * 2, p.y, p.z * 2);
    rig.add(s);
  }
  rig.add(mesh(geo('cocoa', () => new THREE.CylinderGeometry(0.5, 0.5, 0.02, 40)), mat('chocolate'), 0, 0.88, 0));
  const mallow = geo('mallow', () => new THREE.BoxGeometry(0.14, 0.1, 0.14));
  [
    [0.15, 0.1, 0.3],
    [-0.18, -0.05, 1.1],
    [0.0, -0.22, 2.0],
  ].forEach(([x, z, r]) => {
    const m = mesh(mallow, mat(r > 1.5 ? 'pink' : 'icing'), x, 0.92, z);
    m.rotation.set(0.2, r, 0.1);
    rig.add(m);
  });
  const handle = mesh(geo('mugHandle', () => new THREE.TorusGeometry(0.24, 0.06, 12, 24, Math.PI)), mat('mug'), 0.56, 0.5, 0);
  handle.rotation.z = -Math.PI / 2;
  rig.add(handle);
  // Vapor: sprites que suben y se desvanecen
  const steam = [];
  for (let i = 0; i < 12; i++) {
    const s = new THREE.Sprite(mat(`steam${i}`, () => spriteMat('#dfe8ff', 0.3, THREE.NormalBlending)));
    s.userData.noBounds = true;
    s.userData.col = i % 3;
    s.userData.offset = i / 12;
    steam.push(s);
    rig.add(s);
  }
  g.add(rig);
  g.userData.update = (t) => {
    rig.rotation.y = Math.sin(t * 0.5) * 0.5;
    steam.forEach((s) => {
      const life = (t * 0.32 + s.userData.offset) % 1;
      const col = s.userData.col;
      s.position.set((col - 1) * 0.18 + Math.sin(life * 5 + col * 2) * 0.08, 1.0 + life * 1.2, (col - 1) * 0.05);
      s.scale.setScalar(0.25 + life * 0.5);
      s.material.opacity = Math.sin(life * Math.PI) * 0.32;
    });
  };
  return g;
}

/** 18 · Farol con vela encendida. */
function crearFarol() {
  const g = new THREE.Group();
  const rig = new THREE.Group();
  rig.add(mesh(geo('lanternBase', () => new THREE.BoxGeometry(0.8, 0.1, 0.8)), mat('iron'), 0, 0.05, 0));
  rig.add(mesh(geo('lanternTrim', () => new THREE.BoxGeometry(0.7, 0.06, 0.7)), mat('gold'), 0, 0.13, 0));
  const post = geo('lanternPost', () => new THREE.BoxGeometry(0.06, 1.0, 0.06));
  for (const x of [-0.33, 0.33]) for (const z of [-0.33, 0.33]) rig.add(mesh(post, mat('gold'), x, 0.66, z));
  rig.add(mesh(geo('lanternTop', () => new THREE.BoxGeometry(0.76, 0.06, 0.76)), mat('gold'), 0, 1.17, 0));
  rig.add(mesh(geo('lanternCandle', () => new THREE.CylinderGeometry(0.12, 0.12, 0.4, 20)), mat('cream'), 0, 0.36, 0));
  const flame = makeFlame(0.85);
  flame.position.y = 0.57;
  rig.add(flame, glowSprite('glowWarm', 1.9, 0, 0.7, 0));
  const pane = geo('lanternPane', () => new THREE.BoxGeometry(0.6, 0.95, 0.02));
  [
    [0, 0.33, 0],
    [0, -0.33, 0],
    [0.33, 0, Math.PI / 2],
    [-0.33, 0, Math.PI / 2],
  ].forEach(([x, z, r]) => {
    const p = mesh(pane, mat('glass'), x, 0.66, z);
    p.rotation.y = r;
    p.renderOrder = 2;
    rig.add(p);
  });
  const roof = mesh(
    geo('lanternRoof', () => {
      const c = new THREE.ConeGeometry(0.6, 0.42, 4);
      c.rotateY(Math.PI / 4);
      return c;
    }),
    mat('iron'),
    0,
    1.41,
    0
  );
  rig.add(roof);
  const knob = mesh(smallSphereGeo(), mat('gold'), 0, 1.64, 0);
  knob.scale.setScalar(0.07);
  rig.add(knob);
  rig.add(mesh(geo('lanternRing', () => new THREE.TorusGeometry(0.12, 0.03, 8, 20)), mat('gold'), 0, 1.8, 0));
  g.add(rig);
  g.userData.update = (t) => {
    flame.userData.flicker(t, 3);
    rig.rotation.y = t * 0.35;
  };
  return g;
}

/** 19 · Ángel con alas y halo. */
function crearAngel() {
  const g = new THREE.Group();
  const rig = new THREE.Group();
  rig.add(mesh(geo('robe', () => new THREE.ConeGeometry(0.55, 1.35, 40)), mat('robe'), 0, 0.675, 0));
  const hem = mesh(geo('robeHem', () => new THREE.TorusGeometry(0.53, 0.035, 8, 40)), mat('gold'), 0, 0.03, 0);
  hem.rotation.x = Math.PI / 2;
  rig.add(hem);
  const head = mesh(sphereGeo(), mat('skin'), 0, 1.52, 0);
  head.scale.setScalar(0.22);
  const hair = mesh(sphereGeo(), mat('hair'), 0, 1.57, -0.05);
  hair.scale.set(0.24, 0.22, 0.24);
  rig.add(head, hair);
  const halo = mesh(geo('halo', () => new THREE.TorusGeometry(0.2, 0.025, 10, 40)), mat('goldBright'), 0, 1.86, 0);
  halo.rotation.x = Math.PI / 2 - 0.25;
  rig.add(halo, glowSprite('glowGold', 0.9, 0, 1.86, 0));
  for (const side of [-1, 1]) {
    const arm = mesh(geo('angelArm', () => new THREE.CylinderGeometry(0.07, 0.11, 0.45, 12)), mat('robe'), side * 0.16, 1.02, 0.17);
    arm.rotation.set(-0.9, 0, side * 0.35);
    rig.add(arm);
  }
  const star = starMesh(0.12);
  star.position.set(0, 0.92, 0.44);
  rig.add(star, glowSprite('glowGold', 0.6, 0, 0.92, 0.45));
  // Alas
  const wingGeo = geo('wing', () => {
    const s = new THREE.Shape();
    s.moveTo(0, 0);
    s.bezierCurveTo(0.3, 0.5, 0.9, 0.9, 1.1, 0.8);
    s.bezierCurveTo(0.9, 0.5, 0.8, 0.3, 0.95, 0.1);
    s.bezierCurveTo(0.7, 0.15, 0.6, -0.1, 0.75, -0.3);
    s.bezierCurveTo(0.4, -0.25, 0.2, -0.2, 0, 0);
    return new THREE.ExtrudeGeometry(s, { depth: 0.04, bevelEnabled: false, curveSegments: 16 });
  });
  const wings = [];
  for (const side of [-1, 1]) {
    const pivot = new THREE.Group();
    pivot.position.set(side * 0.06, 1.12, -0.2);
    const w = mesh(wingGeo, mat('wing'));
    w.scale.set(side * 0.8, 0.8, 0.8);
    pivot.add(w);
    pivot.userData.side = side;
    wings.push(pivot);
    rig.add(pivot);
  }
  g.add(rig);
  g.userData.update = (t) => {
    const flap = QUALITY.reduced ? 0 : Math.sin(t * 2.2) * 0.2;
    wings.forEach((w) => {
      w.rotation.y = w.userData.side * -(0.55 + flap);
    });
    rig.position.y = Math.sin(t * 1.3) * 0.05;
    rig.rotation.y = Math.sin(t * 0.5) * 0.5;
  };
  return g;
}

/** 20 · Luna creciente con estrellas orbitando. */
function crearLuna() {
  const g = new THREE.Group();
  const rig = new THREE.Group();
  const moon = mesh(
    geo('crescent', () => {
      const s = new THREE.Shape();
      s.absarc(0, 0, 1, Math.PI / 2, (3 * Math.PI) / 2, false);
      s.absarc(0.886, 0, 1.336, -2.296, 2.296, true);
      const e = new THREE.ExtrudeGeometry(s, {
        depth: 0.25,
        bevelEnabled: true,
        bevelThickness: 0.08,
        bevelSize: 0.06,
        bevelSegments: 3,
        curveSegments: 32,
      });
      e.center();
      return e;
    }),
    mat('moon')
  );
  rig.add(moon);
  const orbit = new THREE.Group();
  orbit.rotation.x = 0.35;
  const stars = [];
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * TAU;
    const s = starMesh(i % 2 ? 0.09 : 0.15);
    s.position.set(Math.cos(a) * 1.25, Math.sin(i * 1.7) * 0.25, Math.sin(a) * 1.25);
    stars.push(s);
    orbit.add(s);
  }
  rig.add(orbit);
  g.add(glowSprite('glowGold', 3.4), rig);
  g.userData.update = (t) => {
    orbit.rotation.y = t * 0.5;
    stars.forEach((s, i) => (s.rotation.z = t * (1 + i * 0.2)));
    moon.rotation.z = Math.sin(t * 0.7) * 0.12;
    moon.rotation.y = Math.sin(t * 0.4) * 0.35;
  };
  return g;
}

/** 21 · Bola de nieve de cristal con nieve cayendo dentro. */
function crearBolaNieve() {
  const g = new THREE.Group();
  const rig = new THREE.Group();
  rig.add(mesh(geo('globeBase', () => new THREE.CylinderGeometry(0.72, 0.85, 0.4, 40)), mat('wood'), 0, 0.2, 0));
  const trim = mesh(geo('globeTrim', () => new THREE.TorusGeometry(0.75, 0.04, 8, 48)), mat('gold'), 0, 0.38, 0);
  trim.rotation.x = Math.PI / 2;
  rig.add(trim);
  rig.add(mesh(geo('globePlate', () => new THREE.CylinderGeometry(0.62, 0.66, 0.08, 40)), mat('gold'), 0, 0.42, 0));
  // Escena interior
  rig.add(mesh(geo('globeGround', () => new THREE.CylinderGeometry(0.5, 0.5, 0.1, 32)), mat('snow'), 0, 0.5, 0));
  const mound = mesh(sphereGeo(), mat('snow'), 0, 0.55, 0);
  mound.scale.set(0.5, 0.12, 0.5);
  rig.add(mound);
  const tree = buildTree('darkGreen');
  tree.scale.setScalar(0.27);
  tree.position.set(-0.1, 0.58, -0.05);
  const topStar = starMesh(0.07);
  topStar.position.set(-0.1, 0.58 + 2.55 * 0.27, -0.05);
  rig.add(tree, topStar);
  const mini = new THREE.Group();
  mini.position.set(0.25, 0.6, 0.15);
  const b1 = mesh(sphereGeo(), mat('snow'), 0, 0.08, 0);
  b1.scale.setScalar(0.09);
  const b2 = mesh(sphereGeo(), mat('snow'), 0, 0.21, 0);
  b2.scale.setScalar(0.065);
  mini.add(b1, b2);
  rig.add(mini);
  // Nieve interior: geometría compartida, simulada una vez por fotograma
  const center = new THREE.Vector3(0, 1.25, 0);
  const count = QUALITY.globeSnow;
  const snowGeo = geo(`globeSnow${count}`, () => {
    const gg = new THREE.BufferGeometry();
    const pos = new Float32Array(count * 3);
    const rand = mulberry32(21);
    for (let i = 0; i < count; i++) {
      const r = Math.cbrt(rand()) * 0.75;
      const th = rand() * TAU;
      const ph = Math.acos(2 * rand() - 1);
      pos[i * 3] = r * Math.sin(ph) * Math.cos(th);
      pos[i * 3 + 1] = Math.max(0.65, center.y + r * Math.cos(ph));
      pos[i * 3 + 2] = r * Math.sin(ph) * Math.sin(th);
    }
    gg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    gg.userData.rand = rand;
    return gg;
  });
  const snowMat = mat('globeSnowMat', () =>
    new THREE.PointsMaterial({
      size: 0.055,
      map: createSnowflakeTexture(),
      transparent: true,
      depthWrite: false,
      color: '#ffffff',
    })
  );
  const snow = new THREE.Points(snowGeo, snowMat);
  snow.renderOrder = 1;
  rig.add(snow);
  const glass = mesh(geo('globeGlass', () => new THREE.SphereGeometry(0.9, 40, 30)), mat('glassSphere'), 0, 1.25, 0);
  glass.renderOrder = 3;
  rig.add(glass, glowSprite('glowCool', 0.5, -0.35, 1.65, 0.6));
  g.add(glowSprite('glowCool', 3, 0, 1.1, -0.5), rig);
  g.userData.update = (t, dt = 0.016) => {
    rig.rotation.y = Math.sin(t * 0.4) * 0.4;
    oncePerFrame('globeSnow', t, () => {
      const p = snowGeo.attributes.position.array;
      const rand = snowGeo.userData.rand;
      const swirl = dt * 0.35;
      const cs = Math.cos(swirl);
      const sn = Math.sin(swirl);
      for (let i = 0; i < count; i++) {
        let x = p[i * 3];
        let y = p[i * 3 + 1];
        let z = p[i * 3 + 2];
        y -= (0.12 + (i % 7) * 0.02) * dt;
        const nx = x * cs - z * sn;
        z = x * sn + z * cs;
        x = nx + Math.sin(t * 1.3 + i) * 0.02 * dt;
        const dy = y - center.y;
        if (y < 0.62 || x * x + dy * dy + z * z > 0.78 * 0.78) {
          // Reaparece arriba, dentro de la esfera
          const a = rand() * TAU;
          const rr = Math.sqrt(rand()) * 0.5;
          x = Math.cos(a) * rr;
          z = Math.sin(a) * rr;
          y = center.y + Math.sqrt(Math.max(0, 0.7 * 0.7 - rr * rr)) * rand();
        }
        p[i * 3] = x;
        p[i * 3 + 1] = y;
        p[i * 3 + 2] = z;
      }
      snowGeo.attributes.position.needsUpdate = true;
    });
  };
  return g;
}

/** 22 · Abeto con guirnalda y luces parpadeantes. */
class HelixCurve extends THREE.Curve {
  getPoint(s, target = new THREE.Vector3()) {
    const y = 0.42 + s * 1.95;
    const a = s * TAU * 3.2;
    const r = treeRadius(y) + 0.04;
    return target.set(Math.cos(a) * r, y, Math.sin(a) * r);
  }
}
function crearAbetoLuces() {
  const g = new THREE.Group();
  const rig = new THREE.Group();
  rig.add(buildTree('darkGreen'));
  const helix = new HelixCurve();
  rig.add(mesh(geo('garland', () => new THREE.TubeGeometry(helix, 220, 0.02, 6, false)), mat('gold')));
  const keys = ['bulbRed', 'bulbGold', 'bulbBlue', 'bulbViolet'];
  const perColor = 14;
  const bulbGeo = smallSphereGeo();
  const dummy = new THREE.Object3D();
  const p = new THREE.Vector3();
  keys.forEach((key, k) => {
    const im = new THREE.InstancedMesh(bulbGeo, mat(key), perColor);
    for (let i = 0; i < perColor; i++) {
      const s = (i * keys.length + k + 0.5) / (perColor * keys.length);
      helix.getPoint(s, p);
      const out = 1.04;
      dummy.position.set(p.x * out, p.y - 0.02, p.z * out);
      dummy.scale.setScalar(0.055);
      dummy.updateMatrix();
      im.setMatrixAt(i, dummy.matrix);
    }
    rig.add(im);
  });
  const star = starMesh(0.28);
  star.position.y = 2.62;
  rig.add(star, glowSprite('glowGold', 1.3, 0, 2.62, 0));
  g.add(rig);
  g.userData.update = (t) => {
    rig.rotation.y = t * 0.3;
    star.rotation.y = t;
    oncePerFrame('bulbs', t, () => {
      keys.forEach((key, k) => {
        const speed = QUALITY.reduced ? 1 : 3;
        const v = 0.5 + 0.5 * Math.sin(t * speed + k * 1.6);
        mat(key).emissiveIntensity = 0.25 + 2.2 * v * v;
      });
    });
  };
  return g;
}

/** 23 · Estrella fugaz con estela. */
function crearEstrellaFugaz() {
  const g = new THREE.Group();
  const rig = new THREE.Group();
  const dir = new THREE.Vector3(-1, -0.75, 0).normalize();
  const head = new THREE.Vector3(0.8, 0.7, 0);
  const star = starMesh(0.42);
  star.position.copy(head);
  rig.add(star, glowSprite('glowGold', 1.8, head.x, head.y, 0));
  // Estela: sprites decrecientes del oro al violeta
  const trailColorA = new THREE.Color('#f5c96a');
  const trailColorB = new THREE.Color('#9b7cff');
  for (let k = 1; k <= 14; k++) {
    const f = k / 14;
    const s = new THREE.Sprite(
      mat(`trail${k}`, () => spriteMat(trailColorA.clone().lerp(trailColorB, f), 0.75 * (1 - f) + 0.08))
    );
    s.position.copy(head).addScaledVector(dir, f * 2.2);
    s.scale.setScalar(0.85 * (1 - f) + 0.12);
    s.userData.noBounds = true;
    rig.add(s);
  }
  // Chispas que se desprenden de la estela
  const count = QUALITY.sparkles;
  const sparkGeo = geo(`sparkles${count}`, () => {
    const gg = new THREE.BufferGeometry();
    gg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
    const rand = mulberry32(23);
    gg.userData.seeds = Array.from({ length: count }, () => [rand(), rand() - 0.5, rand() - 0.5]);
    return gg;
  });
  const sparkMat = mat('sparkMat', () =>
    new THREE.PointsMaterial({
      size: 0.07,
      map: getGlowTexture(),
      color: new THREE.Color(2, 1.6, 0.8),
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    })
  );
  const sparks = new THREE.Points(sparkGeo, sparkMat);
  sparks.frustumCulled = false;
  rig.add(sparks);
  rig.add(boundsBox(2.8, 2.4, 0.6, -0.1, 0, 0));
  g.add(rig);
  g.userData.update = (t) => {
    star.rotation.z = t * 2;
    rig.position.set(Math.sin(t * 0.8) * 0.1, Math.cos(t * 0.8) * 0.07, 0);
    oncePerFrame('sparkles', t, () => {
      const arr = sparkGeo.attributes.position.array;
      sparkGeo.userData.seeds.forEach(([seed, ox, oy], i) => {
        const life = (t * 0.6 + seed) % 1;
        arr[i * 3] = head.x + dir.x * life * 2.3 + ox * life * 0.5;
        arr[i * 3 + 1] = head.y + dir.y * life * 2.3 + oy * life * 0.5 - life * life * 0.2;
        arr[i * 3 + 2] = ox * 0.3;
      });
      sparkGeo.attributes.position.needsUpdate = true;
    });
  };
  return g;
}

/** 24 · Gran estrella dorada final con explosión de partículas. */
function crearGranEstrella() {
  const g = new THREE.Group();
  const rig = new THREE.Group();
  const star = starMesh(1);
  const inner = starMesh(0.5, 'ice');
  inner.position.z = 0.24;
  inner.rotation.z = Math.PI / 5;
  rig.add(star, inner);
  const rays = new THREE.Group();
  rays.position.z = -0.25;
  const rayGeo = geo('ray', () => {
    const c = new THREE.ConeGeometry(0.12, 1.1, 8, 1, true);
    c.rotateZ(Math.PI);
    c.translate(0, 1.3, 0);
    return c;
  });
  for (let i = 0; i < 10; i++) {
    const r = mesh(rayGeo, mat('ray'));
    r.rotation.z = (i / 10) * TAU + Math.PI / 10;
    r.userData.noBounds = true;
    rays.add(r);
  }
  rig.add(rays);
  // Explosión de partículas (cálculo analítico, geometría compartida)
  const count = QUALITY.explosion;
  const expGeo = geo(`explosion${count}`, () => {
    const gg = new THREE.BufferGeometry();
    const pos = new Float32Array(count * 3);
    const col = new Float32Array(count * 3);
    const dirs = new Float32Array(count * 3);
    const rand = mulberry32(24);
    const palette = [new THREE.Color(2.2, 1.6, 0.6), new THREE.Color(2, 2, 2.2), new THREE.Color(1.3, 0.9, 2.2)];
    for (let i = 0; i < count; i++) {
      const th = rand() * TAU;
      const ph = Math.acos(2 * rand() - 1);
      const sp = 0.55 + rand() * 0.45;
      dirs[i * 3] = Math.sin(ph) * Math.cos(th) * sp;
      dirs[i * 3 + 1] = Math.cos(ph) * sp;
      dirs[i * 3 + 2] = Math.sin(ph) * Math.sin(th) * sp;
      const c = palette[i % 3];
      col[i * 3] = c.r;
      col[i * 3 + 1] = c.g;
      col[i * 3 + 2] = c.b;
    }
    gg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    gg.setAttribute('color', new THREE.BufferAttribute(col, 3));
    gg.userData.dirs = dirs;
    return gg;
  });
  const expMat = mat('explosionMat', () =>
    new THREE.PointsMaterial({
      size: 0.13,
      map: getGlowTexture(),
      vertexColors: true,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    })
  );
  const explosion = new THREE.Points(expGeo, expMat);
  explosion.frustumCulled = false;
  g.add(glowSprite('glowGold', 5), rig, explosion);
  g.userData.update = (t) => {
    rig.rotation.y = Math.sin(t * 0.8) * 0.45;
    rays.rotation.z = t * 0.2;
    star.scale.setScalar(1 + Math.sin(t * 3) * 0.03);
    oncePerFrame('explosion', t, () => {
      const cycle = QUALITY.reduced ? 4.5 : 2.8;
      const life = (t % cycle) / cycle;
      const reach = (1 - Math.pow(1 - life, 3)) * 2.4;
      const arr = expGeo.attributes.position.array;
      const d = expGeo.userData.dirs;
      for (let i = 0; i < count; i++) {
        arr[i * 3] = d[i * 3] * reach;
        arr[i * 3 + 1] = d[i * 3 + 1] * reach - life * life * 0.6;
        arr[i * 3 + 2] = d[i * 3 + 2] * reach;
      }
      expGeo.attributes.position.needsUpdate = true;
      expMat.opacity = Math.pow(1 - life, 1.4);
      expMat.size = 0.13 * (1 - life * 0.5);
    });
  };
  return g;
}

// ---------------------------------------------------------------------------
// Catálogo con títulos y textos
// ---------------------------------------------------------------------------
export const SURPRISES = [
  { title: 'Estrella', text: 'Una estrella para encender la cuenta atrás. Que su luz te recuerde que lo bonito siempre está por llegar.', create: crearEstrella },
  { title: 'Copo de nieve', text: 'No hay dos copos iguales, igual que no hay dos días iguales. Hoy, deja que algo pequeño te sorprenda.', create: crearCopoNieve },
  { title: 'Muñeco de nieve', text: 'Bufanda, sombrero y una sonrisa de carbón: un amigo que no teme al frío y siempre espera con alegría.', create: crearMunecoNieve },
  { title: 'Árbol de Navidad', text: 'Ramas verdes, adornos brillantes y una estrella en lo alto. La Navidad empieza a tomar forma.', create: crearArbol },
  { title: 'Bola de Navidad', text: 'Una esfera brillante que refleja todas las luces de alrededor, como hacen los buenos recuerdos.', create: crearBola },
  { title: 'Bastón de caramelo', text: 'Rayas rojas y blancas con sabor a menta: un dulce clásico para endulzar el día.', create: crearBaston },
  { title: 'Campana', text: 'Que su tintineo anuncie buenas noticias y llene el aire de música.', create: crearCampana },
  { title: 'Vela', text: 'Una pequeña llama que calienta la noche más larga. Basta una luz para cambiar la oscuridad.', create: crearVela },
  { title: 'Calcetín', text: 'Colgado junto a la chimenea, esperando pequeñas sorpresas. ¿Qué te gustaría encontrar dentro?', create: crearCalcetin },
  { title: 'Gorro de Papá Noel', text: 'Rojo, blanco y con pompón: el gorro oficial de las fiestas. Póntelo y sonríe.', create: crearGorro },
  { title: 'Regalo', text: 'Un regalo dentro de un regalo. Lo mejor de los detalles es la ilusión de abrirlos.', create: crearRegalo },
  { title: 'Casita nevada', text: 'Ventanas encendidas y nieve en el tejado: un hogar cálido al que siempre apetece volver.', create: crearCasita },
  { title: 'Trineo', text: 'Listo para deslizarse por la nieve con la carga más especial. ¡Agárrate, que despegamos!', create: crearTrineo },
  { title: 'Reno', text: 'Con su nariz brillante y sus astas doradas, guía el camino en las noches de niebla.', create: crearReno },
  { title: 'Corona de Adviento', text: 'Cuatro velas que se encienden domingo a domingo, contando los días con calma y esperanza.', create: crearCorona },
  { title: 'Galleta de jengibre', text: 'Recién salida del horno, con glaseado y un toque de canela. ¡Cuidado, que sale corriendo!', create: crearGalleta },
  { title: 'Chocolate caliente', text: 'Una taza humeante con nubes de malvavisco: el mejor plan para una tarde de invierno.', create: crearTaza },
  { title: 'Farol', text: 'Una luz dorada para iluminar los paseos nocturnos entre calles nevadas.', create: crearFarol },
  { title: 'Ángel', text: 'Alas suaves y un halo dorado. Un pequeño guardián que vela por tus sueños.', create: crearAngel },
  { title: 'Luna con estrellas', text: 'La luna se asoma y las estrellas bailan a su alrededor. Una noche perfecta para pedir deseos.', create: crearLuna },
  { title: 'Bola de nieve', text: 'Agítala con la imaginación y deja que la nieve caiga sobre un pequeño mundo de cristal.', create: crearBolaNieve },
  { title: 'Abeto iluminado', text: 'Decenas de lucecitas que parpadean al compás de la Navidad. ¡Que no se apague la ilusión!', create: crearAbetoLuces },
  { title: 'Estrella fugaz', text: 'Cruza el cielo en un suspiro. Cierra los ojos y pide un deseo, rápido.', create: crearEstrellaFugaz },
  { title: 'Gran estrella', text: 'La estrella más grande para la noche más mágica. ¡Feliz Nochebuena y feliz Navidad!', create: crearGranEstrella },
];

export function getSurpriseInfo(day) {
  const s = SURPRISES[day - 1];
  return { title: s.title, text: s.text };
}

// ---------------------------------------------------------------------------
// Normalización: escala cada sorpresa a un tamaño común y apoya su base en y=0
// ---------------------------------------------------------------------------
const _box = new THREE.Box3();
const _tmp = new THREE.Box3();
function computeBounds(root) {
  root.updateMatrixWorld(true);
  _box.makeEmpty();
  root.traverse((o) => {
    if (!o.isMesh || o.isInstancedMesh || o.userData.noBounds) return;
    if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
    _tmp.copy(o.geometry.boundingBox).applyMatrix4(o.matrixWorld);
    _box.union(_tmp);
  });
  return _box;
}

/**
 * Crea la sorpresa del día ajustada a "size" (dimensión mayor).
 * Devuelve un grupo envoltorio con userData.update, userData.height y userData.dispose.
 */
export function createSurprise(day, size = 1) {
  const def = SURPRISES[day - 1];
  const inner = def.create();
  inner.userData.update?.(0, 0);
  const b = computeBounds(inner);
  const dims = b.getSize(new THREE.Vector3());
  const center = b.getCenter(new THREE.Vector3());
  const s = size / Math.max(dims.x, dims.y, dims.z, 0.001);
  inner.scale.setScalar(s);
  inner.position.set(-center.x * s, -b.min.y * s, -center.z * s);

  const wrapper = new THREE.Group();
  wrapper.name = `sorpresa-${day}`;
  wrapper.add(inner);
  wrapper.userData.day = day;
  wrapper.userData.height = dims.y * s;
  wrapper.userData.update = (t, dt) => inner.userData.update?.(t, dt);
  // Geometrías y materiales están cacheados y se reutilizan al volver a abrir;
  // solo hay que liberar los búferes propios de cada InstancedMesh.
  wrapper.userData.dispose = () => {
    wrapper.traverse((o) => {
      if (o.isInstancedMesh) o.dispose();
    });
    wrapper.removeFromParent();
  };
  return wrapper;
}
