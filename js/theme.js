/* ==========================================================================
   NovaConvert — theme.js
   Handles dark / light / system theme, persisted to localStorage and
   reactive to OS-level changes when "system" is selected.
   ========================================================================== */
import { storage } from "./utils.js?v=3";

const MEDIA = window.matchMedia("(prefers-color-scheme: dark)");

function resolve(mode) {
  if (mode === "system") return MEDIA.matches ? "dark" : "light";
  return mode;
}

function apply(mode) {
  document.documentElement.setAttribute("data-theme", resolve(mode));
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", resolve(mode) === "dark" ? "#05060d" : "#f3f4fb");
}

export function initTheme() {
  const mode = storage.get("theme", "system");
  apply(mode);
  MEDIA.addEventListener("change", () => {
    if (storage.get("theme", "system") === "system") apply("system");
  });
  syncButtons(mode);
}

export function setTheme(mode) {
  storage.set("theme", mode);
  apply(mode);
  syncButtons(mode);
}

export function getTheme() {
  return storage.get("theme", "system");
}

export function toggleTheme() {
  const current = resolve(getTheme());
  setTheme(current === "dark" ? "light" : "dark");
}

function syncButtons(mode) {
  document.querySelectorAll("[data-theme-option]").forEach((btn) => {
    btn.setAttribute("aria-pressed", String(btn.dataset.themeOption === mode));
  });
}
