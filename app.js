// ===== Our server (it adds the API keys, so they never reach the browser) =====
const API = "https://trading-room-api.aayush-iyer.workers.dev";

// ===== Home page: searching takes you to the stock page =====
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

// ===== Dashboard: your pinned stocks =====
const pinnedGrid = document.querySelector("#pinned-grid");
const pinCount = document.querySelector("#pin-count");
const dashNews = document.querySelector("#dash-news");
const sparkCharts = [];   // the mini charts on screen (so we can remove them before redrawing)

async function loadDashboard() {
  const pins = getPins();
  pinCount.textContent = `${pins.length} of ${MAX_PINS} pinned`;

  // Remove any old mini charts
  sparkCharts.forEach((chart) => chart.destroy());
  sparkCharts.length = 0;

  // Nothing pinned yet: explain how
  if (pins.length === 0) {
    pinnedGrid.innerHTML = `
      <div class="empty-state">
        <p class="empty-title">Pin stocks to see them here</p>
        <p class="quote-message">Search for a stock above, then tap “☆ Pin to dashboard”. You can pin up to ${MAX_PINS}.</p>
      </div>`;
    dashNews.innerHTML = `<p class="quote-message">News for your pinned stocks will appear here.</p>`;
    return;
  }


  // Draw the cards straight away (in a "loading" state), then fill each one in
  pinnedGrid.innerHTML = pins.map(pinCardHTML).join("");
  pins.forEach(fillPinCard);
  loadDashboardNews(pins);
}

// An empty card for one pinned stock
function pinCardHTML(symbol) {
  return `
    <article class="pin-card" data-symbol="${symbol}">
      <a class="pin-card-link" href="stock.html?symbol=${symbol}" aria-label="Open ${symbol}"></a>
      <div class="pin-card-top">
        <div>
          <p class="pin-symbol">${symbol}</p>
          <p class="pin-name">Loading…</p>
        </div>
        <button type="button" class="unpin-btn" data-symbol="${symbol}" aria-label="Unpin ${symbol}">×</button>
      </div>
      <p class="pin-price">—</p>
      <p class="pin-change">&nbsp;</p>
      <div class="spark-wrap"><canvas aria-hidden="true"></canvas></div>
    </article>`;
}

// Fill one card with its live price, name and mini chart
async function fillPinCard(symbol) {
  const card = pinnedGrid.querySelector(`.pin-card[data-symbol="${symbol}"]`);
  if (!card) return;

  try {
    const [quote, profile] = await Promise.all([
            getJSON(`${API}/finnhub/quote?symbol=${symbol}`),
      getJSON(`${API}/finnhub/stock/profile2?symbol=${symbol}`).catch(() => ({})),
    ]);

    const up = quote.dp >= 0;
    card.querySelector(".pin-name").textContent = profile.name || "";
    card.querySelector(".pin-price").textContent = formatMoney(quote.c);

    const change = card.querySelector(".pin-change");
    change.textContent = `${up ? "+" : ""}${quote.dp.toFixed(2)}% today`;
    change.classList.add(up ? "up" : "down");
  } catch (error) {
    console.error(error);
    card.querySelector(".pin-name").textContent = "Couldn't load price";
  }

  // Mini chart of the last month (uses the same saved daily prices as the stock page)
    try {
    const history = await getDailyHistory(symbol);
    drawSparkline(card.querySelector("canvas"), history.slice(-22));
  } catch (error) {
    console.error(error);
  }
  }
