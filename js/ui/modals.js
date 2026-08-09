/* ==========================================================================
   NovaConvert — ui/modals.js
   Generic accessible modal open/close (focus trap + ESC + scrim click),
   plus the two modals in the app: Settings and the file Metadata viewer.
   ========================================================================== */
import { format, toast } from "../utils.js";
import { state, bus, saveSettings, clearHistory } from "../state.js";
import { setTheme, getTheme } from "../theme.js";
import { getImageDimensions } from "../converters/image.js";

let lastFocused = null;

export function openModal(id) {
  const layer = document.getElementById(id);
  if (!layer) return;
  lastFocused = document.activeElement;
  layer.dataset.open = "true";
  layer.querySelector("[data-autofocus]")?.focus();
  document.body.style.overflow = "hidden";
}

export function closeModal(id) {
  const layer = document.getElementById(id);
  if (!layer) return;
  layer.dataset.open = "false";
  document.body.style.overflow = "";
  lastFocused?.focus?.();
}

function wireModalDismiss(layer) {
  layer.querySelector(".modal-scrim")?.addEventListener("click", () => closeModal(layer.id));
  layer.querySelectorAll("[data-close-modal]").forEach((btn) => btn.addEventListener("click", () => closeModal(layer.id)));
  layer.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeModal(layer.id);
    if (e.key === "Tab") {
      const focusables = [...layer.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')].filter((el) => !el.disabled);
      if (!focusables.length) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  });
}

/* ---------------- Settings modal ---------------- */
export function initSettingsModal() {
  const layer = document.getElementById("settingsModal");
  wireModalDismiss(layer);
  document.getElementById("settingsBtn").addEventListener("click", () => openModal("settingsModal"));
  document.getElementById("mobileSettingsBtn")?.addEventListener("click", () => openModal("settingsModal"));

  layer.querySelectorAll("[data-theme-option]").forEach((btn) => {
    btn.addEventListener("click", () => setTheme(btn.dataset.themeOption));
  });

  const autoDelete = document.getElementById("autoDeleteToggle");
  autoDelete.checked = state.settings.autoDelete;
  autoDelete.addEventListener("change", () => saveSettings({ autoDelete: autoDelete.checked }));

  const qualityMode = document.getElementById("qualityModeSelect");
  qualityMode.value = state.settings.qualityMode;
  qualityMode.addEventListener("change", () => saveSettings({ qualityMode: qualityMode.value }));

  const defaultQuality = document.getElementById("defaultQualityRange");
  const defaultQualityVal = document.getElementById("defaultQualityValue");
  defaultQuality.value = state.settings.defaultQuality;
  defaultQualityVal.textContent = Math.round(state.settings.defaultQuality * 100) + "%";
  defaultQuality.addEventListener("input", () => {
    const v = Number(defaultQuality.value);
    defaultQualityVal.textContent = Math.round(v * 100) + "%";
    saveSettings({ defaultQuality: v });
  });

  const langSelect = document.getElementById("languageSelect");
  langSelect.value = state.settings.themeLanguage;
  langSelect.addEventListener("change", () => {
    saveSettings({ themeLanguage: langSelect.value });
    applyLanguage(langSelect.value);
  });

  document.getElementById("clearHistoryBtn").addEventListener("click", () => {
    clearHistory();
    toast("Conversion history cleared.", "success");
  });

  applyLanguage(state.settings.themeLanguage);
}

/* ---------------- Minimal interface i18n ---------------- */
const TRANSLATIONS = {
  en: {
    navHome: "Home", navTools: "Tools", navHistory: "History",
    heroEyebrow: "Client-side · Private · Free",
    heroSub: "Images, documents, audio, and video — converted right in your browser. Nothing you drop here ever leaves your device.",
    browse: "Browse files", dzTitle: "Drag & drop files here",
    toolsHeading: "Every tool you need", toolsSub: "Pick a category or search for a format.",
    historyHeading: "Recent conversions",
  },
  es: {
    navHome: "Inicio", navTools: "Herramientas", navHistory: "Historial",
    heroEyebrow: "En el navegador · Privado · Gratis",
    heroSub: "Imágenes, documentos, audio y video — convertidos directamente en tu navegador. Nada de lo que sueltes aquí sale de tu dispositivo.",
    browse: "Explorar archivos", dzTitle: "Arrastra y suelta archivos aquí",
    toolsHeading: "Todas las herramientas que necesitas", toolsSub: "Elige una categoría o busca un formato.",
    historyHeading: "Conversiones recientes",
  },
  hi: {
    navHome: "होम", navTools: "टूल्स", navHistory: "इतिहास",
    heroEyebrow: "क्लाइंट-साइड · निजी · मुफ़्त",
    heroSub: "इमेज, दस्तावेज़, ऑडियो और वीडियो — सीधे आपके ब्राउज़र में कन्वर्ट होते हैं। यहाँ डाली गई कोई भी फ़ाइल आपकी डिवाइस से बाहर नहीं जाती।",
    browse: "फ़ाइलें ब्राउज़ करें", dzTitle: "फ़ाइलें यहाँ खींचें और छोड़ें",
    toolsHeading: "आपके काम के सारे टूल", toolsSub: "एक श्रेणी चुनें या फ़ॉर्मैट खोजें।",
    historyHeading: "हाल के कन्वर्शन",
  },
};

export function applyLanguage(code) {
  const dict = TRANSLATIONS[code] || TRANSLATIONS.en;
  document.querySelectorAll("[data-i18n]").forEach((el) => {
    const key = el.dataset.i18n;
    if (dict[key]) el.textContent = dict[key];
  });
  document.documentElement.lang = code;
}

/* ---------------- Metadata modal ---------------- */
export function initMetadataModal() {
  const layer = document.getElementById("metadataModal");
  wireModalDismiss(layer);
  bus.on("ui:show-file-info", async (item) => {
    if (!item) return;
    const dl = document.getElementById("metadataGrid");
    const file = item.file;
    const rows = [
      ["Name", file.name],
      ["Type", file.type || format.ext(file.name).toUpperCase() || "Unknown"],
      ["Size", format.bytes(file.size)],
      ["Last modified", file.lastModified ? new Date(file.lastModified).toLocaleString() : "—"],
    ];

    if (file.type?.startsWith("image/")) {
      const dims = await getImageDimensions(file);
      if (dims) rows.push(["Dimensions", `${dims.width} × ${dims.height} px`]);
    }
    if (file.type?.startsWith("audio/") || file.type?.startsWith("video/")) {
      const duration = await readMediaDuration(file, file.type.startsWith("video/"));
      if (duration) rows.push(["Duration", duration]);
    }

    dl.innerHTML = rows.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join("");
    openModal("metadataModal");
  });
}

function readMediaDuration(file, isVideo) {
  return new Promise((resolve) => {
    const el = document.createElement(isVideo ? "video" : "audio");
    el.preload = "metadata";
    el.src = URL.createObjectURL(file);
    el.onloadedmetadata = () => {
      const s = Math.round(el.duration);
      URL.revokeObjectURL(el.src);
      resolve(Number.isFinite(s) ? `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}` : null);
    };
    el.onerror = () => resolve(null);
  });
}
