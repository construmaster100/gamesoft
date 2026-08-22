const crypto = require("crypto");
const { conectarMongo } = require("./db");
const Jugador = require("./models/Jugador");
const Tablero = require("./models/Tablero");

const ROWS = 7;
const COLS = 10;
const TOTAL_CELDAS = ROWS * COLS;
const MAX_JUGADORES = 20;
const PUNTOS_POR_CELDA = 3;
const PENALIZACION_PUNTOS = 2;
const TOP_N = 15;
const MS_ANTES_DE_LIBERAR_COLOR = 8000;
const VIDA_MAXIMA = 20;
const DANIO_ATAQUE = 5;
const DURACION_DEFENSA_MS = 900;
const PERSONAJES = new Set(["BLUE", "GREEN", "ORANGE", "PINK", "SILVER"]);

const PALETA = [
  { id: "rojo", nombre: "Rojo", hex: "#e63946" },
  { id: "azul", nombre: "Azul", hex: "#2f6a8f" },
  { id: "verde", nombre: "Verde", hex: "#2f9e44" },
  { id: "amarillo", nombre: "Amarillo", hex: "#f4b400" },
  { id: "naranja", nombre: "Naranja", hex: "#ef6c1a" },
  { id: "morado", nombre: "Morado", hex: "#7b4fd6" },
  { id: "rosa", nombre: "Rosa", hex: "#e0559c" },
  { id: "cian", nombre: "Cian", hex: "#17a2b8" },
  { id: "blanco", nombre: "Blanco", hex: "#f5f5f5" },
  { id: "negro", nombre: "Negro", hex: "#1c1c1c" },
];
const PALETA_IDS = new Set(PALETA.map((c) => c.id));

function crearTablero() {
  const tablero = [];
  for (let i = 0; i < TOTAL_CELDAS; i++) {
    tablero.push({
      id: i + 1,
      fila: Math.floor(i / COLS),
      columna: i % COLS,
      marca: null,
      color: null,
      jugadorId: null,
      marcadorId: null,
      puntosOtorgados: false,
    });
  }
  return tablero;
}

class GameState {
  constructor() {
    this.jugadores = new Map(); // jugadorId -> jugador
    this.tablero = crearTablero();
    this.timersDesconexion = new Map(); // jugadorId -> Timeout
    this.persistenciaActiva = false;
  }

  // Restaura jugadores y tablero guardados en MongoDB (si hay MONGODB_URI y
  // Atlas responde) para que el puntaje y las marcas sobrevivan a un
  // reinicio del proceso (por ejemplo el spin-down de Render por
  // inactividad). Si no hay persistencia disponible, el servidor sigue
  // funcionando solo en memoria.
  async cargarDesdeMongo() {
    this.persistenciaActiva = await conectarMongo();
    if (!this.persistenciaActiva) return;

    const docsJugadores = await Jugador.find({}).lean();
    for (const doc of docsJugadores) {
      this.jugadores.set(doc.id, {
        id: doc.id,
        nombre: doc.nombre,
        color: doc.color,
        personaje: PERSONAJES.has(doc.personaje) ? doc.personaje : "BLUE",
        vida: Number.isFinite(doc.vida) ? Math.max(0, Math.min(VIDA_MAXIMA, doc.vida)) : VIDA_MAXIMA,
        defendiendoHasta: 0,
        fila: doc.fila,
        columna: doc.columna,
        score: doc.score,
        conectado: false,
        socketId: null,
        ultimaAccion: Date.now(),
      });
    }

    const docTablero = await Tablero.findById("tablero").lean();
    if (docTablero && docTablero.celdas && docTablero.celdas.length === TOTAL_CELDAS) {
      this.tablero = docTablero.celdas;
    }

    console.log(`CIA: ${docsJugadores.length} jugador(es) y tablero restaurados desde MongoDB.`);
  }

  // "Fire and forget" (sin await): la respuesta al socket no debe esperar a
  // Atlas, y un fallo de persistencia no debe romper la partida en curso.
  _guardarJugador(jugador) {
    if (!this.persistenciaActiva) return;
    Jugador.findOneAndUpdate(
      { id: jugador.id },
      {
        id: jugador.id,
        nombre: jugador.nombre,
        color: jugador.color,
        personaje: jugador.personaje,
        vida: jugador.vida,
        fila: jugador.fila,
        columna: jugador.columna,
        score: jugador.score,
      },
      { upsert: true }
    ).catch((err) => console.error("CIA: error guardando jugador en MongoDB:", err.message));
  }

