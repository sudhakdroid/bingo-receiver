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
const last10WrapEl = document.getElementById("last10Wrap");
const last10RowEl = document.getElementById("last10Row");
const last10LabelEl = document.getElementById("last10Label");
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

const DISPLAY_MODE_HERO = "hero_nickname";
const DISPLAY_MODE_HERO_LAST10 = "hero_nickname_last10";
const DISPLAY_MODE_FULL_BOARD = "full_board";

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

function blendHex(baseHex, tintHex, tintAmount) {
  const base = hexToRgb(baseHex);
  const tint = hexToRgb(tintHex);
  if (!base || !tint) return baseHex;
  const t = Math.max(0, Math.min(1, Number(tintAmount) || 0));
  const mix = (a, b) => Math.round(a * (1 - t) + b * t);
  const r = mix(base.r, tint.r);
  const g = mix(base.g, tint.g);
  const b = mix(base.b, tint.b);
  return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
}

function ensureTileContrast(tileHex, bgHex, darkenAmount) {
  if (contrastRatio(tileHex, bgHex) >= 1.2) return tileHex;
  return blendHex(tileHex, "#000000", darkenAmount);
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

function parseLast10(payload) {
  const source = Array.isArray(payload.last10Called) ? payload.last10Called : payload.calledNumbers;
  if (!Array.isArray(source)) return [];
  return source
    .map((x) => Number(x))
    .filter((n) => Number.isFinite(n))
    .slice(-10);
}

function formatCallNumber(n, bingoSize) {
  if (bingoSize === 75) {
    if (n >= 1 && n <= 15) return `B${n}`;
    if (n >= 16 && n <= 30) return `I${n}`;
    if (n >= 31 && n <= 45) return `N${n}`;
    if (n >= 46 && n <= 60) return `G${n}`;
    if (n >= 61 && n <= 75) return `O${n}`;
  }
  return String(n);
}

function renderLast10(payload, accent, neutral, onSurf, pageBg) {
  if (!last10WrapEl || !last10RowEl || !last10LabelEl) return;
  const arr = parseLast10(payload);
  const normalized = new Array(10).fill(null);
  const start = Math.max(0, 10 - arr.length);
  for (let i = 0; i < arr.length; i++) normalized[start + i] = arr[i];

  const chipText = pickReadableForeground(TEXT_ON_ACCENT, "#FFFFFF", "#111111", accent);
  const emptyBorder = hexWithAlpha(onSurf, 0.18);
  const emptyBg = blendHex(neutral, pageBg, 0.18);

  last10RowEl.replaceChildren();
  normalized.forEach((n, idx) => {
    const chip = document.createElement("div");
    chip.className = `last10-chip${n == null ? " empty" : ""}`;
    if (n == null) {
      chip.textContent = "-";
      chip.style.background = emptyBg;
      chip.style.color = onSurf;
      chip.style.borderColor = emptyBorder;
    } else {
      chip.textContent = formatCallNumber(n, payload.bingoSize);
      chip.style.background = accent;
      chip.style.color = chipText;
      chip.style.borderColor = "transparent";
      if (idx === 9) {
        chip.style.borderColor = JUST_BORDER;
        chip.style.borderWidth = "2px";
      }
    }
    last10RowEl.appendChild(chip);
  });
}

function applyDisplayMode(mode) {
  const isHeroOnly = mode === DISPLAY_MODE_HERO;
  const isHeroLast10 = mode === DISPLAY_MODE_HERO_LAST10;
  const showLast10 = isHeroLast10;
  const showBoard = !isHeroOnly && !isHeroLast10;
  if (root) {
    root.classList.toggle("mode-hero", isHeroOnly);
    root.classList.toggle("mode-hero-last10", isHeroLast10);
    root.classList.toggle("mode-full-board", showBoard);
  }
  if (last10WrapEl) last10WrapEl.style.display = showLast10 ? "block" : "none";
  if (boardWrap) boardWrap.style.display = showBoard ? "flex" : "none";
}

function styleCell75(el, n, calledSet, just, prev, accent, neutral, onSurf, gridBorder) {
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
    el.style.borderColor = gridBorder;
    el.style.borderWidth = "1px";
  }
}

function styleCell10(el, n, bingoSize, calledSet, just, prev, accent, neutral, outR, onSurf, gridBorder) {
  const inRange = n <= bingoSize;
  el.className = "cell";
  if (!inRange) {
    el.style.background = outR;
    el.style.borderColor = gridBorder;
    el.style.borderWidth = "1px";
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
    el.style.borderColor = gridBorder;
    el.style.borderWidth = "1px";
  }
}

function buildBoard75(payload, accent, neutral, onSurf, gridBorder) {
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
      styleCell75(div, n, calledSet, just, prev, accent, neutral, onSurf, gridBorder);
      grid.appendChild(div);
    }
  }
  return grid;
}

