// ===== Search bar =====
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
  showQuote(symbol);
});

// ===== Fetch and show a live quote =====
async function showQuote(symbol) {
  // No key available (e.g. on the online version, for now)
  if (typeof FINNHUB_KEY === "undefined") {
    showMessage("Live prices are coming soon on the online version.");
    return;
  }

  showMessage(`Loading ${symbol}…`);

  try {
    const url = `https://finnhub.io/api/v1/quote?symbol=${symbol}&token=${FINNHUB_KEY}`;
    const response = await fetch(url);       // ask Finnhub for the data
    if (!response.ok) {
      throw new Error(`Server replied ${response.status}`);
    }
    const data = await response.json();      // turn the reply into an object

    // Finnhub returns 0 for tickers it doesn't know
    if (data.c === 0) {
      showMessage(`Couldn't find "${symbol}". Try a US ticker like AAPL or MSFT.`);
      return;
    }

    renderQuote(symbol, data);
  } catch (error) {
    console.error(error);
    showMessage("Couldn't load the price. Check your internet and try again.");
  }
}

// ===== Put the quote on the page =====
function renderQuote(symbol, q) {
  const direction = q.d >= 0 ? "up" : "down";
  const sign = q.d >= 0 ? "+" : "";

  quoteResult.innerHTML = `
    <p class="quote-symbol">${symbol}</p>
    <p class="quote-price">${formatMoney(q.c)}</p>
    <p class="quote-change ${direction}">
      ${sign}${q.d.toFixed(2)} (${sign}${q.dp.toFixed(2)}%) today
    </p>
        <div class="range-buttons">
      <button type="button" class="range-btn active" data-range="1M">1M</button>
      <button type="button" class="range-btn" data-range="3M">3M</button>
      <button type="button" class="range-btn" data-range="6M">6M</button>
      <button type="button" class="range-btn" data-range="1Y">1Y</button>
    </div>
    <div class="chart-wrap">
      <canvas id="price-chart" role="img" aria-label="${symbol} price chart"></canvas>
    </div>
    <p id="chart-note" class="chart-note"></p>
    <dl class="quote-stats">
      <div><dt>Open</dt><dd>${formatMoney(q.o)}</dd></div>
      <div><dt>Day high</dt><dd>${formatMoney(q.h)}</dd></div>
      <div><dt>Day low</dt><dd>${formatMoney(q.l)}</dd></div>
      <div><dt>Prev. close</dt><dd>${formatMoney(q.pc)}</dd></div>
    </dl>
  `;
  quoteResult.hidden = false;
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
let priceChart = null;   // the chart currently on screen
let chartHistory = [];   // daily prices, oldest → newest

// Roughly how many trading days are in each range
const RANGES = { "1M": 22, "3M": 66, "6M": 130, "1Y": 260 };

async function loadChart(symbol) {
  const note = document.querySelector("#chart-note");

  if (typeof TWELVEDATA_KEY === "undefined") {
    note.textContent = "Charts are coming soon on the online version.";
    return;
  }

  note.textContent = "Loading chart…";
  try {
    chartHistory = await getHistory(symbol);
    note.textContent = "";
    drawChart("1M");
  } catch (error) {
    console.error(error);
    note.textContent = "Couldn't load the chart right now. Try again in a minute.";
  }
}

// Get 1 year of daily prices (saved for the day, to protect our free limit)
async function getHistory(symbol) {
  const today = new Date().toISOString().slice(0, 10);   // e.g. "2026-11-24"
  const cacheKey = `history-${symbol}-${today}`;

  const saved = localStorage.getItem(cacheKey);
  if (saved) {
    return JSON.parse(saved);   // already fetched today: reuse it
  }

  const url = `https://api.twelvedata.com/time_series?symbol=${symbol}&interval=1day&outputsize=260&apikey=${TWELVEDATA_KEY}`;
  const response = await fetch(url);
  const data = await response.json();

  if (data.status !== "ok") {
    throw new Error(data.message || "Chart data unavailable");
  }

  // Twelve Data sends newest first, so reverse it to oldest → newest
  const history = data.values
    .map((day) => ({ date: day.datetime, close: Number(day.close) }))
    .reverse();

  localStorage.setItem(cacheKey, JSON.stringify(history));
  return history;
}

// Draw (or redraw) the chart for a range like "3M"
function drawChart(range) {
  const points = chartHistory.slice(-RANGES[range]);
  const labels = points.map((p) => p.date);
  const prices = points.map((p) => p.close);

  // Green if the price rose over this range, red if it fell
  const rising = prices[prices.length - 1] >= prices[0];
  const css = getComputedStyle(document.documentElement);
  const lineColour = css.getPropertyValue(rising ? "--gain" : "--loss").trim();
  const textColour = css.getPropertyValue("--text-muted").trim();
  const gridColour = css.getPropertyValue("--border").trim();
  Chart.defaults.font.family = css.getPropertyValue("--font-body").trim();

  // Highlight the selected range button
  document.querySelectorAll(".range-btn").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.range === range);
  });

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
          callbacks: { label: (item) => formatMoney(item.parsed.y) },
        },
      },
      scales: {
        x: { ticks: { color: textColour, maxTicksLimit: 6 }, grid: { display: false } },
        y: { ticks: { color: textColour, callback: (value) => formatMoney(value) }, grid: { color: gridColour } },
      },
    },
  });
}

// One listener for all range buttons (they live inside the quote card)
quoteResult.addEventListener("click", (event) => {
  const button = event.target.closest(".range-btn");
  if (button && chartHistory.length > 0) {
    drawChart(button.dataset.range);
  }
});