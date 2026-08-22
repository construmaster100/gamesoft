/* ==========================================================================
   CANCHA MULTIJUGADOR — viewport de navegación 7×10 sincronizado por Socket.IO
   --------------------------------------------------------------------------
   La cancha NO es un rectángulo: en la imagen de referencia se ve en
   perspectiva, así que su área es un trapezoide y la grilla 7×10 se calcula
   por interpolación bilineal de sus 4 esquinas (cada celda hereda la
   deformación real de la perspectiva). El recuadro de navegación es un
   VIEWPORT de cámara que encuadra una ventana de 4×3 celdas centrada en la
   celda activa del jugador local; el resto del estado (posición de los
   demás jugadores, marcas X/O, color de cada celda, score, TOP5) llega y
   se sincroniza en vivo desde el servidor — esta página no decide nada por
   su cuenta, solo pide acciones y pinta lo que el servidor confirma.
   ========================================================================== */

const SVG_NS = "http://www.w3.org/2000/svg";
const svg = document.getElementById("pitch-svg");

const ROWS = 7;
const COLS = 10;

const QUAD = {
  TL: { x: 142, y: 98 },
  TR: { x: 858, y: 98 },
  BL: { x: 26,  y: 432 },
  BR: { x: 974, y: 432 },
};

const lerp = (a, b, t) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });

function quadPoint(u, v) {
  const top = lerp(QUAD.TL, QUAD.TR, u);
  const bottom = lerp(QUAD.BL, QUAD.BR, u);
  return lerp(top, bottom, v);
}

function blockCorners(r, c, rSpan, cSpan) {
  const u0 = c / COLS, u1 = (c + cSpan) / COLS;
  const v0 = r / ROWS, v1 = (r + rSpan) / ROWS;
  return [quadPoint(u0, v0), quadPoint(u1, v0), quadPoint(u1, v1), quadPoint(u0, v1)];
}

function cellCorners(r, c) { return blockCorners(r, c, 1, 1); }
function cellCenter(r, c) { return quadPoint((c + 0.5) / COLS, (r + 0.5) / ROWS); }

function blockBBox(r, c, rSpan, cSpan) {
  const corners = blockCorners(r, c, rSpan, cSpan);
  const xs = corners.map(p => p.x), ys = corners.map(p => p.y);
  return {
    minX: Math.min(...xs), maxX: Math.max(...xs),
    minY: Math.min(...ys), maxY: Math.max(...ys),
  };
}

const VIEW_ROWS = 3;
const VIEW_COLS = 4;

function viewportOrigin(r, c) {
  const rWin = Math.max(0, Math.min(r - 1, ROWS - VIEW_ROWS));
  const cWin = Math.max(0, Math.min(c - 1, COLS - VIEW_COLS));
  return { rWin, cWin };
}

function viewportBBox(r, c) {
  const { rWin, cWin } = viewportOrigin(r, c);
  return blockBBox(rWin, cWin, VIEW_ROWS, VIEW_COLS);
}

function bboxToViewBox(b) {
  return `${b.minX.toFixed(2)} ${b.minY.toFixed(2)} ${(b.maxX - b.minX).toFixed(2)} ${(b.maxY - b.minY).toFixed(2)}`;
}

function pointsToStr(points) {
  return points.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
}

function el(tag, attrs = {}, parent) {
  const node = document.createElementNS(SVG_NS, tag);
  for (const k in attrs) node.setAttribute(k, attrs[k]);
  if (parent) parent.appendChild(node);
  return node;
}

function zoneNumber(r, c) { return r * COLS + c + 1; }

const ROW_THIRDS = ["fondo", "mediocampo", "frente"];
const COL_THIRDS = ["banda izquierda", "centro", "banda derecha"];
function zoneDescription(r, c) {
  const rowLabel = ROW_THIRDS[Math.min(2, Math.floor((r / ROWS) * 3))];
  const colLabel = COL_THIRDS[Math.min(2, Math.floor((c / COLS) * 3))];
  return `${colLabel} — ${rowLabel}`;
}

