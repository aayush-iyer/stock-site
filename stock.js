// ===== Our server (it adds the API keys, so they never reach the browser) =====
const API = "https://trading-room-api.aayush-iyer.workers.dev";

// ===== Search bar (on the stock page) =====

// ===== Search bar (on the stock page) =====
const searchForm = document.querySelector(".search");
const searchInput = document.querySelector("#search-input");
const quoteResult = document.querySelector("#quote-result");

searchForm.addEventListener("submit", (event) => {
  event.preventDefault();                 // stop the page reloading
  const query = searchInput.value.trim(); // what the user typed
  if (query === "") {
    return;                               // empty box: do nothing
  }
  const symbol = query.toUpperCase();
  if (!/^[A-Z.\-]{1,10}$/.test(symbol)) {
    showMessage("Type a stock ticker like AAPL (letters only).");
    return;
  }
  window.location.href = `stock.html?symbol=${symbol}`;
});

// ===== Fetch and show a live quote =====
async function showQuote(symbol) {
  
  showMessage(`Loading ${symbol}…`);

  try {
    const url = `${API}/finnhub/quote?symbol=${symbol}`;
    const data = await getJSON(url);

    // Finnhub returns 0 for tickers it doesn't know
    if (data.c === 0) {
      showMessage(`Couldn't find "${symbol}". Try a US ticker like AAPL or MSFT.`);
      return;
    }

    // Company info, key stats and related companies, all at the same time
    // (if any of them fails, use empty data instead of breaking the page)
    const [profile, metrics, peers] = await Promise.all([
      getJSON(`${API}/finnhub/stock/profile2?symbol=${symbol}`).catch(() => ({})),
      getJSON(`${API}/finnhub/stock/metric?symbol=${symbol}&metric=all`).catch(() => ({})),
      getJSON(`${API}/finnhub/stock/peers?symbol=${symbol}`).catch(() => []),
    ]);

    renderQuote(symbol, data, profile, metrics.metric || {}, peers);
  } catch (error) {
    console.error(error);
    showMessage("Couldn't load the price. Check your internet and try again.");
  }
}

// ===== Put the quote on the page =====
function renderQuote(symbol, q, profile, m, peers) {
  const direction = q.d >= 0 ? "up" : "down";
  const sign = q.d >= 0 ? "+" : "";

  quoteResult.innerHTML = `
    <div class="stock-top">

      <!-- Left: name, price and chart -->
      <div class="stock-main">
        <div class="company">
          ${profile.logo ? `<img class="company-logo" src="${profile.logo}" alt="" width="40" height="40">` : ""}
          <div>
            <p class="quote-symbol">${profile.name || symbol}</p>
            <p class="company-meta">${symbol}${profile.exchange ? " · " + shortExchange(profile.exchange) : ""}${profile.finnhubIndustry ? " · " + profile.finnhubIndustry : ""}</p>
          </div>
          ${pinButtonHTML(symbol)}
        </div>
        <p class="quote-price">${formatMoney(q.c)}</p>
        <p class="quote-change ${direction}">
          ${sign}${q.d.toFixed(2)} (${sign}${q.dp.toFixed(2)}%) today
        </p>
        <p class="market-status">${marketStatusHTML()}</p>
        <div class="range-buttons">
          <button type="button" class="range-btn" data-range="1D">1D</button>
          <button type="button" class="range-btn" data-range="5D">5D</button>
          <button type="button" class="range-btn" data-range="2W">2W</button>
          <button type="button" class="range-btn active" data-range="1M">1M</button>
          <button type="button" class="range-btn" data-range="3M">3M</button>
          <button type="button" class="range-btn" data-range="6M">6M</button>
          <button type="button" class="range-btn" data-range="YTD">YTD</button>
          <button type="button" class="range-btn" data-range="1Y">1Y</button>
          <button type="button" class="range-btn" data-range="5Y">5Y</button>
          <span id="range-change" class="range-change"></span>
        </div>
        <div class="chart-wrap">
          <canvas id="price-chart" role="img" aria-label="${symbol} price chart"></canvas>
        </div>
        <p id="chart-note" class="chart-note"></p>
      </div>

      <!-- Right: the main numbers -->
      <aside class="stock-side explain-scope">
        <h3 class="stats-title side-title">At a glance</h3>
        <dl class="side-stats">
          <div><dt>Open</dt><dd>${formatMoney(q.o)}</dd></div>
          <div><dt>Prev. close</dt><dd>${formatMoney(q.pc)}</dd></div>
          <div><dt>Day high</dt><dd id="stat-high">${formatMoney(q.h)}</dd></div>
          <div><dt>Day low</dt><dd id="stat-low">${formatMoney(q.l)}</dd></div>
          ${statRow("marketCap", "Market cap", formatBigMoney(profile.marketCapitalization))}
          ${statRow("high52", "52-week high", formatMoneyOrDash(m["52WeekHigh"]))}
          ${statRow("low52", "52-week low", formatMoneyOrDash(m["52WeekLow"]))}
        </dl>
        ${rangeBar(q.c, m["52WeekLow"], m["52WeekHigh"])}
        <p class="stat-explain" hidden></p>
        ${tradePanelHTML(symbol)}
      </aside>
    </div>

    <!-- Below the chart -->
    <div class="explain-scope">
      <h3 class="stats-title">Key stats</h3>
      <dl class="quote-stats">
        ${statRow("pe", "P/E ratio", formatNumber(m.peTTM ?? m.peBasicExclExtraTTM))}
        ${statRow("eps", "EPS (12 mo)", formatMoneyOrDash(m.epsTTM ?? m.epsBasicExclExtraItemsTTM))}
        ${statRow("dividend", "Dividend yield", formatPercent(m.dividendYieldIndicatedAnnual))}
        ${statRow("beta", "Beta", formatNumber(m.beta))}
      </dl>
      <p class="stat-explain" hidden></p>
    </div>

    ${aboutSection(profile)}
    ${peerChips(symbol, peers)}

    <h3 class="stats-title">Latest news</h3>
    <div id="news-list" class="news-list">
      <p class="quote-message">Loading news…</p>
    </div>
  `;
  quoteResult.hidden = false;
  loadChart(symbol);
  loadNews(symbol);
  document.title = `${symbol} · The Trading Room`;
}

