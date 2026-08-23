/* ==========================================================================
   CANCHA MULTIJUGADOR — grilla interactiva 7×10 sincronizada por Socket.IO,
   con marco decorativo Ω de 38 casillas y foto aérea de fondo.
   --------------------------------------------------------------------------
   La geometría se calcula en un espacio de 9 filas × 12 columnas: la fila 0,
   la fila 8, la columna 0 y la columna 11 forman el marco Ω (decorativo, sin
   clic ni celdaId). El interior (filas 1-7 × columnas 1-10) ES el tablero
   jugable de siempre — 70 celdas, celdaId 1-70, exactamente el mismo
   contrato que ya usa el servidor (game-server/gameState.js: ROWS=7,
   COLS=10). Por eso `active` (la celda del jugador local) se guarda en
   coordenadas "exteriores" (r∈[1,7], c∈[1,10]) y solo se le resta 1 a cada
   eje cuando hace falta hablar con el servidor o indexar celdaId.

   El resto del estado (posición de los demás jugadores, score, TOP) llega
   y se sincroniza en vivo desde el servidor — esta página no decide nada
   por su cuenta, solo pide acciones y pinta lo que el servidor confirma.
   Marcar casillas, pintar celdas y el sistema de combate (atacar/defender/
   vida) existían en versiones anteriores pero ya no forman parte del
   juego: la única mecánica es moverse y lanzar los balones.

   Los dos balones (pickup objects: blanco 5 pts, amarillo 7 pts) son la
   única forma de sumar puntaje. Su posición/atrapada/lanzamiento es
   FASE 1 — solo local, cada jugador ve y atrapa sus propios balones, no
   sincronizados entre pantallas todavía (eso es fase 2). Pero cuando un
   balón cruza la línea de meta, el cliente sí le avisa al servidor
   ("anotar_gol") y el servidor valida y suma esos puntos al score real
   del jugador — eso ya está sincronizado y se refleja en el TOP para
   todos.
   ========================================================================== */

const SVG_NS = "http://www.w3.org/2000/svg";
const svg = document.getElementById("pitch-svg");

const ROWS = 9;
const COLS = 12;
const INNER_ROWS = 7;
const INNER_COLS = 10;
const FIXED_VIEWBOX = "0 0 1672 941";

