// ===== Practice account (shared by every page) =====
// Every visitor starts with US$100,000 of PRACTICE money. Nothing here is real money.
// For now it's saved in this browser (localStorage). In Block 5 it moves to your account.
//
// Saved shape:
// {
//   cash: 100000,
//   holdings: { AAPL: { shares: 2, cost: 708.14 } },   // cost = total paid for the shares you still own
//   trades: [ { id, time, side: "buy" | "sell", symbol, shares, price, total, profit? } ],   // newest first
//   createdAt: "2026-11-25T06:00:00.000Z"
// }

const PRACTICE_KEY = "practiceAccount";
const STARTING_CASH = 100000;

// Money is kept to the cent, shares to 4 decimal places (so you can buy part of a share)
const roundMoney = (n) => Math.round(n * 100) / 100;
const roundShares = (n) => Math.round(n * 10000) / 10000;

function practiceMoney(n) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);
}

function newAccount() {
  return { version: 1, cash: STARTING_CASH, holdings: {}, trades: [], createdAt: new Date().toISOString() };
}

// Read the account (creates a fresh one the first time)
function getAccount() {
  try {
    const saved = JSON.parse(localStorage.getItem(PRACTICE_KEY));
    if (saved && typeof saved.cash === "number" && saved.holdings && Array.isArray(saved.trades)) {
      return saved;
    }
  } catch (error) {
    console.warn(error);
  }
  const account = newAccount();
  saveAccount(account);
  return account;
}

// Save it, and tell any page that's listening that it changed
function saveAccount(account) {
  localStorage.setItem(PRACTICE_KEY, JSON.stringify(account));
  window.dispatchEvent(new CustomEvent("accountchange"));
}

function resetAccount() {
  const account = newAccount();
  saveAccount(account);
  return account;
}

// ===== Buy =====
// Returns { ok: true, trade } or { ok: false, error: "message to show" }
function practiceBuy(symbol, shares, price) {
  shares = roundShares(shares);
  if (!(shares > 0)) return { ok: false, error: "Enter how many shares to buy." };
  if (!(price > 0)) return { ok: false, error: "There's no live price right now, so the trade can't go through." };

  const account = getAccount();
  const total = roundMoney(shares * price);
  if (total < 1) return { ok: false, error: "The smallest trade is $1." };
  if (total > account.cash) {
    return { ok: false, error: `Not enough practice cash. You have ${practiceMoney(account.cash)} available.` };
  }

  const holding = account.holdings[symbol] || { shares: 0, cost: 0 };
  holding.shares = roundShares(holding.shares + shares);
  holding.cost = roundMoney(holding.cost + total);
  account.holdings[symbol] = holding;
  account.cash = roundMoney(account.cash - total);

  const trade = { id: Date.now(), time: new Date().toISOString(), side: "buy", symbol, shares, price, total };
  account.trades.unshift(trade);
  saveAccount(account);
  return { ok: true, trade };
}

// ===== Sell =====
// Profit = what you sold for − what those shares cost you (average cost)
function practiceSell(symbol, shares, price) {
  shares = roundShares(shares);
  if (!(shares > 0)) return { ok: false, error: "Enter how many shares to sell." };
  if (!(price > 0)) return { ok: false, error: "There's no live price right now, so the trade can't go through." };

  const account = getAccount();
  const holding = account.holdings[symbol];
  if (!holding || holding.shares <= 0) return { ok: false, error: `You don't own any ${symbol} shares yet.` };
  if (shares > holding.shares) return { ok: false, error: `You only own ${holding.shares} ${symbol} shares.` };

  const total = roundMoney(shares * price);
  const sellingAll = shares >= holding.shares;
  const costOfSold = sellingAll ? holding.cost : roundMoney(holding.cost * (shares / holding.shares));
  const profit = roundMoney(total - costOfSold);

  if (sellingAll) {
    delete account.holdings[symbol];
  } else {
    holding.shares = roundShares(holding.shares - shares);
    holding.cost = roundMoney(holding.cost - costOfSold);
  }
  account.cash = roundMoney(account.cash + total);

  const trade = { id: Date.now(), time: new Date().toISOString(), side: "sell", symbol, shares, price, total, profit };
  account.trades.unshift(trade);
  saveAccount(account);
  return { ok: true, trade };
}