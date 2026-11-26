// ===== Portfolio page =====
// Reads your practice account (portfolio.js), fetches live prices for what you own,
// and shows totals, each holding's profit/loss, and your trade history.

const API = "https://trading-room-api.aayush-iyer.workers.dev";

const holdingsBody = document.querySelector("#holdings-body");
const historyBody = document.querySelector("#history-body");
const pricesNote = document.querySelector("#prices-note");
const historyNote = document.querySelector("#history-note");

// ===== Helpers =====
async function getJSON(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Server replied ${response.status}`);
  return response.json();
}

// +$12.34 / −$5.00 (a proper minus sign for losses)
function signedMoney(n) {
  return `${n >= 0 ? "+" : "−"}${displayMoney(Math.abs(n))}`;
}

function signedPercent(n) {
  return `${n >= 0 ? "+" : "−"}${Math.abs(n).toFixed(2)}%`;
}

function setChange(element, amount, percent) {
  element.textContent = percent === undefined ? signedMoney(amount) : `${signedMoney(amount)} (${signedPercent(percent)})`;
  element.classList.toggle("up", amount >= 0);
  element.classList.toggle("down", amount < 0);
}

function isMarketOpen() {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York", weekday: "short", hour: "numeric", minute: "numeric", hour12: false,
  }).formatToParts(new Date());
  const get = (type) => parts.find((p) => p.type === type).value;
  const minutes = (Number(get("hour")) % 24) * 60 + Number(get("minute"));
  return !["Sat", "Sun"].includes(get("weekday")) && minutes >= 9 * 60 + 30 && minutes < 16 * 60;
}

// A table row with one message across all columns
function messageRow(tbody, html) {
  tbody.innerHTML = `<tr><td colspan="6" class="dir-empty">${html}</td></tr>`;
}

// ===== Load and show everything =====
async function loadPortfolio() {
  const account = getAccount();
  const symbols = Object.keys(account.holdings).sort();

  // Live price for each holding, all at the same time
  const prices = {};
  await Promise.all(symbols.map(async (symbol) => {
    try {
      const q = await getJSON(`${API}/finnhub/quote?symbol=${encodeURIComponent(symbol)}`);
      if (q && q.c) prices[symbol] = q.c;
    } catch (error) {
      console.error(error);
    }
  }));

  renderPortfolio(getAccount(), prices);
}

function renderPortfolio(account, prices) {
  const symbols = Object.keys(account.holdings).sort();
  let holdingsValue = 0;
  let holdingsCost = 0;

  // --- Holdings table ---
  if (symbols.length === 0) {
    messageRow(holdingsBody, `You don't own anything yet. Find a stock in <a href="markets.html" class="card-link">Markets</a> and use the Practice trade box on its page.`);
  } else {
    holdingsBody.innerHTML = "";
    symbols.forEach((symbol) => {
      const h = account.holdings[symbol];
      const avgCost = h.cost / h.shares;
      const price = prices[symbol];                     // may be missing if a price couldn't load
      const value = roundMoney(h.shares * (price ?? avgCost));
      const profit = roundMoney(value - h.cost);
      holdingsValue += value;
      holdingsCost += h.cost;

      const tr = document.createElement("tr");
      tr.dataset.symbol = symbol;
      tr.innerHTML = `
        <td><a class="dir-symbol" href="stock.html?symbol=${encodeURIComponent(symbol)}"></a></td>
        <td class="dir-num">${h.shares}</td>
        <td class="dir-num">${displayMoney(avgCost)}</td>
        <td class="dir-num">${price ? displayMoney(price) : "—"}</td>
        <td class="dir-num">${displayMoney(value)}</td>
        <td class="dir-num pl-cell"></td>`;
      tr.querySelector(".dir-symbol").textContent = symbol;   // textContent = safe
      setChange(tr.querySelector(".pl-cell"), profit, h.cost ? (profit / h.cost) * 100 : 0);
      holdingsBody.append(tr);
    });
  }

  // --- Summary cards ---
  holdingsValue = roundMoney(holdingsValue);
  const total = roundMoney(account.cash + holdingsValue);
  const overall = roundMoney(total - STARTING_CASH);
  const unrealised = roundMoney(holdingsValue - holdingsCost);

  document.querySelector("#sum-total").textContent = displayMoney(total);
  const returnEl = document.querySelector("#sum-return");
  setChange(returnEl, overall, (overall / STARTING_CASH) * 100);
  returnEl.textContent += ` since you started with ${displayMoney(STARTING_CASH)}`;

  document.querySelector("#sum-holdings").textContent = displayMoney(holdingsValue);
  const holdingsPl = document.querySelector("#sum-holdings-pl");
  if (symbols.length) {
    setChange(holdingsPl, unrealised, holdingsCost ? (unrealised / holdingsCost) * 100 : 0);
    holdingsPl.textContent += " on what you own";
  } else {
    holdingsPl.textContent = "Nothing invested yet";
    holdingsPl.classList.remove("up", "down");
  }

  document.querySelector("#sum-cash").textContent = displayMoney(account.cash);
  drawAllocation(account, prices);
  drawValueChart(account, total);

  const time = new Date().toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  pricesNote.textContent = symbols.length
    ? (isMarketOpen() ? `Live prices · updated ${time}` : `Latest closing prices · US market closed`)
    : "";

  // --- Trade history (newest first, up to 50) ---
  const trades = account.trades.slice(0, 50);
  historyNote.textContent = account.trades.length
    ? `${account.trades.length} trade${account.trades.length === 1 ? "" : "s"}${account.trades.length > 50 ? " · showing the latest 50" : ""}`
    : "";

  if (trades.length === 0) {
    messageRow(historyBody, "No trades yet. Your buys and sells will appear here.");
    return;
  }

  historyBody.innerHTML = "";
  trades.forEach((t) => {
    const tr = document.createElement("tr");
    tr.dataset.symbol = t.symbol;
    const when = new Date(t.time).toLocaleString(undefined, {
      day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit",
    });
    tr.innerHTML = `
      <td class="trade-date"></td>
      <td><span class="side-tag ${t.side}"></span> <a class="dir-symbol" href="stock.html?symbol=${encodeURIComponent(t.symbol)}"></a></td>
      <td class="dir-num">${t.shares}</td>
      <td class="dir-num">${displayMoney(t.price)}</td>
      <td class="dir-num">${displayMoney(t.total)}</td>
      <td class="dir-num pl-cell">—</td>`;
    tr.querySelector(".trade-date").textContent = when;
    tr.querySelector(".side-tag").textContent = t.side === "buy" ? "Buy" : "Sell";
    tr.querySelector(".dir-symbol").textContent = t.symbol;
    if (t.side === "sell" && typeof t.profit === "number") {
      setChange(tr.querySelector(".pl-cell"), t.profit);
    }
    historyBody.append(tr);
  });
}

