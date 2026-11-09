# Calendario de Adviento · Fachada de juguetería

Calendario de Adviento en 3D hecho **solo con HTML, CSS y JavaScript**, sin frameworks, sin bundlers y **sin servidor**.
La única librería externa es **Three.js 0.169**, que se carga desde jsDelivr.

El estilo se inspira en las fachadas navideñas animadas de los grandes almacenes: una fachada de juguete con bombillas de colores que se persiguen, un toldo festoneado, columnas de caramelo, un escenario con alfombra roja y dos soldaditos que marchan. Los colores son vivos y la música alegre. Es un diseño propio: no usa logotipos, nombres ni personajes de ninguna marca.

Hay 24 cajas de regalo con papeles dibujados por código. Al pulsar una, se desenvuelve (el lazo se deshace, la tapa salta y sale un destello) y aparece una mini sorpresa 3D distinta para cada día. Todas las cajas se pueden abrir en cualquier momento.

## Cómo abrirlo

**Haz doble clic en `index.html`** (o arrástralo a una ventana del navegador). No hace falta instalar nada ni arrancar ningún servidor.

Solo necesitas conexión a Internet para descargar Three.js y las fuentes de Google (Fredoka y Nunito).
Funciona en las versiones actuales de Chrome, Edge, Firefox y Safari (16.4 o superior, por el `importmap`).

### Por qué funciona sin servidor

Los navegadores bloquean los módulos ES locales (`<script type="module" src="js/…">`) cuando la página se abre con `file://`. Por eso:

- Los archivos de `js/` son **scripts clásicos**. Cada uno registra una «fábrica» en el objeto global `window.Adviento` y recibe sus dependencias como parámetro.
- **Three.js** (y sus addons `OrbitControls` y bloom) se carga con `import()` dinámico desde el CDN, resuelto por el `importmap` de `index.html`. jsDelivr envía cabeceras CORS, así que esa carga sí está permitida desde `file://`.
- Al final de `js/main.js`, un pequeño arranque espera a Three.js y crea los módulos en orden.

Si aun así prefieres un servidor (por ejemplo, para probarlo en el móvil por red local), también funciona con `npx serve .` o con Live Server.

## Cómo se usa

- **Ratón / dedo**: pulsa una caja para abrirla. En la vista ampliada, arrastra para girar la sorpresa y usa la rueda o pellizca para acercar.
- **Teclado**: `Tab` recorre los días (aparece una etiqueta «Día N» y la caja se ilumina), `Enter` la abre y `Esc` vuelve.
- **Sonido**: la música de caja de música empieza tras la primera interacción. El botón redondo de abajo a la derecha la silencia, y su estado se guarda.
- **Reiniciar calendario**: está abajo a la izquierda y pide confirmación en un modal propio.

El progreso (cajas abiertas y mute) se guarda en `localStorage`.

## Estructura

```
index.html        Estructura, importmap, overlay, modal, lista accesible y scripts
css/styles.css    Estilo de juguetería, responsive y prefers-reduced-motion
js/main.js        Escena, cámara, render, bloom, cielo, nieve, bucle, resize,
                  selección con Raycaster, secuencia abrir/volver, visor 3D
                  y arranque (carga de Three.js)
js/grid.js        Las 24 cajas: rejilla 6×4 / 4×6, hover, desenvolver, estados
js/facade.js      Fachada: marco con bombillas, toldo, columnas, escenario y soldaditos
js/surprises.js   Las 24 sorpresas (una función por día que devuelve un THREE.Group)
js/textures.js    Ilustraciones generadas con <canvas> (papeles, papel pintado, números…)
js/audio.js       «Jingle Bells» (dominio público) y efectos con Web Audio API
js/storage.js     Lectura/escritura en localStorage con try/catch
js/ui.js          Overlay, botones, modal, foco y accesibilidad
js/easing.js      Funciones de easing propias y gestor de animaciones
```

## Notas técnicas

- **Rendimiento**: las geometrías y los materiales se comparten y se guardan en caché. Las hojas de la corona y las luces del abeto usan `InstancedMesh`, y los recursos que se eliminan se liberan con `dispose`. El `pixelRatio` está limitado a 2.
- **Móvil**: no usa bloom, reduce las partículas y pausa la escena de fondo mientras se ve una sorpresa.
- **`prefers-reduced-motion`**: las animaciones son más cortas y suaves, y no hay autorrotación, balanceo ni paralaje.
- **Sin dependencias de imágenes ni audio externos**: todo se genera en tiempo de ejecución.