// ===== Show a simple message in the result box =====
function showMessage(text) {
  quoteResult.innerHTML = "";
  const p = document.createElement("p");
  p.className = "quote-message";
  p.textContent = text;
  quoteResult.append(p);
  quoteResult.hidden = false;
}

// ===== Format a number as US dollars, e.g. 356.27 → $356.27 =====
function formatMoney(number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(number);
}

// ===== Price chart =====
let priceChart = null;    // the chart currently on screen
let dailyHistory = [];    // up to 5 years of daily prices, oldest → newest
let currentSymbol = "";   // the stock the chart is showing
let currentRange = "1M";  // the range button that's selected

// What each range button shows
const RANGES = {
  "1D":  { intraday: true, interval: "5min",  points: 78 },  // last trading session, every 5 minutes
  "5D":  { intraday: true, interval: "30min", points: 65 },  // last 5 sessions, every 30 minutes
  "2W":  { intraday: true, interval: "1h",    points: 70 },  // last 10 sessions, every hour
  "1M":  { days: 22 },                                       // about 22 trading days
  "3M":  { days: 66 },
  "6M":  { days: 130 },
  "YTD": { ytd: true },                                      // since 1 January
  "1Y":  { days: 260 },
  "5Y":  { days: 1260 },
};

async function loadChart(symbol) {
  const note = document.querySelector("#chart-note");


  currentSymbol = symbol;
  note.textContent = "Loading chart…";
  try {
    dailyHistory = await getDailyHistory(symbol);
    note.textContent = "";
    await selectRange("1M");
  } catch (error) {
    console.error(error);
    note.textContent = "Couldn't load the chart right now. Try again in a minute.";
  }
}

// Switch the chart to a range like "5D" or "1Y"
async function selectRange(range) {
  const note = document.querySelector("#chart-note");
  const settings = RANGES[range];
  currentRange = range;

  // Highlight the selected button straight away
  document.querySelectorAll(".range-btn").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.range === range);
  });

  try {
    let points;

    if (settings.intraday) {
      note.textContent = "Loading…";
      points = await getIntraday(currentSymbol, range);
      if (currentRange !== range) return;   // another button was clicked while loading
      note.textContent = "";
    } else if (settings.ytd) {
      const yearStart = `${new Date().getFullYear()}-01-01`;
      points = dailyHistory.filter((p) => p.date >= yearStart);
    } else {
      points = dailyHistory.slice(-settings.days);
    }

    if (points.length < 2) {
      note.textContent = "Not enough data for this range yet.";
      return;
    }

    drawChart(points, range);
  } catch (error) {
    console.error(error);
    note.textContent = "Couldn't load this range right now. Try again in a minute.";
  }
}

