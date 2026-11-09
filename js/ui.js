/**
 * ui.js
 * Capa HTML: pantalla de carga, lista accesible de días, botones flotantes,
 * overlay de la sorpresa y modal de confirmación propio (sin confirm()).
 * Gestiona el foco (trampa de foco, Escape, retorno del foco) y aria.
 */
(function () {
  'use strict';
  const Adviento = (window.Adviento = window.Adviento || {});

  /** Fábrica del módulo: recibe sus dependencias (deps) y devuelve su API pública. */
  Adviento.ui = function (deps) {
    function initUI(handlers) {
      const $ = (id) => document.getElementById(id);
      const els = {
        app: $('app-ui'),
        loader: $('loader'),
        loaderText: $('loader-text'),
        list: $('day-list'),
        progress: $('progress'),
        mute: $('btn-mute'),
        reset: $('btn-reset'),
        overlay: $('overlay'),
        back: $('btn-back'),
        day: $('overlay-day'),
        title: $('overlay-title'),
        text: $('overlay-text'),
        modal: $('modal'),
        modalCancel: $('modal-cancel'),
        modalConfirm: $('modal-confirm'),
      };

      let overlayOpen = false;
      let modalOpen = false;
      let lastFocus = null;
      let modalReturn = null;

      // --- Lista de botones accesibles (Tab / Enter abren cajas) ---
      const buttons = [];
      for (let day = 1; day <= 24; day++) {
        const li = document.createElement('li');
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'day-btn';
        btn.textContent = `Día ${day}`;
        btn.setAttribute('aria-label', `Abrir la caja del día ${day}`);
        btn.addEventListener('click', () => {
          lastFocus = btn;
          handlers.onOpenDay(day);
        });
        btn.addEventListener('focus', () => handlers.onFocusDay(day));
        btn.addEventListener('blur', () => handlers.onFocusDay(null));
        li.append(btn);
        els.list.append(li);
        buttons.push(btn);
      }

      els.mute.addEventListener('click', () => handlers.onToggleMute());
      els.reset.addEventListener('click', openModal);
      els.back.addEventListener('click', () => handlers.onClose());
      els.modalCancel.addEventListener('click', closeModal);
      els.modalConfirm.addEventListener('click', () => {
        closeModal();
        handlers.onReset();
      });
      els.modal.querySelector('.modal-backdrop').addEventListener('click', closeModal);

      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
          if (modalOpen) {
            e.preventDefault();
            closeModal();
          } else if (overlayOpen) {
            e.preventDefault();
            handlers.onClose();
          }
        } else if (e.key === 'Tab') {
          const container = modalOpen ? els.modal : overlayOpen ? els.overlay : null;
          if (container) trapFocus(e, container);
        }
      });

      /** Mantiene el foco dentro de un diálogo abierto. */
      function trapFocus(e, container) {
        const items = [...container.querySelectorAll('button:not([disabled]), [tabindex]:not([tabindex="-1"])')];
        if (!items.length) return;
        const first = items[0];
        const last = items[items.length - 1];
        const activeEl = document.activeElement;
        if (!container.contains(activeEl)) {
          e.preventDefault();
          first.focus();
        } else if (e.shiftKey && activeEl === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && activeEl === last) {
          e.preventDefault();
          first.focus();
        }
      }

      function setInert(value) {
        els.app.inert = value;
        if (value) els.app.setAttribute('aria-hidden', 'true');
        else els.app.removeAttribute('aria-hidden');
      }

      function openModal() {
        if (modalOpen || overlayOpen) return;
        modalReturn = document.activeElement;
        modalOpen = true;
        els.modal.hidden = false;
        setInert(true);
        requestAnimationFrame(() => els.modal.classList.add('is-visible'));
        els.modalCancel.focus({ preventScroll: true });
      }

      function closeModal() {
        if (!modalOpen) return;
        modalOpen = false;
        els.modal.classList.remove('is-visible');
        setInert(false);
        window.setTimeout(() => {
          if (!modalOpen) els.modal.hidden = true;
        }, 260);
        if (modalReturn && modalReturn.focus) modalReturn.focus({ preventScroll: true });
      }

      return {
        hideLoader() {
          els.loader.classList.add('is-hidden');
          window.setTimeout(() => els.loader.remove(), 800);
        },

        showError(message) {
          els.loader.classList.add('has-error');
          els.loaderText.textContent = message;
        },

        setOpened(opened) {
          const n = opened.size;
          els.progress.textContent = n === 24 ? '¡Las 24 sorpresas abiertas!' : `${n} de 24 abiertas`;
          buttons.forEach((btn, i) => {
            const day = i + 1;
            const isOpen = opened.has(day);
            btn.classList.toggle('is-open', isOpen);
            btn.setAttribute(
              'aria-label',
              isOpen ? `Ver de nuevo la sorpresa del día ${day} (ya abierta)` : `Abrir la caja del día ${day}`
            );
          });
        },

        setMuted(isMuted) {
          els.mute.setAttribute('aria-pressed', String(isMuted));
          els.mute.setAttribute('aria-label', isMuted ? 'Activar música y sonidos' : 'Silenciar música y sonidos');
          els.mute.title = isMuted ? 'Activar sonido' : 'Silenciar';
          els.mute.classList.toggle('is-muted', isMuted);
        },

        setBusy(busy) {
          document.body.classList.toggle('is-busy', busy);
        },

        showOverlay(day, info) {
          els.day.textContent = `Día ${day}`;
          els.title.textContent = info.title;
          els.text.textContent = info.text;
          overlayOpen = true;
          els.overlay.hidden = false;
          setInert(true);
          void els.overlay.offsetWidth; // fuerza el reflow para animar la entrada
          els.overlay.classList.add('is-visible');
          els.back.focus({ preventScroll: true });
        },

        hideOverlay() {
          overlayOpen = false;
          els.overlay.classList.remove('is-visible');
          setInert(false);
          window.setTimeout(() => {
            if (!overlayOpen) els.overlay.hidden = true;
          }, 450);
          if (lastFocus) {
            lastFocus.focus({ preventScroll: true });
            lastFocus = null;
          } else if (document.activeElement && els.overlay.contains(document.activeElement)) {
            document.activeElement.blur();
          }
        },

        get viewerCanvas() {
          return $('viewer');
        },
      };
    }

    return { initUI };
  };
})();
