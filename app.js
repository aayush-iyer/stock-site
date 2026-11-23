console.log("app.js is connected!");
// ===== Search bar =====

// 1. Find the search form and the text box on the page
const searchForm = document.querySelector(".search");
const searchInput = document.querySelector("#search-input");

// 2. Run this code whenever the user submits a search (Enter key or button)
searchForm.addEventListener("submit", (event) => {
  // Stop the browser from reloading the page (its default behaviour for forms)
  event.preventDefault();

  // Get what the user typed, with extra spaces removed
  const query = searchInput.value.trim();

  // If the box is empty, do nothing
  if (query === "") {
    return;
  }

  // For now, just print it. Later this will fetch real stock data.
  console.log("Searching for:", query);
});