// Download a price series from Twelve Data → [{ date, close }], oldest → newest
async function fetchSeries(symbol, interval, outputsize) {
    const url = `${API}/twelvedata/time_series?symbol=${symbol}&interval=${interval}&outputsize=${outputsize}&timezone=UTC`;
  const data = await getJSON(url);

  if (data.status !== "ok") {
    throw new Error(data.message || "Chart data unavailable");
  }

  return data.values
    .map((bar) => ({ date: bar.datetime, close: Number(bar.close) }))
    .reverse();
}

// 5 years of daily prices (saved for the day, to protect our free limit)
async function getDailyHistory(symbol) {
  const today = new Date().toISOString().slice(0, 10);   // e.g. "2026-11-24"
  const cacheKey = `daily-${symbol}-${today}`;

  const saved = localStorage.getItem(cacheKey);
  if (saved) {
    return JSON.parse(saved);   // already fetched today: reuse it
  }

  const history = await fetchSeries(symbol, "1day", 1260);
  localStorage.setItem(cacheKey, JSON.stringify(history));
  return history;
}

// Intraday prices for 1D / 5D / 2W (saved for 5 minutes)
async function getIntraday(symbol, range) {
  const { interval, points } = RANGES[range];
  const cacheKey = `intraday-${symbol}-${range}`;
  const FIVE_MINUTES = 5 * 60 * 1000;

  const saved = JSON.parse(localStorage.getItem(cacheKey) || "null");
  if (saved && Date.now() - saved.time < FIVE_MINUTES) {
    return saved.data;
  }

  const history = await fetchSeries(symbol, interval, points);
  localStorage.setItem(cacheKey, JSON.stringify({ time: Date.now(), data: history }));
  return history;
}

// Draw (or redraw) the chart
function drawChart(points, range) {
  const labels = points.map((p) => p.date);
  const prices = points.map((p) => p.close);

  // Change over the selected range, e.g. "+4.21% over 1M"
  const first = prices[0];
  const last = prices[prices.length - 1];
  const rising = last >= first;
  const changePct = ((last - first) / first) * 100;
  const rangeChange = document.querySelector("#range-change");
  if (rangeChange) {
    const period = range === "1D" ? "last session" : `over ${range}`;
    rangeChange.textContent = `${rising ? "+" : ""}${changePct.toFixed(2)}% ${period}`;
    rangeChange.className = `range-change ${rising ? "up" : "down"}`;
  }

  // Theme colours from the CSS variables
  const css = getComputedStyle(document.documentElement);
  const colour = (name) => css.getPropertyValue(name).trim();
  const lineColour = colour(rising ? "--gain" : "--loss");
  Chart.defaults.font.family = colour("--font-body");

  // Remove the old chart before drawing a new one
  if (priceChart) {
    priceChart.destroy();
  }

  priceChart = new Chart(document.querySelector("#price-chart"), {
    type: "line",
    data: {
      labels: labels,
      datasets: [{
        data: prices,
        borderColor: lineColour,
        borderWidth: 2,
        pointRadius: 0,
        pointHoverRadius: 4,
        pointHoverBackgroundColor: lineColour,
        tension: 0.25,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: {
          displayColors: false,
          backgroundColor: colour("--surface-raised"),
          borderColor: colour("--gold"),
          borderWidth: 1,
          padding: 10,
          cornerRadius: 10,
          titleColor: colour("--gold"),
          titleFont: { family: colour("--font-heading"), style: "italic", size: 14 },
          bodyColor: colour("--text"),
          bodyFont: { family: colour("--font-number"), size: 15 },
          callbacks: {
            title: (items) => tooltipLabel(items[0].label, range),
            label: (item) => formatMoney(item.parsed.y),
          },
        },
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: {
            color: colour("--text-muted"),
            maxTicksLimit: 6,
            maxRotation: 0,
            callback: function (value) {
              return axisLabel(this.getLabelForValue(value), range);
            },
          },
        },
        y: {
          grid: { color: colour("--border") },
          ticks: {
            color: colour("--text-muted"),
            callback: (value) => formatMoney(value),
          },
        },
      },
    },
  });
}