// Clicking a row opens that stock
[holdingsBody, historyBody].forEach((tbody) => {
  tbody.addEventListener("click", (event) => {
    const tr = event.target.closest("tr[data-symbol]");
    if (tr && !event.target.closest("a")) {
      window.location.href = `stock.html?symbol=${encodeURIComponent(tr.dataset.symbol)}`;
    }
  });
});

// ===== Keep it up to date =====
// Every minute while the market is open (paused when the tab is hidden)
setInterval(() => {
  if (!document.hidden && isMarketOpen()) loadPortfolio();
}, 60 * 1000);

document.addEventListener("visibilitychange", () => {
  if (!document.hidden) loadPortfolio();
});

// If you trade in another tab, update this one too
window.addEventListener("storage", (event) => {
  if (event.key === PRACTICE_KEY) loadPortfolio();
});

loadPortfolio();

// ===== Allocation chart: how your money is split =====
// Colours chosen to stay readable in both dark and light mode; cash is always grey
const ALLOC_COLOURS = ["#E9C46A", "#7FD6A0", "#F28B82", "#9FA8DA", "#4DB6AC", "#F4A261", "#81D4FA", "#CE93D8", "#FFB74D"];
const CASH_COLOUR = "#8C7A88";
let allocChart = null;
let lastAllocation = null;   // remembered so the chart can redraw when the theme changes

