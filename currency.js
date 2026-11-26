// ===== Display currency (shared by the Portfolio page and the home card) =====
// Practice trades always happen in US dollars (US stocks are priced in US$).
// This only changes how your portfolio's VALUES are shown, e.g. in Singapore dollars.
// Exchange rates: Frankfurter (free, no key), which publishes official reference rates
// such as the European Central Bank's, updated once each working day.

const CURRENCY_KEY = "displayCurrency";
const RATES_KEY = "fxRates";
const CURRENCIES = {
  USD: "US dollar",
  SGD: "Singapore dollar",
  EUR: "Euro",
  GBP: "British pound",
  AUD: "Australian dollar",
  MYR: "Malaysian ringgit",
  INR: "Indian rupee",
  JPY: "Japanese yen",
  HKD: "Hong Kong dollar",
  CNY: "Chinese yuan",
};

let fxRates = null;   // { date, rates: { SGD: 1.30, ... }, fetched } — how much 1 US$ is worth

function getDisplayCurrency() {
  const code = localStorage.getItem(CURRENCY_KEY);
  return CURRENCIES[code] ? code : "USD";
}

function setDisplayCurrency(code) {
  localStorage.setItem(CURRENCY_KEY, code);
  window.dispatchEvent(new CustomEvent("currencychange"));
}

// The rate for the chosen currency (null if we don't have one yet)
function currentRate() {
  const code = getDisplayCurrency();
  if (code === "USD") return 1;
  return (fxRates && fxRates.rates && fxRates.rates[code]) || null;
}

// The currency actually used: falls back to US$ if the rate couldn't load
function displayCode() {
  return currentRate() ? getDisplayCurrency() : "USD";
}

// A US$ amount shown in the chosen currency, e.g. 1000 → "S$1,300.00"
function displayMoney(usd) {
  const code = displayCode();
  const text = new Intl.NumberFormat("en-US", { style: "currency", currency: code }).format(usd * (currentRate() || 1));
  return text.replace(/SGD\s?/, "S$").replace(/MYR\s?/, "RM");   // the symbols people in Singapore and Malaysia use
}

// "Converted at US$1 = S$1.3021 (rate for 24 Nov 2026). Practice trades are always in US$."
function currencyNote() {
  const code = displayCode();
  if (code === "USD") {
    return getDisplayCurrency() === "USD" ? "" : "Exchange rates couldn't load right now, so values are shown in US$.";
  }
  const date = new Date(`${fxRates.date}T00:00:00`).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
  return `Converted at US$1 = ${displayMoney(1).replace(/[\d.,]+$/, "")}${currentRate().toFixed(4)} (reference rate for ${date}). Practice trades are always in US$.`;
}

// Fetch today's rates (saved for the day, so it's one small download per day)
async function loadRates() {
  const today = new Date().toISOString().slice(0, 10);
  try {
    const saved = JSON.parse(localStorage.getItem(RATES_KEY));
    if (saved && saved.rates) {
      fxRates = saved;
      if (saved.fetched === today) {
        window.dispatchEvent(new CustomEvent("currencychange"));
        return;
      }
    }
  } catch (error) {
    console.warn(error);
  }

  try {
    const symbols = Object.keys(CURRENCIES).filter((c) => c !== "USD").join(",");
    const response = await fetch(`https://api.frankfurter.dev/v1/latest?base=USD&symbols=${symbols}`);
    if (!response.ok) throw new Error(`Rates server replied ${response.status}`);
    const data = await response.json();
    if (data && data.rates) {
      fxRates = { date: data.date, rates: data.rates, fetched: today };
      localStorage.setItem(RATES_KEY, JSON.stringify(fxRates));
    }
  } catch (error) {
    console.warn("Exchange rates unavailable", error);   // values stay in US$ (or yesterday's rates)
  }
  window.dispatchEvent(new CustomEvent("currencychange"));
}

loadRates();