// One listener for all range buttons (they live inside the quote card)
quoteResult.addEventListener("click", (event) => {
  const button = event.target.closest(".range-btn");
  if (button && currentSymbol) {
    selectRange(button.dataset.range);
  }
});

// ===== Chart dates and times, in the visitor's own format and time zone =====
// Daily data looks like "2026-10-23"; intraday data like "2026-11-23 15:55:00" (in UTC)
function toDate(label, intraday) {
  return intraday
    ? new Date(`${label.replace(" ", "T")}Z`)
    : new Date(`${label}T00:00:00`);
}

// Labels along the bottom of the chart
function axisLabel(label, range) {
  const intraday = Boolean(RANGES[range].intraday);
  const date = toDate(label, intraday);

  if (range === "1D") {
    return date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });   // "10:30 pm"
  }
  if (intraday) {
    return date.toLocaleDateString(undefined, { weekday: "short", day: "numeric" });   // "Mon 23"
  }
  if (range === "5Y") {
    return date.toLocaleDateString(undefined, { year: "numeric" });                     // "2024"
  }
  if (range === "6M" || range === "YTD" || range === "1Y") {
    return date.toLocaleDateString(undefined, { month: "short", year: "numeric" });     // "Oct 2026"
  }
  return date.toLocaleDateString(undefined, { day: "numeric", month: "short" });        // "23 Oct"
}

// Title of the hover box
function tooltipLabel(label, range) {
  const intraday = Boolean(RANGES[range].intraday);
  const date = toDate(label, intraday);

  if (intraday) {
    return date.toLocaleString(undefined, {
      weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit",
    });   // "Mon, 23 Nov, 10:30 pm"
  }
  return date.toLocaleDateString(undefined, {
    weekday: "short", day: "numeric", month: "short", year: "numeric",
  });     // "Fri, 6 Nov 2026"
}

