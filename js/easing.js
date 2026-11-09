/**
 * easing.js
 * Funciones de easing propias y un gestor mínimo de animaciones (tweens).
 * Todo se actualiza desde el bucle principal (requestAnimationFrame) llamando
 * a updateTweens(tiempoEnSegundos). No se usa ninguna librería externa.
 */
(function () {
  'use strict';
  const Adviento = (window.Adviento = window.Adviento || {});

  /** Fábrica del módulo: recibe sus dependencias (deps) y devuelve su API pública. */
  Adviento.easing = function (deps) {
    const Ease = {
      linear: (t) => t,
      inQuad: (t) => t * t,
      outQuad: (t) => 1 - (1 - t) * (1 - t),
      inCubic: (t) => t * t * t,
      outCubic: (t) => 1 - Math.pow(1 - t, 3),
      inOutCubic: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
      inOutSine: (t) => -(Math.cos(Math.PI * t) - 1) / 2,
      outBack: (t) => {
        const c1 = 1.70158;
        const c3 = c1 + 1;
        return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
      },
      outElastic: (t) => {
        if (t === 0 || t === 1) return t;
        const c4 = (2 * Math.PI) / 3;
        return Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * c4) + 1;
      },
    };

    // Multiplicador global de duración (se reduce con prefers-reduced-motion)
    let motionScale = 1;
    const active = new Set();

    /** Ajusta la escala de duración de todas las animaciones futuras. */
    function setMotionScale(scale) {
      motionScale = scale;
    }

    /**
     * Crea una animación. Devuelve una promesa que se resuelve al terminar.
     * onUpdate(valorConEasing, progresoLineal) se llama en cada fotograma.
     */
    function tween({ duration = 1, delay = 0, ease = Ease.inOutCubic, onUpdate, onComplete } = {}) {
      return new Promise((resolve) => {
        active.add({
          start: null,
          delay: delay * motionScale,
          duration: Math.max(0, duration * motionScale),
          ease,
          onUpdate,
          onComplete,
          resolve,
        });
      });
    }

    /** Espera n segundos (sincronizado con el bucle de animación). */
    const wait = (seconds) => tween({ duration: seconds, ease: Ease.linear });

    /** Avanza todas las animaciones activas. Llamar una vez por fotograma. */
    function updateTweens(time) {
      for (const tw of active) {
        if (tw.start === null) tw.start = time + tw.delay;
        if (time < tw.start) continue;
        const p = tw.duration === 0 ? 1 : Math.min(1, (time - tw.start) / tw.duration);
        if (tw.onUpdate) tw.onUpdate(tw.ease(p), p);
        if (p >= 1) {
          active.delete(tw);
          if (tw.onComplete) tw.onComplete();
          tw.resolve();
        }
      }
    }

    const lerp = (a, b, t) => a + (b - a) * t;
    const clamp = (v, min, max) => Math.min(max, Math.max(min, v));

    return { Ease, setMotionScale, tween, wait, updateTweens, lerp, clamp };
  };
})();
