/**
 * audio.js
 * Todo el sonido se sintetiza con Web Audio API (sin archivos):
 *  - Melodía tipo caja de música en bucle ("Noche de paz", dominio público).
 *  - Sonido de papel al desenvolver (ruido filtrado a ráfagas).
 *  - Campanilla al aparecer la sorpresa (parciales inarmónicos).
 * El AudioContext se crea solo tras la primera interacción del usuario.
 */

let ctx = null;
let master = null;
let musicBus = null;
let sfxBus = null;
let noiseBuffer = null;
let muted = false;
let musicOn = false;
let schedulerId = null;
let eventIndex = 0;
let loopStart = 0;

const BEAT = 0.46; // segundos por pulso (3/4 tranquilo)

// Melodía: [nota MIDI, duración en pulsos]; 0 = silencio
const MELODY = [
  [67, 1.5], [69, 0.5], [67, 1], [64, 3],
  [67, 1.5], [69, 0.5], [67, 1], [64, 3],
  [74, 2], [74, 1], [71, 3],
  [72, 2], [72, 1], [67, 3],
  [69, 2], [69, 1], [72, 1.5], [71, 0.5], [69, 1],
  [67, 1.5], [69, 0.5], [67, 1], [64, 3],
  [69, 2], [69, 1], [72, 1.5], [71, 0.5], [69, 1],
  [67, 1.5], [69, 0.5], [67, 1], [64, 3],
  [74, 2], [74, 1], [77, 1.5], [74, 0.5], [71, 1],
  [72, 3], [76, 3],
  [72, 1], [67, 1], [64, 1], [67, 1.5], [65, 0.5], [62, 1],
  [60, 3], [0, 3],
];
// Acorde por compás (raíz + tercera + quinta) para el acompañamiento de vals
const CHORDS = {
  C: [60, 64, 67],
  G: [55, 59, 62],
  F: [53, 57, 60],
};
const BARS = 'C C C C G G C C F F C C F F C C G G C C C G C C'.split(' ');

// Lista de eventos precalculada (pulso de inicio, nota, volumen)
const EVENTS = (() => {
  const list = [];
  let beat = 0;
  for (const [midi, dur] of MELODY) {
    if (midi) list.push({ beat, midi: midi + 12, vel: 0.9 });
    beat += dur;
  }
  BARS.forEach((name, bar) => {
    const [root, third, fifth] = CHORDS[name];
    list.push({ beat: bar * 3, midi: root, vel: 0.45 });
    list.push({ beat: bar * 3 + 1, midi: third + 12, vel: 0.22 });
    list.push({ beat: bar * 3 + 2, midi: fifth + 12, vel: 0.22 });
  });
  return list.sort((a, b) => a.beat - b.beat);
})();
const LOOP_BEATS = BARS.length * 3 + 3; // pequeño respiro antes de repetir

const midiToFreq = (m) => 440 * Math.pow(2, (m - 69) / 12);

/** Configura el estado inicial (no crea el AudioContext todavía). */
export function initAudio({ muted: initialMuted = false } = {}) {
  muted = initialMuted;
  document.addEventListener('visibilitychange', () => {
    if (!ctx) return;
    if (document.hidden) ctx.suspend().catch(() => {});
    else ctx.resume().catch(() => {});
  });
}

function createGraph() {
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return false;
  try {
    ctx = new AC();
  } catch (err) {
    ctx = null;
    return false;
  }
  master = ctx.createGain();
  master.gain.value = muted ? 0 : 1;
  master.connect(ctx.destination);

  // Bus de música con un eco suave (delay con realimentación filtrada)
  musicBus = ctx.createGain();
  musicBus.gain.value = 0.2;
  musicBus.connect(master);
  const delay = ctx.createDelay(1);
  delay.delayTime.value = 0.34;
  const feedback = ctx.createGain();
  feedback.gain.value = 0.28;
  const tone = ctx.createBiquadFilter();
  tone.type = 'lowpass';
  tone.frequency.value = 2800;
  const wet = ctx.createGain();
  wet.gain.value = 0.32;
  musicBus.connect(delay);
  delay.connect(tone);
  tone.connect(feedback);
  feedback.connect(delay);
  tone.connect(wet);
  wet.connect(master);

  sfxBus = ctx.createGain();
  sfxBus.gain.value = 0.55;
  sfxBus.connect(master);

  // Búfer de ruido blanco reutilizable (2 s)
  noiseBuffer = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  const data = noiseBuffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  return true;
}

/** Llamar en cada interacción del usuario: crea/reanuda el audio. */
export function unlock() {
  if (!ctx && !createGraph()) return;
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  if (!muted) startMusic();
}