/* ---------------------------------------------------------------------- */
/* Grupos base                                                            */
/* ---------------------------------------------------------------------- */
const sceneGroup      = el("g", { class: "scene-group" }, svg);
const turfGroup        = el("g", {}, sceneGroup);
const paintGroup       = el("g", {}, sceneGroup);
const gridGroup        = el("g", {}, sceneGroup);
const cellsGroup       = el("g", {}, sceneGroup);
const markGroup        = el("g", {}, sceneGroup);
const highlightGroup   = el("g", {}, sceneGroup);
const playersGroup     = el("g", {}, sceneGroup);

function drawPitchTexture() {
  const defs = el("defs", {}, svg);
  const clip = el("clipPath", { id: "field-clip" }, defs);
  el("polygon", { points: pointsToStr([QUAD.TL, QUAD.TR, QUAD.BR, QUAD.BL]) }, clip);
  el("image", {
    href: "../assets/img/CANCHA%20FUTBOL/grilla%207x10.png",
    x: 0, y: 0, width: 1000, height: 562.5,
    preserveAspectRatio: "none",
    "clip-path": "url(#field-clip)",
  }, turfGroup);
}

function drawGridLines() {
  for (let c = 1; c < COLS; c++) {
    const u = c / COLS;
    el("line", { x1: quadPoint(u, 0).x, y1: quadPoint(u, 0).y, x2: quadPoint(u, 1).x, y2: quadPoint(u, 1).y, class: "grid-line" }, gridGroup);
  }
  for (let r = 1; r < ROWS; r++) {
    const v = r / ROWS;
    el("line", { x1: quadPoint(0, v).x, y1: quadPoint(0, v).y, x2: quadPoint(1, v).x, y2: quadPoint(1, v).y, class: "grid-line" }, gridGroup);
  }
}

/* ---------------------------------------------------------------------- */
/* Celdas: capa de pintura (color), capa de golpe (clic) y capa de marca  */
/* (X/O) — las 70 = 7×10, una de cada por celda.                          */
/* ---------------------------------------------------------------------- */
const paintPolys = [];
const markTexts = [];

function crearCeldas() {
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const idx = zoneNumber(r, c) - 1;

      const paint = el("polygon", { points: pointsToStr(cellCorners(r, c)), class: "cell-paint" }, paintGroup);
      paintPolys[idx] = paint;

      const hit = el("polygon", { points: pointsToStr(cellCorners(r, c)), class: "cell-hit" }, cellsGroup);
      hit.addEventListener("click", () => requestMove(r - active.r, c - active.c));

      const center = cellCenter(r, c);
      const mark = el("text", { x: center.x, y: center.y, class: "cell-mark", "text-anchor": "middle", "dominant-baseline": "central" }, markGroup);
      markTexts[idx] = mark;
    }
  }
}

function pintarCelda(celda) {
  const idx = celda.id - 1;
  const hex = celda.color ? (paletaPorId[celda.color] || null) : null;
  paintPolys[idx].setAttribute("fill", hex || "transparent");
  paintPolys[idx].style.opacity = hex ? "0.55" : "0";
  markTexts[idx].textContent = celda.marca || "";
}

/* ---------------------------------------------------------------------- */
/* Marcadores de los demás jugadores sobre el propio SVG                  */
/* ---------------------------------------------------------------------- */
const marcadoresJugadores = new Map();
const PERSONAJE_SRC = (personaje) => `../assets/img/pj/PERSONAJE/${personaje || "BLUE"}.png`;

