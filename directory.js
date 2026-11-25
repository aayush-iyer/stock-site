// ===== All US stocks directory =====
// Downloads the full list of US tickers once a day (through our server), keeps only
// real shares and ETFs on the main exchanges, and shows them 25 at a time.
// Live prices are fetched only for the 25 rows on screen, to stay within the free limit.

const API = "https://trading-room-api.aayush-iyer.workers.dev";

// Main US exchanges: Nasdaq, NYSE, NYSE Arca, Cboe BZX, NYSE American, IEX
// (leaves out "OOTC" = over-the-counter listings)
const ALLOWED_MICS = ["XNAS", "XNYS", "ARCX", "BATS", "XASE", "IEXG"];

// Types we keep, and how we label them (skips rights, warrants, units, preferred shares…)
const TYPE_LABELS = { "Common Stock": "Stock", "ETP": "ETF", "ADR": "ADR", "REIT": "REIT" };

const PAGE_SIZE = 25;

let allSymbols = [];   // every kept ticker: { symbol, name, type }
let filtered = [];     // the ones matching the current filters
let page = 0;
let typeFilter = "All";
let letterFilter = "";
let textFilter = "";
let renderId = 0;      // so prices from an old page never land on a new one

const filterInput = document.querySelector("#dir-filter");
const typeBar = document.querySelector("#type-filters");
const letterBar = document.querySelector("#letter-bar");
const body = document.querySelector("#dir-body");
const countNote = document.querySelector("#dir-count");
const pageLabel = document.querySelector("#dir-page");
const prevBtn = document.querySelector("#dir-prev");
const nextBtn = document.querySelector("#dir-next");