// ===== Fetch helper: get JSON from a URL =====
async function getJSON(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Server replied ${response.status}`);
  }
  return response.json();
}

// ===== Key stats: formatting helpers =====
function isNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

// Finnhub gives market cap in millions of dollars → show as $3.45T, $812.3B…
function formatBigMoney(millions) {
  if (!isNumber(millions)) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    notation: "compact",
    maximumFractionDigits: 2,
  }).format(millions * 1_000_000);
}

function formatMoneyOrDash(value) {
  return isNumber(value) ? formatMoney(value) : "—";
}

function formatNumber(value) {
  return isNumber(value) ? value.toFixed(2) : "—";
}

function formatPercent(value) {
  return isNumber(value) ? `${value.toFixed(2)}%` : "—";
}

// One row of a stats list, with its ⓘ button
function statRow(term, label, value) {
  return `
    <div>
      <dt>${label}<button type="button" class="info-btn" data-term="${term}" aria-label="What is ${label}?">i</button></dt>
      <dd>${value}</dd>
    </div>`;
}

// ===== Plain-English explanations for each stat =====
const STAT_INFO = {
  marketCap: "Market cap is the total value of all the company's shares: share price × number of shares. It tells you how big the company is.",
  pe: "P/E (price-to-earnings) ratio = share price ÷ profit per share over the last 12 months. Roughly, it's how many dollars investors pay for $1 of yearly profit. A high P/E can mean investors expect strong growth, or that the stock is expensive. It isn't meaningful when a company is making a loss.",
  eps: "EPS (earnings per share) is the company's profit over the last 12 months divided by its number of shares. Rising EPS over time usually means the business is growing its profits.",
  high52: "The 52-week high is the highest price the stock reached in the past year.",
  low52: "The 52-week low is the lowest price the stock reached in the past year. Comparing today's price with the high and low shows where it sits in its yearly range.",
  dividend: "Dividend yield = yearly dividends per share ÷ share price, shown as a %. It's the cash return you'd get from dividends alone. Many growth companies pay little or no dividend.",
  beta: "Beta shows how much a stock tends to move compared with the overall market. 1 means it moves about as much as the market; above 1 means bigger swings; below 1 means calmer.",
};

// Show or hide an explanation when an ⓘ button is clicked
quoteResult.addEventListener("click", (event) => {
  const button = event.target.closest(".info-btn");
  if (!button) return;

  // Each section has its own explanation box: use the nearest one
  const box = button.closest(".explain-scope").querySelector(".stat-explain");
  const term = button.dataset.term;

  // Clicking the same ⓘ again closes it
  if (!box.hidden && box.dataset.term === term) {
    box.hidden = true;
    return;
  }

  box.dataset.term = term;
  box.textContent = STAT_INFO[term];
  box.hidden = false;
});

// ===== Related companies =====
// Build the chips (skip the stock itself, show up to 8)
function peerChips(symbol, peers) {
  const list = (Array.isArray(peers) ? peers : [])
    .filter((p) => p !== symbol && /^[A-Z.\-]{1,10}$/.test(p))
    .slice(0, 8);

  if (list.length === 0) return "";

  const chips = list
    .map((p) => `<a class="peer-chip" href="stock.html?symbol=${p}">${p}</a>`)
    .join("");

  return `
    <h3 class="stats-title">Related companies</h3>
    <div class="peer-list">${chips}</div>`;
}

// ===== About the company =====
function aboutSection(p) {
  if (!p || !p.name) return "";

  const site = p.weburl
    ? `<a href="${p.weburl}" target="_blank" rel="noopener noreferrer">${p.weburl.replace(/^https?:\/\//, "").replace(/\/$/, "")}</a>`
    : "—";

  return `
    <h3 class="stats-title">About ${p.name}</h3>
    <dl class="quote-stats">
      <div><dt>Industry</dt><dd class="text-dd">${p.finnhubIndustry || "—"}</dd></div>
      <div><dt>Country</dt><dd class="text-dd">${p.country || "—"}</dd></div>
      <div><dt>Exchange</dt><dd class="text-dd">${shortExchange(p.exchange) || "—"}</dd></div>
      <div><dt>Listed since</dt><dd class="text-dd">${p.ipo || "—"}</dd></div>
      <div><dt>Website</dt><dd class="text-dd">${site}</dd></div>
    </dl>`;
}

// ===== Latest news (last 7 days) =====
async function loadNews(symbol) {
  const box = document.querySelector("#news-list");
  const toDate7 = new Date();
  const fromDate7 = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const day = (d) => d.toISOString().slice(0, 10);   // "2026-11-24"

  try {
       const url = `${API}/finnhub/company-news?symbol=${symbol}&from=${day(fromDate7)}&to=${day(toDate7)}`;
    const items = await getJSON(url);
    const top = (Array.isArray(items) ? items : [])
      .filter((n) => n.headline && n.url)
      .slice(0, 6);

    if (top.length === 0) {
      box.innerHTML = `<p class="quote-message">No recent news for ${symbol}.</p>`;
      return;
    }

    box.innerHTML = "";
    top.forEach((n) => {
      const link = document.createElement("a");
      link.className = "news-item";
      link.href = n.url;
      link.target = "_blank";
      link.rel = "noopener noreferrer";

      const headline = document.createElement("p");
      headline.className = "news-headline";
      headline.textContent = n.headline;   // textContent = safe, never runs code

      const meta = document.createElement("p");
      meta.className = "news-meta";
      meta.textContent = `${n.source} · ${timeAgo(n.datetime)}`;

      link.append(headline, meta);
      box.append(link);
    });
  } catch (error) {
    console.error(error);
    box.innerHTML = `<p class="quote-message">Couldn't load news right now.</p>`;
  }
}

// Turn a timestamp into "5m ago", "3h ago", "2d ago"
function timeAgo(unixSeconds) {
  const minutes = Math.round((Date.now() / 1000 - unixSeconds) / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

// ===== Tidy exchange names =====
function shortExchange(name) {
  if (!name) return "";
  const upper = name.toUpperCase();
  if (upper.includes("NASDAQ")) return "NASDAQ";
  if (upper.includes("NEW YORK STOCK EXCHANGE")) return "NYSE";
  return name.split(" - ")[0];
}

// ===== 52-week range bar =====
function rangeBar(price, low, high) {
  if (!isNumber(price) || !isNumber(low) || !isNumber(high) || high <= low) return "";
  const position = Math.min(100, Math.max(0, ((price - low) / (high - low)) * 100));
  return `
    <div class="range-bar" role="img" aria-label="Today's price is ${position.toFixed(0)}% of the way from the 52-week low to the 52-week high">
      <div class="range-bar-track">
        <span class="range-bar-dot" style="left: ${position}%"></span>
      </div>
      <div class="range-bar-labels"><span>52-week low</span><span>52-week high</span></div>
    </div>`;
}

// ===== US market open / closed =====
// Regular hours: Mon–Fri, 9:30am–4:00pm New York time (public holidays not included yet)
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function newYorkNow() {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "short",
    hour: "numeric",
    minute: "numeric",
    hour12: false,
  }).formatToParts(new Date());
  const get = (type) => parts.find((p) => p.type === type).value;
  return {
    dayIndex: WEEKDAYS.indexOf(get("weekday")),
    minutes: (Number(get("hour")) % 24) * 60 + Number(get("minute")),
  };
}

function formatDuration(totalMinutes) {
  if (totalMinutes >= 24 * 60) {
    return `${Math.floor(totalMinutes / 1440)}d ${Math.floor((totalMinutes % 1440) / 60)}h`;
  }
  return `${Math.floor(totalMinutes / 60)}h ${totalMinutes % 60}m`;
}

function marketStatusHTML() {
  const { dayIndex, minutes } = newYorkNow();
  const OPEN = 9 * 60 + 30;   // 9:30am
  const CLOSE = 16 * 60;      // 4:00pm
  const isWeekday = dayIndex >= 1 && dayIndex <= 5;

  if (isWeekday && minutes >= OPEN && minutes < CLOSE) {
    return `<span class="dot open"></span>US market open · closes in ${formatDuration(CLOSE - minutes)}`;
  }

  // Find the next weekday opening time
  for (let d = 0; d <= 7; d++) {
    const day = (dayIndex + d) % 7;
    const until = d * 24 * 60 + OPEN - minutes;
    if (day >= 1 && day <= 5 && until > 0) {
      return `<span class="dot"></span>US market closed · opens in ${formatDuration(until)}`;
    }
  }
  return `<span class="dot"></span>US market closed`;
}

// ===== When the page opens: read the symbol from the address =====
// e.g. stock.html?symbol=AAPL → "AAPL"
const params = new URLSearchParams(window.location.search);
const startSymbol = (params.get("symbol") || "").toUpperCase();

if (/^[A-Z.\-]{1,10}$/.test(startSymbol)) {
  searchInput.value = startSymbol;
  showQuote(startSymbol);
} else {
  showMessage("Search for a stock above, e.g. AAPL.");
}

// ===== Pin to dashboard =====
function pinButtonHTML(symbol) {
  const pinned = isPinned(symbol);
  return `
    <button type="button" class="pin-btn ${pinned ? "pinned" : ""}" data-symbol="${symbol}" aria-pressed="${pinned}">
      <span class="pin-star" aria-hidden="true">${pinned ? "★" : "☆"}</span>
      <span>${pinned ? "Pinned" : "Pin to dashboard"}</span>
    </button>`;
}

quoteResult.addEventListener("click", (event) => {
  const button = event.target.closest(".pin-btn");
  if (!button) return;

  const symbol = button.dataset.symbol;
  const result = togglePin(symbol);

  if (result.full) {
    showToast(`You can pin up to ${MAX_PINS} stocks. Unpin one first.`);
    return;
  }

  button.outerHTML = pinButtonHTML(symbol);   // redraw the button in its new state
  showToast(result.pinned ? `${symbol} pinned to your dashboard` : `${symbol} removed from your dashboard`);
});
// ===== Redraw the chart in the new colours when the theme changes =====
window.addEventListener("themechange", () => {
  if (currentSymbol && priceChart) {
    selectRange(currentRange);
  }
});

// ===== Near-live updates =====
// While the US market is open, the price refreshes every minute.
// It pauses when the tab is hidden, and when the market is closed only the open/closed status updates.
const REFRESH_MS = 60 * 1000;   // 1 minute (our server also saves quotes for 1 minute)
let refreshTimer = null;

function isMarketOpen() {
  const { dayIndex, minutes } = newYorkNow();
  const isWeekday = dayIndex >= 1 && dayIndex <= 5;
  return isWeekday && minutes >= 9 * 60 + 30 && minutes < 16 * 60;
}

async function refreshQuote() {
  if (!currentSymbol || document.hidden) return;

  // Keep the "opens in 10h 46m" countdown up to date
  const status = document.querySelector(".market-status");
  if (status) status.innerHTML = marketStatusHTML();

  if (!isMarketOpen()) return;

  try {
    const q = await getJSON(`${API}/finnhub/quote?symbol=${currentSymbol}`);
    if (q && q.c) updateQuoteNumbers(q);
    
    // If the 1D chart is showing, add new 5-minute points as they arrive
    if (currentRange === "1D" && priceChart) {
      const points = await getIntraday(currentSymbol, "1D");
      const lastOnChart = priceChart.data.labels[priceChart.data.labels.length - 1];
      const lastNew = points[points.length - 1]?.date;
      if (currentRange === "1D" && lastNew && lastNew !== lastOnChart) {
        drawChart(points, "1D");
      }
    }
  } catch (error) {
    console.error(error);   // if one refresh fails, keep the old numbers on screen
  }
}

// Put new numbers on the page without redrawing everything
function updateQuoteNumbers(q) {
  const priceEl = document.querySelector(".quote-price");
  const changeEl = document.querySelector(".quote-change");
  if (!priceEl || !changeEl) return;

  const oldPrice = priceEl.textContent;
  const newPrice = formatMoney(q.c);
  priceEl.textContent = newPrice;

  const sign = q.d >= 0 ? "+" : "";
  changeEl.textContent = `${sign}${q.d.toFixed(2)} (${sign}${q.dp.toFixed(2)}%) today`;
  changeEl.classList.toggle("up", q.d >= 0);
  changeEl.classList.toggle("down", q.d < 0);

  const high = document.querySelector("#stat-high");
  const low = document.querySelector("#stat-low");
  if (high) high.textContent = formatMoney(q.h);
  if (low) low.textContent = formatMoney(q.l);

  // A short gold flash when the price changes
  if (oldPrice !== newPrice) {
    priceEl.classList.remove("flash");
    void priceEl.offsetWidth;   // restarts the animation
    priceEl.classList.add("flash");
  }
}

refreshTimer = setInterval(refreshQuote, REFRESH_MS);

// When you come back to the tab, catch up straight away
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) refreshQuote();
});