function actualizarMarcadorJugador(jugador) {
  let marcador = marcadoresJugadores.get(jugador.id);
  if (!jugador.conectado) {
    if (marcador) { marcador.remove(); marcadoresJugadores.delete(jugador.id); }
    return;
  }
  const centro = cellCenter(jugador.fila, jugador.columna);
  if (!marcador) {
    marcador = el("image", { width: 34, height: 34, class: "player-marker" }, playersGroup);
    marcadoresJugadores.set(jugador.id, marcador);
  }
  marcador.setAttribute("x", centro.x - 17);
  marcador.setAttribute("y", centro.y - 17);
  marcador.setAttribute("href", PERSONAJE_SRC(jugador.personaje));
  marcador.setAttribute("preserveAspectRatio", "xMidYMid meet");
}

/* ---------------------------------------------------------------------- */
/* Selección de la casilla activa                                        */
/* ---------------------------------------------------------------------- */
let active = { r: 3, c: 4 };
let highlightPts = cellCorners(active.r, active.c);
const highlightPoly = el("polygon", { class: "highlight-box", points: pointsToStr(highlightPts) }, highlightGroup);
let currentBBox = viewportBBox(active.r, active.c);

function easeInOutCubic(t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }

function animate(duration, onFrame, onDone) {
  const start = performance.now();
  function frame(now) {
    const t = Math.min(1, (now - start) / duration);
    onFrame(easeInOutCubic(t));
    if (t < 1) requestAnimationFrame(frame); else if (onDone) onDone();
  }
  requestAnimationFrame(frame);
}

function tweenHighlightTo(newPts) {
  const fromPts = highlightPts.map(p => ({ ...p }));
  animate(420, (t) => {
    const cur = fromPts.map((p, i) => lerp(p, newPts[i], t));
    highlightPoly.setAttribute("points", pointsToStr(cur));
  }, () => { highlightPts = newPts; });
}

function tweenViewportTo(newBBox) {
  const from = { ...currentBBox };
  animate(420, (t) => {
    const cur = {
      minX: from.minX + (newBBox.minX - from.minX) * t,
      minY: from.minY + (newBBox.minY - from.minY) * t,
      maxX: from.maxX + (newBBox.maxX - from.maxX) * t,
      maxY: from.maxY + (newBBox.maxY - from.maxY) * t,
    };
    svg.setAttribute("viewBox", bboxToViewBox(cur));
  }, () => { currentBBox = newBBox; });
}

const DIRS = {
  up: { dr: -1, dc: 0 }, down: { dr: 1, dc: 0 },
  left: { dr: 0, dc: -1 }, right: { dr: 0, dc: 1 },
};
const panButtons = {
  up: document.getElementById("pan-up"), down: document.getElementById("pan-down"),
  left: document.getElementById("pan-left"), right: document.getElementById("pan-right"),
};
Object.entries(DIRS).forEach(([name, { dr, dc }]) => {
  panButtons[name].addEventListener("click", () => requestMove(dr, dc));
});
function refreshPanButtons() {
  Object.entries(DIRS).forEach(([name, { dr, dc }]) => {
    const nr = active.r + dr, nc = active.c + dc;
    panButtons[name].classList.toggle("is-visible", nr >= 0 && nr < ROWS && nc >= 0 && nc < COLS);
  });
}

const gallery = document.getElementById("image-gallery");
const galleryImage = document.getElementById("gallery-image");
const galleryCell = document.getElementById("gallery-cell");
const galleryCounter = document.getElementById("gallery-counter");
let galleryIndex = 0;

const SERIES_IMAGES = [
  "../assets/img/CANCHA%20FUTBOL/grilla%207x10.png",
  "../assets/img/CANCHA%20FUTBOL/CANCHA%20VACIA.png",
  "../assets/img/CANCHA%20FUTBOL/cancha%20medidas.png",
];
const seriesPorCelda = Array.from({ length: ROWS * COLS }, () => SERIES_IMAGES);