const QUAD = {
  TL: { x: 0, y: 0 },
  TR: { x: 1672, y: 0 },
  BL: { x: 0, y: 941 },
  BR: { x: 1672, y: 941 },
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

function pointsToStr(points) {
  return points.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
}

function el(tag, attrs = {}, parent) {
  const node = document.createElementNS(SVG_NS, tag);
  for (const k in attrs) node.setAttribute(k, attrs[k]);
  if (parent) parent.appendChild(node);
  return node;
}

/* celdaId 1-70 del tablero jugable, a partir de coordenadas EXTERIORES
   (r∈[1,7], c∈[1,10]) — coincide exactamente con lo que espera el
   servidor (fila*10+columna+1 en su espacio interior 0-based). */
function zoneNumber(r, c) { return (r - 1) * INNER_COLS + (c - 1) + 1; }

const ROW_THIRDS = ["fondo", "mediocampo", "frente"];
const COL_THIRDS = ["banda izquierda", "centro", "banda derecha"];
function zoneDescription(r, c) {
  const rowLabel = ROW_THIRDS[Math.min(2, Math.floor(((r - 1) / INNER_ROWS) * 3))];
  const colLabel = COL_THIRDS[Math.min(2, Math.floor(((c - 1) / INNER_COLS) * 3))];
  return `${colLabel} — ${rowLabel}`;
}

function isOuterFrameCell(r, c) {
  return r === 0 || r === ROWS - 1 || c === 0 || c === COLS - 1;
}
function outerFrameNumber(r, c) {
  if (r === 0) return c + 1;
  if (c === COLS - 1) return COLS + r;
  if (r === ROWS - 1) return COLS + ROWS - 1 + (COLS - 1 - c);
  return COLS + ROWS - 1 + COLS - 1 + (ROWS - 1 - r);
}
function displayCellLabel(r, c) {
  if (isOuterFrameCell(r, c)) return `Ω${outerFrameNumber(r, c)}`;
  return `${String.fromCharCode(65 + c - 1)}${r}`;
}

/* ---------------------------------------------------------------------- */
/* Grupos base                                                            */
/* ---------------------------------------------------------------------- */
const sceneGroup       = el("g", { class: "scene-group" }, svg);
const pitchGroup        = el("g", {}, sceneGroup);
const specialLinesGroup = el("g", {}, sceneGroup);
const cellsGroup        = el("g", {}, sceneGroup);
const labelsGroup       = el("g", {}, sceneGroup);
const highlightGroup    = el("g", {}, sceneGroup);
const playersGroup      = el("g", {}, sceneGroup);
const pickupGroup       = el("g", {}, sceneGroup);
const movementGroup     = el("g", { class: "movement-controls" }, sceneGroup);

/* ---------------------------------------------------------------------- */
/* Cancha: foto aérea de fondo + capas vectoriales que la foto no trae     */
/* (borde verde, línea central, línea de área, semicírculos, línea de     */
/* meta amarilla).                                                        */
/* ---------------------------------------------------------------------- */
function dibujarCancha() {
  el("image", {
    href: "../assets/img/CANCHA%20FUTBOL/vista%20aerea.png",
    x: 0, y: 0, width: 1672, height: 941,
    preserveAspectRatio: "none",
    class: "pitch-photo",
  }, pitchGroup);

  const greenTopLeft = quadPoint(1 / COLS, 1 / ROWS);
  const greenBottomRight = quadPoint((COLS - 1) / COLS, (ROWS - 1) / ROWS);
  el("rect", {
    x: greenTopLeft.x,
    y: greenTopLeft.y,
    width: greenBottomRight.x - greenTopLeft.x,
    height: greenBottomRight.y - greenTopLeft.y,
    class: "green-border",
  }, specialLinesGroup);

  const magentaLineStart = quadPoint(1 / COLS, 4.5 / ROWS);
  const magentaLineEnd = quadPoint((COLS - 1) / COLS, 4.5 / ROWS);
  el("line", {
    x1: magentaLineStart.x, y1: magentaLineStart.y,
    x2: magentaLineEnd.x, y2: magentaLineEnd.y,
    class: "magenta-row-line",
  }, specialLinesGroup);

  const centerPoint = quadPoint(6 / COLS, 4.5 / ROWS);
  const centerCell = cellCorners(4, 5);
  const centerCellWidth = centerCell[1].x - centerCell[0].x;
  const centerCellHeight = centerCell[3].y - centerCell[0].y;
  el("circle", {
    cx: centerPoint.x, cy: centerPoint.y,
    r: Math.min(centerCellWidth, centerCellHeight),
    class: "center-cell-circle",
  }, specialLinesGroup);

  const customWhiteSegments = [
    { row: 3, column: 10, edge: "top" },
    { row: 3, column: 10, edge: "left" },
    { row: 4, column: 10, edge: "left" },
    { row: 5, column: 10, edge: "left" },
    { row: 5, column: 10, edge: "bottom" },
  ];
  const mirroredWhiteSegments = customWhiteSegments.map(({ row, column, edge }) => ({
    row,
    column: 11 - column,
    edge: edge === "left" ? "right" : edge === "right" ? "left" : edge,
  }));
  [...customWhiteSegments, ...mirroredWhiteSegments].forEach(({ row, column, edge }) => {
    const corners = cellCorners(row, column);
    const edgePoints = {
      top: [corners[0], corners[1]],
      right: [corners[1], corners[2]],
      bottom: [corners[3], corners[2]],
      left: [corners[0], corners[3]],
    }[edge];
    el("line", {
      x1: edgePoints[0].x, y1: edgePoints[0].y,
      x2: edgePoints[1].x, y2: edgePoints[1].y,
      class: "custom-white-line",
    }, specialLinesGroup);
  });

  const areaArcSpecs = [{ row: 4, column: 10, edge: "left" }];
  const mirroredAreaArcSpecs = areaArcSpecs.map(({ row, column, edge }) => ({
    row,
    column: 11 - column,
    edge: edge === "left" ? "right" : "left",
  }));
  [...areaArcSpecs, ...mirroredAreaArcSpecs].forEach(({ row, column, edge }) => {
    const corners = cellCorners(row, column);
    const [top, bottom] = edge === "left" ? [corners[0], corners[3]] : [corners[1], corners[2]];
    const radius = (bottom.y - top.y) / 2;
    const sweep = edge === "left" ? 0 : 1;
    const d = `M ${top.x.toFixed(1)},${top.y.toFixed(1)} A ${radius.toFixed(1)},${radius.toFixed(1)} 0 0,${sweep} ${bottom.x.toFixed(1)},${bottom.y.toFixed(1)}`;
    el("path", { d, class: "area-arc" }, specialLinesGroup);
  });

  [
    { row: 4, column: 1 },
    { row: 4, column: COLS - 2 },
  ].forEach(({ row, column }, index) => {
    const corners = cellCorners(row, column);
    const sideStart = corners[index === 0 ? 0 : 1];
    const sideEnd = corners[index === 0 ? 3 : 2];
    el("line", {
      x1: sideStart.x, y1: sideStart.y,
      x2: sideEnd.x, y2: sideEnd.y,
      class: "yellow-side-line",
    }, specialLinesGroup);
  });
}

/* Etiquetas del marco Ω: puramente decorativas, sin cell-hit ni celdaId. */
function dibujarMarcoDecorativo() {
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (!isOuterFrameCell(r, c)) continue;
      const labelCorner = cellCorners(r, c)[0];
      const label = el("text", {
        x: labelCorner.x + 8, y: labelCorner.y + 23,
        class: "cell-label",
        "aria-label": `Casilla ${displayCellLabel(r, c)}`,
      }, labelsGroup);
      label.textContent = displayCellLabel(r, c);
    }
  }
}

