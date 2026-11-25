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
  return `${n >= 0 ? "+" : "−"}${practiceMoney(Math.abs(n))}`;
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
        <td class="dir-num">${practiceMoney(avgCost)}</td>
        <td class="dir-num">${price ? practiceMoney(price) : "—"}</td>
        <td class="dir-num">${practiceMoney(value)}</td>
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

  document.querySelector("#sum-total").textContent = practiceMoney(total);
  const returnEl = document.querySelector("#sum-return");
  setChange(returnEl, overall, (overall / STARTING_CASH) * 100);
  returnEl.textContent += ` since you started with ${practiceMoney(STARTING_CASH)}`;

  document.querySelector("#sum-holdings").textContent = practiceMoney(holdingsValue);
  const holdingsPl = document.querySelector("#sum-holdings-pl");
  if (symbols.length) {
    setChange(holdingsPl, unrealised, holdingsCost ? (unrealised / holdingsCost) * 100 : 0);
    holdingsPl.textContent += " on what you own";
  } else {
    holdingsPl.textContent = "Nothing invested yet";
    holdingsPl.classList.remove("up", "down");
  }

  document.querySelector("#sum-cash").textContent = practiceMoney(account.cash);

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
      <td class="dir-num">${practiceMoney(t.price)}</td>
      <td class="dir-num">${practiceMoney(t.total)}</td>
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