function drawAllocation(account, prices) {
  lastAllocation = { account, prices };

  // Value of each holding (at live price, or what you paid if the price is missing)
  const slices = Object.keys(account.holdings).map((symbol) => {
    const h = account.holdings[symbol];
    return { label: symbol, value: roundMoney(h.shares * (prices[symbol] ?? h.cost / h.shares)) };
  }).sort((a, b) => b.value - a.value);

  // More than 9 holdings: group the smallest into "Other"
  if (slices.length > 9) {
    const rest = slices.splice(8);
    slices.push({ label: "Other", value: roundMoney(rest.reduce((sum, s) => sum + s.value, 0)) });
  }
  slices.forEach((s, i) => { s.colour = ALLOC_COLOURS[i % ALLOC_COLOURS.length]; });
  if (account.cash > 0) slices.push({ label: "Cash", value: account.cash, colour: CASH_COLOUR });

  const total = slices.reduce((sum, s) => sum + s.value, 0);

  // Legend: colour, name, % and value
  const legend = document.querySelector("#alloc-legend");
  legend.innerHTML = "";
  slices.forEach((s) => {
    const li = document.createElement("li");
    li.innerHTML = `<span class="alloc-swatch" style="background:${s.colour}"></span><span class="alloc-name"></span><span class="alloc-pct">${((s.value / total) * 100).toFixed(1)}%</span><span class="alloc-value">${displayMoney(s.value)}</span>`;
    li.querySelector(".alloc-name").textContent = s.label;
    legend.append(li);
  });

  // A short tip about diversification
  const invested = total - account.cash;
  const biggest = slices.find((s) => s.label !== "Cash" && s.label !== "Other");
  const tip = document.querySelector("#alloc-tip");
  if (!biggest) {
    tip.textContent = "All cash for now. Once you buy, this shows how your money is spread out.";
  } else if (Object.keys(account.holdings).length > 1 && invested > 0 && biggest.value / invested > 0.5) {    tip.textContent = `Over half of what you've invested is in ${biggest.label}. That's concentrated: one bad day for it moves your whole portfolio. Spreading money across different companies and sectors (diversifying) lowers that risk.`;
  } else if (Object.keys(account.holdings).length === 1) {    tip.textContent = `Everything you've invested is in one stock (${biggest.label}). Spreading money across different companies and sectors (diversifying) lowers your risk.`;
  } else {
    tip.textContent = "Your money is spread across several holdings. That's diversification, which lowers the risk of one company hurting your whole portfolio.";
  }

  // The doughnut chart itself
  const css = getComputedStyle(document.documentElement);
  if (allocChart) allocChart.destroy();
  allocChart = new Chart(document.querySelector("#alloc-chart"), {
    type: "doughnut",
    data: {
      labels: slices.map((s) => s.label),
      datasets: [{
        data: slices.map((s) => s.value),
        backgroundColor: slices.map((s) => s.colour),
        borderColor: css.getPropertyValue("--surface").trim(),
        borderWidth: 2,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: "68%",
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (item) => ` ${item.label}: ${displayMoney(item.parsed)} (${((item.parsed / total) * 100).toFixed(1)}%)`,
          },
        },
      },
    },
  });
}

// Redraw in the new colours when the theme changes
window.addEventListener("themechange", () => {
  if (lastAllocation) drawAllocation(lastAllocation.account, lastAllocation.prices);
});

// ===== Value over time chart =====
// Rebuilds your account's value for every trading day since you started:
// cash on that day + (shares you held that day × that day's closing price).
// Uses the same saved daily prices as the stock pages, so it rarely needs new downloads.
let valueChart = null;
let lastValueArgs = null;   // remembered so the chart can redraw when the theme changes
const seriesCache = {};     // symbol → daily closes, kept while the page is open

// A date in New York time as "2026-11-25" (US market days follow New York time)
function nyDate(iso) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date(iso));
}

// Up to 5 years of daily closes (saved for the day under the same name the stock page uses)
async function getDailyCloses(symbol) {
  if (seriesCache[symbol]) return seriesCache[symbol];
  const today = new Date().toISOString().slice(0, 10);
  const key = `daily-${symbol}-${today}`;
  let history = null;
  try {
    history = JSON.parse(localStorage.getItem(key));
  } catch (error) {
    history = null;
  }
  if (!history) {
    const data = await getJSON(`${API}/twelvedata/time_series?symbol=${encodeURIComponent(symbol)}&interval=1day&outputsize=1260&timezone=UTC`);
    if (data.status !== "ok") throw new Error(data.message || "No price history");
    history = data.values.map((bar) => ({ date: bar.datetime, close: Number(bar.close) })).reverse();
    try {
      localStorage.setItem(key, JSON.stringify(history));
    } catch (error) {
      console.warn(error);
    }
  }
  seriesCache[symbol] = history;
  return history;
}