export function isMuted() {
  return muted;
}

export function setMuted(value) {
  muted = value;
  if (!ctx) return;
  master.gain.cancelScheduledValues(ctx.currentTime);
  master.gain.setTargetAtTime(muted ? 0 : 1, ctx.currentTime, 0.08);
  if (muted) stopMusic();
  else startMusic();
}

function ready() {
  return ctx && !muted && ctx.state === 'running';
}

// ---------- Caja de música ----------

function playBoxNote(midi, time, vel) {
  const f = midiToFreq(midi);
  const out = ctx.createGain();
  out.gain.setValueAtTime(0.0001, time);
  out.gain.exponentialRampToValueAtTime(vel * 0.35, time + 0.006);
  out.gain.exponentialRampToValueAtTime(0.0001, time + 2.2);
  out.connect(musicBus);
  // Parciales de una lengüeta metálica: fundamental + armónicos brillantes
  for (const [ratio, amp] of [
    [1, 1],
    [2, 0.22],
    [5.4, 0.05],
  ]) {
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = f * ratio;
    const g = ctx.createGain();
    g.gain.value = amp;
    osc.connect(g);
    g.connect(out);
    osc.start(time);
    osc.stop(time + 2.3);
  }
}

function scheduler() {
  if (!ctx) return;
  const horizon = ctx.currentTime + 0.3;
  for (;;) {
    const ev = EVENTS[eventIndex];
    const time = loopStart + ev.beat * BEAT;
    if (time > horizon) break;
    if (time >= ctx.currentTime - 0.05) playBoxNote(ev.midi, time, ev.vel);
    eventIndex++;
    if (eventIndex >= EVENTS.length) {
      eventIndex = 0;
      loopStart += LOOP_BEATS * BEAT;
    }
  }
}

function startMusic() {
  if (musicOn || !ctx) return;
  musicOn = true;
  eventIndex = 0;
  loopStart = ctx.currentTime + 0.25;
  schedulerId = window.setInterval(scheduler, 60);
  scheduler();
}

function stopMusic() {
  musicOn = false;
  if (schedulerId !== null) window.clearInterval(schedulerId);
  schedulerId = null;
}

// ---------- Efectos ----------

/** Papel arrugándose y rasgándose. */
export function playPaper() {
  if (!ready()) return;
  const now = ctx.currentTime;
  for (let i = 0; i < 12; i++) {
    const t = now + Math.random() * 0.5;
    const d = 0.03 + Math.random() * 0.07;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 1800 + Math.random() * 4200;
    bp.Q.value = 0.9 + Math.random() * 1.5;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.25 + Math.random() * 0.3, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + d);
    src.connect(bp);
    bp.connect(g);
    g.connect(sfxBus);
    src.start(t, Math.random() * 1.5, d + 0.02);
  }
  // Rasgado: ruido con un filtro paso alto que sube
  const rip = ctx.createBufferSource();
  rip.buffer = noiseBuffer;
  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.setValueAtTime(700, now + 0.1);
  hp.frequency.exponentialRampToValueAtTime(4500, now + 0.45);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, now + 0.1);
  g.gain.exponentialRampToValueAtTime(0.2, now + 0.14);
  g.gain.exponentialRampToValueAtTime(0.0001, now + 0.5);
  rip.connect(hp);
  hp.connect(g);
  g.connect(sfxBus);
  rip.start(now + 0.1, 0.3, 0.45);
}

function bellNote(f, time, vel) {
  const partials = [
    [1, 1, 1.8],
    [2.76, 0.45, 1.2],
    [5.4, 0.25, 0.7],
    [8.93, 0.12, 0.4],
  ];
  for (const [ratio, amp, decay] of partials) {
    if (f * ratio > ctx.sampleRate * 0.45) continue; // evita frecuencias fuera de rango
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = f * ratio;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, time);
    g.gain.exponentialRampToValueAtTime(vel * amp, time + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, time + decay);
    osc.connect(g);
    g.connect(sfxBus);
    osc.start(time);
    osc.stop(time + decay + 0.05);
  }
}

/** Campanilla brillante (arpegio ascendente). */
export function playChime() {
  if (!ready()) return;
  const now = ctx.currentTime;
  [84, 88, 91, 96, 100].forEach((m, i) => bellNote(midiToFreq(m), now + i * 0.075, 0.16));
}

/** Pequeño "tintineo" suave (al reiniciar). */
export function playSoftBell() {
  if (!ready()) return;
  bellNote(midiToFreq(79), ctx.currentTime, 0.12);
}
