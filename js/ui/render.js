/* ==========================================================================
   NovaConvert — ui/render.js
   Rendering functions. Each takes a container + data + callbacks and
   (re)builds its DOM. Kept free of app-wide state so it's easy to reuse
   or test in isolation — orchestration lives in workspace.js / nav.js.
   ========================================================================== */
import { format } from "../utils.js";
import { TOOLS, CATEGORIES, toolMatchesQuery } from "../toolsConfig.js";
import { isFavorite } from "../state.js";

export function icon(name, cls = "") {
  return `<svg class="${cls}" aria-hidden="true"><use href="#icon-${name}"></use></svg>`;
}

/* ---------------- Category tabs ---------------- */
export function renderCategoryTabs(container, activeCategory, onSelect) {
  const all = [{ id: "all", label: "All tools", icon: "layers" }, ...CATEGORIES, { id: "favorites", label: "Favorites", icon: "star-filled" }];
  container.innerHTML = all
    .map(
      (c) => `<button class="cat-tab" data-cat="${c.id}" aria-pressed="${c.id === activeCategory}">${icon(c.icon)}${c.label}</button>`
    )
    .join("");
  container.querySelectorAll(".cat-tab").forEach((btn) => {
    btn.addEventListener("click", () => onSelect(btn.dataset.cat));
  });
}

/* ---------------- Tool grid ---------------- */
export function renderToolGrid(container, { category, query, onSelect, onToggleFavorite }) {
  let tools = TOOLS;
  if (category === "favorites") tools = tools.filter((t) => isFavorite(t.id));
  else if (category && category !== "all") tools = tools.filter((t) => t.category === category);
  if (query) tools = tools.filter((t) => toolMatchesQuery(t, query));

  if (!tools.length) {
    container.innerHTML = `<div class="empty-state">${icon("search")}<p>No tools match “${query || ""}”. Try a different search or category.</p></div>`;
    return;
  }

  container.innerHTML = tools
    .map(
      (t, i) => `
      <div class="tool-card glass" data-tool="${t.id}" role="button" tabindex="0" style="animation-delay:${Math.min(i * 40, 320)}ms">
        <div class="tool-card-top">
          <div class="tool-icon">${icon(t.icon)}</div>
          <button class="tool-fav icon-btn" data-fav="${t.id}" aria-pressed="${isFavorite(t.id)}" aria-label="Toggle favorite for ${t.name}">${icon(isFavorite(t.id) ? "star-filled" : "star")}</button>
        </div>
        <h3>${t.name}</h3>
        <p>${t.description}</p>
      </div>`
    )
    .join("");

  container.querySelectorAll(".tool-card").forEach((card) => {
    card.addEventListener("click", (e) => {
      if (e.target.closest("[data-fav]")) return;
      onSelect(card.dataset.tool);
    });
    card.addEventListener("keydown", (e) => {
      if ((e.key === "Enter" || e.key === " ") && !e.target.closest("[data-fav]")) {
        e.preventDefault();
        onSelect(card.dataset.tool);
      }
    });
  });
  container.querySelectorAll("[data-fav]").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      onToggleFavorite(btn.dataset.fav);
      btn.classList.add("star-pop");
      setTimeout(() => btn.classList.remove("star-pop"), 350);
    });
  });
}