function actualizarGaleria() {
  const serie = seriesPorCelda[zoneNumber(active.r, active.c) - 1] || SERIES_IMAGES;
  galleryImage.src = serie[galleryIndex];
  galleryImage.alt = `Imagen ${galleryIndex + 1} de la casilla ${zoneNumber(active.r, active.c)}`;
  galleryCell.textContent = `Casilla ${zoneNumber(active.r, active.c)} · Fila ${active.r + 1}, columna ${active.c + 1}`;
  galleryCounter.textContent = `${galleryIndex + 1} / ${serie.length}`;
}

function abrirGaleria() {
  galleryIndex = 0;
  actualizarGaleria();
  gallery.hidden = false;
}

function seleccionarCelda(r, c) {
  const dr = r - active.r;
  const dc = c - active.c;
  if (Math.abs(dr) + Math.abs(dc) === 1) CIA.mover(dr, dc);
  active = { r, c };
  tweenHighlightTo(cellCorners(r, c));
  refreshStatus();
  abrirGaleria();
}

document.getElementById("gallery-close").addEventListener("click", () => { gallery.hidden = true; });
document.getElementById("gallery-prev").addEventListener("click", () => {
  const serie = seriesPorCelda[zoneNumber(active.r, active.c) - 1] || SERIES_IMAGES;
  galleryIndex = (galleryIndex - 1 + serie.length) % serie.length;
  actualizarGaleria();
});
document.getElementById("gallery-next").addEventListener("click", () => {
  const serie = seriesPorCelda[zoneNumber(active.r, active.c) - 1] || SERIES_IMAGES;
  galleryIndex = (galleryIndex + 1) % serie.length;
  actualizarGaleria();
});

/* ---------------------------------------------------------------------- */
/* Estado / UI                                                            */
/* ---------------------------------------------------------------------- */
const zoneNumberEl = document.getElementById("zone-number");
const zoneCoordsEl = document.getElementById("zone-coords");
const zoneDescEl = document.getElementById("zone-desc");
const minimapLocationEl = document.getElementById("minimap-location");
const minimapCoordsEl = document.getElementById("minimap-coords");
const minimapZoneEl = document.getElementById("minimap-zone");
const minimapPlayersEl = document.getElementById("minimap-players");
const playerNameEl = document.getElementById("player-name");
const playerScoreEl = document.getElementById("player-score");
const playerHealthBarEl = document.getElementById("player-health-bar");
const playerHealthEl = document.getElementById("player-health");
const playerColorDotEl = document.getElementById("player-color-dot");
const playersListEl = document.getElementById("players-list");
const playersCountEl = document.getElementById("players-count");
const top5ListEl = document.getElementById("top5-list");

function refreshStatus() {
  const n = zoneNumber(active.r, active.c);
  zoneNumberEl.textContent = n;
  zoneNumberEl.classList.remove("pulse");
  void zoneNumberEl.offsetWidth;
  zoneNumberEl.classList.add("pulse");

  const coordsText = `Fila ${active.r + 1} · Columna ${active.c + 1}`;
  zoneCoordsEl.textContent = coordsText;
  zoneDescEl.textContent = `${zoneDescription(active.r, active.c)} · celda ${n} de ${ROWS * COLS}`;

  minimapLocationEl.style.left = `${(active.c / COLS) * 100}%`;
  minimapLocationEl.style.top = `${(active.r / ROWS) * 100}%`;
  minimapCoordsEl.textContent = coordsText;
  minimapZoneEl.textContent = `ZONA ${n} / ${ROWS * COLS}`;
}

function refreshMinimapMarkers() {
  minimapPlayersEl.innerHTML = "";
  jugadoresMap.forEach((j) => {
    if (!j.conectado) return;
    const dot = document.createElement("span");
    dot.className = "minimap-player-dot" + (j.id === miJugadorId ? " is-self" : "");
    dot.style.left = `${((j.columna + 0.5) / COLS) * 100}%`;
    dot.style.top = `${((j.fila + 0.5) / ROWS) * 100}%`;
    dot.style.background = paletaPorId[j.color] || "#999";
    dot.title = j.nombre;
    minimapPlayersEl.appendChild(dot);
  });
}

