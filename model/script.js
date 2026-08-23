/* ==========================================================================
  CANCHA — viewport de navegación 12×9, modo local (un jugador, sin servidor)
   --------------------------------------------------------------------------
  La cancha se representa como una grilla exacta de 12×9. Esta versión no
   depende de Socket.IO ni de un backend: todo el estado (posición, marcas
   X/O, color de celda, casillas visitadas) vive en memoria del navegador.
   ========================================================================== */

const SVG_NS = "http://www.w3.org/2000/svg";
const svg = document.getElementById("pitch-svg");

const ROWS = 9;
const COLS = 12;
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
const pitchGroup      = el("g", {}, sceneGroup);
const frameGroup      = el("g", {}, sceneGroup);
const gridGroup       = el("g", {}, sceneGroup);
const greenBorderGroup = el("g", {}, sceneGroup);
const specialLinesGroup = el("g", {}, sceneGroup);
const paintGroup      = el("g", {}, sceneGroup);
const cellsGroup      = el("g", {}, sceneGroup);
const markGroup       = el("g", {}, sceneGroup);
const highlightGroup  = el("g", {}, sceneGroup);
const playersGroup    = el("g", {}, sceneGroup);
const pickupGroup     = el("g", {}, sceneGroup);
const samplePlayersGroup = el("g", {}, sceneGroup);
const labelsGroup     = el("g", {}, sceneGroup);
const movementGroup   = el("g", { class: "movement-controls" }, sceneGroup);

function dibujarCancha() {
  el("rect", { x: 0, y: 0, width: 1672, height: 941, class: "pitch-surface" }, pitchGroup);
  for (let r = 0; r <= ROWS; r++) {
    const left = quadPoint(0, r / ROWS);
    const right = quadPoint(1, r / ROWS);
    const lineClass = r === 0 || r === ROWS ? "grid-line grid-line-outer" : "grid-line";
    el("line", { x1: left.x, y1: left.y, x2: right.x, y2: right.y, class: lineClass }, gridGroup);
  }
  for (let c = 0; c <= COLS; c++) {
    const top = quadPoint(c / COLS, 0);
    const bottom = quadPoint(c / COLS, 1);
    const lineClass = c === 0 || c === COLS
      ? "grid-line grid-line-outer"
      : c === 6 ? "grid-line grid-line-middle" : "grid-line";
    el("line", { x1: top.x, y1: top.y, x2: bottom.x, y2: bottom.y, class: lineClass }, gridGroup);
  }
  const greenTopLeft = quadPoint(1 / COLS, 1 / ROWS);
  const greenBottomRight = quadPoint((COLS - 1) / COLS, (ROWS - 1) / ROWS);
  el("rect", {
    x: greenTopLeft.x,
    y: greenTopLeft.y,
    width: greenBottomRight.x - greenTopLeft.x,
    height: greenBottomRight.y - greenTopLeft.y,
    class: "green-border",
  }, greenBorderGroup);
  const magentaLineStart = quadPoint(1 / COLS, 4.5 / ROWS);
  const magentaLineEnd = quadPoint((COLS - 1) / COLS, 4.5 / ROWS);
  el("line", {
    x1: magentaLineStart.x,
    y1: magentaLineStart.y,
    x2: magentaLineEnd.x,
    y2: magentaLineEnd.y,
    class: "magenta-row-line",
  }, specialLinesGroup);
  const centerPoint = quadPoint(6 / COLS, 4.5 / ROWS);
  const centerCell = cellCorners(4, 5);
  const centerCellWidth = centerCell[1].x - centerCell[0].x;
  const centerCellHeight = centerCell[3].y - centerCell[0].y;
  el("circle", {
    cx: centerPoint.x,
    cy: centerPoint.y,
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
      x1: edgePoints[0].x,
      y1: edgePoints[0].y,
      x2: edgePoints[1].x,
      y2: edgePoints[1].y,
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
      x1: sideStart.x,
      y1: sideStart.y,
      x2: sideEnd.x,
      y2: sideEnd.y,
      class: "yellow-side-line",
    }, specialLinesGroup);
  });
}

