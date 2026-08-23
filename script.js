/* ==========================================================================
   CANCHA — viewport de navegación 7×10, modo local (un jugador, sin servidor)
   --------------------------------------------------------------------------
   La cancha se ve en perspectiva, así que su área es un trapezoide y la
   grilla 7×10 se calcula por interpolación bilineal de sus 4 esquinas (cada
   celda hereda la deformación real de la perspectiva). Esta versión no
   depende de Socket.IO ni de un backend: todo el estado (posición, marcas
   X/O, color de celda, casillas visitadas) vive en memoria del navegador.
   ========================================================================== */

const SVG_NS = "http://www.w3.org/2000/svg";
const svg = document.getElementById("pitch-svg");

const ROWS = 7;
const COLS = 10;
const FIXED_VIEWBOX = "0 0 1000 562.5";

const QUAD = {
  TL: { x: 165, y: 145 },
  TR: { x: 835, y: 145 },
  BL: { x: 165, y: 479 },
  BR: { x: 835, y: 479 },
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
const sceneGroup     = el("g", { class: "scene-group" }, svg);
const turfGroup       = el("g", {}, sceneGroup);
const paintGroup      = el("g", {}, sceneGroup);
const cellsGroup      = el("g", {}, sceneGroup);
const markGroup       = el("g", {}, sceneGroup);
const highlightGroup  = el("g", {}, sceneGroup);
const playersGroup    = el("g", {}, sceneGroup);
const movementGroup   = el("g", { class: "movement-controls" }, sceneGroup);

function drawPitchTexture() {
  const defs = el("defs", {}, svg);
  const clip = el("clipPath", { id: "field-clip" }, defs);
  el("polygon", { points: pointsToStr([QUAD.TL, QUAD.TR, QUAD.BR, QUAD.BL]) }, clip);
  el("image", {
    href: "assets/img/grilla%207x10.png",
    x: 0, y: 0, width: 1000, height: 562.5,
    preserveAspectRatio: "none",
    "clip-path": "url(#field-clip)",
  }, turfGroup);
}

/* ---------------------------------------------------------------------- */
/* Celdas: capa de pintura (color), capa de golpe (clic) y capa de marca  */
/* (X/O) — 70 = 7×10, una de cada por celda.                              */
/* ---------------------------------------------------------------------- */
const PALETA = ["#e23c2f", "#2f6a8f", "#2f9e44", "#f2bd57", "#8a4fd6"];
const paintPolys = [];
const markTexts = [];
const cellState = Array.from({ length: ROWS * COLS }, () => ({ colorIdx: -1, marca: "" }));

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

function pintarCelda(idx) {
  const estado = cellState[idx];
  const hex = estado.colorIdx >= 0 ? PALETA[estado.colorIdx] : null;
  paintPolys[idx].setAttribute("fill", hex || "transparent");
  paintPolys[idx].style.opacity = hex ? "0.55" : "0";
  markTexts[idx].textContent = estado.marca || "";
}

function marcarCelda(zona, simbolo) {
  const idx = zona - 1;
  cellState[idx].marca = cellState[idx].marca === simbolo ? "" : simbolo;
  pintarCelda(idx);
}

function cambiarColorCelda(zona) {
  const idx = zona - 1;
  cellState[idx].colorIdx = (cellState[idx].colorIdx + 2) % (PALETA.length + 1) - 1;
  pintarCelda(idx);
}

/* ---------------------------------------------------------------------- */
/* Marcador del jugador local sobre el SVG                                */
/* ---------------------------------------------------------------------- */
const PERSONAJE_SRC = "assets/img/ORANGE.png";
let playerMarker = null;

function actualizarMarcadorJugador(r, c) {
  const centro = cellCenter(r, c);
  if (!playerMarker) {
    playerMarker = el("image", {
      width: 34, height: 34, class: "player-marker",
      href: PERSONAJE_SRC, preserveAspectRatio: "xMidYMid meet",
    }, playersGroup);
  }
  playerMarker.setAttribute("x", centro.x - 17);
  playerMarker.setAttribute("y", centro.y - 17);
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
    const valid = active.r + dr >= 0 && active.r + dr < ROWS && active.c + dc >= 0 && active.c + dc < COLS;
    movementButtons[direction].classList.toggle("is-disabled", !valid);
  });
}

/* ---------------------------------------------------------------------- */
/* Selección de la casilla activa + animación del recuadro                */
/* ---------------------------------------------------------------------- */
let active = { r: 3, c: 4 };
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
  animate(300, (t) => {
    const cur = fromPts.map((p, i) => lerp(p, newPts[i], t));
    highlightPoly.setAttribute("points", pointsToStr(cur));
  }, () => { highlightPts = newPts; });
}