// ===== Helpers =====
async function getJSON(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Server replied ${response.status}`);
  return response.json();
}

function formatMoney(number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(number);
}

// The list gives names in CAPITALS ("APPLE INC") → turn into "Apple Inc", keeping short codes like ETF
const KEEP_CAPS = new Set(["ETF", "ETN", "US", "USA", "UK", "ADR", "LLC", "PLC", "LP", "AG", "NV", "SA", "SE", "II", "III", "IV", "REIT", "S&P", "AI"]);
function niceName(raw) {
  return raw
    .toLowerCase()
    .split(" ")
    .map((word) => (KEEP_CAPS.has(word.toUpperCase()) ? word.toUpperCase() : word.charAt(0).toUpperCase() + word.slice(1)))
    .join(" ");
}

function messageRow(text) {
  body.innerHTML = "";
  const tr = document.createElement("tr");
  const td = document.createElement("td");
  td.colSpan = 5;
  td.className = "dir-empty";
  td.textContent = text;
  tr.append(td);
  body.append(tr);
}

// ===== Get the full list (saved in the browser for the day) =====
async function loadSymbols() {
  const today = new Date().toISOString().slice(0, 10);
  const cacheKey = `us-symbols-${today}`;

  try {
    const saved = localStorage.getItem(cacheKey);
    if (saved) return JSON.parse(saved);
  } catch (error) {
    console.warn(error);
  }

  const raw = await getJSON(`${API}/finnhub/stock/symbol?exchange=US`);
  const unique = new Map();

  raw.forEach((r) => {
    if (!ALLOWED_MICS.includes(r.mic)) return;
    if (!/^[A-Z]{1,5}(\.[A-Z])?$/.test(r.symbol)) return;
    let type = TYPE_LABELS[r.type];
    if (!type && !r.type && /\bETF\b/i.test(r.description)) type = "ETF";   // a few ETFs have no type
    if (!type || unique.has(r.symbol)) return;
    unique.set(r.symbol, { symbol: r.symbol, name: niceName(r.description || r.symbol), type });
  });

  const list = [...unique.values()].sort((a, b) => a.symbol.localeCompare(b.symbol));

  try {
    // Remove older days' copies, then save today's
    Object.keys(localStorage)
      .filter((key) => key.startsWith("us-symbols-"))
      .forEach((key) => localStorage.removeItem(key));
    localStorage.setItem(cacheKey, JSON.stringify(list));
  } catch (error) {
    console.warn("Couldn't save the list in the browser", error);
  }
  return list;
}

// ===== Filtering =====
function applyFilters() {
  const text = textFilter.toLowerCase();

  filtered = allSymbols.filter((s) => {
    const typeOK = typeFilter === "All" || (typeFilter === "ETF" ? s.type === "ETF" : s.type !== "ETF");
    const letterOK = !letterFilter || s.symbol.startsWith(letterFilter);
    const textOK = !text || s.symbol.toLowerCase().startsWith(text) || s.name.toLowerCase().includes(text);
    return typeOK && letterOK && textOK;
  });

  // When typing, show exact ticker matches first, then tickers starting with it
  if (text) {
    const score = (s) => {
      const sym = s.symbol.toLowerCase();
      return sym === text ? 0 : sym.startsWith(text) ? 1 : 2;
    };
    filtered.sort((a, b) => score(a) - score(b));
  }

  page = 0;
  renderPage();
}

// ===== Show one page of 25 =====
function renderPage() {
  const id = ++renderId;
  const total = filtered.length;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const start = page * PAGE_SIZE;
  const rows = filtered.slice(start, start + PAGE_SIZE);

  countNote.textContent = total
    ? `Showing ${start + 1}–${start + rows.length} of ${total.toLocaleString()}`
    : "No matches";
  pageLabel.textContent = `Page ${page + 1} of ${pages.toLocaleString()}`;
  prevBtn.disabled = page === 0;
  nextBtn.disabled = page >= pages - 1;

  if (rows.length === 0) {
    messageRow("No US stocks or ETFs match. Try a different spelling or filter.");
    return;
  }

  body.innerHTML = "";
  rows.forEach((s) => {
    const tr = document.createElement("tr");
    tr.dataset.symbol = s.symbol;
    tr.innerHTML = `
      <td><a class="dir-symbol" href="stock.html?symbol=${encodeURIComponent(s.symbol)}"></a></td>
      <td class="dir-name"></td>
      <td class="dir-type-col"><span class="type-tag"></span></td>
      <td class="dir-num dir-price">—</td>
      <td class="dir-num dir-change">&nbsp;</td>`;
    tr.querySelector(".dir-symbol").textContent = s.symbol;   // textContent = safe, never runs code
    tr.querySelector(".dir-name").textContent = s.name;
    tr.querySelector(".type-tag").textContent = s.type;
    body.append(tr);
  });

  rows.forEach((s) => fillPrice(s.symbol, id));
}

async function fillPrice(symbol, id) {
  try {
    const q = await getJSON(`${API}/finnhub/quote?symbol=${encodeURIComponent(symbol)}`);
    if (id !== renderId) return;   // you've moved to another page since
    const tr = body.querySelector(`tr[data-symbol="${symbol}"]`);
    if (!tr || !q || !q.c) return;

    const up = q.dp >= 0;
    tr.querySelector(".dir-price").textContent = formatMoney(q.c);
    const change = tr.querySelector(".dir-change");
    change.textContent = `${up ? "+" : ""}${(q.dp ?? 0).toFixed(2)}%`;
    change.classList.add(up ? "up" : "down");
  } catch (error) {
    console.error(error);   // price stays as "—"
  }
}

// ===== Controls =====
// Letter buttons: All, A–Z
letterBar.innerHTML = ["All", ..."ABCDEFGHIJKLMNOPQRSTUVWXYZ"]
  .map((l) => `<button type="button" class="range-btn ${l === "All" ? "active" : ""}" data-letter="${l === "All" ? "" : l}" aria-pressed="${l === "All"}">${l}</button>`)
  .join("");

function choose(bar, button) {
  bar.querySelectorAll(".range-btn").forEach((btn) => {
    btn.classList.toggle("active", btn === button);
    btn.setAttribute("aria-pressed", btn === button);
  });
}

letterBar.addEventListener("click", (event) => {
  const button = event.target.closest(".range-btn");
  if (!button) return;
  choose(letterBar, button);
  letterFilter = button.dataset.letter;
  applyFilters();
});

typeBar.addEventListener("click", (event) => {
  const button = event.target.closest(".range-btn");
  if (!button) return;
  choose(typeBar, button);
  typeFilter = button.dataset.type;
  applyFilters();
});

let typingTimer = null;
filterInput.addEventListener("input", () => {
  clearTimeout(typingTimer);
  typingTimer = setTimeout(() => {
    textFilter = filterInput.value.trim();
    applyFilters();
  }, 200);
});

function goToPage(newPage) {
  page = newPage;
  renderPage();
  document.querySelector("#dir-title").scrollIntoView({ behavior: "smooth", block: "start" });
}
prevBtn.addEventListener("click", () => goToPage(page - 1));
nextBtn.addEventListener("click", () => goToPage(page + 1));

// Clicking anywhere on a row opens that stock
body.addEventListener("click", (event) => {
  const tr = event.target.closest("tr[data-symbol]");
  if (tr && !event.target.closest("a")) {
    window.location.href = `stock.html?symbol=${encodeURIComponent(tr.dataset.symbol)}`;
  }
});

// ===== Start =====
async function init() {
  messageRow("Loading the full list of US stocks… (the first visit each day takes a few seconds)");
  try {
    allSymbols = await loadSymbols();
    applyFilters();
  } catch (error) {
    console.error(error);
    messageRow("Couldn't load the list right now. Please try again in a minute.");
  }
}

init();