/* ---------------------------------------------------------------------- */
/* Celdas jugables: capa de golpe (clic para moverse) — 70 = 7×10. Solo   */
/* el interior de la grilla (filas 1-7, columnas 1-10) es interactivo.    */
/* ---------------------------------------------------------------------- */
function crearCeldas() {
  for (let r = 1; r <= INNER_ROWS; r++) {
    for (let c = 1; c <= INNER_COLS; c++) {
      const hit = el("polygon", { points: pointsToStr(cellCorners(r, c)), class: "cell-hit" }, cellsGroup);
      hit.addEventListener("click", () => requestMove(r - active.r, c - active.c));

      const labelCorner = cellCorners(r, c)[0];
      const label = el("text", {
        x: labelCorner.x + 8, y: labelCorner.y + 23,
        class: "cell-label",
        "aria-label": `Casilla ${displayCellLabel(r, c)}`,
      }, labelsGroup);
      label.textContent = displayCellLabel(r, c);
    }
  }
}

/* ---------------------------------------------------------------------- */
/* Marcadores de los demás jugadores sobre el propio SVG                  */
/* ---------------------------------------------------------------------- */
const marcadoresJugadores = new Map();
const PERSONAJE_SRC = (personaje) => `../assets/img/pj/PERSONAJE/${personaje || "BLUE"}.png`;
const MARCADOR_ZOOM = 1.35; // compensa el margen transparente de los PNG de personaje

function actualizarMarcadorJugador(jugador) {
  let marcador = marcadoresJugadores.get(jugador.id);
  if (!jugador.conectado) {
    if (marcador) { marcador.remove(); marcadoresJugadores.delete(jugador.id); }
    return;
  }
  const r = jugador.fila + 1, c = jugador.columna + 1;
  const centro = cellCenter(r, c);
  const corners = cellCorners(r, c);
  const cellWidth = (corners[1].x - corners[0].x) * MARCADOR_ZOOM;
  const cellHeight = (corners[3].y - corners[0].y) * MARCADOR_ZOOM;
  if (!marcador) {
    marcador = el("image", { class: "player-marker" }, playersGroup);
    marcadoresJugadores.set(jugador.id, marcador);
  }
  marcador.setAttribute("x", centro.x - cellWidth / 2);
  marcador.setAttribute("y", centro.y - cellHeight / 2);
  marcador.setAttribute("width", cellWidth);
  marcador.setAttribute("height", cellHeight);
  marcador.setAttribute("href", PERSONAJE_SRC(jugador.personaje));
  marcador.setAttribute("preserveAspectRatio", "xMidYMid meet");
}

