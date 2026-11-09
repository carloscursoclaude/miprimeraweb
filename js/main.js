/**
 * main.js
 * Punto de entrada: escena, cámara, render (con bloom en escritorio), cielo
 * estrellado, luna, nieve, bucle de animación, redimensionado, selección con
 * Raycaster y la secuencia abrir → ver → volver. También contiene el visor
 * del overlay (segundo renderer con OrbitControls).
 */
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

import { tween, updateTweens, Ease, setMotionScale } from './easing.js';
import { AdventGrid } from './grid.js';
import { createSurprise, getSurpriseInfo, setSurpriseQuality } from './surprises.js';
import { createBackgroundTexture, createSnowflakeTexture, createMoonTexture, getGlowTexture } from './textures.js';
import * as audio from './audio.js';
import { loadState, saveState } from './storage.js';
import { initUI } from './ui.js';

// ---------------------------------------------------------------------------
// Preferencias del dispositivo y calidad
// ---------------------------------------------------------------------------
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const coarsePointer = window.matchMedia('(pointer: coarse)').matches;
const smallScreen = Math.min(window.innerWidth, window.innerHeight) < 640;
const lowPower = coarsePointer || smallScreen;
const PIXEL_RATIO = Math.min(window.devicePixelRatio || 1, 2);

const QUALITY = {
  bloom: !lowPower,
  snow: reducedMotion ? 140 : lowPower ? 280 : 750,
  stars: lowPower ? 700 : 1500,
  burst: lowPower ? 90 : 220,
  explosion: lowPower ? 140 : 320,
  globeSnow: lowPower ? 70 : 140,
  sparkles: lowPower ? 40 : 80,
};

// ---------------------------------------------------------------------------
// Estado
// ---------------------------------------------------------------------------
const saved = loadState();
const state = {
  opened: new Set(saved.opened),
  muted: saved.muted,
  mode: 'loading', // loading | grid | opening | viewing | closing
  day: null,
};

let renderer;
let scene;
let camera;
let composer = null;
let grid;
let stars;
let snow;
let moon;
let viewer;
let ui;

const home = { pos: new THREE.Vector3(), target: new THREE.Vector3() };
const cam = { pos: new THREE.Vector3(), target: new THREE.Vector3() };
const parallax = new THREE.Vector2();
const parallaxTarget = new THREE.Vector2();
const ZERO2 = new THREE.Vector2();
const raycaster = new THREE.Raycaster();
const ndc = new THREE.Vector2();
let lastTime = 0;

function persist() {
  saveState({ opened: state.opened, muted: state.muted });
}

// ---------------------------------------------------------------------------
// Cielo: estrellas titilantes (shader propio), luna y nieve
// ---------------------------------------------------------------------------
function createStars(count) {
  const positions = new Float32Array(count * 3);
  const sizes = new Float32Array(count);
  const phases = new Float32Array(count);
  const colors = new Float32Array(count * 3);
  const cool = new THREE.Color('#dfe8ff');
  const warm = new THREE.Color('#f5c96a');
  const violet = new THREE.Color('#c4b0ff');
  for (let i = 0; i < count; i++) {
    positions[i * 3] = (Math.random() - 0.5) * 340;
    positions[i * 3 + 1] = -60 + Math.random() * 190;
    positions[i * 3 + 2] = -90 - Math.random() * 90;
    sizes[i] = 1 + Math.pow(Math.random(), 3) * 3.2;
    phases[i] = Math.random();
    const r = Math.random();
    const c = r < 0.12 ? warm : r < 0.2 ? violet : cool;
    colors.set([c.r, c.g, c.b], i * 3);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
  geometry.setAttribute('aPhase', new THREE.BufferAttribute(phases, 1));
  geometry.setAttribute('aColor', new THREE.BufferAttribute(colors, 3));
  const material = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: {
      uTime: { value: 0 },
      uPixelRatio: { value: PIXEL_RATIO },
      uTwinkle: { value: reducedMotion ? 0.25 : 1 },
    },
    vertexShader: /* glsl */ `
      attribute float aSize;
      attribute float aPhase;
      attribute vec3 aColor;
      uniform float uTime;
      uniform float uPixelRatio;
      uniform float uTwinkle;
      varying float vAlpha;
      varying vec3 vColor;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mv;
        float tw = 0.5 + 0.5 * sin(uTime * (0.6 + aPhase * 1.8) + aPhase * 6.2831);
        vAlpha = mix(1.0, 0.25 + 0.75 * tw, uTwinkle);
        vColor = aColor;
        gl_PointSize = aSize * uPixelRatio * (0.85 + 0.3 * tw);
      }
    `,
    fragmentShader: /* glsl */ `
      varying float vAlpha;
      varying vec3 vColor;
      void main() {
        float d = length(gl_PointCoord - 0.5);
        float a = pow(smoothstep(0.5, 0.0, d), 1.6) * vAlpha;
        gl_FragColor = vec4(vColor * 1.6, a);
        #include <colorspace_fragment>
      }
    `,
  });
  const points = new THREE.Points(geometry, material);
  points.frustumCulled = false;
  return points;
}

