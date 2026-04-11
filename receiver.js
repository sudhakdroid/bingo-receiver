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
const castWatermarkEl = document.getElementById("castWatermark");

/** Match app caller stage: only animate when number changes. */
let lastNumberAnimationKey = null;

/** Pixel gap between grid cells — must match `.board-grid { gap }` in index.html */
const BOARD_GAP_PX = 4;

/** Last cast payload — used to refit the grid on resize */
let lastPayload = null;

/** Cached board: avoid replacing the whole grid on every draw (only rebuild when bingoSize changes). */
let boardCache = { bingoSize: null, grid: null };

function clampToPercent(value, max) {
  if (max <= 0) return 0;
  return Math.max(0, Math.min(100, (value / max) * 100));
}

function hexToRgb(hex) {
  const m = String(hex || "").match(/^#([0-9a-fA-F]{6})$/);
  if (!m) return null;
  return {
    r: parseInt(m[1].slice(0, 2), 16),
    g: parseInt(m[1].slice(2, 4), 16),
    b: parseInt(m[1].slice(4, 6), 16),
  };
}

function relativeLuminance(hex) {
  const rgb = hexToRgb(hex);
  if (!rgb) return 0;
  const toLinear = (v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  const r = toLinear(rgb.r);
  const g = toLinear(rgb.g);
  const b = toLinear(rgb.b);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrastRatio(hexA, hexB) {
  const l1 = relativeLuminance(hexA);
  const l2 = relativeLuminance(hexB);
  const hi = Math.max(l1, l2);
  const lo = Math.min(l1, l2);
  return (hi + 0.05) / (lo + 0.05);
}

function pickReadableForeground(preferred, fallbackLight, fallbackDark, bg) {
  if (contrastRatio(preferred, bg) >= 3.1) return preferred;
  const lightContrast = contrastRatio(fallbackLight, bg);
  const darkContrast = contrastRatio(fallbackDark, bg);
  return lightContrast >= darkContrast ? fallbackLight : fallbackDark;
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

function styleCell75(el, n, calledSet, just, prev, accent, neutral, onSurf) {
  el.className = "cell";
  el.textContent = String(n);
  const called = calledSet.has(n);
  const isJust = called && just != null && n === just;
  const isPrev = called && prev != null && n === prev && !isJust;
  if (called) {
    el.classList.add("called");
    el.style.background = accent;
    if (isJust) {
      el.classList.add("just-called");
      el.style.color = TEXT_JUST_ON_ACCENT;
      el.style.borderColor = JUST_BORDER;
      el.style.borderWidth = "2px";
    } else if (isPrev) {
      el.classList.add("previous-called");
      el.style.color = TEXT_ON_ACCENT;
      el.style.borderColor = PREV_BORDER;
      el.style.borderWidth = "1.5px";
    } else {
      el.style.color = TEXT_ON_ACCENT;
      el.style.borderColor = "transparent";
    }
  } else {
    el.style.background = neutral;
    el.style.color = onSurf;
    el.style.borderColor = "transparent";
  }
}

function styleCell10(el, n, bingoSize, calledSet, just, prev, accent, neutral, outR, onSurf) {
  const inRange = n <= bingoSize;
  el.className = "cell";
  if (!inRange) {
    el.style.background = outR;
    el.style.borderColor = "transparent";
    el.textContent = "";
    return;
  }
  el.textContent = String(n);
  const called = calledSet.has(n);
  const isJust = called && just != null && n === just;
  const isPrev = called && prev != null && n === prev && !isJust;
  if (called) {
    el.classList.add("called");
    el.style.background = accent;
    if (isJust) {
      el.classList.add("just-called");
      el.style.color = TEXT_JUST_ON_ACCENT;
      el.style.borderColor = JUST_BORDER;
      el.style.borderWidth = "2px";
    } else if (isPrev) {
      el.classList.add("previous-called");
      el.style.color = TEXT_ON_ACCENT;
      el.style.borderColor = PREV_BORDER;
      el.style.borderWidth = "1.5px";
    } else {
      el.style.color = TEXT_ON_ACCENT;
      el.style.borderColor = "transparent";
    }
  } else {
    el.style.background = neutral;
    el.style.color = onSurf;
    el.style.borderColor = "transparent";
  }
}

function buildBoard75(payload, accent, neutral, onSurf) {
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
      const div = document.createElement("div");
      styleCell75(div, n, calledSet, just, prev, accent, neutral, onSurf);
      grid.appendChild(div);
    }
  }
  return grid;
}

function buildBoard10(payload, accent, neutral, outR, onSurf) {
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
      const div = document.createElement("div");
      styleCell10(div, n, bingoSize, calledSet, just, prev, accent, neutral, outR, onSurf);
      grid.appendChild(div);
    }
  }
  return grid;
}

function updateBoard75(grid, payload, accent, neutral, onSurf) {
  const calledSet = parseCalledSet(payload);
  const just = payload.justCalled;
  const prev = payload.previousCalled;
  const cells = grid.querySelectorAll(".cell");
  for (let ci = 5; ci < cells.length; ci++) {
    const idx = ci - 5;
    const row = Math.floor(idx / 5);
    const col = idx % 5;
    const n = col * 15 + row + 1;
    styleCell75(cells[ci], n, calledSet, just, prev, accent, neutral, onSurf);
  }
}