function buildBoard10(payload, accent, neutral, outR, onSurf, gridBorder) {
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
      styleCell10(div, n, bingoSize, calledSet, just, prev, accent, neutral, outR, onSurf, gridBorder);
      grid.appendChild(div);
    }
  }
  return grid;
}

function updateBoard75(grid, payload, accent, neutral, onSurf, gridBorder) {
  const calledSet = parseCalledSet(payload);
  const just = payload.justCalled;
  const prev = payload.previousCalled;
  const cells = grid.querySelectorAll(".cell");
  for (let ci = 5; ci < cells.length; ci++) {
    const idx = ci - 5;
    const row = Math.floor(idx / 5);
    const col = idx % 5;
    const n = col * 15 + row + 1;
    styleCell75(cells[ci], n, calledSet, just, prev, accent, neutral, onSurf, gridBorder);
  }
}

function updateBoard10(grid, payload, accent, neutral, outR, onSurf, gridBorder) {
  const bingoSize = payload.bingoSize;
  const calledSet = parseCalledSet(payload);
  const just = payload.justCalled;
  const prev = payload.previousCalled;
  const cells = grid.querySelectorAll(".cell");
  cells.forEach((el, idx) => {
    const row = Math.floor(idx / 10);
    const col = idx % 10;
    const n = row * 10 + col + 1;
    styleCell10(el, n, bingoSize, calledSet, just, prev, accent, neutral, outR, onSurf, gridBorder);
  });
}

function renderBoard(payload, accent, neutral, outR, onSurf, gridBorder) {
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
      updateBoard75(boardCache.grid, payload, accent, neutral, onSurf, gridBorder);
    } else {
      updateBoard10(boardCache.grid, payload, accent, neutral, outR, onSurf, gridBorder);
    }
    return;
  }

  const grid = bs === 75
    ? buildBoard75(payload, accent, neutral, onSurf, gridBorder)
    : buildBoard10(payload, accent, neutral, outR, onSurf, gridBorder);
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
  const displayModeRaw = typeof payload.displayMode === "string" ? payload.displayMode.trim() : "";
  const displayMode = displayModeRaw.length > 0 ? displayModeRaw : DISPLAY_MODE_FULL_BOARD;
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
  if (last10LabelEl) {
    last10LabelEl.style.color = onSurfaceVariant && String(onSurfaceVariant).trim().length > 0 ? onSurfaceVariant : onSurf;
  }

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
    const neutralTile = neutral;
    const outOfRangeTile = outR;
    const gridBorder = hexWithAlpha("#FFFFFF", 0.08);
    root.style.background = [
      `radial-gradient(circle at 50% 18%, ${hexWithAlpha(accent, 0.34)} 0%, ${hexWithAlpha(accent, 0.14)} 36%, transparent 70%)`,
      `linear-gradient(180deg, ${hexWithAlpha(surface, 0.96)} 0%, ${hexWithAlpha(pageBg, 1)} 56%, ${hexWithAlpha(pageBg, 1)} 100%)`,
      `radial-gradient(circle at 50% 92%, ${hexWithAlpha(accent, 0.16)} 0%, transparent 62%)`
    ].join(",");
    applyDisplayMode(displayMode);
    renderLast10(payload, accent, neutralTile, onSurf, pageBg);
    if (displayMode === DISPLAY_MODE_FULL_BOARD) {
      renderBoard(payload, accent, neutralTile, outOfRangeTile, onSurf, gridBorder);
    }
  } else {
    const neutralTile = ensureTileContrast(neutral, pageBg, 0.16);
    const outOfRangeTile = ensureTileContrast(outR, pageBg, 0.22);
    const gridBorder = hexWithAlpha("#000000", 0.14);
    const lightTop = blendHex(surface, "#EEF2FA", 0.62);
    const lightMid = blendHex(pageBg, "#F3F6FC", 0.4);
    const lightBottom = blendHex(pageBg, "#DFE6F0", 0.24);
    root.style.background = [
      `radial-gradient(circle at 50% 14%, ${hexWithAlpha(accent, 0.24)} 0%, ${hexWithAlpha(accent, 0.09)} 36%, transparent 70%)`,
      `linear-gradient(180deg, ${hexWithAlpha(lightTop, 1)} 0%, ${hexWithAlpha(lightMid, 1)} 48%, ${hexWithAlpha(lightBottom, 1)} 100%)`,
      `radial-gradient(circle at 50% 90%, ${hexWithAlpha(accent, 0.14)} 0%, transparent 60%)`,
      `linear-gradient(180deg, rgba(0,0,0,0) 0%, rgba(0,0,0,0.06) 100%)`
    ].join(",");
    applyDisplayMode(displayMode);
    renderLast10(payload, accent, neutralTile, onSurf, pageBg);
    if (displayMode === DISPLAY_MODE_FULL_BOARD) {
      renderBoard(payload, accent, neutralTile, outOfRangeTile, onSurf, gridBorder);
    }
  }
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