/* ---------------- Options form ---------------- */
function fieldHTML(field, value) {
  const id = `opt-${field.key}`;
  switch (field.type) {
    case "select":
      return `<div class="field"><label for="${id}">${field.label}</label>
        <select class="select" id="${id}" name="${field.key}">
          ${field.options.map((o) => `<option value="${o.value}" ${o.value === value ? "selected" : ""}>${o.label}</option>`).join("")}
        </select></div>`;
    case "range":
      return `<div class="field"><label for="${id}">${field.label} <span class="field-hint">${field.hint === "percent" ? value + "%" : field.hint === "crf" ? value : Math.round(value * 100) / 100}</span></label>
        <input class="range" type="range" id="${id}" name="${field.key}" min="${field.min}" max="${field.max}" step="${field.step}" value="${value}"></div>`;
    case "number":
      return `<div class="field"><label for="${id}">${field.label}</label>
        <input class="text-input" type="number" id="${id}" name="${field.key}" min="${field.min ?? ""}" max="${field.max ?? ""}" value="${value}"></div>`;
    case "text":
      return `<div class="field"><label for="${id}">${field.label}${field.hint ? `<span class="field-hint">${field.hint}</span>` : ""}</label>
        <input class="text-input" type="text" id="${id}" name="${field.key}" value="${value ?? ""}"></div>`;
    case "textarea":
      return `<div class="field"><label for="${id}">${field.label}</label>
        <textarea class="text-input" id="${id}" name="${field.key}" rows="3">${value ?? ""}</textarea></div>`;
    case "checkbox":
      return `<label class="checkbox-row field" for="${id}"><input type="checkbox" id="${id}" name="${field.key}" ${value ? "checked" : ""}> ${field.label}</label>`;
    case "hidden":
      return "";
    default:
      return "";
  }
}

/**
 * Renders an options form from a schema + current values object.
 * onChange(key, value, structural) fires on every edit; `structural` is true
 * only for select/checkbox fields, which are the only ones our schemas use
 * to drive conditional (showIf) visibility. The caller should only rebuild
 * the whole form when `structural` is true — rebuilding on every range/text
 * keystroke would blow away focus and interrupt slider drags.
 */
export function renderOptionsForm(container, schema, values, onChange) {
  const visible = schema.filter((f) => !f.showIf || f.showIf(values));
  if (!visible.length) {
    container.innerHTML = `<p class="field-hint" style="color:var(--text-tertiary)">No options needed — just add files and convert.</p>`;
    return;
  }
  container.innerHTML = visible.map((f) => fieldHTML(f, values[f.key])).join("");

  visible.forEach((f) => {
    if (f.type === "hidden") return;
    const el = container.querySelector(`[name="${f.key}"]`);
    if (!el) return;

    if (f.type === "select" || f.type === "checkbox") {
      el.addEventListener("change", () => {
        onChange(f.key, f.type === "checkbox" ? el.checked : el.value, true);
      });
    } else {
      el.addEventListener("input", () => {
        const v = f.type === "number" || f.type === "range" ? Number(el.value) : el.value;
        onChange(f.key, v, false);
        if (f.type === "range") {
          const hintEl = container.querySelector(`label[for="opt-${f.key}"] .field-hint`);
          if (hintEl) hintEl.textContent = f.hint === "percent" ? v + "%" : f.hint === "crf" ? v : Math.round(v * 100) / 100;
        }
      });
    }
  });
}

export function defaultValuesFor(schema) {
  const values = {};
  schema.forEach((f) => (values[f.key] = f.default));
  return values;
}

/* ---------------- File list ---------------- */
const FILE_ICONS = { image: "image", application: "file-text", audio: "music", video: "video", text: "file-text" };
function iconForMime(mime = "") {
  const kind = mime.split("/")[0];
  return FILE_ICONS[kind] || "file-text";
}

export function renderFileList(container, queue, { onRemove, onInfo, numbered = false }) {
  if (!queue.length) {
    container.innerHTML = "";
    return;
  }
  container.innerHTML = queue
    .map((item, i) => {
      const safeName = format.escapeHtml(item.file.name);
      return `
      <li class="file-item" data-id="${item.id}">
        ${numbered ? `<span class="file-index">${i + 1}</span>` : ""}
        ${item.previewUrl ? `<img class="file-thumb" src="${item.previewUrl}" alt="">` : `<span class="file-thumb-icon">${icon(iconForMime(item.file.type))}</span>`}
        <div class="file-meta">
          <div class="file-name" title="${safeName}">${format.escapeHtml(format.truncate(item.file.name, 42))}</div>
          <div class="file-sub">${format.bytes(item.file.size)} · ${format.ext(item.file.name).toUpperCase() || "FILE"}</div>
        </div>
        <div class="file-actions">
          <button class="icon-btn" data-info="${item.id}" aria-label="File info">${icon("info")}</button>
          <button class="icon-btn" data-remove="${item.id}" aria-label="Remove file">${icon("trash")}</button>
        </div>
      </li>`;
    })
    .join("");

  container.querySelectorAll("[data-remove]").forEach((btn) => btn.addEventListener("click", () => onRemove(btn.dataset.remove)));
  container.querySelectorAll("[data-info]").forEach((btn) => btn.addEventListener("click", () => onInfo(btn.dataset.info)));
}