function createMoon() {
  const group = new THREE.Group();
  const sphere = new THREE.Mesh(
    new THREE.SphereGeometry(4, 48, 32),
    new THREE.MeshBasicMaterial({ map: createMoonTexture(), color: new THREE.Color(1.15, 1.1, 0.95) })
  );
  sphere.rotation.y = -0.6;
  const halo = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: getGlowTexture(),
      color: '#fff1c8',
      transparent: true,
      opacity: 0.35,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })
  );
  halo.scale.setScalar(26);
  group.add(halo, sphere);
  group.userData.halo = halo;
  return group;
}

/** Nieve con THREE.Points; el volumen se adapta a lo que ve la cámara. */
function createSnow(count) {
  const positions = new Float32Array(count * 3);
  const speeds = new Float32Array(count);
  const phases = new Float32Array(count);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const material = new THREE.PointsMaterial({
    size: 0.13,
    map: createSnowflakeTexture(),
    transparent: true,
    depthWrite: false,
    opacity: 0.85,
    color: '#ffffff',
  });
  const points = new THREE.Points(geometry, material);
  points.frustumCulled = false;
  const bounds = { x: 0, y: 0, w: 30, h: 24, zMin: -8, zMax: 6 };

  function respawn(i, anywhere) {
    positions[i * 3] = bounds.x + (Math.random() - 0.5) * bounds.w;
    positions[i * 3 + 1] = anywhere ? bounds.y + (Math.random() - 0.5) * bounds.h : bounds.y + bounds.h / 2;
    positions[i * 3 + 2] = bounds.zMin + Math.random() * (bounds.zMax - bounds.zMin);
    speeds[i] = 0.35 + Math.random() * 0.75;
    phases[i] = Math.random() * Math.PI * 2;
  }
  for (let i = 0; i < count; i++) respawn(i, true);

  return {
    points,
    setBounds(b, reseed = false) {
      Object.assign(bounds, b);
      if (reseed) for (let i = 0; i < count; i++) respawn(i, true);
    },
    update(t, dt) {
      const sway = reducedMotion ? 0.1 : 0.35;
      const speedK = reducedMotion ? 0.5 : 1;
      const bottom = bounds.y - bounds.h / 2;
      const left = bounds.x - bounds.w / 2;
      for (let i = 0; i < count; i++) {
        positions[i * 3 + 1] -= speeds[i] * speedK * dt;
        positions[i * 3] += Math.sin(t * 0.8 + phases[i]) * sway * dt;
        if (positions[i * 3 + 1] < bottom) respawn(i, false);
        else if (positions[i * 3] < left) positions[i * 3] += bounds.w;
        else if (positions[i * 3] > left + bounds.w) positions[i * 3] -= bounds.w;
      }
      geometry.attributes.position.needsUpdate = true;
    },
  };
}

// ---------------------------------------------------------------------------
// Visor del overlay: renderer propio + OrbitControls
// ---------------------------------------------------------------------------
class SurpriseViewer {
  constructor(canvas) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    this.renderer.setPixelRatio(PIXEL_RATIO);
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.1;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
    this.scene.add(new THREE.AmbientLight('#8090c0', 0.7));
    this.scene.add(new THREE.HemisphereLight('#bcd0ff', '#1b2a5a', 0.7));
    const key = new THREE.DirectionalLight('#fff1d6', 2.4);
    key.position.set(3, 4, 5);
    const rim = new THREE.DirectionalLight('#9b7cff', 1.4);
    rim.position.set(-3, 2, -4);
    const gold = new THREE.PointLight('#f5c96a', 18, 0, 2);
    gold.position.set(-2.5, -1, 3);
    this.scene.add(key, rim, gold);

