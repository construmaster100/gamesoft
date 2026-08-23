/* ==========================================================================
   CIA — capa de conexión Socket.IO compartida por index.html (login) y las
   páginas de pages/ (cancha, score, administrador). Expone window.CIA.
   ========================================================================== */

if (window.location.protocol === "file:" || typeof io === "undefined") {
  document.body.innerHTML = `
    <div style="max-width:560px;margin:15vh auto;padding:24px 28px;font-family:system-ui,sans-serif;
                background:#fff;border-radius:14px;box-shadow:0 18px 40px -14px rgba(23,34,43,.35);">
      <h1 style="font-size:1.3rem;margin:0 0 10px;color:#e23c2f;">Esto necesita el servidor corriendo</h1>
      <p style="margin:0 0 8px;">Este archivo se abrió sin pasar por el servidor Node.js (por ejemplo,
      directamente como archivo local, o desde GitHub/GitHub Pages, que solo sirve archivos estáticos).
      El juego necesita ese servidor activo para sincronizar jugadores en tiempo real por Socket.IO.</p>
      <p style="margin:0;">Ejecuta <code>npm run dev:game</code> en tu computador y abre
      <code>http://localhost:4000/</code> en el navegador. Para que otras personas se conecten,
      hace falta desplegarlo en un servicio que ejecute Node.js (por ejemplo Render.com), no solo subirlo a GitHub.</p>
    </div>`;
  throw new Error("CIA: abre http://localhost:4000/ (servidor corriendo), no el archivo estático.");
}

const CIA = (() => {
  const SESION_KEY = "cia_sesion";
  const socket = io();

  function obtenerSesion() {
    try {
      const raw = sessionStorage.getItem(SESION_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  function guardarSesion(sesion) {
    sessionStorage.setItem(SESION_KEY, JSON.stringify(sesion));
  }

  function borrarSesion() {
    sessionStorage.removeItem(SESION_KEY);
  }

  function observar() {
    return new Promise((resolve) => socket.emit("observar", {}, resolve));
  }

  function unirse(nombre, color, personaje) {
    const sesionPrevia = obtenerSesion();
    const payload = { nombre, color, personaje, jugadorId: sesionPrevia ? sesionPrevia.jugadorId : undefined };
    return new Promise((resolve) => {
      socket.emit("unirse", payload, (respuesta) => {
        if (respuesta.ok) guardarSesion({ jugadorId: respuesta.jugadorId, nombre, color, personaje });
        resolve(respuesta);
      });
    });
  }

  function reclamarSesion() {
    const sesion = obtenerSesion();
    if (!sesion) return Promise.resolve({ ok: false, motivo: "Sin sesión guardada." });
    return unirse(sesion.nombre, sesion.color, sesion.personaje);
  }

  function mover(dr, dc) {
    socket.emit("mover", { dr, dc });
  }

  function atacar(dr, dc) {
    socket.emit("atacar", { dr, dc });
  }

  function defender() {
    socket.emit("defender");
  }

  function marcar(celdaId, marca) {
    socket.emit("marcar", { celdaId, marca });
  }

  function cambiarColorCelda(celdaId) {
    socket.emit("cambiar_color_celda", { celdaId });
  }

  function anotarGol(puntos) {
    socket.emit("anotar_gol", { puntos });
  }

  function reiniciarPartida() {
    socket.emit("admin_reiniciar");
  }

  // Si la conexión se cae y se restablece (por ejemplo, la instancia gratuita
  // de Render se reinició por inactividad), el navegador vuelve a conectar el
  // socket solo, pero del lado del servidor es una conexión nueva sin
  // "unirse" — las acciones quedarían ignoradas en silencio. "connect" se
  // dispara en cada conexión exitosa (la primera y cualquier reconexión); a
  // partir de la segunda vez, recargamos para rehacer todo el arranque
  // (rejoin + estado fresco) en vez de seguir sobre un socket a medio unir.
  let yaConectadoUnaVez = false;
  socket.on("connect", () => {
    if (yaConectadoUnaVez) window.location.reload();
    yaConectadoUnaVez = true;
  });

  return {
    socket,
    obtenerSesion,
    guardarSesion,
    borrarSesion,
    observar,
    unirse,
    reclamarSesion,
    mover,
    atacar,
    defender,
    marcar,
    cambiarColorCelda,
    anotarGol,
    reiniciarPartida,
  };
})();
