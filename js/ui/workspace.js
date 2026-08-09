/* ==========================================================================
   NovaConvert — ui/workspace.js
   Orchestrates the "workspace" panel: selecting a tool, managing its file
   queue, running the conversion with a live progress bar and cancel
   support, and handling the results (download / zip / share / copy link).
   ========================================================================== */
import { format, toast, downloadBlob } from "../utils.js";
import { getTool } from "../toolsConfig.js";
import { state, bus, setQueue, addToQueue, removeFromQueue, clearQueue, toggleFavorite, isFavorite, pushHistory } from "../state.js";
import { icon, renderOptionsForm, defaultValuesFor, renderFileList, renderResults } from "./render.js";
import { zipResults } from "../converters/zip.js";
import { killFFmpeg } from "../converters/av.js";

const el = {};
let optionValues = {};
let cancelFlag = { cancelled: false };
let isRunning = false;

export function initWorkspace() {
  el.section = document.getElementById("workspace");
  el.icon = document.getElementById("wsIcon");
  el.name = document.getElementById("wsName");
  el.desc = document.getElementById("wsDesc");
  el.favToggle = document.getElementById("favToggle");
  el.dropzone = document.getElementById("wsDropzone");
  el.fileInput = document.getElementById("wsFileInput");
  el.fileList = document.getElementById("fileList");
  el.optionsForm = document.getElementById("optionsForm");
  el.convertBtn = document.getElementById("convertBtn");
  el.cancelBtn = document.getElementById("cancelBtn");
  el.progressWrap = document.getElementById("progressWrap");
  el.progressFill = document.getElementById("progressFill");
  el.progressLabel = document.getElementById("progressLabel");
  el.resultsPanel = document.getElementById("resultsPanel");
  el.resultsList = document.getElementById("resultsList");
  el.resultsSavings = document.getElementById("resultsSavings");
  el.downloadAllBtn = document.getElementById("downloadAllBtn");
  el.convertMoreBtn = document.getElementById("convertMoreBtn");
  el.backBtn = document.getElementById("backBtn");

  el.dropzone.addEventListener("click", () => el.fileInput.click());
  el.dropzone.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      el.fileInput.click();
    }
  });
  el.fileInput.addEventListener("change", () => {
    handleFiles([...el.fileInput.files]);
    el.fileInput.value = "";
  });
  ["dragenter", "dragover"].forEach((evt) =>
    el.dropzone.addEventListener(evt, (e) => {
      e.preventDefault();
      el.dropzone.classList.add("drag-over");
    })
  );
  ["dragleave", "drop"].forEach((evt) =>
    el.dropzone.addEventListener(evt, (e) => {
      e.preventDefault();
      el.dropzone.classList.remove("drag-over");
    })
  );
  el.dropzone.addEventListener("drop", (e) => handleFiles([...(e.dataTransfer?.files || [])]));

  el.favToggle.addEventListener("click", () => {
    if (!state.currentToolId) return;
    toggleFavorite(state.currentToolId);
    syncFavButton();
    el.favToggle.classList.add("star-pop");
    setTimeout(() => el.favToggle.classList.remove("star-pop"), 350);
  });

  el.convertBtn.addEventListener("click", runConversion);
  el.cancelBtn.addEventListener("click", cancelConversion);
  el.backBtn.addEventListener("click", () => closeWorkspace());
  el.convertMoreBtn.addEventListener("click", () => {
    el.resultsPanel.hidden = true;
    clearQueue();
  });
  el.downloadAllBtn.addEventListener("click", async () => {
    try {
      const blob = await zipResults(state.lastResults);
      downloadBlob(blob, "novaconvert-files.zip");
    } catch {
      toast("Couldn't build the ZIP file.", "error");
    }
  });

  el.resultsList.addEventListener("click", (e) => {
    const dl = e.target.closest("[data-download]");
    const share = e.target.closest("[data-share]");
    const copy = e.target.closest("[data-copy]");
    if (dl) downloadResult(dl.dataset.download);
    if (share) shareResult(share.dataset.share);
    if (copy) copyResultLink(copy.dataset.copy);
  });

  bus.on("queue:change", (queue) => {
    renderFileList(el.fileList, queue, { onRemove: removeFromQueue, onInfo: showFileInfo });
    updateConvertButton();
  });
}

function showFileInfo(id) {
  bus.emit("ui:show-file-info", state.queue.find((q) => q.id === id));
}

function syncFavButton() {
  const active = isFavorite(state.currentToolId);
  el.favToggle.setAttribute("aria-pressed", String(active));
  el.favToggle.innerHTML = icon(active ? "star-filled" : "star");
}

function updateConvertButton() {
  const tool = getTool(state.currentToolId);
  if (!tool) return;
  const ready = tool.noFiles || state.queue.length > 0;
  el.convertBtn.disabled = !ready || isRunning;
}

export function openTool(toolId) {
  const tool = getTool(toolId);
  if (!tool) return;
  state.currentToolId = toolId;
  clearQueue();
  el.resultsPanel.hidden = true;
  optionValues = defaultValuesFor(tool.options);
  applyQualityModePreference(tool, optionValues);

  el.icon.innerHTML = icon(tool.icon);
  el.name.textContent = tool.name;
  el.desc.textContent = tool.description;
  syncFavButton();

  el.dropzone.parentElement.hidden = !!tool.noFiles;
  el.fileInput.setAttribute("accept", tool.accept || "*");
  el.fileInput.toggleAttribute("multiple", tool.multiple !== false);
  el.dropzone.setAttribute("aria-label", tool.multiple === false ? "Drop a file or press to browse" : "Drop files or press to browse");

  renderForm();
  updateConvertButton();

  el.section.hidden = false;
  document.getElementById("toolsSection").hidden = true;
  el.section.scrollIntoView({ behavior: "smooth", block: "start" });
}