/* ---------------------------------------------------------------------- */
/* Objetos "balón" / pickup objects — FASE 1: solo locales, no             */
/* sincronizados entre jugadores ni persistidos en el servidor. Cada      */
/* balón tiene su propia distancia de disparo y puntos por gol; ese       */
/* puntaje solo alimenta la ventana de recompensa local, nunca el score   */
/* real del jugador (ese sigue siendo 100% autoridad del servidor).       */
/* ---------------------------------------------------------------------- */
const pickups = [];

function crearGradientesPickup() {
  const defs = el("defs", {}, svg);

  const blanco = el("radialGradient", { id: "pickup-gradient-blanco", cx: "35%", cy: "32%", r: "70%" }, defs);
  el("stop", { offset: "0%", "stop-color": "#ffffff" }, blanco);
  el("stop", { offset: "55%", "stop-color": "#dfe2e5" }, blanco);
  el("stop", { offset: "100%", "stop-color": "#8a9096" }, blanco);

  const amarillo = el("radialGradient", { id: "pickup-gradient-amarillo", cx: "35%", cy: "32%", r: "70%" }, defs);
  el("stop", { offset: "0%", "stop-color": "#fffbe0" }, amarillo);
  el("stop", { offset: "55%", "stop-color": "#f4df16" }, amarillo);
  el("stop", { offset: "100%", "stop-color": "#a8860a" }, amarillo);
}

function crearPickup({ r, c, forma, colorClase, puntosPorGol, distanciaDisparo, etiqueta }) {
  const center = cellCenter(r, c);
  const corners = cellCorners(r, c);
  const radioBase = Math.min(corners[1].x - corners[0].x, corners[3].y - corners[0].y) * 0.18;
  const clase = `pickup-object ${colorClase}`;
  const elemento = forma === "ovalo"
    ? el("ellipse", { cx: center.x, cy: center.y, rx: radioBase * 1.4, ry: radioBase * 0.85, class: clase, "aria-label": etiqueta }, pickupGroup)
    : el("circle", { cx: center.x, cy: center.y, r: radioBase, class: clase, "aria-label": etiqueta }, pickupGroup);

  pickups.push({ r, c, atrapado: false, enMovimiento: false, el: elemento, puntosPorGol, distanciaDisparo });
}

function actualizarPickups() {
  pickups.forEach((pickup) => {
    if (pickup.atrapado) return;
    if (active.r === pickup.r && active.c === pickup.c) {
      pickup.atrapado = true;
      pickup.el.classList.add("is-pickup-caught");
    }
  });
}

const VELOCIDAD_MS = 100; // 1 casilla por decisegundo
const FILA_LINEA_META = 4;

function cruzaLineaDeMeta(r, c) {
  return r === FILA_LINEA_META && (c === 0 || c === COLS - 1);
}

function dispararPickup(pickup, dr, dc) {
  if (!pickup.atrapado || pickup.enMovimiento) return;
  if (!dr && !dc) return;
  pickup.atrapado = false;
  pickup.enMovimiento = true;
  pickup.el.classList.remove("is-pickup-caught");

  let pasos = 0;
  let yaAnotoEsteDisparo = false;
  function paso() {
    const nr = pickup.r + dr, nc = pickup.c + dc;
    if (pasos >= pickup.distanciaDisparo || nr < 0 || nr >= ROWS || nc < 0 || nc >= COLS) {
      pickup.enMovimiento = false;
      actualizarPickups();
      return;
    }
    pickup.r = nr;
    pickup.c = nc;
    const centro = cellCenter(nr, nc);
    pickup.el.setAttribute("cx", centro.x);
    pickup.el.setAttribute("cy", centro.y);
    if (!yaAnotoEsteDisparo && cruzaLineaDeMeta(nr, nc)) {
      yaAnotoEsteDisparo = true;
      sumarGol(pickup.puntosPorGol);
    }
    pasos += 1;
    setTimeout(paso, VELOCIDAD_MS);
  }
  paso();
}