    this.halo = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: getGlowTexture(),
        color: '#f5c96a',
        transparent: true,
        opacity: 0.28,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    this.halo.scale.setScalar(4.4);
    this.halo.position.z = -1.2;
    this.scene.add(this.halo);

    this.pivot = new THREE.Group();
    this.scene.add(this.pivot);

    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.enablePan = false;
    this.controls.minDistance = 3;
    this.controls.maxDistance = 8.5;
    this.controls.autoRotate = !reducedMotion;
    this.controls.autoRotateSpeed = 1.4;

    this.current = null;
    this.active = false;
    this.width = 0;
    this.height = 0;
  }

  show(day) {
    this.clear();
    const s = createSurprise(day, 2.2);
    s.position.y = -s.userData.height / 2;
    this.pivot.add(s);
    this.current = s;
    this.active = true;
    this.camera.position.set(0, 0.5, 5.2);
    this.controls.target.set(0, 0, 0);
    this.controls.update();
    this.resize();
    this.pivot.scale.setScalar(0.001);
    tween({
      duration: 0.9,
      ease: Ease.outBack,
      onUpdate: (e) => {
        this.pivot.scale.setScalar(Math.max(0.001, e));
        this.pivot.rotation.y = (1 - e) * -Math.PI;
      },
    });
  }

  hide() {
    this.active = false;
    window.setTimeout(() => {
      if (!this.active) this.clear();
    }, 450);
  }

  clear() {
    if (this.current) {
      this.current.userData.dispose();
      this.current = null;
    }
  }

  resize() {
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    if (!w || !h || (w === this.width && h === this.height)) return;
    this.width = w;
    this.height = h;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  render(t, dt) {
    if (!this.active || !this.current) return;
    this.resize();
    this.controls.update(dt);
    this.current.userData.update(t, dt);
    this.halo.material.opacity = 0.24 + Math.sin(t * 1.5) * 0.05;
    this.renderer.render(this.scene, this.camera);
  }
}

// ---------------------------------------------------------------------------
// Cámara y encuadre responsive
// ---------------------------------------------------------------------------
function computeHome() {
  const aspect = camera.aspect;
  const tanV = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
  const { width, height } = grid.getSize();
  const portrait = aspect < 0.85;
  const top = portrait ? 0.19 : 0.2; // espacio para el título
  const bottom = portrait ? 0.1 : 0.08; // espacio para los botones
  const side = 0.03;
  const usable = 1 - top - bottom;
  const dH = height / (2 * tanV * usable);
  const dW = width / (2 * tanV * aspect * (1 - 2 * side));
  const d = Math.max(dH, dW) + 0.7;
  const visH = 2 * d * tanV;
  const yOff = ((top - bottom) / 2) * visH;
  home.pos.set(0, yOff, d);
  home.target.set(0, yOff, 0);

  // Luna en la esquina superior derecha del encuadre
  const md = d + 70;
  const halfH = md * tanV;
  const halfW = halfH * aspect;
  moon.position.set(halfW * (portrait ? 0.66 : 0.62), yOff + halfH * (portrait ? 0.86 : 0.6), -70);

  // Volumen de la nieve
  snow.setBounds({ x: 0, y: yOff, w: visH * aspect + 8, h: visH + 6, zMin: -8, zMax: d - 3 });
}

function closeUpDistance() {
  const aspect = camera.aspect;
  const tanV = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
  return Math.max(6.2, 2.4 / (tanV * aspect));
}

function moveCamera(pos, target, duration = 0.95) {
  const p0 = cam.pos.clone();
  const t0 = cam.target.clone();
  return tween({
    duration,
    ease: Ease.inOutCubic,
    onUpdate: (e) => {
      cam.pos.lerpVectors(p0, pos, e);
      cam.target.lerpVectors(t0, target, e);
    },
  });
}

// ---------------------------------------------------------------------------
// Secuencia de apertura / cierre
// ---------------------------------------------------------------------------
async function openDay(day) {
  if (state.mode !== 'grid') return;
  state.mode = 'opening';
  state.day = day;
  audio.unlock();
  grid.interactive = false;
  grid.setHover(null);
  renderer.domElement.style.cursor = '';
  ui.setBusy(true);

  const focus = grid.getFocusPoint(day).add(new THREE.Vector3(0, 0.75, 0));
  const camPos = focus.clone().add(new THREE.Vector3(0, 0.35, closeUpDistance()));
  await moveCamera(camPos, focus, 0.9);

  if (!state.opened.has(day)) {
    audio.playPaper();
    await grid.unwrap(day);
    state.opened.add(day);
    persist();
    ui.setOpened(state.opened);
    audio.playChime();
    await grid.emerge(day);
  } else {
    audio.playChime();
    await grid.emerge(day);
  }

  ui.showOverlay(day, getSurpriseInfo(day));
  viewer.show(day);
  state.mode = 'viewing';
}