// The closing price on a date, or the last close before it
function closeOn(list, date) {
  let price = null;
  for (const p of list || []) {
    if (p.date > date) break;
    price = p.close;
  }
  return price;
}

// Work out the value for each trading day → [{ label, value }]
function buildValuePoints(account, series, currentTotal) {
  const trades = [...account.trades].reverse();   // oldest first
  const startDate = nyDate(account.createdAt);

  // Every trading day (from the price data) since the account was created
  const dates = new Set();
  Object.values(series).forEach((list) => list.forEach((p) => {
    if (p.date >= startDate) dates.add(p.date);
  }));

  let cash = STARTING_CASH;
  const shares = {};
  const lastTradePrice = {};
  let next = 0;
  const points = [{ label: startDate, value: STARTING_CASH }];

  [...dates].sort().forEach((date) => {
    // Apply every trade made on or before this day
    while (next < trades.length && nyDate(trades[next].time) <= date) {
      const t = trades[next++];
      cash += t.side === "buy" ? -t.total : t.total;
      shares[t.symbol] = (shares[t.symbol] || 0) + (t.side === "buy" ? t.shares : -t.shares);
      lastTradePrice[t.symbol] = t.price;
    }
    let value = cash;
    Object.keys(shares).forEach((symbol) => {
      if (shares[symbol] <= 0.00005) return;
      const price = closeOn(series[symbol], date) ?? lastTradePrice[symbol];
      value += shares[symbol] * price;
    });
    points.push({ label: date, value: roundMoney(value) });
  });

  // If the account was created on a trading day, that day's close replaces the starting point
  if (points[1] && points[1].label === startDate) points.shift();

  points.push({ label: "Now", value: currentTotal });
  return points;
}

