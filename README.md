# CIA — Cancha Interactiva Asincrónica «CR7»

Este README documenta la aplicación que corre en la raíz de este repositorio
(`index.html`, `pages/`, `assets/`, `game-server/`) y que es lo que despliega
el servicio de Render conectado a este repo/branch: una **cancha
interactiva multijugador** de 70 casillas donde cada jugador entra con
nombre y color, se mueve libremente por la cancha en tiempo real (juego
concurrente, no por turnos) y puede dejar marcas, sincronizado vía
Socket.IO. El servidor (`game-server/gameState.js`) es la única autoridad
sobre el estado de la partida.

Documentación técnica completa en
[`docs/CIA - Documentacion del Proyecto.md`](docs/CIA%20-%20Documentacion%20del%20Proyecto.md).

> **Nota:** entre el 21 y 22 de agosto de 2026 este repositorio tuvo, por un
> tiempo breve, una implementación de SENAEnglish (cuestionario de inglés)
> desplegada por error en lugar de la cancha CR7. Se revirtió porque
> SENAEnglish es un proyecto aparte que vive únicamente en
> `construmaster100/MAP` / `englishcoding.onrender.com` — ver
> [`docs/2026-08-21_diagnostico-despliegue-render.md`](docs/2026-08-21_diagnostico-despliegue-render.md).

## Despliegue

| | |
| --- | --- |
| Carpeta local | `D:\cancha interactiva asincronica` |
| GitHub | [construmaster100/AVAsoft](https://github.com/construmaster100/AVAsoft), branch `cancha-svg-viewport` |
| Render (en vivo) | https://adsoavasoft.onrender.com |

Este repositorio es independiente de `construmaster100/MAP` (carpeta local
`D:\FT3P`, servicio Render `englishcoding`, proyecto SENAEnglish) — son dos
proyectos separados, sin historial ni despliegue en común.

## Cómo correrlo

```
npm install
npm run dev:game
```

Abre `http://localhost:4000/`. La cancha **necesita** el servidor Node
corriendo — Socket.IO sincroniza el ingreso de jugadores, el movimiento y las
marcas; abrir los `.html` como archivo local no funciona.

### Persistencia (opcional)

Si defines `MONGODB_URI` (en `.env` local, o como variable de entorno en
Render → el servicio `ADSOAVAsoft` → Environment), el jugador y el tablero
(marcas, colores, puntajes) se guardan en MongoDB Atlas y sobreviven a un
reinicio del proceso — por ejemplo el spin-down de Render por inactividad.
Sin esa variable, el servidor sigue funcionando igual, solo que en memoria
(el estado se pierde al reiniciar).

## Estructura de la cancha CR7

```
index.html                     Login: nombre + color
pages/
  cancha.html                  Vista principal de la cancha (grilla 7×10)
  jugador 1.html, jugador 2.html   Vistas auxiliares por jugador
  score.html                    Marcador
  Lobby de espera.html          Sala de espera antes de entrar
assets/
  js/game-client.js             Capa de conexión Socket.IO (cliente)
  js/script.js                  Lógica de interacción de la cancha
  img/CANCHA FUTBOL/             Assets gráficos de la cancha
game-server/
  index.js                      Servidor Express + Socket.IO
  gameState.js                  Estado del servidor: jugadores, posiciones, marcas (autoridad)
pruebas/
  test-game.js                  Prueba de flujo por Socket.IO
docs/
  CIA - Documentacion del Proyecto.md/.docx   Documentación técnica vigente
```

## Otros contenidos de este repositorio (no forman parte de la cancha CR7)

Este repositorio reúne varios entregables independientes del mismo programa
formativo (ADSO, ficha 3293836); ninguno de los siguientes es parte de la
cancha CR7:

- `pages/aprendiz.html`, `pages/instructor.html`, `docs/documentacion/` — la
  plataforma AVA SENA (LMS) y su documentación de requisitos (RF01–RF13).
- `client/`, `shared/`, `server/sockets/` — una arquitectura modular más
  nueva del juego de cancha (entidades, física, colisiones), separada del
  `game-server/` que usa la versión actual desplegada.
- `server/` (routes, models, config) — API REST propia (Express + Mongoose)
  de otro entregable, no usada por la cancha CR7.