// ===== Practice trading panel (Buy / Sell) =====
// Uses the practice money in portfolio.js. Nothing here is real money or a real order.
let tradeSide = "buy";      // "buy" or "sell"
let tradeUnit = "shares";   // "shares" or "dollars"
let pendingTrade = null;    // the trade waiting for you to press Confirm

function tradePanelHTML(symbol) {
  tradeSide = "buy";
  tradeUnit = "shares";
  pendingTrade = null;
  return `
    <div class="trade-panel" data-symbol="${symbol}">
      <h3 class="stats-title side-title">Practice trade</h3>
      <div class="range-buttons" role="group" aria-label="Buy or sell">
        <button type="button" class="range-btn active" data-side="buy" aria-pressed="true">Buy</button>
        <button type="button" class="range-btn" data-side="sell" aria-pressed="false">Sell</button>
      </div>
      <div class="range-buttons" role="group" aria-label="Amount in">
        <button type="button" class="range-btn active" data-unit="shares" aria-pressed="true">Shares</button>
        <button type="button" class="range-btn" data-unit="dollars" aria-pressed="false">Dollars</button>
      </div>
      <label for="trade-amount" class="sr-only">Amount</label>
      <input id="trade-amount" class="trade-input" type="number" min="0" step="any" inputmode="decimal" placeholder="Number of shares">
      <p id="trade-preview" class="trade-preview">&nbsp;</p>
      <button type="button" id="trade-review" class="btn-gold trade-btn">Review buy</button>
      <div id="trade-confirm" class="trade-confirm" hidden></div>
      <p id="trade-holding" class="trade-holding">${holdingText(symbol)}</p>
      <p class="trade-note">Practice money only, never a real trade. Orders fill straight away at the latest price${isMarketOpen() ? "" : " (the US market is closed, so that's the last closing price)"}.</p>
    </div>`;
}

