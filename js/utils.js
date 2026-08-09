/* ==========================================================================
   NovaConvert — utils.js
   Small, dependency-free helpers shared across the app:
     - storage: typed localStorage wrapper
     - format: bytes/date/string helpers
     - toast: notification queue
     - loadScript: cached lazy-loader for third-party libraries (CDN)
   ========================================================================== */

/* ---------------- storage ---------------- */
const NS = "novaconvert:";

export const storage = {
  get(key, fallback = null) {
    try {
      const raw = localStorage.getItem(NS + key);
      return raw === null ? fallback : JSON.parse(raw);
    } catch {
      return fallback;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(NS + key, JSON.stringify(value));
    } catch {
      /* storage full or unavailable — fail silently, app still works in-memory */
    }
  },
  remove(key) {
    localStorage.removeItem(NS + key);
  },
};

/* ---------------- format ---------------- */
export const format = {
  bytes(n) {
    if (!Number.isFinite(n) || n < 0) return "—";
    if (n === 0) return "0 B";
    const units = ["B", "KB", "MB", "GB"];
    const i = Math.min(units.length - 1, Math.floor(Math.log(n) / Math.log(1024)));
    const val = n / 1024 ** i;
    return `${val >= 10 || i === 0 ? Math.round(val) : val.toFixed(1)} ${units[i]}`;
  },
  percent(part, whole) {
    if (!whole) return "0%";
    return `${Math.round((part / whole) * 100)}%`;
  },
  date(ts) {
    const d = new Date(ts);
    const now = new Date();
    const sameDay = d.toDateString() === now.toDateString();
    if (sameDay) return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    return d.toLocaleDateString([], { month: "short", day: "numeric" });
  },
  ext(name = "") {
    const i = name.lastIndexOf(".");
    return i === -1 ? "" : name.slice(i + 1).toLowerCase();
  },
  baseName(name = "") {
    const i = name.lastIndexOf(".");
    return i === -1 ? name : name.slice(0, i);
  },
  truncate(str, n) {
    return str.length > n ? str.slice(0, n - 1) + "…" : str;
  },
  uid() {
    return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
  },
  clamp(v, min, max) {
    return Math.min(max, Math.max(min, v));
  },
};

/* ---------------- toast ---------------- */
let toastRegion = null;
function region() {
  if (!toastRegion) toastRegion = document.getElementById("toastRegion");
  return toastRegion;
}

const ICONS = {
  success: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 12l5 5L20 6"/></svg>',
  error: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M12 8v5M12 16h.01"/></svg>',
  info: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/></svg>',
};

export function toast(message, type = "info", duration = 4200) {
  const el = document.createElement("div");
  el.className = `toast glass ${type}`;
  el.setAttribute("role", type === "error" ? "alert" : "status");
  el.innerHTML = `${ICONS[type] || ICONS.info}<p></p>`;
  el.querySelector("p").textContent = message;
  region().appendChild(el);
  const remove = () => {
    el.classList.add("leaving");
    el.addEventListener("animationend", () => el.remove(), { once: true });
  };
  const timer = setTimeout(remove, duration);
  el.addEventListener("click", () => {
    clearTimeout(timer);
    remove();
  });
  return el;
}

/* ---------------- lazy script loader ---------------- */
const scriptCache = new Map();

/**
 * Loads a third-party script from a CDN exactly once and caches the promise,
 * so multiple converters can request the same library without re-fetching.
 */
export function loadScript(src) {
  if (scriptCache.has(src)) return scriptCache.get(src);
  const p = new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = src;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error(`Failed to load ${src}. Check your connection.`));
    document.head.appendChild(s);
  });
  scriptCache.set(src, p);
  return p;
}

/** Reads a File as a data URL (used for previews). */
export function readAsDataURL(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
}

/** Reads a File as an ArrayBuffer. */
export function readAsArrayBuffer(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(r.error);
    r.readAsArrayBuffer(file);
  });
}

/** Reads a File as plain text. */
export function readAsText(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(r.error);
    r.readAsText(file);
  });
}

/** Triggers a browser download for a Blob. */
export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

/** Simple event bus used to decouple state changes from UI rendering. */
export class Emitter {
  constructor() {
    this.listeners = new Map();
  }
  on(evt, fn) {
    if (!this.listeners.has(evt)) this.listeners.set(evt, new Set());
    this.listeners.get(evt).add(fn);
    return () => this.listeners.get(evt)?.delete(fn);
  }
  emit(evt, payload) {
    this.listeners.get(evt)?.forEach((fn) => fn(payload));
  }
}