async function closeDay() {
  if (state.mode !== 'viewing') return;
  state.mode = 'closing';
  ui.hideOverlay();
  viewer.hide();
  grid.settle(state.day);
  await moveCamera(home.pos, home.target, 0.95);
  state.mode = 'grid';
  state.day = null;
  grid.interactive = true;
  ui.setBusy(false);
}

function toggleMute() {
  state.muted = !state.muted;
  audio.setMuted(state.muted);
  if (!state.muted) audio.unlock();
  ui.setMuted(state.muted);
  persist();
}

function resetCalendar() {
  if (state.mode !== 'grid') return;
  grid.reset();
  state.opened.clear();
  persist();
  ui.setOpened(state.opened);
  audio.playSoftBell();
}

// ---------------------------------------------------------------------------
// Entrada: puntero (ratón y táctil) con Raycaster
// ---------------------------------------------------------------------------
function setNDC(e) {
  const rect = renderer.domElement.getBoundingClientRect();
  ndc.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
  ndc.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
}

function pickDay() {
  raycaster.setFromCamera(ndc, camera);
  return grid.pick(raycaster);
}

function updateHover() {
  if (state.mode !== 'grid') return;
  const day = pickDay();
  grid.setHover(day);
  renderer.domElement.style.cursor = day ? 'pointer' : '';
}

function bindPointer() {
  const canvas = renderer.domElement;
  let down = null;
  canvas.addEventListener('pointermove', (e) => {
    setNDC(e);
    parallaxTarget.set(ndc.x, ndc.y);
    if (e.pointerType === 'mouse') updateHover();
  });
  canvas.addEventListener('pointerdown', (e) => {
    down = { x: e.clientX, y: e.clientY };
    if (e.pointerType !== 'mouse') {
      setNDC(e);
      updateHover(); // en táctil la caja "flota" al tocarla
    }
  });
  canvas.addEventListener('pointerup', (e) => {
    if (!down) return;
    const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
    down = null;
    if (moved > 12 || state.mode !== 'grid') return;
    setNDC(e);
    const day = pickDay();
    if (day) openDay(day);
    else if (e.pointerType !== 'mouse') grid.setHover(null);
  });
  canvas.addEventListener('pointercancel', () => {
    down = null;
    grid.setHover(null);
  });
  canvas.addEventListener('pointerleave', () => {
    grid.setHover(null);
    parallaxTarget.set(0, 0);
    canvas.style.cursor = '';
  });

  // El audio solo puede arrancar tras un gesto del usuario
  const unlock = () => audio.unlock();
  window.addEventListener('pointerdown', unlock, { passive: true });
  window.addEventListener('keydown', unlock);
}

// ---------------------------------------------------------------------------
// Redimensionado
// ---------------------------------------------------------------------------
function onResize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  renderer.setSize(w, h, false);
  if (composer) composer.setSize(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  const cols = w / h < 0.85 ? 4 : 6;
  if (cols !== grid.cols) grid.layout(cols);
  computeHome();
  if (state.mode === 'grid' || state.mode === 'loading') {
    cam.pos.copy(home.pos);
    cam.target.copy(home.target);
  }
  viewer.resize();
}

// ---------------------------------------------------------------------------
// Bucle principal
// ---------------------------------------------------------------------------
function loop(now) {
  requestAnimationFrame(loop);
  const t = now / 1000;
  const dt = lastTime ? Math.min(0.05, t - lastTime) : 1 / 60;
  lastTime = t;

  updateTweens(t);
  stars.material.uniforms.uTime.value = t;
  snow.update(t, dt);
  grid.update(t, dt);
  moon.userData.halo.material.opacity = 0.33 + Math.sin(t * 0.7) * 0.04;

  // Ligero paralaje con el ratón en la vista de rejilla
  const usePar = state.mode === 'grid' && !reducedMotion && !coarsePointer;
  parallax.lerp(usePar ? parallaxTarget : ZERO2, Math.min(1, dt * 3));
  camera.position.set(cam.pos.x + parallax.x * 0.4, cam.pos.y + parallax.y * 0.25, cam.pos.z);
  camera.lookAt(cam.target);

  // En móviles se pausa la escena de fondo mientras el overlay la cubre
  const skipMain = state.mode === 'viewing' && lowPower;
  if (!skipMain) {
    if (composer) composer.render(dt);
    else renderer.render(scene, camera);
  }
  viewer.render(t, dt);
}

