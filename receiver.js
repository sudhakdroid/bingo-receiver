const NAMESPACE = "urn:x-cast:com.nv.simplebingo";

const context = cast.framework.CastReceiverContext.getInstance();
const options = new cast.framework.CastReceiverOptions();
options.disableIdleTimeout = true;

const root = document.getElementById("root");
const numberEl = document.getElementById("number");
const phraseEl = document.getElementById("phrase");
const countdownEl = document.getElementById("countdown");
const countdownFillEl = document.getElementById("countdownFill");

function clampToPercent(value, max) {
  if (max <= 0) return 0;
  return Math.max(0, Math.min(100, (value / max) * 100));
}

function applyCallerState(payload) {
  const number =
    payload.number && String(payload.number).trim().length > 0
      ? String(payload.number).trim()
      : "";
  numberEl.textContent = number;

  phraseEl.textContent = payload.phrase || "";

  const accent = payload.accent || "#6A1B9A";
  countdownFillEl.style.backgroundColor = accent;

  if (payload.auto === true && typeof payload.countdownSec === "number" && payload.countdownSec > 0) {
    countdownEl.style.display = "block";
    const percent = clampToPercent(payload.countdownSec, 12);
    countdownFillEl.style.width = `${percent}%`;
  } else {
    countdownEl.style.display = "none";
    countdownFillEl.style.width = "0%";
  }

  root.style.background = `radial-gradient(circle at top, ${accent}33, #111 60%)`;
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
