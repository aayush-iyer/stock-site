// ===== Search bar =====
const searchForm = document.querySelector(".search");
const searchInput = document.querySelector("#search-input");

searchForm.addEventListener("submit", (event) => {
  event.preventDefault();                 // stop the page reloading
  const query = searchInput.value.trim(); // what the user typed
  if (query === "") {
    return;                               // empty box: do nothing
  }
  console.log("Searching for:", query);   // later: fetch real stock data
});