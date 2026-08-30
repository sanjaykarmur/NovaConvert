/* ==========================================================================
   NovaConvert — state.js
   Single source of truth for anything that needs to persist or be shared
   across UI modules: user settings, conversion history, favorites, lifetime
   stats, and the active file queue for whichever tool is open.
   ========================================================================== */
import { storage, format, Emitter } from "./utils.js?v=3";

export const bus = new Emitter();

const DEFAULT_SETTINGS = {
  themeLanguage: "en",
  autoDelete: true, // clear in-memory file data after a successful conversion
  qualityMode: "high", // "high" | "fast"
  defaultQuality: 0.85,
};

export const state = {
  settings: storage.get("settings", DEFAULT_SETTINGS),
  favorites: new Set(storage.get("favorites", [])),
  history: storage.get("history", []), // [{id, toolId, toolName, fileName, originalSize, resultSize, ts}]
  stats: storage.get("stats", { filesConverted: 0, bytesSaved: 0 }),
  currentToolId: null,
  queue: [], // [{id, file, previewUrl?, meta}]
  lastResults: [], // [{name, blob, originalSize}]
};

export function saveSettings(patch) {
  state.settings = { ...state.settings, ...patch };
  storage.set("settings", state.settings);
  bus.emit("settings:change", state.settings);
}

export function toggleFavorite(toolId) {
  if (state.favorites.has(toolId)) state.favorites.delete(toolId);
  else state.favorites.add(toolId);
  storage.set("favorites", [...state.favorites]);
  bus.emit("favorites:change", state.favorites);
}

export function isFavorite(toolId) {
  return state.favorites.has(toolId);
}

export function pushHistory(entry) {
  state.history.unshift({ id: format.uid(), ts: Date.now(), ...entry });
  state.history = state.history.slice(0, 60);
  storage.set("history", state.history);

  state.stats.filesConverted += 1;
  if (entry.originalSize && entry.resultSize && entry.resultSize < entry.originalSize) {
    state.stats.bytesSaved += entry.originalSize - entry.resultSize;
  }
  storage.set("stats", state.stats);

  bus.emit("history:change", state.history);
  bus.emit("stats:change", state.stats);
}

export function clearHistory() {
  state.history = [];
  storage.remove("history");
  bus.emit("history:change", state.history);
}

/* ---------------- file queue ---------------- */
export function setQueue(files) {
  clearQueuePreviews();
  state.queue = files.map((file) => ({
    id: format.uid(),
    file,
    previewUrl: file.type?.startsWith("image/") ? URL.createObjectURL(file) : null,
  }));
  bus.emit("queue:change", state.queue);
}

export function addToQueue(files) {
  const items = files.map((file) => ({
    id: format.uid(),
    file,
    previewUrl: file.type?.startsWith("image/") ? URL.createObjectURL(file) : null,
  }));
  state.queue = [...state.queue, ...items];
  bus.emit("queue:change", state.queue);
}

export function removeFromQueue(id) {
  const item = state.queue.find((q) => q.id === id);
  if (item?.previewUrl) URL.revokeObjectURL(item.previewUrl);
  state.queue = state.queue.filter((q) => q.id !== id);
  bus.emit("queue:change", state.queue);
}

export function clearQueuePreviews() {
  state.queue.forEach((q) => q.previewUrl && URL.revokeObjectURL(q.previewUrl));
}

export function clearQueue() {
  clearQueuePreviews();
  state.queue = [];
  bus.emit("queue:change", state.queue);
}