function renderPlayersList() {
  const conectados = [...jugadoresMap.values()].filter((j) => j.conectado);
  playersCountEl.textContent = conectados.length;
  playersListEl.innerHTML = "";
  conectados.forEach((j) => {
    const li = document.createElement("li");
    li.className = j.id === miJugadorId ? "is-self" : "";
    li.innerHTML = `<span class="color-dot" style="background:${paletaPorId[j.color] || "#999"}"></span>
      <span class="players-list-name">${j.nombre}${j.id === miJugadorId ? " (tú)" : ""}</span>
      <span class="players-list-health">${j.vida ?? 20}/20 HP</span>
      <span class="players-list-score">${j.score}</span>`;
    playersListEl.appendChild(li);
  });
  refreshMinimapMarkers();
}

function refreshOwnHealth(vida = 20) {
  const actual = Math.max(0, Math.min(20, vida));
  playerHealthBarEl.style.width = `${actual * 5}%`;
  playerHealthBarEl.style.background = actual <= 5 ? "#e23c2f" : actual <= 10 ? "#ef6c1a" : "#2f9e44";
  playerHealthEl.textContent = `${actual} / 20 HP`;
}

function renderTop5(top5) {
  top5ListEl.innerHTML = "";
  top5.forEach((j) => {
    const li = document.createElement("li");
    li.innerHTML = `<span class="color-dot" style="background:${paletaPorId[j.color] || "#999"}"></span>
      <span class="players-list-name">${j.nombre}</span>
      <span class="players-list-score">${j.score}</span>`;
    top5ListEl.appendChild(li);
  });
}

function applyOwnPosition(r, c) {
  active = { r, c };
  tweenHighlightTo(cellCorners(r, c));
  tweenViewportTo(viewportBBox(r, c));
  const jugador = jugadoresMap.get(miJugadorId);
  if (jugador) {
    jugador.fila = r;
    jugador.columna = c;
    actualizarMarcadorJugador(jugador);
  }
  refreshStatus();
  refreshMinimapMarkers();
}

function requestMove(dr, dc) {
  if (!dr && !dc) return;
  const nr = active.r + dr, nc = active.c + dc;
  if (nr < 0 || nr >= ROWS || nc < 0 || nc >= COLS) return;
  CIA.mover(dr, dc);
}

/* ---------------------------------------------------------------------- */
/* Arranque: reclamar sesión, pedir estado inicial, montar la escena      */
/* ---------------------------------------------------------------------- */
let miJugadorId = null;
let paletaPorId = {};
const jugadoresMap = new Map();

async function iniciar() {
  if (!CIA.obtenerSesion()) {
    window.location.href = "../index.html";
    return;
  }

  const respuesta = await CIA.reclamarSesion();
  if (!respuesta.ok) {
    CIA.borrarSesion();
    window.location.href = "../index.html";
    return;
  }

  miJugadorId = respuesta.jugadorId;
  const estado = respuesta.estado;
  estado.config.paleta.forEach((c) => { paletaPorId[c.id] = c.hex; });
  estado.jugadores.forEach((j) => jugadoresMap.set(j.id, j));

  const miJugador = jugadoresMap.get(miJugadorId);
  playerNameEl.textContent = miJugador.nombre;
  playerColorDotEl.style.background = paletaPorId[miJugador.color] || "#999";

  drawPitchTexture();
  drawGridLines();
  crearCeldas();
  estado.tablero.forEach(pintarCelda);
  jugadoresMap.forEach(actualizarMarcadorJugador);

  active = { r: miJugador.fila, c: miJugador.columna };
  highlightPts = cellCorners(active.r, active.c);
  highlightPoly.setAttribute("points", pointsToStr(highlightPts));
  currentBBox = viewportBBox(active.r, active.c);
  svg.setAttribute("viewBox", bboxToViewBox(currentBBox));
  refreshPanButtons();
  refreshStatus();

  playerScoreEl.textContent = miJugador.score;
  refreshOwnHealth(miJugador.vida);
  renderPlayersList();
  renderTop5(estado.top5);

  conectarEventos();
}

