/* ==========================================================================
   NovaConvert — app.js
   Entry point. Wires up every module in the right order and owns the two
   bits of glue that don't belong anywhere else: the history section and
   the ambient aurora canvas that gives the hero its signature look.
   ========================================================================== */
import { initTheme } from "./theme.js?v=3";
import { state, bus } from "./state.js?v=3";
import { initWorkspace } from "./ui/workspace.js?v=3";
import { initNav } from "./ui/nav.js?v=3";
import { initSettingsModal, initMetadataModal } from "./ui/modals.js?v=3";
import { renderHistory, renderHeroStats } from "./ui/render.js?v=3";

function initHistorySection() {
  const list = document.getElementById("historyList");
  renderHistory(list, state.history);
  bus.on("history:change", (h) => renderHistory(list, h));
}

function initHeroStats() {
  const el = document.getElementById("heroStats");
  renderHeroStats(el, state.stats);
  bus.on("stats:change", (s) => renderHeroStats(el, s));
}

/* ---------------- Ambient aurora canvas ----------------
   A slow-drifting nebula of soft particles behind the hero — the page's one
   deliberate flourish. Respects prefers-reduced-motion by rendering a single
   static frame instead of animating. */
function initAuroraCanvas() {
  const canvas = document.getElementById("auroraCanvas");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  let w, h, particles;

  function resize() {
    w = canvas.width = canvas.offsetWidth * devicePixelRatio;
    h = canvas.height = canvas.offsetHeight * devicePixelRatio;
  }

  function makeParticles() {
    const count = Math.round((w * h) / 90000);
    const colors = ["#8b6bff", "#2dd4e8", "#ff6b9d"];
    particles = Array.from({ length: Math.min(count, 46) }, () => ({
      x: Math.random() * w,
      y: Math.random() * h,
      r: (Math.random() * 90 + 60) * devicePixelRatio,
      color: colors[Math.floor(Math.random() * colors.length)],
      vx: (Math.random() - 0.5) * 0.15,
      vy: (Math.random() - 0.5) * 0.15,
      alpha: Math.random() * 0.12 + 0.05,
    }));
  }

  function frame() {
    ctx.clearRect(0, 0, w, h);
    particles.forEach((p) => {
      p.x += p.vx;
      p.y += p.vy;
      if (p.x < -p.r) p.x = w + p.r;
      if (p.x > w + p.r) p.x = -p.r;
      if (p.y < -p.r) p.y = h + p.r;
      if (p.y > h + p.r) p.y = -p.r;
      const grad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r);
      grad.addColorStop(0, p.color + Math.round(p.alpha * 255).toString(16).padStart(2, "0"));
      grad.addColorStop(1, p.color + "00");
      ctx.fillStyle = grad;
      ctx.fillRect(p.x - p.r, p.y - p.r, p.r * 2, p.r * 2);
    });
    if (!reduceMotion) requestAnimationFrame(frame);
  }

  resize();
  makeParticles();
  frame();
  window.addEventListener("resize", () => {
    resize();
    makeParticles();
    if (reduceMotion) frame();
  });
}

function registerServiceWorker() {
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("./sw.js").catch(() => {
        /* offline support is a progressive enhancement — safe to ignore failures */
      });
    });
  }
}

function init() {
  initTheme();
  initWorkspace();
  initNav();
  initSettingsModal();
  initMetadataModal();
  initHistorySection();
  initHeroStats();
  initAuroraCanvas();
  registerServiceWorker();

  // Footer year + settings shortcut from footer link
  const yearEl = document.getElementById("year");
  if (yearEl) yearEl.textContent = new Date().getFullYear();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