  _guardarTablero() {
    if (!this.persistenciaActiva) return;
    Tablero.findOneAndUpdate(
      { _id: "tablero" },
      { celdas: this.tablero },
      { upsert: true }
    ).catch((err) => console.error("CIA: error guardando tablero en MongoDB:", err.message));
  }

  colorEnUso(colorId, excluirJugadorId) {
    for (const jugador of this.jugadores.values()) {
      if (jugador.id === excluirJugadorId) continue;
      if (jugador.conectado && jugador.color === colorId) return true;
    }
    return false;
  }

  jugadoresConectados() {
    return [...this.jugadores.values()].filter((j) => j.conectado).length;
  }

  serializarJugador(jugador) {
    const { id, nombre, color, personaje, fila, columna, score, vida, conectado, ultimaAccion } = jugador;
    return { id, nombre, color, personaje, fila, columna, score, vida, conectado, ultimaAccion };
  }

  serializarEstado() {
    return {
      config: { rows: ROWS, cols: COLS, total: TOTAL_CELDAS, paleta: PALETA, puntosPorCelda: PUNTOS_POR_CELDA },
      jugadores: [...this.jugadores.values()].map((j) => this.serializarJugador(j)),
      tablero: this.tablero,
      top5: this.top5(),
    };
  }

  top5() {
    return [...this.jugadores.values()]
      .slice()
      .sort((a, b) => b.score - a.score)
      .slice(0, TOP_N)
      .map((j) => ({ id: j.id, nombre: j.nombre, color: j.color, score: j.score }));
  }

  unirse({ nombre, color, personaje, jugadorId, socketId }) {
    if (jugadorId && this.jugadores.has(jugadorId)) {
      const jugador = this.jugadores.get(jugadorId);
      const timer = this.timersDesconexion.get(jugadorId);
      if (timer) {
        clearTimeout(timer);
        this.timersDesconexion.delete(jugadorId);
      }
      jugador.conectado = true;
      jugador.socketId = socketId;
      if (PERSONAJES.has(personaje)) jugador.personaje = personaje;
      jugador.ultimaAccion = Date.now();
      return { ok: true, jugador, esNuevo: false };
    }

    const nombreLimpio = String(nombre || "").trim().slice(0, 20);
    if (!nombreLimpio) return { ok: false, motivo: "Ingresa un nombre de usuario." };
    if (!PALETA_IDS.has(color)) return { ok: false, motivo: "Elige un color válido." };
    if (this.colorEnUso(color)) return { ok: false, motivo: "Ese color ya está en uso por otro jugador conectado." };
    if (this.jugadoresConectados() >= MAX_JUGADORES) {
      return { ok: false, motivo: `La sala está llena (máximo ${MAX_JUGADORES} jugadores).` };
    }

    const jugador = {
      id: crypto.randomUUID(),
      nombre: nombreLimpio,
      color,
      personaje: PERSONAJES.has(personaje) ? personaje : "BLUE",
      vida: VIDA_MAXIMA,
      defendiendoHasta: 0,
      fila: Math.floor(Math.random() * ROWS),
      columna: Math.floor(Math.random() * COLS),
      score: 0,
      conectado: true,
      socketId,
      ultimaAccion: Date.now(),
    };
    this.jugadores.set(jugador.id, jugador);
    this._guardarJugador(jugador);
    return { ok: true, jugador, esNuevo: true };
  }

  // Solo desconecta si "socketId" sigue siendo la conexión activa de ese
  // jugador. Cuando el navegador navega de una página a otra (login →
  // cancha), la conexión vieja puede tardar en avisar su cierre más de lo
  // que tarda la nueva en reclamar el mismo jugadorId — si se procesara ese
  // "disconnect" tardío sin esta verificación, marcaría como desconectado a
  // un jugador que en realidad ya está activo en la conexión nueva, y sus
  // acciones quedarían ignoradas en silencio.
  desconectar(jugadorId, socketId) {
    const jugador = this.jugadores.get(jugadorId);
    if (!jugador) return;
    if (socketId && jugador.socketId !== socketId) return;
    jugador.conectado = false;
    jugador.ultimaAccion = Date.now();
    const timer = setTimeout(() => {
      this.timersDesconexion.delete(jugadorId);
    }, MS_ANTES_DE_LIBERAR_COLOR);
    this.timersDesconexion.set(jugadorId, timer);
  }

