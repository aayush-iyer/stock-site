// ===== Our server (it adds the API keys, so they never reach the browser) =====
const API = "https://trading-room-api.aayush-iyer.workers.dev";

// ===== Markets page: searching takes you to the stock page =====
const searchForm = document.querySelector(".search");
const searchInput = document.querySelector("#search-input");

searchForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const symbol = searchInput.value.trim().toUpperCase();

  if (!/^[A-Z.\-]{1,10}$/.test(symbol)) {
    searchInput.value = "";
    searchInput.placeholder = "Type a ticker like AAPL";
    return;
  }

  window.location.href = `stock.html?symbol=${symbol}`;
});

// ===== Fetch helper: get JSON from a URL =====
async function getJSON(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Server replied ${response.status}`);
  }
  return response.json();
}

// ===== Format a number as US dollars, e.g. 356.27 → $356.27 =====
function formatMoney(number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(number);
}

// ===== Popular US stocks and ETFs =====
// type: "Stock" or "ETF" (an ETF is a fund that holds many companies at once)
// sector: used for the filter buttons in Step 34
const POPULAR = [
  { symbol: "AAPL",  name: "Apple",                       type: "Stock", sector: "Tech" },
  { symbol: "MSFT",  name: "Microsoft",                   type: "Stock", sector: "Tech" },
  { symbol: "NVDA",  name: "NVIDIA",                      type: "Stock", sector: "Tech" },
  { symbol: "GOOGL", name: "Alphabet (Google)",           type: "Stock", sector: "Tech" },
  { symbol: "META",  name: "Meta Platforms",              type: "Stock", sector: "Tech" },
  { symbol: "AMZN",  name: "Amazon",                      type: "Stock", sector: "Consumer" },
  { symbol: "TSLA",  name: "Tesla",                       type: "Stock", sector: "Consumer" },
  { symbol: "KO",    name: "Coca-Cola",                   type: "Stock", sector: "Consumer" },
  { symbol: "JPM",   name: "JPMorgan Chase",              type: "Stock", sector: "Finance" },
  { symbol: "V",     name: "Visa",                        type: "Stock", sector: "Finance" },
  { symbol: "LLY",   name: "Eli Lilly",                   type: "Stock", sector: "Healthcare" },
  { symbol: "JNJ",   name: "Johnson & Johnson",           type: "Stock", sector: "Healthcare" },
  { symbol: "XOM",   name: "Exxon Mobil",                 type: "Stock", sector: "Energy" },
  { symbol: "SPY",   name: "SPDR S&P 500 ETF",            type: "ETF",   sector: "ETF" },
  { symbol: "VOO",   name: "Vanguard S&P 500 ETF",        type: "ETF",   sector: "ETF" },
  { symbol: "QQQ",   name: "Invesco QQQ (Nasdaq-100)",    type: "ETF",   sector: "ETF" },
  { symbol: "VTI",   name: "Vanguard Total Stock Market", type: "ETF",   sector: "ETF" },
];

const marketGrid = document.querySelector("#market-grid");
const marketNote = document.querySelector("#market-note");
const latestQuotes = {};   // symbol → its latest quote (used for movers and filters later)

// One card (starts in a "loading" state)
function marketCardHTML(item) {
  return `
    <article class="pin-card market-card" data-symbol="${item.symbol}">
      <a class="pin-card-link" href="stock.html?symbol=${item.symbol}" aria-label="Open ${item.name}"></a>
      <div class="pin-card-top">
        <div>
          <p class="pin-symbol">${item.symbol}</p>
          <p class="pin-name">${item.name}</p>
        </div>
        <span class="type-tag">${item.type}</span>
      </div>
      <p class="pin-price">—</p>
      <p class="pin-change">&nbsp;</p>
    </article>`;
}

// Fetch one live price and put it on its card
async function fillMarketCard(item) {
  const card = marketGrid.querySelector(`.market-card[data-symbol="${item.symbol}"]`);
  if (!card) return;

  try {
    const q = await getJSON(`${API}/finnhub/quote?symbol=${item.symbol}`);
    if (!q || !q.c) throw new Error("No price");
    latestQuotes[item.symbol] = q;

    const up = q.dp >= 0;
    card.querySelector(".pin-price").textContent = formatMoney(q.c);
    const change = card.querySelector(".pin-change");
    change.textContent = `${up ? "+" : ""}${q.dp.toFixed(2)}% today`;
    change.classList.toggle("up", up);
    change.classList.toggle("down", !up);
  } catch (error) {
    console.error(error);
    card.querySelector(".pin-change").textContent = "Price unavailable";
  }
}

// Draw all the cards, then fetch every price at the same time
async function loadMarkets() {
  marketGrid.innerHTML = POPULAR.map(marketCardHTML).join("");
  await Promise.all(POPULAR.map(fillMarketCard));
  const time = new Date().toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  marketNote.textContent = `Prices updated ${time}`;
}

loadMarkets().then(renderMovers);

// ===== Near-live updates =====
// While the US market is open, every card refreshes once a minute (paused when the tab is hidden)
function isMarketOpen() {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York", weekday: "short", hour: "numeric", minute: "numeric", hour12: false,
  }).formatToParts(new Date());
  const get = (type) => parts.find((p) => p.type === type).value;
  const minutes = (Number(get("hour")) % 24) * 60 + Number(get("minute"));
  const isWeekday = !["Sat", "Sun"].includes(get("weekday"));
  return isWeekday && minutes >= 9 * 60 + 30 && minutes < 16 * 60;
}

async function refreshMarkets() {
  if (document.hidden || !isMarketOpen()) return;
  await Promise.all(POPULAR.map(fillMarketCard));   // updates the numbers on the existing cards
    renderMovers();
  const time = new Date().toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  marketNote.textContent = `Prices updated ${time}`;
}

setInterval(refreshMarkets, 60 * 1000);

document.addEventListener("visibilitychange", () => {
  if (!document.hidden) refreshMarkets();
});

// ===== Biggest movers today (from the popular list) =====
const moversBox = document.querySelector("#movers");

function moverRowHTML(item, q) {
  const up = q.dp >= 0;
  return `
    <a class="mover-row" href="stock.html?symbol=${item.symbol}">
      <span class="mover-name"><strong>${item.symbol}</strong><span>${item.name}</span></span>
      <span class="mover-price">${formatMoney(q.c)}</span>
      <span class="mover-change ${up ? "up" : "down"}">${up ? "+" : ""}${q.dp.toFixed(2)}%</span>
    </a>`;
}

function renderMovers() {
  const withPrices = POPULAR.filter((item) => latestQuotes[item.symbol]);
  if (withPrices.length === 0) {
    moversBox.innerHTML = `<p class="quote-message">Movers will appear once prices load.</p>`;
    return;
  }

  // Sort from biggest rise to biggest fall
  const sorted = [...withPrices].sort((a, b) => latestQuotes[b.symbol].dp - latestQuotes[a.symbol].dp);
  const gainers = sorted.filter((i) => latestQuotes[i.symbol].dp > 0).slice(0, 3);
  const losers = sorted.filter((i) => latestQuotes[i.symbol].dp < 0).reverse().slice(0, 3);

  const column = (title, list, emptyText) => `
    <div class="movers-col">
      <h3 class="movers-title">${title}</h3>
      ${list.length
        ? list.map((i) => moverRowHTML(i, latestQuotes[i.symbol])).join("")
        : `<p class="quote-message">${emptyText}</p>`}
    </div>`;

  moversBox.innerHTML =
    column("Top gainers", gainers, "Nothing on the list is up today.") +
    column("Top losers", losers, "Nothing on the list is down today.");
}

// ===== Sector filter buttons =====
const filterBar = document.querySelector("#sector-filters");

filterBar.addEventListener("click", (event) => {
  const button = event.target.closest(".range-btn");
  if (!button) return;
  const sector = button.dataset.sector;

  // Highlight the chosen button
  filterBar.querySelectorAll(".range-btn").forEach((btn) => {
    const chosen = btn === button;
    btn.classList.toggle("active", chosen);
    btn.setAttribute("aria-pressed", chosen);
  });

  // Show only the cards in that sector ("All" shows everything)
  POPULAR.forEach((item) => {
    const card = marketGrid.querySelector(`.market-card[data-symbol="${item.symbol}"]`);
    if (card) card.hidden = sector !== "All" && item.sector !== sector;
  });
});