// A tiny chart with no axes or labels
function drawSparkline(canvas, points) {
  const prices = points.map((p) => p.close);
  const rising = prices[prices.length - 1] >= prices[0];
  const css = getComputedStyle(document.documentElement);
  const lineColour = css.getPropertyValue(rising ? "--gain" : "--loss").trim();

  const chart = new Chart(canvas, {
    type: "line",
    data: {
      labels: points.map((p) => p.date),
      datasets: [{
        data: prices,
        borderColor: lineColour,
        borderWidth: 2,
        pointRadius: 0,
        tension: 0.3,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      plugins: { legend: { display: false }, tooltip: { enabled: false } },
      scales: { x: { display: false }, y: { display: false } },
    },
  });
  sparkCharts.push(chart);
}

// Unpin with the × button
pinnedGrid.addEventListener("click", (event) => {
  const button = event.target.closest(".unpin-btn");
  if (!button) return;

  const symbol = button.dataset.symbol;
  togglePin(symbol);
  showToast(`${symbol} removed from your dashboard`);
  loadDashboard();
});

// ===== Combined news for all pinned stocks (last 3 days) =====
async function loadDashboardNews(pins) {
  dashNews.innerHTML = `<p class="quote-message">Loading news…</p>`;

  const day = (d) => d.toISOString().slice(0, 10);
  const toDate = new Date();
  const fromDate = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);

  // Ask for each stock's news at the same time; tag each article with its ticker
  const lists = await Promise.all(
    pins.map((symbol) =>
    getJSON(`${API}/finnhub/company-news?symbol=${symbol}&from=${day(fromDate)}&to=${day(toDate)}`)
        .then((items) => (Array.isArray(items) ? items : []).map((n) => ({ ...n, symbol })))
        .catch(() => [])
    )
  );

  // Combine, skip duplicate headlines, newest first, keep the top 10
  const seen = new Set();
  const articles = [];
  lists.flat()
    .sort((a, b) => b.datetime - a.datetime)
    .forEach((n) => {
      if (n.headline && n.url && !seen.has(n.headline) && articles.length < 10) {
        seen.add(n.headline);
        articles.push(n);
      }
    });

  if (articles.length === 0) {
    dashNews.innerHTML = `<p class="quote-message">No recent news for your pinned stocks.</p>`;
    return;
  }

  dashNews.innerHTML = "";
  articles.forEach((n) => {
    const link = document.createElement("a");
    link.className = "news-item";
    link.href = n.url;
    link.target = "_blank";
    link.rel = "noopener noreferrer";

    const headline = document.createElement("p");
    headline.className = "news-headline";
    headline.textContent = n.headline;

    const meta = document.createElement("p");
    meta.className = "news-meta";
    const tag = document.createElement("span");
    tag.className = "news-tag";
    tag.textContent = n.symbol;
    meta.append(tag, `${n.source} · ${timeAgo(n.datetime)}`);

    link.append(headline, meta);
    dashNews.append(link);
  });
}

// ===== Helpers (same as on the stock page) =====
async function getJSON(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Server replied ${response.status}`);
  }
  return response.json();
}

function formatMoney(number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(number);
}

function timeAgo(unixSeconds) {
  const minutes = Math.round((Date.now() / 1000 - unixSeconds) / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
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

// 5 years of daily prices, saved for the day (shared with the stock page)
async function getDailyHistory(symbol) {
  const today = new Date().toISOString().slice(0, 10);
  const cacheKey = `daily-${symbol}-${today}`;

  const saved = localStorage.getItem(cacheKey);
  if (saved) {
    return JSON.parse(saved);
  }

  const history = await fetchSeries(symbol, "1day", 1260);
  localStorage.setItem(cacheKey, JSON.stringify(history));
  return history;
}

// ===== Start =====
// "pageshow" also runs when you come back with the Back button,
// so the dashboard always reflects your latest pins
window.addEventListener("pageshow", loadDashboard);

// Redraw the mini charts in the new colours when the theme changes
window.addEventListener("themechange", loadDashboard);

// ===== Near-live updates for pinned cards =====
// While the US market is open, every pinned card's price refreshes once a minute
// (paused when the tab is hidden). The count line shows when prices were last updated.
function dashboardMarketOpen() {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York", weekday: "short", hour: "numeric", minute: "numeric", hour12: false,
  }).formatToParts(new Date());
  const get = (type) => parts.find((p) => p.type === type).value;
  const minutes = (Number(get("hour")) % 24) * 60 + Number(get("minute"));
  const isWeekday = !["Sat", "Sun"].includes(get("weekday"));
  return isWeekday && minutes >= 9 * 60 + 30 && minutes < 16 * 60;
}

async function refreshPinCards() {
  const pins = getPins();
  if (document.hidden || pins.length === 0 || !dashboardMarketOpen()) return;

  await Promise.all(pins.map(async (symbol) => {
    const card = pinnedGrid.querySelector(`.pin-card[data-symbol="${symbol}"]`);
    if (!card) return;
    try {
      const quote = await getJSON(`${API}/finnhub/quote?symbol=${symbol}`);
      if (!quote || !quote.c) return;
      const up = quote.dp >= 0;
      card.querySelector(".pin-price").textContent = formatMoney(quote.c);
      const change = card.querySelector(".pin-change");
      change.textContent = `${up ? "+" : ""}${quote.dp.toFixed(2)}% today`;
      change.classList.toggle("up", up);
      change.classList.toggle("down", !up);
    } catch (error) {
      console.error(error);   // keep the old price if one refresh fails
    }
  }));

  const time = new Date().toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  pinCount.textContent = `${pins.length} of ${MAX_PINS} pinned · updated ${time}`;
}

setInterval(refreshPinCards, 60 * 1000);

// Coming back to the tab: catch up straight away
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) refreshPinCards();
}); 