function dispararAtrapados(dr, dc) {
  pickups.filter((pickup) => pickup.atrapado && !pickup.enMovimiento).forEach((pickup) => dispararPickup(pickup, dr, dc));
}

/* ---------------------------------------------------------------------- */
/* Ventana de recompensa local (20 / 30 / 50 / 100 puntos de balón)       */
/* ---------------------------------------------------------------------- */
let golScore = 0;
const UMBRALES_RECOMPENSA = [20, 30, 50, 100];
const recompensasMostradas = new Set();
const rewardModalEl = document.getElementById("reward-modal");
const rewardModalSubEl = document.getElementById("reward-modal-sub");
const rewardModalCloseEl = document.getElementById("reward-modal-close");
rewardModalCloseEl.addEventListener("click", () => { rewardModalEl.hidden = true; });

function verificarRecompensas() {
  const umbral = UMBRALES_RECOMPENSA.find((u) => golScore >= u && !recompensasMostradas.has(u));
  if (!umbral) return;
  recompensasMostradas.add(umbral);
  rewardModalSubEl.textContent = `Llegaste a ${umbral} puntos.`;
  rewardModalEl.hidden = false;
}

function sumarGol(puntos) {
  golScore += puntos;
  verificarRecompensas();
  CIA.anotarGol(puntos);
}

/* ---------------------------------------------------------------------- */
/* Botones de movimiento contextuales alrededor de la celda activa        */
/* ---------------------------------------------------------------------- */
const DIRS = {
  up: { dr: -1, dc: 0 }, down: { dr: 1, dc: 0 },
  left: { dr: 0, dc: -1 }, right: { dr: 0, dc: 1 },
};

const movementButtons = {};
const movementButtonShapes = {
  up: "12,0 24,14 16,14 16,28 8,28 8,14 0,14",
  down: "8,0 16,0 16,14 24,14 12,28 0,14 8,14",
  left: "0,12 14,0 14,8 28,8 28,16 14,16 14,24",
  right: "0,8 14,8 14,0 28,12 14,24 14,16 0,16",
};

Object.entries(movementButtonShapes).forEach(([direction, points]) => {
  const button = el("g", { class: "movement-button", role: "button", tabindex: "0", "aria-label": `Mover ${direction}` }, movementGroup);
  el("polygon", { points }, button);
  button.addEventListener("click", () => requestMove(DIRS[direction].dr, DIRS[direction].dc));
  button.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") requestMove(DIRS[direction].dr, DIRS[direction].dc);
  });
  movementButtons[direction] = button;
});

function refreshMovementButtons() {
  const center = cellCenter(active.r, active.c);
  const positions = {
    up: { x: center.x - 14, y: center.y - 57 },
    down: { x: center.x - 14, y: center.y + 29 },
    left: { x: center.x - 57, y: center.y - 14 },
    right: { x: center.x + 29, y: center.y - 14 },
  };
  Object.entries(positions).forEach(([direction, position]) => {
    movementButtons[direction].setAttribute("transform", `translate(${position.x} ${position.y})`);
    const { dr, dc } = DIRS[direction];
    const valid = active.r + dr >= 1 && active.r + dr <= INNER_ROWS && active.c + dc >= 1 && active.c + dc <= INNER_COLS;
    movementButtons[direction].classList.toggle("is-disabled", !valid);
  });
}

/* ---------------------------------------------------------------------- */
/* Selección de la casilla activa (en coordenadas EXTERIORES)             */
/* ---------------------------------------------------------------------- */
let active = { r: 4, c: 5 };
let highlightPts = cellCorners(active.r, active.c);
const highlightPoly = el("polygon", { class: "highlight-box", points: pointsToStr(highlightPts) }, highlightGroup);

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
const seriesPorCelda = Array.from({ length: INNER_ROWS * INNER_COLS }, () => SERIES_IMAGES);

