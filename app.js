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