function updateBoard10(grid, payload, accent, neutral, outR, onSurf) {
  const bingoSize = payload.bingoSize;
  const calledSet = parseCalledSet(payload);
  const just = payload.justCalled;
  const prev = payload.previousCalled;
  const cells = grid.querySelectorAll(".cell");
  cells.forEach((el, idx) => {
    const row = Math.floor(idx / 10);
    const col = idx % 10;
    const n = row * 10 + col + 1;
    styleCell10(el, n, bingoSize, calledSet, just, prev, accent, neutral, outR, onSurf);
  });
}

function renderBoard(payload, accent, neutral, outR, onSurf) {
  if (typeof payload.bingoSize !== "number" || payload.bingoSize <= 0) {
    boardEl.replaceChildren();
    boardCache = { bingoSize: null, grid: null };
    return;
  }

  const bs = payload.bingoSize;
  const gridStillMounted =
    boardCache.grid &&
    boardCache.bingoSize === bs &&
    boardCache.grid.parentNode === boardEl;

  if (gridStillMounted) {
    if (bs === 75) {
      updateBoard75(boardCache.grid, payload, accent, neutral, onSurf);
    } else {
      updateBoard10(boardCache.grid, payload, accent, neutral, outR, onSurf);
    }
    return;
  }

  const grid = bs === 75 ? buildBoard75(payload, accent, neutral, onSurf) : buildBoard10(payload, accent, neutral, outR, onSurf);
  boardEl.replaceChildren(grid);
  boardCache = { bingoSize: bs, grid };
  fitBoardGrid();
}

/**
 * Size the grid so the full board fits inside #boardWrap (no clipping).
 * Uses min(cellW, cellH) so rows×cols always fit the available rectangle.
 */
/** Re-run number-only reveal (phrase/countdown remain static). */
function maybePlayNumberReveal(numberStr) {
  if (!numberEl) return;
  const key = String(numberStr || "");
  if (key === lastNumberAnimationKey) return;
  lastNumberAnimationKey = key;
  if (!numberStr || numberStr.length === 0) {
    numberEl.classList.remove("number-reveal");
    return;
  }
  numberEl.classList.remove("number-reveal");
  void numberEl.offsetWidth;
  numberEl.classList.add("number-reveal");
}

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

  maybePlayNumberReveal(number);

  const accent = payload.accent || "#6A1B9A";
  const neutral = payload.neutralTile || "#1e1e1e";
  const outR = payload.outOfRange || "#2d2d2d";
  const onSurf = payload.onSurface || "#e3e3e3";
  const pageBg = payload.pageBg || "#111111";
  const onSurfaceVariant = payload.onSurfaceVariant || onSurf;
  const surface = payload.surface || pageBg;
  const bgIsDark = typeof payload.isDarkTheme === "boolean"
    ? payload.isDarkTheme
    : relativeLuminance(pageBg) < 0.36;

  const titleText = payload.title != null ? String(payload.title).trim() : "";
  titleEl.textContent = titleText;
  const heroColor = pickReadableForeground(accent, "#FFFFFF", "#111111", pageBg);
  const titleColor = pickReadableForeground(accent, onSurf, "#1A1A1A", pageBg);
  titleEl.style.color = titleColor;
  titleEl.style.textShadow = `0 2px 12px ${hexWithAlpha(heroColor, bgIsDark ? 0.32 : 0.18)}`;

  numberEl.style.color = heroColor;
  numberEl.style.textShadow = `0 4px 38px ${hexWithAlpha(heroColor, bgIsDark ? 0.42 : 0.22)}`;

  if (castWatermarkEl) {
    castWatermarkEl.style.color = accent;
    castWatermarkEl.style.opacity = "0.26";
  }

  phraseEl.style.color = onSurfaceVariant && String(onSurfaceVariant).trim().length > 0 ? onSurfaceVariant : "#e3e3e3";

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

  if (bgIsDark) {
    root.style.background = [
      `radial-gradient(circle at 50% 18%, ${hexWithAlpha(accent, 0.34)} 0%, ${hexWithAlpha(accent, 0.14)} 36%, transparent 70%)`,
      `linear-gradient(180deg, ${hexWithAlpha(surface, 0.96)} 0%, ${hexWithAlpha(pageBg, 1)} 56%, ${hexWithAlpha(pageBg, 1)} 100%)`,
      `radial-gradient(circle at 50% 92%, ${hexWithAlpha(accent, 0.16)} 0%, transparent 62%)`
    ].join(",");
  } else {
    root.style.background = [
      `linear-gradient(180deg, ${hexWithAlpha(surface, 1)} 0%, ${hexWithAlpha(pageBg, 1)} 42%, ${hexWithAlpha(pageBg, 1)} 100%)`,
      `radial-gradient(circle at 50% 12%, ${hexWithAlpha(accent, 0.14)} 0%, ${hexWithAlpha(accent, 0.06)} 30%, transparent 58%)`,
      `radial-gradient(circle at 50% 88%, ${hexWithAlpha(accent, 0.07)} 0%, transparent 52%)`
    ].join(",");
  }

  renderBoard(payload, accent, neutral, outR, onSurf);
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
  new ResizeObserver(() => {
    requestAnimationFrame(() => fitBoardGrid());
  }).observe(boardWrap);
}
