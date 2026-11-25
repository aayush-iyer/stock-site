// ===== Search suggestions (shared by every page with a search bar) =====
// As you type a company name or ticker, matching US stocks and ETFs appear under the box.
// Works with the mouse, or with the arrow keys + Enter. Escape closes the list.
(function () {
  const SUGGEST_API = "https://trading-room-api.aayush-iyer.workers.dev";
  const form = document.querySelector(".search");
  const input = document.querySelector("#search-input");
  if (!form || !input) return;

  // The dropdown list, added just under the search box
  const list = document.createElement("ul");
  list.id = "search-suggestions";
  list.className = "suggestions";
  list.setAttribute("role", "listbox");
  list.hidden = true;
  form.append(list);

  // Tell screen readers this box has suggestions
  input.setAttribute("role", "combobox");
  input.setAttribute("aria-autocomplete", "list");
  input.setAttribute("aria-controls", list.id);
  input.setAttribute("aria-expanded", "false");

  const TYPE_LABELS = { "Common Stock": "Stock", "ETP": "ETF", "ADR": "ADR", "REIT": "REIT" };
  let timer = null;
  let latestQuery = "";
  let results = [];
  let activeIndex = -1;

  function go(symbol) {
    window.location.href = `stock.html?symbol=${encodeURIComponent(symbol)}`;
  }

  function close() {
    list.hidden = true;
    list.innerHTML = "";
    input.setAttribute("aria-expanded", "false");
    input.removeAttribute("aria-activedescendant");
    results = [];
    activeIndex = -1;
  }

  function highlight(index) {
    activeIndex = index;
    list.querySelectorAll(".suggestion").forEach((li, i) => {
      li.classList.toggle("active", i === index);
      li.setAttribute("aria-selected", i === index);
    });
    input.setAttribute("aria-activedescendant", `suggestion-${index}`);
  }

  function show(items, query) {
    results = items;
    activeIndex = -1;
    list.innerHTML = "";

    if (items.length === 0) {
      const empty = document.createElement("li");
      empty.className = "suggestion-empty";
      empty.textContent = `No US stocks or ETFs match "${query}"`;
      list.append(empty);
    }

    items.forEach((item, i) => {
      const li = document.createElement("li");
      li.id = `suggestion-${i}`;
      li.className = "suggestion";
      li.setAttribute("role", "option");
      li.setAttribute("aria-selected", "false");

      const symbol = document.createElement("strong");
      symbol.textContent = item.symbol;
      const name = document.createElement("span");
      name.className = "suggestion-name";
      name.textContent = item.description;   // textContent = safe, never runs code
      const tag = document.createElement("span");
      tag.className = "type-tag";
      tag.textContent = TYPE_LABELS[item.type] || item.type || "";

      li.append(symbol, name, tag);
      // mousedown (not click) so it fires before the box loses focus
      li.addEventListener("mousedown", (event) => {
        event.preventDefault();
        go(item.symbol);
      });
      list.append(li);
    });

    list.hidden = false;
    input.setAttribute("aria-expanded", "true");
  }

  async function lookup(query) {
    try {
      const response = await fetch(`${SUGGEST_API}/finnhub/search?q=${encodeURIComponent(query)}&exchange=US`);
      if (!response.ok) throw new Error(`Server replied ${response.status}`);
      const data = await response.json();
      if (query !== latestQuery) return;   // you kept typing: ignore this older answer

      const items = (data.result || [])
        .filter((r) => /^[A-Z.\-]{1,10}$/.test(r.symbol))
        .slice(0, 8);
      show(items, query);
    } catch (error) {
      console.error(error);
      close();
    }
  }

  // Wait until you pause typing for a moment before searching
  input.addEventListener("input", () => {
    const query = input.value.trim();
    latestQuery = query;
    clearTimeout(timer);
    if (query === "") {
      close();
      return;
    }
    timer = setTimeout(() => lookup(query), 250);
  });

  input.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      close();
      return;
    }
    if (list.hidden || results.length === 0) return;

    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const step = event.key === "ArrowDown" ? 1 : -1;
      highlight((activeIndex + step + results.length) % results.length);
    } else if (event.key === "Enter") {
      // Enter picks the highlighted one, or an exact ticker match, or the top result
      event.preventDefault();
      const typed = input.value.trim().toUpperCase();
      const exact = results.find((r) => r.symbol === typed);
      const pick = activeIndex >= 0 ? results[activeIndex] : exact || results[0];
      go(pick.symbol);
    }
  });

  // Clicking anywhere else closes the list
  input.addEventListener("blur", () => setTimeout(close, 150));
})();