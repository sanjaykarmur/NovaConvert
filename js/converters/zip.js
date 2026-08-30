/* ==========================================================================
   NovaConvert — converters/zip.js
   ZIP creation and extraction via JSZip (lazy-loaded from CDN on first use),
   plus the shared helper used to bundle any tool's results into one archive.
   ========================================================================== */
import { loadScript } from "../utils.js?v=3";

const JSZIP_CDN = "https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js";

async function ensureJSZip() {
  if (!window.JSZip) await loadScript(JSZIP_CDN);
  return window.JSZip;
}

/** Bundles an array of {name, blob} results into a single downloadable zip Blob. */
export async function zipResults(results, onProgress) {
  const JSZip = await ensureJSZip();
  const zip = new JSZip();
  results.filter((r) => r.ok !== false).forEach((r) => zip.file(r.name, r.blob));
  return zip.generateAsync({ type: "blob", compression: "DEFLATE" }, (meta) => {
    onProgress?.({ percent: meta.percent });
  });
}

/** Tool: create a zip archive from arbitrary uploaded files. */
export async function createZip(files, options, { onProgress, isCancelled } = {}) {
  if (isCancelled?.()) return [];
  const JSZip = await ensureJSZip();
  const zip = new JSZip();
  files.forEach((f) => zip.file(f.name, f));
  const blob = await zip.generateAsync({ type: "blob", compression: "DEFLATE" }, (meta) => {
    onProgress?.({ percent: meta.percent });
  });
  const name = options.archiveName ? `${options.archiveName}.zip` : "archive.zip";
  const originalSize = files.reduce((sum, f) => sum + f.size, 0);
  return [{ name, blob, originalSize, ok: true }];
}

/** Tool: extract every file inside an uploaded zip archive. */
export async function extractZip(files, options, { onProgress, isCancelled } = {}) {
  const JSZip = await ensureJSZip();
  const results = [];
  for (const file of files) {
    if (isCancelled?.()) break;
    try {
      const zip = await JSZip.loadAsync(file);
      const entries = Object.values(zip.files).filter((e) => !e.dir);
      let done = 0;
      for (const entry of entries) {
        if (isCancelled?.()) break;
        const blob = await entry.async("blob");
        results.push({ name: entry.name.split("/").pop() || entry.name, blob, originalSize: blob.size, ok: true });
        done++;
        onProgress?.({ percent: (done / entries.length) * 100, fileName: entry.name });
      }
    } catch (err) {
      results.push({ name: file.name, error: "This doesn't look like a valid ZIP archive.", ok: false, originalSize: file.size });
    }
  }
  return results;
}
