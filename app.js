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
