// ===== Light / dark mode =====

// 1. Runs in the <head>, before the page is drawn, so there's no flash of the wrong colours.
//    Uses the saved choice, or the device's setting on a first visit.
(function () {
  let saved = null;
  try {
    saved = localStorage.getItem("theme");
  } catch {
    // storage not available: just follow the device
  }
  const prefersLight = window.matchMedia("(prefers-color-scheme: light)").matches;
  document.documentElement.dataset.theme = saved || (prefersLight ? "light" : "dark");
})();

// 2. Switch theme, remember it, and tell the charts to recolour
function setTheme(theme) {
  document.documentElement.dataset.theme = theme;
  try {
    localStorage.setItem("theme", theme);
  } catch {
    // storage not available: the switch still works for this visit
  }
  updateThemeButton();
  window.dispatchEvent(new CustomEvent("themechange", { detail: theme }));
}

// 3. Show ☀ in dark mode (click for light) and ☾ in light mode (click for dark)
function updateThemeButton() {
  const button = document.querySelector(".theme-toggle");
  if (!button) return;
  const isLight = document.documentElement.dataset.theme === "light";
  const label = isLight ? "Switch to dark mode" : "Switch to light mode";
  button.textContent = isLight ? "☾" : "☀";
  button.setAttribute("aria-label", label);
  button.title = label;
}

// 4. Once the page has loaded, connect the button
document.addEventListener("DOMContentLoaded", () => {
  updateThemeButton();
  const button = document.querySelector(".theme-toggle");
  if (button) {
    button.addEventListener("click", () => {
      const isLight = document.documentElement.dataset.theme === "light";
      setTheme(isLight ? "dark" : "light");
    });
  }
});
