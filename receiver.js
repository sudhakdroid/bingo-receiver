const NAMESPACE = "urn:x-cast:com.nv.simplebingo";

const JUST_BORDER = "#FFC107";
const PREV_BORDER = "#BBDEFB";
const TEXT_ON_ACCENT = "#FFFFFF";
const TEXT_JUST_ON_ACCENT = "#FFECB3";

const context = cast.framework.CastReceiverContext.getInstance();
const options = new cast.framework.CastReceiverOptions();
options.disableIdleTimeout = true;

const root = document.getElementById("root");
const titleEl = document.getElementById("title");
const numberEl = document.getElementById("number");
const phraseEl = document.getElementById("phrase");
const countdownEl = document.getElementById("countdown");
const countdownFillEl = document.getElementById("countdownFill");
const boardEl = document.getElementById("board");
const boardWrap = document.getElementById("boardWrap");

/** Pixel gap between grid cells — must match `.board-grid { gap }` in index.html */
const BOARD_GAP_PX = 4;

/** Last cast payload — used to refit the grid on resize */
let lastPayload = null;

function clampToPercent(value, max) {
  if (max <= 0) return 0;
  return Math.max(0, Math.min(100, (value / max) * 100));
}

function parseCalledSet(payload) {
  const raw = payload.calledNumbers;
  if (raw == null) return new Set();
  if (Array.isArray(raw)) {
    return new Set(raw.map((x) => Number(x)).filter((n) => Number.isFinite(n)));
  }
  if (typeof raw === "string") {
    return new Set(
      raw
        .split(",")
        .map((s) => parseInt(String(s).trim(), 10))
        .filter((n) => !Number.isNaN(n))
    );
  }
  return new Set();
}

function appendCell75(grid, n, calledSet, just, prev, accent, neutral, onSurf) {
  const called = calledSet.has(n);
  const isJust = called && just != null && n === just;
  const isPrev = called && prev != null && n === prev && !isJust;
  const div = document.createElement("div");
  div.className = "cell";
  div.textContent = String(n);
  if (called) {
    div.classList.add("called");
    div.style.background = accent;
    if (isJust) {
      div.classList.add("just-called");
      div.style.color = TEXT_JUST_ON_ACCENT;
      div.style.borderColor = JUST_BORDER;
      div.style.borderWidth = "2px";
    } else if (isPrev) {
      div.classList.add("previous-called");
      div.style.color = TEXT_ON_ACCENT;
      div.style.borderColor = PREV_BORDER;
      div.style.borderWidth = "1.5px";
    } else {
      div.style.color = TEXT_ON_ACCENT;
      div.style.borderColor = "transparent";
    }
  } else {
    div.style.background = neutral;
    div.style.color = onSurf;
    div.style.borderColor = "transparent";
  }
  grid.appendChild(div);
}

function renderBoard75(payload, accent, neutral, onSurf) {
  const calledSet = parseCalledSet(payload);
  const just = payload.justCalled;
  const prev = payload.previousCalled;
  const grid = document.createElement("div");
  grid.className = "board-grid";
  "BINGO".split("").forEach((letter) => {
    const h = document.createElement("div");
    h.className = "cell header-letter";
    h.textContent = letter;
    h.style.background = accent;
    h.style.color = TEXT_ON_ACCENT;
    h.style.borderColor = "transparent";
    grid.appendChild(h);
  });
  for (let row = 0; row < 15; row++) {
    for (let col = 0; col < 5; col++) {
      const n = col * 15 + row + 1;
      appendCell75(grid, n, calledSet, just, prev, accent, neutral, onSurf);
    }
  }
  boardEl.replaceChildren(grid);
}

function appendCell10(grid, n, bingoSize, calledSet, just, prev, accent, neutral, outR, onSurf) {
  const inRange = n <= bingoSize;
  const div = document.createElement("div");
  div.className = "cell";
  if (!inRange) {
    div.style.background = outR;
    div.style.borderColor = "transparent";
    div.textContent = "";
    grid.appendChild(div);
    return;
  }
  const called = calledSet.has(n);
  const isJust = called && just != null && n === just;
  const isPrev = called && prev != null && n === prev && !isJust;
  div.textContent = String(n);
  if (called) {
    div.classList.add("called");
    div.style.background = accent;
    if (isJust) {
      div.classList.add("just-called");
      div.style.color = TEXT_JUST_ON_ACCENT;
      div.style.borderColor = JUST_BORDER;
      div.style.borderWidth = "2px";
    } else if (isPrev) {
      div.classList.add("previous-called");
      div.style.color = TEXT_ON_ACCENT;
      div.style.borderColor = PREV_BORDER;
      div.style.borderWidth = "1.5px";
    } else {
      div.style.color = TEXT_ON_ACCENT;
      div.style.borderColor = "transparent";
    }
  } else {
    div.style.background = neutral;
    div.style.color = onSurf;
    div.style.borderColor = "transparent";
  }
  grid.appendChild(div);
}

function renderBoard10(payload, accent, neutral, outR, onSurf) {
  const bingoSize = payload.bingoSize;
  const calledSet = parseCalledSet(payload);
  const just = payload.justCalled;
  const prev = payload.previousCalled;
  const numRows = Math.ceil(bingoSize / 10);
  const grid = document.createElement("div");
  grid.className = "board-grid";
  for (let row = 0; row < numRows; row++) {
    for (let col = 0; col < 10; col++) {
      const n = row * 10 + col + 1;
      appendCell10(grid, n, bingoSize, calledSet, just, prev, accent, neutral, outR, onSurf);
    }
  }
  boardEl.replaceChildren(grid);
}