/* ---------------- Results ---------------- */
export function renderResults(container, results, savingsEl) {
  const ok = results.filter((r) => r.ok !== false);
  const failed = results.filter((r) => r.ok === false);

  const totalBefore = ok.reduce((s, r) => s + (r.originalSize || 0), 0);
  const totalAfter = ok.reduce((s, r) => s + (r.blob?.size || 0), 0);

  if (savingsEl) {
    if (totalBefore && totalAfter && totalAfter < totalBefore) {
      savingsEl.innerHTML = `<strong>${format.bytes(totalBefore - totalAfter)} saved</strong> (${format.percent(totalBefore - totalAfter, totalBefore)} smaller)`;
    } else {
      savingsEl.textContent = "";
    }
  }

  const okItems = ok
    .map((r) => {
      const safeName = format.escapeHtml(r.name);
      return `
      <li class="result-item" data-name="${safeName}">
        <span class="file-thumb-icon">${icon("check-circle")}</span>
        <div class="file-meta">
          <div class="file-name" title="${safeName}">${format.escapeHtml(format.truncate(r.name, 42))}</div>
          <div class="result-size-compare">
            ${r.originalSize ? `<span class="before">${format.bytes(r.originalSize)}</span> →` : ""}
            <span class="after">${format.bytes(r.blob.size)}</span>
          </div>
        </div>
        <div class="file-actions">
          <button class="icon-btn" data-share="${safeName}" aria-label="Share ${safeName}">${icon("share")}</button>
          <button class="icon-btn" data-copy="${safeName}" aria-label="Copy link to ${safeName}">${icon("link")}</button>
          <button class="icon-btn" data-download="${safeName}" aria-label="Download ${safeName}">${icon("download")}</button>
        </div>
      </li>`;
    })
    .join("");

  const failedItems = failed
    .map((r) => {
      const safeName = format.escapeHtml(r.name);
      return `
      <li class="result-item" data-name="${safeName}">
        <span class="file-thumb-icon" style="color:var(--danger)">${icon("alert-triangle")}</span>
        <div class="file-meta">
          <div class="file-name" title="${safeName}">${format.escapeHtml(format.truncate(r.name, 42))}</div>
          <div class="file-sub" style="color:var(--danger)">${format.escapeHtml(r.error)}</div>
        </div>
      </li>`;
    })
    .join("");

  container.innerHTML = okItems + failedItems;
}

/* ---------------- History ---------------- */
export function renderHistory(container, history) {
  if (!history.length) {
    container.innerHTML = `<div class="empty-state">${icon("history")}<p>Your recent conversions will show up here.</p></div>`;
    return;
  }
  container.innerHTML = history
    .map((h) => {
      const tool = TOOLS.find((t) => t.id === h.toolId);
      const safeName = format.escapeHtml(h.fileName);
      return `<li class="history-item glass">
        <div class="tool-icon">${icon(tool?.icon || "file-text")}</div>
        <div class="file-meta">
          <div class="file-name" title="${safeName}">${format.escapeHtml(format.truncate(h.fileName, 40))}</div>
          <div class="file-sub">${format.escapeHtml(h.toolName)}</div>
        </div>
        <time>${format.date(h.ts)}</time>
      </li>`;
    })
    .join("");
}

/* ---------------- Hero stats ---------------- */
export function renderHeroStats(container, stats) {
  container.innerHTML = `
    <div class="hero-stat"><strong>${stats.filesConverted.toLocaleString()}</strong><span>Files converted</span></div>
    <div class="hero-stat"><strong>${format.bytes(stats.bytesSaved)}</strong><span>Space saved</span></div>
    <div class="hero-stat"><strong>100%</strong><span>Processed on-device</span></div>
  `;
}