  mover(jugadorId, dr, dc) {
    const jugador = this.jugadores.get(jugadorId);
    if (!jugador || !jugador.conectado) return { ok: false };
    const nr = jugador.fila + dr;
    const nc = jugador.columna + dc;
    if (nr < 0 || nr >= ROWS || nc < 0 || nc >= COLS) return { ok: false };
    jugador.fila = nr;
    jugador.columna = nc;
    jugador.ultimaAccion = Date.now();
    return { ok: true, jugador };
  }

  defender(jugadorId) {
    const jugador = this.jugadores.get(jugadorId);
    if (!jugador || !jugador.conectado) return { ok: false };
    jugador.defendiendoHasta = Date.now() + DURACION_DEFENSA_MS;
    return { ok: true, jugador };
  }

  atacar(jugadorId, dr, dc) {
    const atacante = this.jugadores.get(jugadorId);
    if (!atacante || !atacante.conectado) return { ok: false };
    if (Math.abs(dr) + Math.abs(dc) !== 1) return { ok: false };

    const objetivo = [...this.jugadores.values()].find((jugador) =>
      jugador.conectado && jugador.id !== jugadorId &&
      jugador.fila === atacante.fila + dr && jugador.columna === atacante.columna + dc
    );
    if (!objetivo) return { ok: true, impacto: false };

    const bloqueado = objetivo.defendiendoHasta > Date.now();
    if (!bloqueado) {
      objetivo.vida = Math.max(0, objetivo.vida - DANIO_ATAQUE);
      this._guardarJugador(objetivo);
    }
    return { ok: true, impacto: true, bloqueado, atacante, objetivo, danio: bloqueado ? 0 : DANIO_ATAQUE };
  }

  marcar(jugadorId, celdaId, marca) {
    const jugador = this.jugadores.get(jugadorId);
    if (!jugador || !jugador.conectado) return { ok: false };
    if (!Number.isInteger(celdaId) || celdaId < 1 || celdaId > TOTAL_CELDAS) return { ok: false };
    if (marca !== "X" && marca !== "O") return { ok: false };

    const celda = this.tablero[celdaId - 1];
    const marcadorAnterior = celda.marcadorId ? this.jugadores.get(celda.marcadorId) : null;

    let jugadorPenalizado = null;
    if (marcadorAnterior) {
      marcadorAnterior.score = Math.max(0, marcadorAnterior.score - PENALIZACION_PUNTOS);
      jugadorPenalizado = marcadorAnterior;
    }

    celda.marca = marca;
    celda.jugadorId = jugadorId;
    celda.marcadorId = jugadorId;
    celda.puntosOtorgados = true;
    jugador.score += PUNTOS_POR_CELDA;
    jugador.ultimaAccion = Date.now();
    this._guardarTablero();
    this._guardarJugador(jugador);
    if (jugadorPenalizado && jugadorPenalizado.id !== jugador.id) this._guardarJugador(jugadorPenalizado);
    return { ok: true, celda, jugador, jugadorPenalizado, puntajeCambio: true };
  }

  cambiarColorCelda(jugadorId, celdaId) {
    const jugador = this.jugadores.get(jugadorId);
    if (!jugador || !jugador.conectado) return { ok: false };
    if (!Number.isInteger(celdaId) || celdaId < 1 || celdaId > TOTAL_CELDAS) return { ok: false };

    const celda = this.tablero[celdaId - 1];
    const seDecolora = celda.color === jugador.color;
    celda.color = seDecolora ? null : jugador.color;
    celda.jugadorId = jugadorId;
    jugador.ultimaAccion = Date.now();
    this._guardarTablero();

    let jugadorPenalizado = null;
    if (seDecolora && celda.marcadorId) {
      const marcador = this.jugadores.get(celda.marcadorId);
      if (marcador) {
        marcador.score = Math.max(0, marcador.score - PENALIZACION_PUNTOS);
        this._guardarJugador(marcador);
        jugadorPenalizado = marcador;
      }
    }

    return { ok: true, celda, jugadorPenalizado };
  }

  reiniciar() {
    this.tablero = crearTablero();
    for (const jugador of this.jugadores.values()) jugador.score = 0;
    if (this.persistenciaActiva) {
      Tablero.findOneAndUpdate({ _id: "tablero" }, { celdas: this.tablero }, { upsert: true }).catch((err) =>
        console.error("CIA: error reiniciando tablero en MongoDB:", err.message)
      );
      Jugador.updateMany({}, { score: 0 }).catch((err) =>
        console.error("CIA: error reiniciando puntajes en MongoDB:", err.message)
      );
    }
  }
}

module.exports = { GameState, ROWS, COLS, TOTAL_CELDAS, MAX_JUGADORES, PALETA, PUNTOS_POR_CELDA };
