/* ==========================================================================
   NovaConvert — ui/nav.js
   Site chrome: mobile nav drawer, header search + category filtering of the
   tool grid, theme toggle, the hero drop zone's "smart" tool routing, and
   global keyboard shortcuts.
   ========================================================================== */
import { toast } from "../utils.js?v=3";
import { toggleTheme } from "../theme.js?v=3";
import { toggleFavorite, addToQueue, bus } from "../state.js?v=3";
import { renderToolGrid, renderCategoryTabs } from "./render.js?v=3";
import { openTool } from "./workspace.js?v=3";

let uiState = { category: "all", query: "" };

const EXT_TOOL_MAP = {
  jpg: "image-convert", jpeg: "image-convert", png: "image-convert", webp: "image-convert", bmp: "image-convert", gif: "image-convert",
  docx: "word-to-pdf", txt: "text-to-pdf", zip: "zip-extract",
  mp3: "audio-convert", wav: "audio-convert", ogg: "audio-convert", aac: "audio-convert", m4a: "audio-convert",
  mp4: "video-convert", webm: "video-convert", mov: "video-convert", avi: "video-convert",
};

function guessTool(files) {
  const counts = {};
  files.forEach((f) => {
    const ext = f.name.split(".").pop().toLowerCase();
    const tool = EXT_TOOL_MAP[ext];
    if (tool) counts[tool] = (counts[tool] || 0) + 1;
  });
  const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  return entries[0]?.[0] || null;
}

function refreshGrid() {
  const grid = document.getElementById("toolGrid");
  renderToolGrid(grid, {
    category: uiState.category,
    query: uiState.query,
    onSelect: openTool,
    onToggleFavorite: (id) => {
      toggleFavorite(id);
      refreshGrid();
    },
  });
}

export function initNav() {
  refreshGrid();
  bus.on("favorites:change", refreshGrid);

  /* Category tabs */
  const tabs = document.getElementById("categoryTabs");
  const setCategory = (cat) => {
    uiState.category = cat;
    tabs.querySelectorAll(".cat-tab").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.cat === cat)));
    refreshGrid();
  };
  renderCategoryTabs(tabs, uiState.category, setCategory);

  /* Search */
  const search = document.getElementById("searchInput");
  search.addEventListener("input", () => {
    uiState.query = search.value;
    refreshGrid();
  });

  /* Theme toggle */
  document.getElementById("themeToggle").addEventListener("click", toggleTheme);
  document.getElementById("mobileThemeToggle")?.addEventListener("click", toggleTheme);

  /* Mobile nav drawer */
  const drawer = document.getElementById("navDrawer");
  const navToggle = document.getElementById("navToggle");
  const openDrawer = () => {
    drawer.dataset.open = "true";
    navToggle.setAttribute("aria-expanded", "true");
  };
  const closeDrawer = () => {
    drawer.dataset.open = "false";
    navToggle.setAttribute("aria-expanded", "false");
  };
  navToggle.addEventListener("click", openDrawer);
  drawer.querySelector(".nav-drawer-scrim").addEventListener("click", closeDrawer);
  drawer.querySelectorAll("a").forEach((a) => a.addEventListener("click", closeDrawer));

  /* Smooth-scroll + active nav link */
  const navLinks = [...document.querySelectorAll('.main-nav a, .nav-drawer-panel a')];
  const sections = navLinks.map((a) => document.querySelector(a.getAttribute("href"))).filter(Boolean);
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        navLinks.forEach((a) => a.classList.toggle("active", a.getAttribute("href") === `#${entry.target.id}`));
      });
    },
    { rootMargin: "-40% 0px -55% 0px" }
  );
  sections.forEach((s) => observer.observe(s));

  /* Hero drop zone: works with no tool selected, routes to the best-guess tool */
  const heroDropzone = document.getElementById("heroDropzone");
  const heroInput = document.getElementById("fileInput");
  heroDropzone.addEventListener("click", (e) => {
    if (e.target.closest("#browseBtn") || e.target === heroDropzone) heroInput.click();
  });
  heroDropzone.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      heroInput.click();
    }
  });
  document.getElementById("browseBtn").addEventListener("click", (e) => {
    e.stopPropagation();
    heroInput.click();
  });
  heroInput.addEventListener("change", () => {
    routeHeroFiles([...heroInput.files]);
    heroInput.value = "";
  });
  ["dragenter", "dragover"].forEach((evt) => heroDropzone.addEventListener(evt, (e) => { e.preventDefault(); heroDropzone.classList.add("drag-over"); }));
  ["dragleave", "drop"].forEach((evt) => heroDropzone.addEventListener(evt, (e) => { e.preventDefault(); heroDropzone.classList.remove("drag-over"); }));
  heroDropzone.addEventListener("drop", (e) => routeHeroFiles([...(e.dataTransfer?.files || [])]));

  /* Global drag files anywhere on the page onto the hero */
  window.addEventListener("dragover", (e) => e.preventDefault());
  window.addEventListener("drop", (e) => {
    if (heroDropzone.contains(e.target) || document.getElementById("wsDropzone")?.contains(e.target)) return;
    e.preventDefault();
    routeHeroFiles([...(e.dataTransfer?.files || [])]);
  });

  /* Keyboard shortcuts */
  document.addEventListener("keydown", (e) => {
    const typing = ["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement?.tagName);
    if (e.key === "/" && !typing) {
      e.preventDefault();
      search.focus();
    }
    if (e.key === "Escape") {
      closeDrawer();
      search.blur();
    }
  });
}

function routeHeroFiles(files) {
  if (!files.length) return;
  const toolId = guessTool(files);
  if (!toolId) {
    toast("Not sure which tool fits those files — pick one below.", "info");
    document.getElementById("toolsSection").scrollIntoView({ behavior: "smooth" });
    return;
  }
  openTool(toolId);
  addToQueue(files);
  toast(`Opened the best match for your file${files.length > 1 ? "s" : ""}.`, "info");
}