function renderBoard(payload, accent, neutral, outR, onSurf) {
  if (typeof payload.bingoSize !== "number" || payload.bingoSize <= 0) {
    boardEl.replaceChildren();
    return;
  }
  if (payload.bingoSize === 75) {
    renderBoard75(payload, accent, neutral, onSurf);
  } else {
    renderBoard10(payload, accent, neutral, outR, onSurf);
  }
}

/**
 * Size the grid so the full board fits inside #boardWrap (no clipping).
 * Uses min(cellW, cellH) so rows×cols always fit the available rectangle.
 */
function fitBoardGrid() {
  const grid = boardEl.querySelector(".board-grid");
  if (!grid || !boardWrap || !lastPayload) return;
  const bingoSize = lastPayload.bingoSize;
  if (typeof bingoSize !== "number" || bingoSize <= 0) return;

  let cols;
  let rows;
  if (bingoSize === 75) {
    cols = 5;
    rows = 16;
  } else {
    cols = 10;
    rows = Math.ceil(bingoSize / 10);
  }

  const gap = BOARD_GAP_PX;
  const w = boardWrap.clientWidth;
  const h = boardWrap.clientHeight;
  if (w < 4 || h < 4) return;

  const cellW = (w - gap * (cols - 1)) / cols;
  const cellH = (h - gap * (rows - 1)) / rows;
  let cell = Math.floor(Math.min(cellW, cellH));
  cell = Math.max(6, cell);

  const totalW = cell * cols + gap * (cols - 1);
  const totalH = cell * rows + gap * (rows - 1);

  grid.style.gridTemplateColumns = `repeat(${cols}, ${cell}px)`;
  grid.style.gridTemplateRows = `repeat(${rows}, ${cell}px)`;
  grid.style.width = `${totalW}px`;
  grid.style.height = `${totalH}px`;
  grid.style.margin = "0 auto";

  const fontSize = Math.max(7, Math.min(22, cell * 0.36));
  const headerFont = Math.max(8, Math.min(24, cell * 0.4));

  grid.querySelectorAll(".cell").forEach((el) => {
    el.style.width = `${cell}px`;
    el.style.height = `${cell}px`;
    el.style.boxSizing = "border-box";
    el.style.fontSize = el.classList.contains("header-letter") ? `${headerFont}px` : `${fontSize}px`;
  });
}

function scheduleFitBoard() {
  requestAnimationFrame(() => {
    requestAnimationFrame(() => fitBoardGrid());
  });
}

function applyCallerState(payload) {
  lastPayload = payload;
  const number =
    payload.number && String(payload.number).trim().length > 0
      ? String(payload.number).trim()
      : "";
  numberEl.textContent = number;

  const phraseText = payload.phrase ? String(payload.phrase).trim() : "";
  phraseEl.textContent = phraseText;
  phraseEl.style.display = phraseText.length > 0 ? "block" : "none";

  const accent = payload.accent || "#6A1B9A";
  const neutral = payload.neutralTile || "#1e1e1e";
  const outR = payload.outOfRange || "#2d2d2d";
  const onSurf = payload.onSurface || "#e3e3e3";
  const pageBg = payload.pageBg || "#111111";

  const titleText = payload.title != null ? String(payload.title).trim() : "";
  titleEl.textContent = titleText;
  titleEl.style.color = accent;

  countdownFillEl.style.backgroundColor = accent;

  if (payload.auto === true && typeof payload.countdownSec === "number" && payload.countdownSec > 0) {
    countdownEl.style.display = "block";
    const totalSec =
      typeof payload.countdownTotalSec === "number" && payload.countdownTotalSec > 0
        ? payload.countdownTotalSec
        : 12;
    const percent = clampToPercent(payload.countdownSec, totalSec);
    countdownFillEl.style.width = `${percent}%`;
  } else {
    countdownEl.style.display = "none";
    countdownFillEl.style.width = "0%";
  }

  root.style.background = `radial-gradient(circle at top, ${hexWithAlpha(accent, 0.2)}, ${pageBg} 60%)`;

  renderBoard(payload, accent, neutral, outR, onSurf);
  scheduleFitBoard();
}

function hexWithAlpha(hex, alpha) {
  const m = String(hex).match(/^#([0-9a-fA-F]{6})$/);
  if (!m) return `rgba(106, 27, 154, ${alpha})`;
  const r = parseInt(m[1].slice(0, 2), 16);
  const g = parseInt(m[1].slice(2, 4), 16);
  const b = parseInt(m[1].slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

function parseCustomPayload(raw) {
  if (raw == null) return null;
  if (typeof raw === "object" && !Array.isArray(raw)) return raw;
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }
  return null;
}

context.addCustomMessageListener(NAMESPACE, (event) => {
  const payload = parseCustomPayload(event.data);
  if (payload != null && payload.v == 1) {
    applyCallerState(payload);
  }
});

context.start(options);

if (typeof ResizeObserver !== "undefined" && boardWrap) {
  new ResizeObserver(() => scheduleFitBoard()).observe(boardWrap);
}
