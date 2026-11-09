/**
 * facade.js
 * Fachada festiva de "gran almacén de juguete" detrás de la rejilla:
 * pared de papel pintado, marco rojo con bombillas de colores que se
 * persiguen (marquesina de feria), toldo festoneado, columnas de caramelo,
 * escenario con alfombra y dos soldaditos de juguete que marchan.
 * Todo con geometrías de Three.js; las piezas repetidas usan InstancedMesh.
 */
(function () {
  'use strict';
  const Adviento = (window.Adviento = window.Adviento || {});

  /** Fábrica del módulo: recibe sus dependencias (deps) y devuelve su API pública. */
  Adviento.facade = function (deps) {
    const THREE = deps.THREE;
    const { createWallTexture, createCandyTexture, getGlowTexture } = deps.textures;

    // Colores de las bombillas (valores > 1 para que brillen con el bloom)
    const BULB_COLORS = [
      new THREE.Color(2.6, 0.45, 0.4), // rojo
      new THREE.Color(2.6, 2.0, 0.5), // amarillo
      new THREE.Color(0.45, 2.3, 0.75), // verde
      new THREE.Color(0.6, 1.3, 2.8), // azul
    ];
    const FRAME_T = 0.34; // grosor del marco
    const BULB_STEP = 0.42; // separación entre bombillas
    const SCALLOP_R = 0.26; // radio de cada festón del toldo

    const std = (color, opts = {}) =>
      new THREE.MeshStandardMaterial({ color, roughness: 0.55, metalness: 0.1, ...opts });

    class Facade {
      constructor(scene, { reduced = false } = {}) {
        this.reduced = reduced;
        this.group = new THREE.Group();
        this.group.name = 'fachada';
        scene.add(this.group);
        this.layoutGroup = new THREE.Group(); // piezas que dependen del tamaño
        this.group.add(this.layoutGroup);
        this.width = 0;
        this.height = 0;
        this.portrait = false;
        this.bulbs = null;
        this.scallops = null;
        this._tmpColor = new THREE.Color();

        // Geometrías y materiales compartidos
        this.geo = {
          box: new THREE.BoxGeometry(1, 1, 1),
          bulb: new THREE.SphereGeometry(0.085, 12, 10),
          scallop: (() => {
            const g = new THREE.CylinderGeometry(SCALLOP_R, SCALLOP_R, 0.12, 20, 1, false, 0, Math.PI);
            g.rotateX(Math.PI / 2);
            g.rotateZ(-Math.PI / 2); // medio disco colgando hacia abajo
            return g;
          })(),
          column: new THREE.CylinderGeometry(0.22, 0.22, 1, 24, 1),
          ball: new THREE.SphereGeometry(0.3, 24, 16),
        };
        const wallTex = createWallTexture();
        this.mat = {
          wall: std('#ffffff', { map: wallTex, roughness: 0.9, metalness: 0, emissive: '#ffffff', emissiveMap: wallTex, emissiveIntensity: 0.14 }),
          frame: std('#d8202f', { roughness: 0.4, metalness: 0.25, emissive: '#4a0508', emissiveIntensity: 0.4 }),
          gold: std('#ffc93c', { roughness: 0.3, metalness: 0.7, emissive: '#7a4a00', emissiveIntensity: 0.5 }),
          carpet: std('#b3122a', { roughness: 0.95, metalness: 0, emissive: '#2a0006', emissiveIntensity: 0.4 }),
          stageEdge: std('#ffc93c', { roughness: 0.35, metalness: 0.6, emissive: '#6a3c00', emissiveIntensity: 0.5 }),
          bulb: new THREE.MeshBasicMaterial({ color: '#ffffff' }),
          scallop: std('#ffffff', { roughness: 0.6, metalness: 0, emissive: '#ffffff', emissiveIntensity: 0.12 }),
        };
        const candy = createCandyTexture().clone();
        candy.needsUpdate = true;
        this.candyTex = candy;
        this.mat.column = std('#ffffff', { map: candy, roughness: 0.35, emissive: '#ffffff', emissiveMap: candy, emissiveIntensity: 0.12 });
        this.glowMat = new THREE.SpriteMaterial({
          map: getGlowTexture(),
          color: '#ffd27a',
          transparent: true,
          opacity: 0.55,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        });

        // Soldaditos de juguete (se crean una vez y se recolocan)
        this.soldiers = [this._createSoldier(1), this._createSoldier(-1)];
        this.soldiers.forEach((s) => this.group.add(s));
      }

      /** Pieza de caja escalada (marco, escenario…). */
      _block(material, w, h, d, x, y, z) {
        const m = new THREE.Mesh(this.geo.box, material);
        m.scale.set(w, h, d);
        m.position.set(x, y, z);
        return m;
      }

      /** Soldadito de juguete genérico, con piernas y brazos articulados. */
      _createSoldier(side) {
        const g = new THREE.Group();
        const red = std('#d8202f', { roughness: 0.45, emissive: '#3a0306', emissiveIntensity: 0.4 });
        const navy = std('#1d3c8f', { roughness: 0.5, emissive: '#08153a', emissiveIntensity: 0.4 });
        const black = std('#1a1a24', { roughness: 0.5 });
        const skin = std('#f6d2b8', { roughness: 0.7, emissive: '#3a2010', emissiveIntensity: 0.25 });
        const white = std('#ffffff', { roughness: 0.6, emissive: '#ffffff', emissiveIntensity: 0.1 });
        const cyl = (rt, rb, h, mat, x, y, z) => {
          const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, 16), mat);
          m.position.set(x, y, z);
          return m;
        };
        // Piernas con pivote en la cadera
        const legs = [];
        for (const lx of [-0.12, 0.12]) {
          const pivot = new THREE.Group();
          pivot.position.set(lx, 0.75, 0);
          pivot.add(cyl(0.09, 0.09, 0.62, navy, 0, -0.33, 0));
          pivot.add(cyl(0.1, 0.11, 0.12, black, 0, -0.68, 0.03));
          legs.push(pivot);
          g.add(pivot);
        }
        // Cuerpo, cinturón y botones
        g.add(cyl(0.24, 0.22, 0.62, red, 0, 1.05, 0));
        g.add(cyl(0.245, 0.245, 0.08, white, 0, 0.8, 0));
        for (let i = 0; i < 3; i++) {
          const b = new THREE.Mesh(new THREE.SphereGeometry(0.03, 8, 6), this.mat.gold);
          b.position.set(0, 0.95 + i * 0.13, 0.23);
          g.add(b);
        }
        // Brazos con pivote en el hombro
        const arms = [];
        for (const ax of [-0.31, 0.31]) {
          const pivot = new THREE.Group();
          pivot.position.set(ax, 1.3, 0);
          pivot.add(cyl(0.07, 0.07, 0.5, red, 0, -0.25, 0));
          const hand = new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 8), white);
          hand.position.y = -0.52;
          pivot.add(hand);
          arms.push(pivot);
          g.add(pivot);
        }
        // Cabeza, mejillas y gorro alto con pluma dorada
        const head = new THREE.Mesh(new THREE.SphereGeometry(0.2, 20, 16), skin);
        head.position.y = 1.55;
        g.add(head);
        for (const cx of [-0.1, 0.1]) {
          const cheek = new THREE.Mesh(new THREE.SphereGeometry(0.04, 8, 6), std('#ff8a9a'));
          cheek.position.set(cx, 1.51, 0.17);
          g.add(cheek);
          const eye = new THREE.Mesh(new THREE.SphereGeometry(0.025, 8, 6), black);
          eye.position.set(cx * 0.8, 1.58, 0.18);
          g.add(eye);
        }
        g.add(cyl(0.2, 0.2, 0.42, black, 0, 1.86, 0));
        g.add(cyl(0.205, 0.205, 0.06, this.mat.gold, 0, 1.7, 0));
        const plume = new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 8), this.mat.gold);
        plume.scale.set(1, 1.8, 1);
        plume.position.set(0, 2.13, 0);
        g.add(plume);
        g.userData = { legs, arms, side };
        g.rotation.y = -side * 0.35;
        return g;
      }

      /** Reconstruye las piezas dependientes del tamaño de la rejilla. */
      build(gridWidth, gridHeight, portrait) {
        // Libera lo anterior (InstancedMesh tienen búferes propios)
        this.layoutGroup.children.slice().forEach((o) => {
          if (o.isInstancedMesh) o.dispose();
          this.layoutGroup.remove(o);
        });
        this.portrait = portrait;
        const W = gridWidth + 1.5;
        const H = gridHeight + 1.2;
        this.width = W;
        this.height = H;
        const zWall = -1.05;
        const L = this.layoutGroup;

        // Pared de papel pintado
        const wall = this._block(this.mat.wall, W, H, 0.3, 0, 0, zWall);
        this.mat.wall.map.repeat.set(W / 3, H / 3);
        L.add(wall);

        // Marco rojo con filete dorado interior
        const fz = zWall + 0.25;
        L.add(this._block(this.mat.frame, W + FRAME_T * 2, FRAME_T, 0.5, 0, H / 2 + FRAME_T / 2, fz));
        L.add(this._block(this.mat.frame, W + FRAME_T * 2, FRAME_T, 0.5, 0, -H / 2 - FRAME_T / 2, fz));
        L.add(this._block(this.mat.frame, FRAME_T, H, 0.5, -W / 2 - FRAME_T / 2, 0, fz));
        L.add(this._block(this.mat.frame, FRAME_T, H, 0.5, W / 2 + FRAME_T / 2, 0, fz));
        const gz = zWall + 0.2;
        L.add(this._block(this.mat.gold, W, 0.06, 0.1, 0, H / 2 - 0.03, gz));
        L.add(this._block(this.mat.gold, W, 0.06, 0.1, 0, -H / 2 + 0.03, gz));
        L.add(this._block(this.mat.gold, 0.06, H, 0.1, -W / 2 + 0.03, 0, gz));
        L.add(this._block(this.mat.gold, 0.06, H, 0.1, W / 2 - 0.03, 0, gz));

        // Bombillas a lo largo del marco (marquesina)
        const pts = [];
        const ow = W + FRAME_T;
        const oh = H + FRAME_T;
        const perimeter = 2 * (ow + oh);
        const count = Math.round(perimeter / BULB_STEP);
        for (let i = 0; i < count; i++) {
          let d = (i / count) * perimeter;
          let x;
          let y;
          if (d < ow) {
            x = -ow / 2 + d;
            y = oh / 2;
          } else if ((d -= ow) < oh) {
            x = ow / 2;
            y = oh / 2 - d;
          } else if ((d -= oh) < ow) {
            x = ow / 2 - d;
            y = -oh / 2;
          } else {
            d -= ow;
            x = -ow / 2;
            y = -oh / 2 + d;
          }
          pts.push([x, y]);
        }
        this.bulbs = new THREE.InstancedMesh(this.geo.bulb, this.mat.bulb, count);
        const dummy = new THREE.Object3D();
        pts.forEach(([x, y], i) => {
          dummy.position.set(x, y, fz + 0.27);
          dummy.updateMatrix();
          this.bulbs.setMatrixAt(i, dummy.matrix);
          this.bulbs.setColorAt(i, BULB_COLORS[i % BULB_COLORS.length]);
        });
        L.add(this.bulbs);

        // Toldo festoneado rojo/blanco sobre el marco
        const topY = H / 2 + FRAME_T;
        const nScallops = Math.ceil((W + FRAME_T * 2 + 0.4) / (SCALLOP_R * 2));
        const awningW = nScallops * SCALLOP_R * 2;
        L.add(this._block(this.mat.frame, awningW, 0.38, 0.7, 0, topY + 0.19, fz + 0.15));
        L.add(this._block(this.mat.gold, awningW, 0.06, 0.74, 0, topY + 0.4, fz + 0.15));
        this.scallops = new THREE.InstancedMesh(this.geo.scallop, this.mat.scallop, nScallops);
        for (let i = 0; i < nScallops; i++) {
          dummy.position.set(-awningW / 2 + SCALLOP_R + i * SCALLOP_R * 2, topY + 0.01, fz + 0.5);
          dummy.updateMatrix();
          this.scallops.setMatrixAt(i, dummy.matrix);
          this.scallops.setColorAt(i, new THREE.Color(i % 2 ? '#ffffff' : '#e0262f'));
        }
        L.add(this.scallops);

        // Escenario con alfombra roja y canto dorado
        const stageY = -H / 2 - FRAME_T - 0.18;
        const stageW = W + (portrait ? 1.8 : 4.4);
        L.add(this._block(this.mat.carpet, stageW, 0.36, 2.4, 0, stageY, 0.05));
        L.add(this._block(this.mat.stageEdge, stageW, 0.08, 0.08, 0, stageY + 0.16, 1.25));

        // Columnas de caramelo con bolas doradas y halo
        const colH = H + FRAME_T * 2 + 0.6;
        this.candyTex.repeat.set(1, colH * 1.6);
        for (const s of [-1, 1]) {
          const x = s * (W / 2 + FRAME_T + 0.32);
          const col = new THREE.Mesh(this.geo.column, this.mat.column);
          col.scale.y = colH;
          col.position.set(x, stageY + 0.18 + colH / 2, fz);
          const ball = new THREE.Mesh(this.geo.ball, this.mat.gold);
          ball.position.set(x, stageY + 0.18 + colH + 0.25, fz);
          const halo = new THREE.Sprite(this.glowMat);
          halo.position.copy(ball.position);
          halo.scale.setScalar(1.6);
          L.add(col, ball, halo);
        }

        // Soldaditos: a los lados del escenario solo en horizontal
        this.soldiers.forEach((s) => {
          s.visible = !portrait;
          s.position.set(s.userData.side * -(W / 2 + 1.55), stageY + 0.18, 0.4);
          s.scale.setScalar(1.15);
        });
        this.stageBottom = stageY - 0.18;
      }

      /** Medidas que debe encuadrar la cámara. */
      getExtents() {
        const extraW = this.portrait ? 1.5 : 4.6;
        return {
          width: this.width + FRAME_T * 2 + extraW,
          height: this.height + FRAME_T * 2 + 0.9 + 0.55,
          // la fachada es algo más alta por arriba (toldo) que por abajo (escenario)
          centerY: 0.05,
        };
      }

      update(t) {
        // Bombillas que se persiguen alternando encendido/tenue
        if (this.bulbs) {
          const speed = this.reduced ? 1.5 : 6;
          const step = Math.floor(t * speed);
          const n = this.bulbs.count;
          for (let i = 0; i < n; i++) {
            const base = BULB_COLORS[(i + step) % BULB_COLORS.length];
            const on = (i + step) % 3 !== 0;
            this._tmpColor.copy(base).multiplyScalar(on ? 1 : 0.25);
            this.bulbs.setColorAt(i, this._tmpColor);
          }
          this.bulbs.instanceColor.needsUpdate = true;
        }
        // Soldaditos marchando en el sitio
        const k = this.reduced ? 0.35 : 1;
        this.soldiers.forEach((s, idx) => {
          if (!s.visible) return;
          const ph = t * 4 + idx * Math.PI;
          const [l1, l2] = s.userData.legs;
          const [a1, a2] = s.userData.arms;
          l1.rotation.x = Math.sin(ph) * 0.45 * k;
          l2.rotation.x = -Math.sin(ph) * 0.45 * k;
          a1.rotation.x = -Math.sin(ph) * 0.6 * k;
          a2.rotation.x = Math.sin(ph) * 0.6 * k;
          s.position.y = this.stageBottom + 0.36 + Math.abs(Math.sin(ph)) * 0.05 * k;
        });
      }
    }

    return { Facade };
  };
})();