// ---------------------------------------------------------------------------
// Inicialización
// ---------------------------------------------------------------------------
async function loadFonts() {
  if (!document.fonts || !document.fonts.load) return;
  try {
    await Promise.race([
      Promise.all([
        document.fonts.load('700 120px "Cormorant Garamond"'),
        document.fonts.load('600 40px "Cormorant Garamond"'),
      ]),
      new Promise((resolve) => window.setTimeout(resolve, 2000)),
    ]);
  } catch (err) {
    /* Si la fuente no carga, se usa la serif del sistema */
  }
}

async function init() {
  const startedAt = performance.now();
  setMotionScale(reducedMotion ? 0.55 : 1);
  setSurpriseQuality({
    explosion: QUALITY.explosion,
    globeSnow: QUALITY.globeSnow,
    sparkles: QUALITY.sparkles,
    reduced: reducedMotion,
  });
  audio.initAudio({ muted: state.muted });

  ui = initUI({
    onOpenDay: openDay,
    onClose: closeDay,
    onToggleMute: toggleMute,
    onReset: resetCalendar,
    onFocusDay: (day) => grid && grid.setFocusDay(day),
  });
  ui.setMuted(state.muted);
  ui.setOpened(state.opened);

  await loadFonts();

  // Renderer principal
  const canvas = document.getElementById('scene');
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  } catch (err) {
    ui.showError('Tu navegador no puede mostrar gráficos 3D (WebGL). Prueba con otro navegador o dispositivo.');
    return;
  }
  renderer.setPixelRatio(PIXEL_RATIO);
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;

  scene = new THREE.Scene();
  scene.background = createBackgroundTexture();
  camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 400);

  // Iluminación cálida: ambiente tenue + puntuales doradas
  scene.add(new THREE.AmbientLight('#5a6ab0', 0.55));
  scene.add(new THREE.HemisphereLight('#9fb3ff', '#141c40', 0.6));
  const key = new THREE.DirectionalLight('#ffe2b0', 1.7);
  key.position.set(5, 8, 12);
  const rim = new THREE.DirectionalLight('#7f8cff', 0.7);
  rim.position.set(-6, 4, -4);
  const goldL = new THREE.PointLight('#f5c96a', 90, 0, 1.5);
  goldL.position.set(-11, 5, 16);
  const goldR = new THREE.PointLight('#ffcf80', 70, 0, 1.5);
  goldR.position.set(11, -5, 16);
  scene.add(key, rim, goldL, goldR);

  stars = createStars(QUALITY.stars);
  moon = createMoon();
  snow = createSnow(QUALITY.snow);
  scene.add(stars, moon, snow.points);

  grid = new AdventGrid(scene, { burstCount: QUALITY.burst, reduced: reducedMotion });
  state.opened.forEach((day) => grid.setOpenedInstant(day));

  if (QUALITY.bloom) {
    composer = new EffectComposer(renderer);
    composer.setPixelRatio(PIXEL_RATIO);
    composer.addPass(new RenderPass(scene, camera));
    composer.addPass(new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.55, 0.5, 0.82));
    composer.addPass(new OutputPass());
  }

  viewer = new SurpriseViewer(ui.viewerCanvas);

  grid.layout(window.innerWidth / window.innerHeight < 0.85 ? 4 : 6);
  onResize();
  snow.setBounds({}, true);
  window.addEventListener('resize', onResize);
  bindPointer();

  // Compila los shaders antes de mostrar la escena para evitar tirones
  renderer.compile(scene, camera);
  requestAnimationFrame(loop);

  // Muestra la pantalla de carga un instante mínimo y arranca la intro
  const minDelay = Math.max(0, 700 - (performance.now() - startedAt));
  window.setTimeout(() => {
    ui.hideLoader();
    grid.intro();
    state.mode = 'grid';
    window.__adventReady = true;
  }, minDelay);
}

init().catch((err) => {
  console.error(err);
  if (ui) ui.showError('Algo ha fallado al preparar la magia. Recarga la página para intentarlo de nuevo.');
});