/* ---------------------------------------------------------------------- */
/* Celdas: capa de pintura (color), capa de golpe (clic) y capa de marca  */
/* (X/O) — 108 = 12×9, una de cada por celda.                              */
/* ---------------------------------------------------------------------- */
const PALETA = ["#e23c2f", "#2f6a8f", "#2f9e44", "#f2bd57", "#8a4fd6"];
const paintPolys = [];
const markTexts = [];
const labelTexts = [];
const cellState = Array.from({ length: ROWS * COLS }, () => ({ colorIdx: -1, marca: "" }));

function cellLabel(r, c) {
  return `${String.fromCharCode(65 + c)}${r + 1}`;
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

function crearCeldas() {
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const idx = zoneNumber(r, c) - 1;
      if (isOuterFrameCell(r, c)) {
        el("polygon", { points: pointsToStr(cellCorners(r, c)), class: "outer-frame-cell" }, frameGroup);
      }

      const paint = el("polygon", { points: pointsToStr(cellCorners(r, c)), class: "cell-paint" }, paintGroup);
      paintPolys[idx] = paint;

      const hit = el("polygon", { points: pointsToStr(cellCorners(r, c)), class: "cell-hit" }, cellsGroup);
      hit.addEventListener("click", () => requestMove(r - active.r, c - active.c));

      const center = cellCenter(r, c);
      const mark = el("text", { x: center.x, y: center.y, class: "cell-mark", "text-anchor": "middle", "dominant-baseline": "central" }, markGroup);
      markTexts[idx] = mark;

      const labelCorner = cellCorners(r, c)[0];
      const label = el("text", {
        x: labelCorner.x + 8,
        y: labelCorner.y + 23,
        class: "cell-label",
        "aria-label": `Casilla ${displayCellLabel(r, c)}`,
      }, labelsGroup);
      label.textContent = displayCellLabel(r, c);
      labelTexts[idx] = label;
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
const PERSONAJE_SRC = "../assets/img/pj/PERSONAJE/ORANGE.png";
let playerMarker = null;
let navigationPoint = null;

function actualizarMarcadorJugador(r, c) {
  const centro = cellCenter(r, c);
  const corners = cellCorners(r, c);
  const cellWidth = corners[1].x - corners[0].x;
  const cellHeight = corners[3].y - corners[0].y;
  if (!navigationPoint) {
    navigationPoint = el("circle", { r: 12, class: "navigation-point" }, playersGroup);
  }
  navigationPoint.setAttribute("cx", centro.x);
  navigationPoint.setAttribute("cy", centro.y);
  if (!playerMarker) {
    playerMarker = el("image", {
      class: "player-marker", href: PERSONAJE_SRC,
      preserveAspectRatio: "none",
    }, playersGroup);
  }
  playerMarker.setAttribute("x", corners[0].x);
  playerMarker.setAttribute("y", corners[0].y);
  playerMarker.setAttribute("width", cellWidth);
  playerMarker.setAttribute("height", cellHeight);
  playersGroup.appendChild(navigationPoint);
}

/* ---------------------------------------------------------------------- */
/* Objeto "balón" / pickup object (PO): círculo que ocupa una casilla.    */
/* Al caminar el personaje sobre su casilla, el objeto se atrapa y queda  */
/* fijo a la posición de quien lo recogió.                                */
/* ---------------------------------------------------------------------- */
let pickupObject = null;

function dibujarPickupObject(r, c) {
  const center = cellCenter(r, c);
  const corners = cellCorners(r, c);
  const radius = Math.min(corners[1].x - corners[0].x, corners[3].y - corners[0].y) * 0.18;
  pickupObject = {
    r, c,
    atrapado: false,
    el: el("circle", {
      cx: center.x, cy: center.y, r: radius,
      class: "pickup-object",
      "aria-label": "Objeto balón",
    }, pickupGroup),
  };
}

function actualizarPickupObject() {
  if (!pickupObject || pickupObject.atrapado) return;
  if (active.r === pickupObject.r && active.c === pickupObject.c) {
    pickupObject.atrapado = true;
    pickupObject.el.classList.add("is-pickup-caught");
  }
}

function dibujarJugadoresDeMuestra() {
  const samples = [
    { row: 1, column: 2, color: "#2f6a8f", image: "BLUE.png", name: "Ana Ríos" },
    { row: 2, column: 8, color: "#2f9e44", image: "GREEN.png", name: "Mateo Gómez" },
    { row: 6, column: 5, color: "#d946ef", image: "PINK.png", name: "Sofía León" },
  ];
  samples.forEach(({ row, column, color, image, name }) => {
    const corners = cellCorners(row, column);
    const inset = 10;
    el("rect", {
      x: corners[0].x + inset,
      y: corners[0].y + inset,
      width: corners[1].x - corners[0].x - inset * 2,
      height: corners[3].y - corners[0].y - inset * 2,
      rx: 8,
      fill: color,
      class: "sample-player-backdrop",
      "aria-label": `${name}, jugador de muestra`,
    }, samplePlayersGroup);
    el("image", {
      x: corners[0].x + inset,
      y: corners[0].y + inset,
      width: corners[1].x - corners[0].x - inset * 2,
      height: corners[3].y - corners[0].y - inset * 2,
      href: `../assets/img/pj/PERSONAJE/${image}`,
      preserveAspectRatio: "xMidYMid meet",
      class: "sample-player-image",
      "aria-label": name,
    }, samplePlayersGroup);
  });
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
  Object.entries(DIRS).forEach(([direction, { dr, dc }]) => {
    const neighbor = {
      r: active.r + dr,
      c: active.c + dc,
    };
    const center = cellCenter(active.r, active.c);
    const neighborCenter = cellCenter(
      Math.max(0, Math.min(ROWS - 1, neighbor.r)),
      Math.max(0, Math.min(COLS - 1, neighbor.c)),
    );
    const position = {
      x: (center.x + neighborCenter.x) / 2 - 14,
      y: (center.y + neighborCenter.y) / 2 - 14,
    };
    movementButtons[direction].setAttribute("transform", `translate(${position.x} ${position.y})`);
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

const SERIES_IMAGES = ["../assets/img/CANCHA%20FUTBOL/grilla%207x10.png"];

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
const playersCountEl = document.getElementById("players-count");
const playerBottomNameEl = document.getElementById("player-bottom-name");
const playerBottomScoreEl = document.getElementById("player-bottom-score");
const playerBottomImageEl = document.getElementById("player-bottom-image");
const playerColorChoiceEl = document.getElementById("player-color-choice");
const top5ListEl = document.getElementById("top5-list");
const footerScoreEl = document.getElementById("footer-score");

const visited = new Set();
let golScore = 0;

function sumarGol() {
  golScore += 5;
  refreshStatus();
}

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
  const puntaje = golScore;
  visitedCountEl.textContent = `${visited.size} / ${ROWS * COLS}`;
  playerBottomNameEl.innerHTML = "Jugador<br>local";
  playerBottomScoreEl.textContent = puntaje;
  footerScoreEl.textContent = puntaje;
  playerBottomImageEl.src = PERSONAJE_SRC;
  playerColorChoiceEl.style.backgroundColor = "#f97316";
  top5ListEl.innerHTML = [
    [1, "Jugador local", puntaje],
    [2, "Ana Ríos", 0],
    [3, "Mateo Gómez", 0],
    [4, "Sofía León", 0],
  ].map(([position, name, score]) => `<tr><td>${position}</td><td>${name}</td><td class="score-value">${score}</td></tr>`).join("");
}

function applyOwnPosition(r, c) {
  active = { r, c };
  tweenHighlightTo(cellCorners(r, c));
  actualizarMarcadorJugador(r, c);
  actualizarPickupObject();
  if (pickupObject && pickupObject.atrapado) {
    const center = cellCenter(r, c);
    pickupObject.el.setAttribute("cx", center.x);
    pickupObject.el.setAttribute("cy", center.y);
  }
  refreshStatus();
  refreshMovementButtons();
}

let lastDirection = { dr: 0, dc: 1 };

function requestMove(dr, dc) {
  if (!dr && !dc) return;
  const nr = active.r + dr, nc = active.c + dc;
  if (nr < 0 || nr >= ROWS || nc < 0 || nc >= COLS) return;
  lastDirection = { dr: Math.sign(dr), dc: Math.sign(dc) };
  applyOwnPosition(nr, nc);
}

/* ---------------------------------------------------------------------- */
/* Disparo del balón: X lo desplaza 2 casillas en la dirección de flecha  */
/* sostenida, o en la última dirección usada, a 1 casilla por decisegundo.*/
/* ---------------------------------------------------------------------- */
const DISTANCIA_DISPARO = 2;
const VELOCIDAD_MS = 100; // 1 casilla por decisegundo
const FILA_LINEA_META = 4;
const PUNTOS_POR_GOL = 5;

function cruzaLineaDeMeta(r, c) {
  return r === FILA_LINEA_META && (c === 0 || c === COLS - 1);
}

function liberarBalon(dr, dc) {
  if (!pickupObject || !pickupObject.atrapado || pickupObject.enMovimiento) return;
  if (!dr && !dc) return;
  pickupObject.atrapado = false;
  pickupObject.enMovimiento = true;
  pickupObject.el.classList.remove("is-pickup-caught");

  let pasos = 0;
  let yaAnotoEsteDisparo = false;
  function paso() {
    const nr = pickupObject.r + dr, nc = pickupObject.c + dc;
    if (pasos >= DISTANCIA_DISPARO || nr < 0 || nr >= ROWS || nc < 0 || nc >= COLS) {
      pickupObject.enMovimiento = false;
      actualizarPickupObject();
      return;
    }
    pickupObject.r = nr;
    pickupObject.c = nc;
    const centro = cellCenter(nr, nc);
    pickupObject.el.setAttribute("cx", centro.x);
    pickupObject.el.setAttribute("cy", centro.y);
    if (!yaAnotoEsteDisparo && cruzaLineaDeMeta(nr, nc)) {
      yaAnotoEsteDisparo = true;
      sumarGol();
    }
    pasos += 1;
    setTimeout(paso, VELOCIDAD_MS);
  }
  paso();
}

/* ---------------------------------------------------------------------- */
/* Arranque: montar la escena localmente, sin servidor                    */
/* ---------------------------------------------------------------------- */
function iniciar() {
  dibujarCancha();
  crearCeldas();
  dibujarJugadoresDeMuestra();
  dibujarPickupObject(4, 6);
  actualizarMarcadorJugador(active.r, active.c);
  actualizarPickupObject();

  highlightPts = cellCorners(active.r, active.c);
  highlightPoly.setAttribute("points", pointsToStr(highlightPts));
  svg.setAttribute("viewBox", FIXED_VIEWBOX);
  svg.setAttribute("preserveAspectRatio", "none");

  refreshStatus();
  refreshMovementButtons();
}

const heldArrows = new Set();
const ARROW_CODES = { ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right" };

document.addEventListener("keydown", (e) => {
  const moveMap = {
    ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right",
    KeyW: "up", KeyS: "down", KeyA: "left", KeyD: "right",
  };
  if (ARROW_CODES[e.code]) heldArrows.add(ARROW_CODES[e.code]);
  if (moveMap[e.code]) {
    e.preventDefault();
    const { dr, dc } = DIRS[moveMap[e.code]];
    requestMove(dr, dc);
    return;
  }
  if (e.code === "Escape") { gallery.hidden = true; return; }
  if (e.code === "KeyX") {
    e.preventDefault();
    if (pickupObject && pickupObject.atrapado) {
      const direccion = heldArrows.size ? DIRS[[...heldArrows].pop()] : lastDirection;
      liberarBalon(direccion.dr, direccion.dc);
    }
    return;
  }
  if (e.code === "KeyO") { e.preventDefault(); marcarCelda(zoneNumber(active.r, active.c), "O"); return; }
  if (e.code === "Space") { e.preventDefault(); cambiarColorCelda(zoneNumber(active.r, active.c)); return; }
  if (e.code === "KeyG") { e.preventDefault(); galleryIndex = 0; actualizarGaleria(); gallery.hidden = false; return; }
});

document.addEventListener("keyup", (e) => {
  if (ARROW_CODES[e.code]) heldArrows.delete(ARROW_CODES[e.code]);
});

const minimap = document.getElementById("minimap");
if (minimap) {
  minimap.addEventListener("click", (event) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    const c = Math.min(COLS - 1, Math.floor(((event.clientX - bounds.left) / bounds.width) * COLS));
    const r = Math.min(ROWS - 1, Math.floor(((event.clientY - bounds.top) / bounds.height) * ROWS));
    requestMove(r - active.r, c - active.c);
  });
}

iniciar();