/* ---------------------------------------------------------------------- */
/* Galería de imágenes de la casilla                                      */
/* ---------------------------------------------------------------------- */
const gallery = document.getElementById("image-gallery");
const galleryImage = document.getElementById("gallery-image");
const galleryCell = document.getElementById("gallery-cell");
const galleryCounter = document.getElementById("gallery-counter");
let galleryIndex = 0;

const SERIES_IMAGES = ["assets/img/grilla%207x10.png"];

function actualizarGaleria() {
  galleryImage.src = SERIES_IMAGES[galleryIndex];
  galleryImage.alt = `Imagen ${galleryIndex + 1} de la casilla ${zoneNumber(active.r, active.c)}`;
  galleryCell.textContent = `Casilla ${zoneNumber(active.r, active.c)} · Fila ${active.r + 1}, columna ${active.c + 1}`;
  galleryCounter.textContent = `${galleryIndex + 1} / ${SERIES_IMAGES.length}`;
}

document.getElementById("gallery-close").addEventListener("click", () => { gallery.hidden = true; });
document.getElementById("gallery-prev").addEventListener("click", () => {
  galleryIndex = (galleryIndex - 1 + SERIES_IMAGES.length) % SERIES_IMAGES.length;
  actualizarGaleria();
});
document.getElementById("gallery-next").addEventListener("click", () => {
  galleryIndex = (galleryIndex + 1) % SERIES_IMAGES.length;
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
const visitedCountEl = document.getElementById("visited-count");

const visited = new Set();

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

  visited.add(n);
  visitedCountEl.textContent = `${visited.size} / ${ROWS * COLS}`;
}

function applyOwnPosition(r, c) {
  active = { r, c };
  tweenHighlightTo(cellCorners(r, c));
  actualizarMarcadorJugador(r, c);
  refreshStatus();
  refreshMovementButtons();
}

function requestMove(dr, dc) {
  if (!dr && !dc) return;
  const nr = active.r + dr, nc = active.c + dc;
  if (nr < 0 || nr >= ROWS || nc < 0 || nc >= COLS) return;
  applyOwnPosition(nr, nc);
}

/* ---------------------------------------------------------------------- */
/* Arranque: montar la escena localmente, sin servidor                    */
/* ---------------------------------------------------------------------- */
function iniciar() {
  drawPitchTexture();
  crearCeldas();
  actualizarMarcadorJugador(active.r, active.c);

  highlightPts = cellCorners(active.r, active.c);
  highlightPoly.setAttribute("points", pointsToStr(highlightPts));
  svg.setAttribute("viewBox", FIXED_VIEWBOX);
  svg.setAttribute("preserveAspectRatio", "xMidYMid meet");

  refreshStatus();
  refreshMovementButtons();
}

document.addEventListener("keydown", (e) => {
  const moveMap = {
    ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right",
    KeyW: "up", KeyS: "down", KeyA: "left", KeyD: "right",
  };
  if (moveMap[e.code]) {
    e.preventDefault();
    const { dr, dc } = DIRS[moveMap[e.code]];
    requestMove(dr, dc);
    return;
  }
  if (e.code === "Escape") { gallery.hidden = true; return; }
  if (e.code === "KeyX") { e.preventDefault(); marcarCelda(zoneNumber(active.r, active.c), "X"); return; }
  if (e.code === "KeyO") { e.preventDefault(); marcarCelda(zoneNumber(active.r, active.c), "O"); return; }
  if (e.code === "Space") { e.preventDefault(); cambiarColorCelda(zoneNumber(active.r, active.c)); return; }
  if (e.code === "KeyG") { e.preventDefault(); galleryIndex = 0; actualizarGaleria(); gallery.hidden = false; return; }
});

document.getElementById("btn-mark-x").addEventListener("click", () => marcarCelda(zoneNumber(active.r, active.c), "X"));
document.getElementById("btn-mark-o").addEventListener("click", () => marcarCelda(zoneNumber(active.r, active.c), "O"));
document.getElementById("btn-color").addEventListener("click", () => cambiarColorCelda(zoneNumber(active.r, active.c)));

document.getElementById("minimap").addEventListener("click", (event) => {
  const bounds = event.currentTarget.getBoundingClientRect();
  const c = Math.min(COLS - 1, Math.floor(((event.clientX - bounds.left) / bounds.width) * COLS));
  const r = Math.min(ROWS - 1, Math.floor(((event.clientY - bounds.top) / bounds.height) * ROWS));
  requestMove(r - active.r, c - active.c);
});

iniciar();