function valueLabel(label) {
  if (label === "Now") return "Now";
  return new Date(`${label}T00:00:00`).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

async function drawValueChart(account, currentTotal) {
  lastValueArgs = { account, currentTotal };
  const note = document.querySelector("#value-note");

  if (account.trades.length === 0) {
    note.textContent = "Your account's value over time will appear here after your first trade.";
    if (valueChart) {
      valueChart.destroy();
      valueChart = null;
    }
    return;
  }

  // Daily prices for every stock you've ever traded
  const symbols = [...new Set(account.trades.map((t) => t.symbol))];
  const series = {};
  const results = await Promise.allSettled(symbols.map(async (symbol) => {
    series[symbol] = await getDailyCloses(symbol);
  }));
  const missing = results.some((r) => r.status === "rejected");

  const points = buildValuePoints(account, series, currentTotal);
  note.textContent = missing
    ? "Some price history couldn't load right now, so parts of this chart use your trade prices instead."
    : (points.length <= 3 ? "Just getting started: a new point is added after each US trading day." : "");

  // Draw it: a green (up) or red (down) line vs a dashed line at your US$100,000 start
  const css = getComputedStyle(document.documentElement);
  const colour = (name) => css.getPropertyValue(name).trim();
  const lineColour = colour(currentTotal >= STARTING_CASH ? "--gain" : "--loss");

  if (valueChart) valueChart.destroy();
  valueChart = new Chart(document.querySelector("#value-chart"), {
    type: "line",
    data: {
      labels: points.map((p) => p.label),
      datasets: [
        {
          data: points.map((p) => p.value),
          borderColor: lineColour,
          borderWidth: 2,
          pointRadius: points.length <= 12 ? 3 : 0,
          pointBackgroundColor: lineColour,
          pointHoverRadius: 4,
          tension: 0.25,
        },
        {
          data: points.map(() => STARTING_CASH),
          borderColor: colour("--text-muted"),
          borderDash: [6, 6],
          borderWidth: 1,
          pointRadius: 0,
          pointHoverRadius: 0,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: {
          displayColors: false,
          filter: (item) => item.datasetIndex === 0,   // only show your value, not the dashed line
          backgroundColor: colour("--surface-raised"),
          borderColor: colour("--gold"),
          borderWidth: 1,
          padding: 10,
          cornerRadius: 10,
          titleColor: colour("--gold"),
          bodyColor: colour("--text"),
          callbacks: {
            title: (items) => valueLabel(items[0].label),
            label: (item) => displayMoney(item.parsed.y),
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
              const label = this.getLabelForValue(value);
              return label === "Now" ? "Now" : new Date(`${label}T00:00:00`).toLocaleDateString(undefined, { day: "numeric", month: "short" });
            },
          },
        },
        y: {
          grid: { color: colour("--border") },
          ticks: { color: colour("--text-muted"), callback: (value) => displayMoney(value) },
        },
      },
    },
  });
}

window.addEventListener("themechange", () => {
  if (lastValueArgs) drawValueChart(lastValueArgs.account, lastValueArgs.currentTotal);
});

// ===== Currency picker =====
// Fills the "Show values in" list; choosing one re-shows everything in that currency
const currencySelect = document.querySelector("#currency-select");
const currencyNoteEl = document.querySelector("#currency-note");

currencySelect.innerHTML = Object.entries(CURRENCIES)
  .map(([code, name]) => `<option value="${code}">${code} · ${name}</option>`)
  .join("");
currencySelect.value = getDisplayCurrency();

currencySelect.addEventListener("change", () => setDisplayCurrency(currencySelect.value));

window.addEventListener("currencychange", () => {
  currencySelect.value = getDisplayCurrency();
  currencyNoteEl.textContent = currencyNote();
  loadPortfolio();
});

currencyNoteEl.textContent = currencyNote();

// ===== CSV downloads (open in Excel, Google Sheets or Numbers) =====
// Amounts are plain numbers in US$ (the currency trades happen in), so spreadsheets can add them up.

// Wrap a value in quotes if it contains a comma, quote or line break
function csvCell(value) {
  const text = String(value ?? "");
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function csvDate() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function csvDateTime(iso) {
  const d = new Date(iso);
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function holdingsRows(account, prices) {
  const rows = [["Ticker", "Shares", "Average cost (USD)", "Latest price (USD)", "Value (USD)", "Profit/loss (USD)", "Profit/loss (%)"]];
  Object.keys(account.holdings).sort().forEach((symbol) => {
    const h = account.holdings[symbol];
    const avgCost = h.cost / h.shares;
    const price = prices[symbol] ?? avgCost;
    const value = roundMoney(h.shares * price);
    const profit = roundMoney(value - h.cost);
    rows.push([symbol, h.shares, avgCost.toFixed(2), price.toFixed(2), value.toFixed(2), profit.toFixed(2), (h.cost ? (profit / h.cost) * 100 : 0).toFixed(2)]);
  });
  rows.push([]);
  rows.push(["Cash (USD)", "", "", "", account.cash.toFixed(2)]);
  return rows;
}

function tradeRows(account) {
  const rows = [["Date and time", "Trade", "Ticker", "Shares", "Price (USD)", "Total (USD)", "Profit/loss (USD)"]];
  account.trades.forEach((t) => {
    rows.push([
      csvDateTime(t.time),
      t.side === "buy" ? "Buy" : "Sell",
      t.symbol,
      t.shares,
      t.price.toFixed(2),
      t.total.toFixed(2),
      t.side === "sell" && typeof t.profit === "number" ? t.profit.toFixed(2) : "",
    ]);
  });
  return rows;
}

// Turn rows into a .csv file and save it (\uFEFF tells Excel the file is UTF-8)
function downloadCSV(filename, rows) {
  const csv = "\uFEFF" + rows.map((row) => row.map(csvCell).join(",")).join("\r\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

document.querySelector("#csv-holdings").addEventListener("click", () => {
  const prices = (lastAllocation && lastAllocation.prices) || {};
  downloadCSV(`trading-room-holdings-${csvDate()}.csv`, holdingsRows(getAccount(), prices));
});

document.querySelector("#csv-trades").addEventListener("click", () => {
  downloadCSV(`trading-room-trades-${csvDate()}.csv`, tradeRows(getAccount()));
});

// ===== Reset practice account =====
// Asks first (on the page, not a pop-up), then starts you again with US$100,000
const resetBtn = document.querySelector("#reset-btn");
const resetConfirm = document.querySelector("#reset-confirm");

resetBtn.addEventListener("click", () => {
  resetBtn.hidden = true;
  resetConfirm.hidden = false;
});

resetConfirm.addEventListener("click", (event) => {
  if (event.target.closest("#reset-cancel")) {
    resetConfirm.hidden = true;
    resetBtn.hidden = false;
    return;
  }
  if (event.target.closest("#reset-yes")) {
    resetAccount();
    resetConfirm.hidden = true;
    resetBtn.hidden = false;
    loadPortfolio();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
});