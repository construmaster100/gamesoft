require("dotenv").config();
const path = require("path");
const express = require("express");
const { createServer } = require("http");
const { Server } = require("socket.io");
const { GameState } = require("./gameState");

const ROOT = path.join(__dirname, "..");
const PORT = process.env.PORT || 4000;

const app = express();
const server = createServer(app);
const io = new Server(server);

const estado = new GameState();

app.use("/assets", express.static(path.join(ROOT, "assets")));
app.use("/pages", express.static(path.join(ROOT, "pages")));
app.get(["/", "/index.html"], (req, res) => res.sendFile(path.join(ROOT, "index.html")));

// Prototipo local standalone (sin servidor, un solo jugador) que vive en la
// raiz del repo. No se sirve como estatico completo de ROOT (expondria
// package.json, .env, etc.) — solo estos tres archivos puntuales.
app.get("/cancha.html", (req, res) => res.sendFile(path.join(ROOT, "cancha.html")));
app.get("/script.js", (req, res) => res.sendFile(path.join(ROOT, "script.js")));
app.get("/style.css", (req, res) => res.sendFile(path.join(ROOT, "style.css")));

io.on("connection", (socket) => {
  socket.on("observar", (_payload, cb) => {
    socket.join("sala-1");
    if (typeof cb === "function") cb(estado.serializarEstado());
  });

  socket.on("unirse", ({ nombre, color, personaje, jugadorId } = {}, cb) => {
    const resultado = estado.unirse({ nombre, color, personaje, jugadorId, socketId: socket.id });
    if (!resultado.ok) {
      if (typeof cb === "function") cb({ ok: false, motivo: resultado.motivo });
      return;
    }

    socket.data.jugadorId = resultado.jugador.id;
    socket.join("sala-1");

    if (typeof cb === "function") {
      cb({ ok: true, jugadorId: resultado.jugador.id, estado: estado.serializarEstado() });
    }
    if (resultado.esNuevo) {
      socket.to("sala-1").emit("jugador_nuevo", estado.serializarJugador(resultado.jugador));
    } else {
      socket.to("sala-1").emit("jugador_reconectado", estado.serializarJugador(resultado.jugador));
    }
  });

  socket.on("mover", ({ dr, dc } = {}) => {
    const jugadorId = socket.data.jugadorId;
    if (!jugadorId) return;
    const resultado = estado.mover(jugadorId, Number(dr) || 0, Number(dc) || 0);
    if (!resultado.ok) return;
    io.to("sala-1").emit("jugador_movido", {
      id: resultado.jugador.id,
      fila: resultado.jugador.fila,
      columna: resultado.jugador.columna,
    });
  });

  socket.on("defender", () => {
    const resultado = estado.defender(socket.data.jugadorId);
    if (resultado.ok) io.to("sala-1").emit("jugador_defendiendo", { id: resultado.jugador.id });
  });

  socket.on("atacar", ({ dr, dc } = {}) => {
    const resultado = estado.atacar(socket.data.jugadorId, Number(dr) || 0, Number(dc) || 0);
    if (!resultado.ok || !resultado.impacto) return;
    io.to("sala-1").emit("ataque_resuelto", {
      atacanteId: resultado.atacante.id,
      objetivoId: resultado.objetivo.id,
      bloqueado: resultado.bloqueado,
      danio: resultado.danio,
      vida: resultado.objetivo.vida,
    });
    io.to("sala-1").emit("jugador_actualizado", estado.serializarJugador(resultado.objetivo));
  });

  socket.on("anotar_gol", ({ puntos } = {}) => {
    const jugadorId = socket.data.jugadorId;
    if (!jugadorId) return;
    const resultado = estado.anotarGol(jugadorId, Number(puntos));
    if (!resultado.ok) return;
    io.to("sala-1").emit("jugador_actualizado", estado.serializarJugador(resultado.jugador));
    io.to("sala-1").emit("top5_actualizado", estado.top5());
  });

  socket.on("marcar", ({ celdaId, marca } = {}) => {
    const jugadorId = socket.data.jugadorId;
    if (!jugadorId) return;
    const resultado = estado.marcar(jugadorId, Number(celdaId), marca);
    if (!resultado.ok) return;
    io.to("sala-1").emit("celda_actualizada", resultado.celda);
    if (resultado.puntajeCambio) {
      io.to("sala-1").emit("jugador_actualizado", estado.serializarJugador(resultado.jugador));
      io.to("sala-1").emit("top5_actualizado", estado.top5());
    }
    if (resultado.jugadorPenalizado && resultado.jugadorPenalizado.id !== resultado.jugador.id) {
      io.to("sala-1").emit("jugador_actualizado", estado.serializarJugador(resultado.jugadorPenalizado));
      io.to("sala-1").emit("top5_actualizado", estado.top5());
    }
  });

  socket.on("cambiar_color_celda", ({ celdaId } = {}) => {
    const jugadorId = socket.data.jugadorId;
    if (!jugadorId) return;
    const resultado = estado.cambiarColorCelda(jugadorId, Number(celdaId));
    if (!resultado.ok) return;
    io.to("sala-1").emit("celda_actualizada", resultado.celda);
    if (resultado.jugadorPenalizado) {
      io.to("sala-1").emit("jugador_actualizado", estado.serializarJugador(resultado.jugadorPenalizado));
      io.to("sala-1").emit("top5_actualizado", estado.top5());
    }
  });

  socket.on("admin_reiniciar", () => {
    estado.reiniciar();
    io.to("sala-1").emit("estado_inicial", estado.serializarEstado());
  });

  socket.on("disconnect", () => {
    const jugadorId = socket.data.jugadorId;
    if (!jugadorId) return;
    estado.desconectar(jugadorId, socket.id);
    io.to("sala-1").emit("jugador_desconectado", { id: jugadorId });
  });
});

estado.cargarDesdeMongo().finally(() => {
  server.listen(PORT, () => {
    console.log(`CIA — Cancha Interactiva Asincrónica escuchando en http://localhost:${PORT}`);
  });
});