// "You own 2 AAPL shares (avg cost $356.05) · Practice cash $99,287.86"
function holdingText(symbol) {
  const account = getAccount();
  const h = account.holdings[symbol];
  const owned = h
    ? `You own ${h.shares} ${symbol} share${h.shares === 1 ? "" : "s"} (avg cost ${practiceMoney(h.cost / h.shares)})`
    : `You don't own any ${symbol} yet`;
  return `${owned} · Practice cash ${practiceMoney(account.cash)}`;
}

// Work out shares, price and total from what you typed (uses the price shown on the page)
function tradeNumbers() {
  const amount = Number(document.querySelector("#trade-amount").value);
  const price = Number((document.querySelector(".quote-price")?.textContent || "").replace(/[^0-9.]/g, ""));
  if (!(amount > 0) || !(price > 0)) return null;
  const shares = roundShares(tradeUnit === "shares" ? amount : amount / price);
  return { shares, price, total: roundMoney(shares * price) };
}

function showTradeMessage(text, isError) {
  const preview = document.querySelector("#trade-preview");
  preview.textContent = text || "\u00a0";
  preview.classList.toggle("down", Boolean(isError));
}

function updateTradePreview() {
  const n = tradeNumbers();
  showTradeMessage(n ? `≈ ${n.shares} share${n.shares === 1 ? "" : "s"} × ${practiceMoney(n.price)} = ${practiceMoney(n.total)}` : "");
}

