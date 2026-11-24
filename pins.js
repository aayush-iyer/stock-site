// ===== Pinned stocks: saved in this browser, up to 5 =====
// Used by both the stock page (to pin) and the home page dashboard (to show them)

const PIN_KEY = "pinnedStocks";
const MAX_PINS = 5;

// Get the list of pinned symbols, e.g. ["AAPL", "NVDA"]
function getPins() {
  try {
    const pins = JSON.parse(localStorage.getItem(PIN_KEY) || "[]");
    return Array.isArray(pins) ? pins : [];
  } catch {
    return [];   // if anything's wrong with the saved data, start fresh
  }
}

function savePins(pins) {
  localStorage.setItem(PIN_KEY, JSON.stringify(pins));
}

function isPinned(symbol) {
  return getPins().includes(symbol);
}

// Pin if not pinned, unpin if pinned. Returns what happened.
function togglePin(symbol) {
  const pins = getPins();

  if (pins.includes(symbol)) {
    savePins(pins.filter((p) => p !== symbol));
    return { pinned: false };
  }

  if (pins.length >= MAX_PINS) {
    return { pinned: false, full: true };
  }

  pins.push(symbol);
  savePins(pins);
  return { pinned: true };
}

// ===== Small pop-up message at the bottom of the screen =====
function showToast(text) {
  const toast = document.createElement("div");
  toast.className = "toast";
  toast.setAttribute("role", "status");   // screen readers announce it
  toast.textContent = text;
  document.body.append(toast);
  setTimeout(() => toast.remove(), 2500); // disappears after 2.5 seconds
}