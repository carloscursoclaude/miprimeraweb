# Calendario de Adviento · Noche mágica

Calendario de Adviento en 3D hecho **solo con HTML, CSS y JavaScript** (módulos ES, sin frameworks ni bundlers).
La única librería externa es **Three.js 0.169**, que se carga desde jsDelivr con un `importmap`.

Hay 24 cajas de regalo con papeles dibujados por código. Al pulsar una, se desenvuelve (el lazo se deshace, la tapa salta y sale un destello) y aparece una mini sorpresa 3D distinta para cada día. Todas las cajas se pueden abrir en cualquier momento.

## Cómo ejecutarlo en local

Los módulos ES no funcionan abriendo el archivo con `file://`. Hace falta un servidor estático:

```bash
npx serve .
```

y abre la URL que indique (normalmente http://localhost:3000).

Alternativas:

- **VS Code**: extensión *Live Server* → clic derecho en `index.html` → *Open with Live Server*.
- **Python**: `python3 -m http.server 8000` y abre http://localhost:8000.

Necesitas conexión a Internet para cargar Three.js y las fuentes de Google (Cormorant Garamond e Inter).

## Cómo se usa

- **Ratón / dedo**: pulsa una caja para abrirla. En la vista ampliada, arrastra para girar la sorpresa y usa la rueda o pellizca para acercar.
- **Teclado**: `Tab` recorre los días (aparece una etiqueta «Día N» y la caja se ilumina), `Enter` la abre y `Esc` vuelve.
- **Sonido**: la música de caja de música empieza tras la primera interacción. El botón redondo de abajo a la derecha la silencia, y su estado se guarda.
- **Reiniciar calendario**: está abajo a la izquierda y pide confirmación en un modal propio.

El progreso (cajas abiertas y mute) se guarda en `localStorage`.

## Estructura

```
index.html        Estructura, importmap, overlay, modal y lista accesible
css/styles.css    Estilo "Noche mágica", responsive y prefers-reduced-motion
js/main.js        Escena, cámara, render, bloom, cielo, nieve, bucle, resize,
                  selección con Raycaster, secuencia abrir/volver y visor 3D
js/grid.js        Las 24 cajas: rejilla 6×4 / 4×6, hover, desenvolver, estados
js/surprises.js   Las 24 sorpresas (una función por día que devuelve un THREE.Group)
js/textures.js    Ilustraciones generadas con <canvas> (papeles, números, brillos…)
js/audio.js       Música y efectos con Web Audio API (sin archivos de audio)
js/storage.js     Lectura/escritura en localStorage con try/catch
js/ui.js          Overlay, botones, modal, foco y accesibilidad
js/easing.js      Funciones de easing propias y gestor de animaciones
```

## Notas técnicas

- **Rendimiento**: las geometrías y los materiales se comparten y se guardan en caché. Las hojas de la corona y las luces del abeto usan `InstancedMesh`, y los recursos que se eliminan se liberan con `dispose`. El `pixelRatio` está limitado a 2.
- **Móvil**: no usa bloom, reduce las partículas y pausa la escena de fondo mientras se ve una sorpresa.
- **`prefers-reduced-motion`**: las animaciones son más cortas y suaves, y no hay autorrotación, balanceo ni paralaje.
- **Sin dependencias de imágenes ni audio externos**: todo se genera en tiempo de ejecución.