function closeConfirm() {
  pendingTrade = null;
  const box = document.querySelector("#trade-confirm");
  if (box) {
    box.hidden = true;
    box.innerHTML = "";
  }
}

// Typing an amount updates the preview
quoteResult.addEventListener("input", (event) => {
  if (event.target.id === "trade-amount") {
    closeConfirm();
    updateTradePreview();
  }
});

// All the panel's buttons
quoteResult.addEventListener("click", (event) => {
  const panel = event.target.closest(".trade-panel");
  if (!panel) return;
  const symbol = panel.dataset.symbol;

  // Buy/Sell and Shares/Dollars switches
  const sideBtn = event.target.closest("[data-side]");
  const unitBtn = event.target.closest("[data-unit]");
  if (sideBtn || unitBtn) {
    if (sideBtn) tradeSide = sideBtn.dataset.side;
    if (unitBtn) tradeUnit = unitBtn.dataset.unit;
    panel.querySelectorAll("[data-side]").forEach((b) => {
      b.classList.toggle("active", b.dataset.side === tradeSide);
      b.setAttribute("aria-pressed", b.dataset.side === tradeSide);
    });
    panel.querySelectorAll("[data-unit]").forEach((b) => {
      b.classList.toggle("active", b.dataset.unit === tradeUnit);
      b.setAttribute("aria-pressed", b.dataset.unit === tradeUnit);
    });
    panel.querySelector("#trade-amount").placeholder = tradeUnit === "shares" ? "Number of shares" : "Amount in US$";
    panel.querySelector("#trade-review").textContent = tradeSide === "buy" ? "Review buy" : "Review sell";
    closeConfirm();
    updateTradePreview();
    return;
  }

  // Review: show what will happen, with Confirm / Cancel
  if (event.target.closest("#trade-review")) {
    const n = tradeNumbers();
    if (!n) {
      showTradeMessage("Enter an amount first.", true);
      return;
    }
    pendingTrade = { symbol, side: tradeSide, ...n };
    const box = panel.querySelector("#trade-confirm");
    box.innerHTML = `
      <p>${tradeSide === "buy" ? "Buy" : "Sell"} <strong>${n.shares}</strong> ${symbol} at ${practiceMoney(n.price)}<br>
      Total: <strong>${practiceMoney(n.total)}</strong></p>
      <div class="trade-confirm-btns">
        <button type="button" class="btn-gold" id="trade-confirm-btn">Confirm ${tradeSide}</button>
        <button type="button" class="range-btn" id="trade-cancel-btn">Cancel</button>
      </div>`;
    box.hidden = false;
    return;
  }

  if (event.target.closest("#trade-cancel-btn")) {
    closeConfirm();
    return;
  }

  // Confirm: make the practice trade
  if (event.target.closest("#trade-confirm-btn") && pendingTrade) {
    const t = pendingTrade;
    closeConfirm();
    const result = t.side === "buy"
      ? practiceBuy(t.symbol, t.shares, t.price)
      : practiceSell(t.symbol, t.shares, t.price);

    if (!result.ok) {
      showTradeMessage(result.error, true);
      return;
    }

    panel.querySelector("#trade-amount").value = "";
    showTradeMessage("");
    panel.querySelector("#trade-holding").textContent = holdingText(t.symbol);

    const verb = t.side === "buy" ? "Bought" : "Sold";
    const profit = result.trade.profit;
    const extra = t.side === "sell" ? ` · ${profit >= 0 ? "profit" : "loss"} ${practiceMoney(Math.abs(profit))}` : "";
    showToast(`${verb} ${t.shares} ${t.symbol} for ${practiceMoney(result.trade.total)}${extra}`);
  }
});