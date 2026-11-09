/**
 * textures.js
 * Todas las ilustraciones se generan con <canvas> y se convierten en
 * THREE.CanvasTexture: papeles de regalo, número del día, brillos, copos,
 * luna, fondo y rayas del bastón de caramelo. Nada de imágenes externas.
 */
(function () {
  'use strict';
  const Adviento = (window.Adviento = window.Adviento || {});

  /** Fábrica del módulo: recibe sus dependencias (deps) y devuelve su API pública. */
  Adviento.textures = function (deps) {
    const THREE = deps.THREE;

    // Papeles base (fondo + tinta): colores vivos de juguetería navideña
    const PAPER_BASES = [
      { bg: '#e0262f', ink: '#ffffff' }, // rojo + blanco
      { bg: '#1f9e5a', ink: '#ffe066' }, // verde + amarillo
      { bg: '#ffc93c', ink: '#e0262f' }, // amarillo + rojo
      { bg: '#2f8ff0', ink: '#ffffff' }, // azul cielo + blanco
      { bg: '#ff6fae', ink: '#ffffff' }, // rosa + blanco
      { bg: '#fff6e6', ink: '#e0262f' }, // crema + rojo
      { bg: '#ff8c2b', ink: '#fff6e6' }, // naranja + crema
      { bg: '#8e5cf0', ink: '#ffe066' }, // violeta + amarillo
      { bg: '#19b5a5', ink: '#ffffff' }, // turquesa + blanco
      { bg: '#1d3c8f', ink: '#ffc93c' }, // azul marino + oro
      { bg: '#fff6e6', ink: '#1f9e5a' }, // crema + verde
      { bg: '#c2185b', ink: '#ffe066' }, // frambuesa + amarillo
    ];
    const PATTERNS = ['stars', 'snowflakes', 'stripes', 'dots', 'diamonds', 'waves'];

    /** Estilo de papel para un día: 12 colores × 6 motivos sin repetir combinación. */
    function paperStyle(day) {
      const i = day - 1;
      const base = PAPER_BASES[i % PAPER_BASES.length];
      const pattern = PATTERNS[(i + Math.floor(i / 12) * 3) % PATTERNS.length];
      return { ...base, pattern };
    }

    /** Indica si un color de fondo es claro (para elegir contrastes). */
    function isLight(hex) {
      const c = parseInt(hex.slice(1), 16);
      const r = (c >> 16) & 255;
      const g = (c >> 8) & 255;
      const b = c & 255;
      return 0.299 * r + 0.587 * g + 0.114 * b > 150;
    }

    // Generador pseudoaleatorio con semilla (para que cada papel sea estable)
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

    function makeCanvas(w, h) {
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      return canvas;
    }

    function toTexture(canvas) {
      const tex = new THREE.CanvasTexture(canvas);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = 8;
      tex.needsUpdate = true;
      return tex;
    }

    // ---------- Primitivas de dibujo ----------

    function drawStar(ctx, x, y, r, points = 5, inset = 0.45) {
      ctx.beginPath();
      for (let i = 0; i < points * 2; i++) {
        const rr = i % 2 ? r * inset : r;
        const a = -Math.PI / 2 + (i * Math.PI) / points;
        ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
      }
      ctx.closePath();
      ctx.fill();
    }

    function drawFlake(ctx, x, y, r, lw) {
      ctx.save();
      ctx.translate(x, y);
      ctx.lineWidth = lw;
      ctx.lineCap = 'round';
      for (let i = 0; i < 6; i++) {
        ctx.rotate(Math.PI / 3);
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(0, -r);
        ctx.moveTo(0, -r * 0.55);
        ctx.lineTo(-r * 0.25, -r * 0.8);
        ctx.moveTo(0, -r * 0.55);
        ctx.lineTo(r * 0.25, -r * 0.8);
        ctx.stroke();
      }
      ctx.restore();
    }

    function dot(ctx, x, y, r) {
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }

    /** Pinta el papel de regalo completo (fondo + motivo + brillo). */
    function paintPaper(ctx, w, h, style, rand) {
      ctx.fillStyle = style.bg;
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = style.ink;
      ctx.strokeStyle = style.ink;
      const unit = w / 5; // misma densidad por unidad de mundo en todas las caras

      switch (style.pattern) {
        case 'stars':
          for (let y = -1; y <= h / unit + 1; y++) {
            for (let x = -1; x <= w / unit + 1; x++) {
              const ox = (Math.abs(y) % 2) * unit * 0.5;
              ctx.globalAlpha = 0.95;
              drawStar(ctx, x * unit + ox + unit / 2, y * unit + unit / 2, unit * (0.16 + rand() * 0.06));
              ctx.globalAlpha = 0.55;
              dot(ctx, x * unit + ox, y * unit, unit * 0.04);
            }
          }
          break;
        case 'snowflakes':
          for (let y = -1; y <= h / unit + 1; y++) {
            for (let x = -1; x <= w / unit + 1; x++) {
              const ox = (Math.abs(y) % 2) * unit * 0.5;
              ctx.globalAlpha = 0.9;
              drawFlake(ctx, x * unit + ox + unit / 2, y * unit + unit / 2, unit * 0.26, unit * 0.045);
              ctx.globalAlpha = 0.5;
              dot(ctx, x * unit + ox, y * unit + unit * 0.05, unit * 0.035);
            }
          }
          break;
        case 'stripes': {
          ctx.save();
          ctx.translate(w / 2, h / 2);
          ctx.rotate(-Math.PI / 4);
          const L = Math.hypot(w, h);
          for (let x = -L; x < L; x += unit * 0.9) {
            ctx.globalAlpha = 0.85;
            ctx.fillRect(x, -L, unit * 0.3, 2 * L);
            ctx.globalAlpha = 0.55;
            ctx.fillRect(x + unit * 0.5, -L, unit * 0.06, 2 * L);
          }
          ctx.restore();
          break;
        }
        case 'dots':
          for (let y = 0; y <= h / unit + 1; y++) {
            for (let x = 0; x <= w / unit + 1; x++) {
              ctx.globalAlpha = 0.9;
              dot(ctx, x * unit, y * unit, unit * 0.15);
              ctx.globalAlpha = 0.5;
              dot(ctx, x * unit + unit / 2, y * unit + unit / 2, unit * 0.06);
            }
          }
          break;
        case 'diamonds':
          ctx.lineWidth = unit * 0.04;
          for (let y = -1; y <= h / unit + 1; y++) {
            for (let x = -1; x <= w / unit + 1; x++) {
              const cx = x * unit + ((Math.abs(y) % 2) * unit) / 2;
              const cy = y * unit * 0.8;
              ctx.beginPath();
              ctx.moveTo(cx, cy - unit * 0.4);
              ctx.lineTo(cx + unit * 0.28, cy);
              ctx.lineTo(cx, cy + unit * 0.4);
              ctx.lineTo(cx - unit * 0.28, cy);
              ctx.closePath();
              ctx.globalAlpha = 0.28;
              ctx.fill();
              ctx.globalAlpha = 0.9;
              ctx.stroke();
              dot(ctx, cx + unit / 2, cy, unit * 0.05);
            }
          }
          break;
        case 'waves':
        default:
          ctx.lineWidth = unit * 0.06;
          ctx.lineCap = 'round';
          for (let y = 0; y <= h + unit; y += unit * 0.6) {
            ctx.globalAlpha = 0.85;
            ctx.beginPath();
            for (let x = 0; x <= w; x += 4) {
              const yy = y + Math.sin((x / unit) * Math.PI) * unit * 0.12;
              if (x === 0) ctx.moveTo(x, yy);
              else ctx.lineTo(x, yy);
            }
            ctx.stroke();
            ctx.globalAlpha = 0.6;
            for (let x = unit / 2; x <= w; x += unit) dot(ctx, x, y + unit * 0.3, unit * 0.05);
          }
          break;
      }
      ctx.globalAlpha = 1;

      // Brillo satinado + leve viñeta
      const g = ctx.createLinearGradient(0, 0, w, h);
      g.addColorStop(0, 'rgba(255,255,255,0.12)');
      g.addColorStop(0.5, 'rgba(255,255,255,0)');
      g.addColorStop(1, 'rgba(0,0,0,0.18)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    }

    /**
     * Texturas de una caja: papel (laterales y tapa) y cara frontal con el número.
     * La cara frontal mide 1 × 0.85 unidades, así que el canvas respeta esa proporción.
     */
    function createBoxTextures(day) {
      const style = paperStyle(day);

      const paperCanvas = makeCanvas(256, 256);
      paintPaper(paperCanvas.getContext('2d'), 256, 256, style, mulberry32(day * 97));

      const fw = 512;
      const fh = 436;
      const frontCanvas = makeCanvas(fw, fh);
      const ctx = frontCanvas.getContext('2d');
      paintPaper(ctx, fw, fh, style, mulberry32(day * 131));

      // Etiqueta circular con el número del día
      const cx = fw / 2;
      const cy = fh / 2;
      const R = fh * 0.32;
      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,0.4)';
      ctx.shadowBlur = 18;
      ctx.fillStyle = '#ffffff';
      dot(ctx, cx, cy, R);
      ctx.restore();

      ctx.lineWidth = 10;
      ctx.strokeStyle = '#e0262f';
      ctx.beginPath();
      ctx.arc(cx, cy, R - 5, 0, Math.PI * 2);
      ctx.stroke();
      ctx.lineWidth = 2;
      ctx.globalAlpha = 0.5;
      ctx.strokeStyle = '#1b2a5a';
      ctx.beginPath();
      ctx.arc(cx, cy, R - 19, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;

      ctx.fillStyle = '#1d3c8f';
      ctx.font = `600 ${Math.round(R * 1.15)}px "Fredoka", "Trebuchet MS", Arial, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(day), cx, cy + R * 0.06);

      ctx.fillStyle = '#ffc93c';
      drawStar(ctx, cx, cy - R * 0.68, R * 0.08);
      drawStar(ctx, cx, cy + R * 0.7, R * 0.08);

      return { paper: toTexture(paperCanvas), front: toTexture(frontCanvas) };
    }

    // ---------- Texturas compartidas (se crean una sola vez) ----------

    const cache = new Map();
    function cached(key, make) {
      if (!cache.has(key)) cache.set(key, make());
      return cache.get(key);
    }

    /** Halo radial blanco para sprites aditivos (brillos, llamas, vapor). */
    function getGlowTexture() {
      return cached('glow', () => {
        const s = 128;
        const c = makeCanvas(s, s);
        const ctx = c.getContext('2d');
        const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
        g.addColorStop(0, 'rgba(255,255,255,1)');
        g.addColorStop(0.2, 'rgba(255,255,255,0.6)');
        g.addColorStop(0.5, 'rgba(255,255,255,0.15)');
        g.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, s, s);
        return toTexture(c);
      });
    }

    /** Copo de nieve suave para THREE.Points. */
    function createSnowflakeTexture() {
      return cached('snowflake', () => {
        const s = 64;
        const c = makeCanvas(s, s);
        const ctx = c.getContext('2d');
        const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
        g.addColorStop(0, 'rgba(255,255,255,1)');
        g.addColorStop(0.35, 'rgba(235,242,255,0.75)');
        g.addColorStop(1, 'rgba(235,242,255,0)');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, s, s);
        ctx.strokeStyle = 'rgba(255,255,255,0.7)';
        drawFlake(ctx, s / 2, s / 2, s * 0.42, 2);
        return toTexture(c);
      });
    }

    /** Degradado vertical del cielo: azul de anochecer festivo. */
    function createBackgroundTexture() {
      return cached('background', () => {
        const c = makeCanvas(16, 512);
        const ctx = c.getContext('2d');
        const g = ctx.createLinearGradient(0, 0, 0, 512);
        g.addColorStop(0, '#0a1f5c');
        g.addColorStop(0.5, '#123a8f');
        g.addColorStop(0.85, '#1f5fc0');
        g.addColorStop(1, '#3a7fd6');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, 16, 512);
        return toTexture(c);
      });
    }

    /** Papel pintado de la fachada: rayas crema, estrellitas y acebo. */
    function createWallTexture() {
      return cached('wall', () => {
        const s = 256;
        const c = makeCanvas(s, s);
        const ctx = c.getContext('2d');
        const stripe = s / 8;
        for (let i = 0; i < 8; i++) {
          ctx.fillStyle = i % 2 ? '#fff3dc' : '#ffe6bd';
          ctx.fillRect(i * stripe, 0, stripe, s);
        }
        // Estrellitas doradas y ramitas de acebo alternas
        for (let y = 0; y < 4; y++) {
          for (let x = 0; x < 4; x++) {
            const px = x * (s / 4) + s / 8;
            const py = y * (s / 4) + (x % 2 ? s / 8 : s / 4) - s / 16;
            if ((x + y) % 2) {
              ctx.fillStyle = '#f2b733';
              drawStar(ctx, px, py, 9);
            } else {
              ctx.fillStyle = '#2e9e5b';
              for (const a of [-0.6, 0.6]) {
                ctx.save();
                ctx.translate(px, py);
                ctx.rotate(a);
                ctx.beginPath();
                ctx.ellipse(0, -9, 4.5, 9, 0, 0, Math.PI * 2);
                ctx.fill();
                ctx.restore();
              }
              ctx.fillStyle = '#e0262f';
              dot(ctx, px - 2, py + 1, 3.2);
              dot(ctx, px + 3, py + 2, 3.2);
            }
          }
        }
        const tex = toTexture(c);
        tex.wrapS = THREE.RepeatWrapping;
        tex.wrapT = THREE.RepeatWrapping;
        return tex;
      });
    }

    /** Superficie lunar suave con cráteres difuminados. */
    function createMoonTexture() {
      return cached('moon', () => {
        const w = 512;
        const h = 256;
        const c = makeCanvas(w, h);
        const ctx = c.getContext('2d');
        ctx.fillStyle = '#f6eed6';
        ctx.fillRect(0, 0, w, h);
        const rand = mulberry32(2024);
        for (let i = 0; i < 70; i++) {
          const x = rand() * w;
          const y = h * 0.15 + rand() * h * 0.7;
          const r = 4 + rand() * 26;
          const g = ctx.createRadialGradient(x, y, 0, x, y, r);
          g.addColorStop(0, 'rgba(190,178,150,0.35)');
          g.addColorStop(1, 'rgba(190,178,150,0)');
          ctx.fillStyle = g;
          dot(ctx, x, y, r);
        }
        return toTexture(c);
      });
    }

    /** Rayas diagonales rojo/blanco repetibles para el bastón de caramelo. */
    function createCandyTexture() {
      return cached('candy', () => {
        const s = 128;
        const c = makeCanvas(s, s);
        const ctx = c.getContext('2d');
        const img = ctx.createImageData(s, s);
        const red = [211, 38, 58];
        const white = [253, 248, 240];
        for (let y = 0; y < s; y++) {
          for (let x = 0; x < s; x++) {
            // Dos franjas por tesela a 45º: el patrón encaja sin costuras
            const v = (((x + y) / s) * 2) % 1;
            const edge = Math.min(1, Math.max(0, (Math.abs(v - 0.5) - 0.22) * 40 + 0.5));
            const col = red.map((r, k) => r * (1 - edge) + white[k] * edge);
            const i = (y * s + x) * 4;
            img.data[i] = col[0];
            img.data[i + 1] = col[1];
            img.data[i + 2] = col[2];
            img.data[i + 3] = 255;
          }
        }
        ctx.putImageData(img, 0, 0);
        const tex = toTexture(c);
        tex.wrapS = THREE.RepeatWrapping;
        tex.wrapT = THREE.RepeatWrapping;
        tex.repeat.set(10, 1);
        return tex;
      });
    }

    return { paperStyle, isLight, createBoxTextures, getGlowTexture, createSnowflakeTexture, createBackgroundTexture, createWallTexture, createMoonTexture, createCandyTexture };
  };
})();