function actualizarGaleria() {
  const serie = seriesPorCelda[zoneNumber(active.r, active.c) - 1] || SERIES_IMAGES;
  galleryImage.src = serie[galleryIndex];
  galleryImage.alt = `Imagen ${galleryIndex + 1} de la casilla ${zoneNumber(active.r, active.c)}`;
  galleryCell.textContent = `Casilla ${zoneNumber(active.r, active.c)} · Fila ${active.r}, columna ${active.c}`;
  galleryCounter.textContent = `${galleryIndex + 1} / ${serie.length}`;
}

function abrirGaleria() {
  galleryIndex = 0;
  actualizarGaleria();
  gallery.hidden = false;
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
const footerScoreEl = document.getElementById("footer-score");
const samplePlayersEl = document.getElementById("sample-players");
const top5ListEl = document.getElementById("top5-list");
const characterPhotoImageEl = document.getElementById("character-photo-image");
const characterPhotoRegisteredEl = document.getElementById("character-photo-registered");
const characterPhotoCharacterEl = document.getElementById("character-photo-character");

function refreshStatus() {
  const n = zoneNumber(active.r, active.c);
  zoneNumberEl.textContent = n;
  zoneNumberEl.classList.remove("pulse");
  void zoneNumberEl.offsetWidth;
  zoneNumberEl.classList.add("pulse");

  const coordsText = `Fila ${active.r} · Columna ${active.c}`;
  zoneCoordsEl.textContent = coordsText;
  zoneDescEl.textContent = `${zoneDescription(active.r, active.c)} · celda ${n} de ${INNER_ROWS * INNER_COLS}`;

  minimapLocationEl.style.left = `${((active.c - 1) / INNER_COLS) * 100}%`;
  minimapLocationEl.style.top = `${((active.r - 1) / INNER_ROWS) * 100}%`;
  minimapCoordsEl.textContent = coordsText;
  minimapZoneEl.textContent = `ZONA ${n} / ${INNER_ROWS * INNER_COLS}`;
}

function refreshMinimapMarkers() {
  minimapPlayersEl.innerHTML = "";
  jugadoresMap.forEach((j) => {
    if (!j.conectado) return;
    const dot = document.createElement("span");
    dot.className = "minimap-player-dot" + (j.id === miJugadorId ? " is-self" : "");
    dot.style.left = `${((j.columna + 0.5) / INNER_COLS) * 100}%`;
    dot.style.top = `${((j.fila + 0.5) / INNER_ROWS) * 100}%`;
    dot.style.background = paletaPorId[j.color] || "#999";
    dot.title = j.nombre;
    minimapPlayersEl.appendChild(dot);
  });
}

function renderPlayersRoster() {
  const conectados = [...jugadoresMap.values()].filter((j) => j.conectado);
  samplePlayersEl.innerHTML = "";
  conectados.forEach((j) => {
    const hex = paletaPorId[j.color] || "#999";
    const esSelf = j.id === miJugadorId;
    const card = document.createElement("div");
    card.className = "player-bottom-card" + (esSelf ? " is-self" : "");
    card.innerHTML = `
      <div class="player-image-frame" style="border-color:${hex};background:${hex}">
        <span class="player-color-choice" style="background:${hex}"></span>
        <img src="${PERSONAJE_SRC(j.personaje)}" alt="Personaje de ${j.nombre}">
      </div>
      <div class="player-bottom-name"><span>${j.nombre}</span><span>${esSelf ? "(tú)" : ""}</span></div>
      <div class="player-bottom-score"><span>Score</span><strong>${j.score}</strong></div>`;
    samplePlayersEl.appendChild(card);
  });
  refreshMinimapMarkers();
}

function renderTop5(top5) {
  top5ListEl.innerHTML = "";
  top5.forEach((j, index) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td>${index + 1}</td><td>${j.nombre}</td><td class="score-value">${j.score}</td>`;
    top5ListEl.appendChild(tr);
  });
}

function applyOwnPosition(r, c) {
  active = { r, c };
  tweenHighlightTo(cellCorners(r, c));
  const jugador = jugadoresMap.get(miJugadorId);
  if (jugador) {
    jugador.fila = r - 1;
    jugador.columna = c - 1;
    actualizarMarcadorJugador(jugador);
  }
  actualizarPickups();
  const center = cellCenter(r, c);
  pickups.forEach((pickup) => {
    if (!pickup.atrapado) return;
    pickup.el.setAttribute("cx", center.x);
    pickup.el.setAttribute("cy", center.y);
  });
  refreshStatus();
  refreshMovementButtons();
  refreshMinimapMarkers();
}

function requestMove(dr, dc) {
  if (!dr && !dc) return;
  const nr = active.r + dr, nc = active.c + dc;
  if (nr < 1 || nr > INNER_ROWS || nc < 1 || nc > INNER_COLS) return;
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
  characterPhotoImageEl.src = PERSONAJE_SRC(miJugador.personaje);
  characterPhotoRegisteredEl.textContent = miJugador.nombre;
  characterPhotoCharacterEl.textContent = miJugador.personaje;

  dibujarCancha();
  dibujarMarcoDecorativo();
  crearCeldas();
  crearGradientesPickup();
  crearPickup({ r: 4, c: 6, forma: "circulo", colorClase: "pickup-blanco", puntosPorGol: 5, distanciaDisparo: 2, etiqueta: "Objeto balón" });
  crearPickup({ r: 4, c: 5, forma: "ovalo", colorClase: "pickup-amarillo", puntosPorGol: 7, distanciaDisparo: 3, etiqueta: "Objeto balón ovalado" });
  jugadoresMap.forEach(actualizarMarcadorJugador);

  active = { r: miJugador.fila + 1, c: miJugador.columna + 1 };
  highlightPts = cellCorners(active.r, active.c);
  highlightPoly.setAttribute("points", pointsToStr(highlightPts));
  svg.setAttribute("viewBox", FIXED_VIEWBOX);
  svg.setAttribute("preserveAspectRatio", "xMidYMid meet");
  refreshStatus();
  refreshMovementButtons();
  actualizarPickups();

  footerScoreEl.textContent = miJugador.score;
  renderPlayersRoster();
  renderTop5(estado.top5);

  conectarEventos();
}

function conectarEventos() {
  CIA.socket.on("jugador_movido", ({ id, fila, columna }) => {
    const j = jugadoresMap.get(id);
    if (j) { j.fila = fila; j.columna = columna; }
    if (id === miJugadorId) {
      applyOwnPosition(fila + 1, columna + 1);
    } else if (j) {
      actualizarMarcadorJugador(j);
      refreshMinimapMarkers();
    }
  });

  CIA.socket.on("jugador_actualizado", (jugador) => {
    jugadoresMap.set(jugador.id, { ...jugadoresMap.get(jugador.id), ...jugador });
    if (jugador.id === miJugadorId) footerScoreEl.textContent = jugador.score;
    renderPlayersRoster();
  });

  CIA.socket.on("top5_actualizado", (top5) => renderTop5(top5));

  CIA.socket.on("jugador_nuevo", (jugador) => {
    jugadoresMap.set(jugador.id, jugador);
    actualizarMarcadorJugador(jugador);
    renderPlayersRoster();
  });

  CIA.socket.on("jugador_reconectado", (jugador) => {
    jugadoresMap.set(jugador.id, jugador);
    actualizarMarcadorJugador(jugador);
    renderPlayersRoster();
  });

  CIA.socket.on("jugador_desconectado", ({ id }) => {
    const j = jugadoresMap.get(id);
    if (j) j.conectado = false;
    actualizarMarcadorJugador(j || { id, conectado: false });
    renderPlayersRoster();
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
    if (pickups.some((pickup) => pickup.atrapado)) {
      dispararAtrapados(ultimaDireccion.dr, ultimaDireccion.dc);
    }
    return;
  }
});

document.getElementById("btn-salir").addEventListener("click", () => {
  CIA.borrarSesion();
  window.location.href = "../index.html";
});

document.getElementById("minimap").addEventListener("click", (event) => {
  const bounds = event.currentTarget.getBoundingClientRect();
  const c = Math.min(INNER_COLS - 1, Math.floor(((event.clientX - bounds.left) / bounds.width) * INNER_COLS));
  const r = Math.min(INNER_ROWS - 1, Math.floor(((event.clientY - bounds.top) / bounds.height) * INNER_ROWS));
  requestMove((r + 1) - active.r, (c + 1) - active.c);
});

iniciar();