function conectarEventos() {
  CIA.socket.on("jugador_movido", ({ id, fila, columna }) => {
    const j = jugadoresMap.get(id);
    if (j) { j.fila = fila; j.columna = columna; }
    if (id === miJugadorId) {
      applyOwnPosition(fila, columna);
    } else if (j) {
      actualizarMarcadorJugador(j);
      refreshMinimapMarkers();
    }
  });

  CIA.socket.on("celda_actualizada", (celda) => pintarCelda(celda));

  CIA.socket.on("jugador_actualizado", (jugador) => {
    jugadoresMap.set(jugador.id, { ...jugadoresMap.get(jugador.id), ...jugador });
    if (jugador.id === miJugadorId) playerScoreEl.textContent = jugador.score;
    if (jugador.id === miJugadorId) refreshOwnHealth(jugador.vida);
    renderPlayersList();
  });

  CIA.socket.on("top5_actualizado", (top5) => renderTop5(top5));

  CIA.socket.on("jugador_nuevo", (jugador) => {
    jugadoresMap.set(jugador.id, jugador);
    actualizarMarcadorJugador(jugador);
    renderPlayersList();
  });

  CIA.socket.on("jugador_reconectado", (jugador) => {
    jugadoresMap.set(jugador.id, jugador);
    actualizarMarcadorJugador(jugador);
    renderPlayersList();
  });

  CIA.socket.on("jugador_desconectado", ({ id }) => {
    const j = jugadoresMap.get(id);
    if (j) j.conectado = false;
    actualizarMarcadorJugador(j || { id, conectado: false });
    renderPlayersList();
  });

  CIA.socket.on("estado_inicial", () => window.location.reload());
}

let ultimaDireccion = { dr: 0, dc: 1 };

document.addEventListener("keydown", (e) => {
  const moveMap = {
    ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right",
    KeyW: "up", KeyS: "down", KeyA: "left", KeyD: "right",
  };
  if (moveMap[e.code]) {
    e.preventDefault();
    const { dr, dc } = DIRS[moveMap[e.code]];
    ultimaDireccion = { dr, dc };
    requestMove(dr, dc);
    return;
  }
  if (e.code === "Escape") { gallery.hidden = true; return; }
  if (e.code === "KeyX") {
    e.preventDefault();
    CIA.marcar(zoneNumber(active.r, active.c), "X");
    CIA.atacar(ultimaDireccion.dr, ultimaDireccion.dc);
    return;
  }
  if (e.code === "KeyO") {
    e.preventDefault();
    CIA.marcar(zoneNumber(active.r, active.c), "O");
    CIA.defender();
    return;
  }
  if (e.code === "Space") { e.preventDefault(); CIA.cambiarColorCelda(zoneNumber(active.r, active.c)); return; }
});

document.getElementById("btn-mark-x").addEventListener("click", () => CIA.marcar(zoneNumber(active.r, active.c), "X"));
document.getElementById("btn-mark-o").addEventListener("click", () => CIA.marcar(zoneNumber(active.r, active.c), "O"));
document.getElementById("btn-color").addEventListener("click", () => CIA.cambiarColorCelda(zoneNumber(active.r, active.c)));
document.getElementById("btn-salir").addEventListener("click", () => {
  CIA.borrarSesion();
  window.location.href = "../index.html";
});

document.getElementById("minimap").addEventListener("click", (event) => {
  const bounds = event.currentTarget.getBoundingClientRect();
  const c = Math.min(COLS - 1, Math.floor(((event.clientX - bounds.left) / bounds.width) * COLS));
  const r = Math.min(ROWS - 1, Math.floor(((event.clientY - bounds.top) / bounds.height) * ROWS));
  requestMove(r - active.r, c - active.c);
});

iniciar();