export function closeWorkspace() {
  el.section.hidden = true;
  document.getElementById("toolsSection").hidden = false;
  document.getElementById("toolsSection").scrollIntoView({ behavior: "smooth", block: "start" });
}

/** Lets the Settings "quality mode" and "default quality" preferences seed a tool's own sliders. */
function applyQualityModePreference(tool, values) {
  const fast = state.settings.qualityMode === "fast";
  if ("quality" in values) values.quality = fast ? 0.6 : state.settings.defaultQuality;
  if ("crf" in values) values.crf = fast ? 34 : 24;
}

function renderForm() {
  const tool = getTool(state.currentToolId);
  renderOptionsForm(el.optionsForm, tool.options, optionValues, (key, value, structural) => {
    optionValues[key] = value;
    if (structural) renderForm(); // only rebuild when a select/checkbox changes visibility
  });
}

function handleFiles(files) {
  if (!files.length) return;
  const tool = getTool(state.currentToolId);
  if (tool.multiple === false) {
    setQueue(files.slice(0, 1));
  } else {
    addToQueue(files);
  }
  el.resultsPanel.hidden = true;
}

async function runConversion() {
  const tool = getTool(state.currentToolId);
  if (!tool || isRunning) return;

  if (tool.id === "qr-generate" && !optionValues.text?.trim()) {
    toast("Enter some text or a URL first.", "error");
    return;
  }

  isRunning = true;
  cancelFlag = { cancelled: false };
  el.convertBtn.hidden = true;
  el.cancelBtn.hidden = false;
  el.progressWrap.hidden = false;
  el.resultsPanel.hidden = true;
  setProgress(0, "Starting…");

  const files = state.queue.map((q) => q.file);

  try {
    const results = await tool.run(files, optionValues, {
      onProgress: (p) => {
        const pct = Math.round(p.percent ?? 0);
        setProgress(pct, p.stage || (p.fileName ? `Converting ${format.truncate(p.fileName, 30)}…` : `Converting… ${pct}%`));
      },
      isCancelled: () => cancelFlag.cancelled,
    });

    if (cancelFlag.cancelled) {
      toast("Conversion cancelled.", "info");
    } else {
      state.lastResults = results;
      renderResults(el.resultsList, results, el.resultsSavings);
      el.resultsPanel.hidden = false;
      const successHeading = el.resultsPanel.querySelector(".results-header h3");
      successHeading?.classList.remove("success-ring");
      void successHeading?.offsetWidth; // force reflow so the animation retriggers on repeat conversions
      successHeading?.classList.add("success-ring");
      el.downloadAllBtn.hidden = results.filter((r) => r.ok !== false).length < 2;

      const ok = results.filter((r) => r.ok !== false);
      const failed = results.filter((r) => r.ok === false);
      ok.forEach((r) => pushHistory({ toolId: tool.id, toolName: tool.name, fileName: r.name, originalSize: r.originalSize, resultSize: r.blob.size }));

      if (ok.length && !failed.length) toast(`${ok.length} file${ok.length > 1 ? "s" : ""} converted successfully.`, "success");
      else if (ok.length && failed.length) toast(`${ok.length} converted, ${failed.length} failed.`, "info");
      else toast("Conversion failed. See details below.", "error");

      if (state.settings.autoDelete) clearQueue();
      el.resultsPanel.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  } catch (err) {
    toast(err.message || "Something went wrong during conversion.", "error");
  } finally {
    isRunning = false;
    el.convertBtn.hidden = false;
    el.cancelBtn.hidden = true;
    el.progressWrap.hidden = true;
    updateConvertButton();
  }
}

function cancelConversion() {
  cancelFlag.cancelled = true;
  if (["audio-convert", "audio-trim", "video-convert", "video-extract-audio", "video-compress"].includes(state.currentToolId)) {
    killFFmpeg();
  }
  setProgress(0, "Cancelling…");
}

function setProgress(pct, label) {
  el.progressFill.style.width = `${format.clamp(pct, 2, 100)}%`;
  el.progressFill.classList.toggle("indeterminate", pct === 0);
  el.progressLabel.textContent = label;
}

function downloadResult(name) {
  const r = state.lastResults.find((x) => x.name === name);
  if (r) downloadBlob(r.blob, r.name);
}

async function shareResult(name) {
  const r = state.lastResults.find((x) => x.name === name);
  if (!r) return;
  const file = new File([r.blob], r.name, { type: r.blob.type });
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: r.name });
    } catch {
      /* user cancelled share sheet */
    }
  } else {
    toast("Sharing isn't supported on this device — downloading instead.", "info");
    downloadBlob(r.blob, r.name);
  }
}

function copyResultLink(name) {
  const r = state.lastResults.find((x) => x.name === name);
  if (!r) return;
  const url = URL.createObjectURL(r.blob);
  navigator.clipboard
    ?.writeText(url)
    .then(() => toast("Link copied — valid in this browser tab until you close it.", "success"))
    .catch(() => toast("Couldn't copy the link.", "error"));
}
