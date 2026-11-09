/**
 * storage.js
 * Persistencia en localStorage: cajas abiertas y estado del sonido.
 * Todos los accesos van envueltos en try/catch (modo privado, almacenamiento
 * bloqueado, cuota llena…). Si falla, la app funciona igual sin guardar.
 */

const KEY = 'calendario-adviento:v1';
const DEFAULT_STATE = { opened: [], muted: false };

/** Lee el estado guardado (o el estado por defecto si no hay o falla). */
export function loadState() {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULT_STATE };
    const data = JSON.parse(raw);
    const opened = Array.isArray(data.opened)
      ? data.opened.filter((n) => Number.isInteger(n) && n >= 1 && n <= 24)
      : [];
    return { opened: [...new Set(opened)], muted: Boolean(data.muted) };
  } catch (err) {
    return { ...DEFAULT_STATE };
  }
}

/** Guarda el estado. opened puede ser un Set o un array de días. */
export function saveState({ opened, muted }) {
  try {
    const list = [...opened].sort((a, b) => a - b);
    window.localStorage.setItem(KEY, JSON.stringify({ opened: list, muted: Boolean(muted) }));
    return true;
  } catch (err) {
    return false;
  }
}
