const NAMESPACE = "urn:x-cast:com.nv.simplebingo";

const context = cast.framework.CastReceiverContext.getInstance();
const options = new cast.framework.CastReceiverOptions();
// Non-media app: do not load Shaka/MPL — otherwise the default media splash / Cast
// artwork covers this page and it looks like “only the Cast icon”.
options.skipPlayersLoad = true;
options.disableIdleTimeout = true;
// Required by CAF: namespaces must be registered before start() or custom messages fail.
options.customNamespaces = {
  [NAMESPACE]: cast.framework.system.MessageType.JSON,
};
options.statusText = "SimpleBingo";

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
  const number = payload.number && payload.number.length > 0 ? payload.number : "-";
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

context.addCustomMessageListener(NAMESPACE, (event) => {
  try {
    const payload = JSON.parse(event.data);
    if (payload && payload.v === 1) {
      applyCallerState(payload);
    }
  } catch (e) {
    console.warn("Invalid cast payload", e);
  }
});

try {
  context.start(options);
} catch (e) {
  console.error("Cast receiver start failed", e);
  if (numberEl) {
    numberEl.textContent = "!";
  }
  if (phraseEl) {
    phraseEl.textContent = "Receiver error — check console / hosting";
  }
}
