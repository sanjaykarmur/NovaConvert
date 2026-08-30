/* ==========================================================================
   NovaConvert — converters/pdf.js
   Document tools built on pdf-lib (structural edits: merge/split/rotate/
   extract/compress) and pdf.js (rendering pages to images). Word → PDF uses
   mammoth.js + html2canvas + jsPDF as a best-effort client-side pipeline.
   All heavy libraries are lazy-loaded from a CDN on first use.
   ========================================================================== */
import { loadScript, readAsArrayBuffer } from "../utils.js";

const PDFLIB_CDN = "https://cdnjs.cloudflare.com/ajax/libs/pdf-lib/1.17.1/pdf-lib.min.js";
const PDFJS_CDN = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";
const PDFJS_WORKER = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
const MAMMOTH_CDN = "https://cdnjs.cloudflare.com/ajax/libs/mammoth/1.6.0/mammoth.browser.min.js";
const HTML2CANVAS_CDN = "https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js";
const JSPDF_CDN = "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js";

async function ensurePDFLib() {
  if (!window.PDFLib) await loadScript(PDFLIB_CDN);
  return window.PDFLib;
}
async function ensurePDFJS() {
  if (!window.pdfjsLib) {
    await loadScript(PDFJS_CDN);
    window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER;
  }
  return window.pdfjsLib;
}

/** Parses a page-range string like "1-3,5,8-9" into a zero-indexed page list. */
function parseRanges(str, pageCount) {
  if (!str || !str.trim()) return [...Array(pageCount).keys()];
  const out = new Set();
  str.split(",").forEach((part) => {
    const p = part.trim();
    if (!p) return;
    if (p.includes("-")) {
      const [a, b] = p.split("-").map((n) => parseInt(n.trim(), 10));
      for (let i = a; i <= b; i++) if (i >= 1 && i <= pageCount) out.add(i - 1);
    } else {
      const n = parseInt(p, 10);
      if (n >= 1 && n <= pageCount) out.add(n - 1);
    }
  });
  return [...out].sort((a, b) => a - b);
}

function assertPdf(file) {
  if (file.type && file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
    throw new Error(`"${file.name}" doesn't look like a PDF file.`);
  }
}

/* ---------------- Photo(s) -> PDF ---------------- */
// Combines every selected photo into a single PDF, one photo per page, in
// the exact order the photos were selected/listed. No resize, compression,
// or page-size options — each page is sized to fit the photo on A4 paper.
const A4_PT = { width: 595.28, height: 841.89 };
const PAGE_MARGIN_PT = 24;

/** Decodes an image file into raw PNG bytes via canvas — used as a fallback
 *  for formats pdf-lib can't embed directly (WebP, GIF, BMP, etc.). */
function imageFileToPngBytes(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        canvas.getContext("2d").drawImage(img, 0, 0);
        canvas.toBlob((blob) => {
          URL.revokeObjectURL(url);
          if (!blob) return reject(new Error(`"${file.name}" could not be read — it may be corrupted or an unsupported image format.`));
          blob.arrayBuffer().then(resolve, reject);
        }, "image/png");
      } catch (err) {
        URL.revokeObjectURL(url);
        reject(err);
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error(`"${file.name}" could not be read — it may be corrupted or an unsupported image format.`));
    };
    img.src = url;
  });
}

/** Embeds a single photo file into the pdf-lib document, converting via
 *  canvas first for any format that isn't natively JPEG/PNG. */
async function embedPhoto(doc, file) {
  const mime = (file.type || "").toLowerCase();
  const ext = format_ext(file.name);
  const isJpeg = mime === "image/jpeg" || mime === "image/jpg" || (!mime && (ext === "jpg" || ext === "jpeg"));
  const isPng = mime === "image/png" || (!mime && ext === "png");

  if (isJpeg) {
    try {
      return await doc.embedJpg(await readAsArrayBuffer(file));
    } catch {
      /* fall through to canvas conversion below */
    }
  } else if (isPng) {
    try {
      return await doc.embedPng(await readAsArrayBuffer(file));
    } catch {
      /* fall through to canvas conversion below */
    }
  }
  const pngBytes = await imageFileToPngBytes(file);
  return doc.embedPng(pngBytes);
}

function format_ext(name = "") {
  const i = name.lastIndexOf(".");
  return i === -1 ? "" : name.slice(i + 1).toLowerCase();
}

export async function photosToPDF(files, options, { onProgress, isCancelled } = {}) {
  if (!files.length) throw new Error("Add at least one photo to convert.");
  const PDFLib = await ensurePDFLib();
  const doc = await PDFLib.PDFDocument.create();
  const originalSize = files.reduce((s, f) => s + f.size, 0);
  const failed = [];
  let embedded = 0;

  for (let i = 0; i < files.length; i++) {
    if (isCancelled?.()) return [];
    const file = files[i];
    onProgress?.({ index: i, total: files.length, fileName: file.name, percent: (i / files.length) * 100 });

    try {
      const img = await embedPhoto(doc, file);
      const maxW = A4_PT.width - PAGE_MARGIN_PT * 2;
      const maxH = A4_PT.height - PAGE_MARGIN_PT * 2;
      const scale = Math.min(maxW / img.width, maxH / img.height);
      const w = img.width * scale;
      const h = img.height * scale;

      const page = doc.addPage([A4_PT.width, A4_PT.height]);
      page.drawImage(img, { x: (A4_PT.width - w) / 2, y: (A4_PT.height - h) / 2, width: w, height: h });
      embedded++;
    } catch (err) {
      failed.push({ name: file.name, error: err.message || "This photo couldn't be added to the PDF.", ok: false, originalSize: file.size });
    }
    onProgress?.({ index: i, total: files.length, percent: ((i + 1) / files.length) * 100 });
  }

  if (!embedded) {
    throw new Error("None of the selected photos could be read. Try different files.");
  }

  const bytes = await doc.save();
  const name = options?.outputName?.trim() ? `${options.outputName.trim()}.pdf` : "photos.pdf";
  const results = [{ name, blob: new Blob([bytes], { type: "application/pdf" }), originalSize, ok: true }];
  return [...results, ...failed];
}

/* ---------------- Merge PDFs ---------------- */
export async function mergePDFs(files, options, { onProgress, isCancelled } = {}) {
  if (files.length < 2) throw new Error("Add at least two PDF files to merge.");
  const PDFLib = await ensurePDFLib();
  const out = await PDFLib.PDFDocument.create();
  const originalSize = files.reduce((s, f) => s + f.size, 0);

  for (let i = 0; i < files.length; i++) {
    if (isCancelled?.()) return [];
    assertPdf(files[i]);
    const buf = await readAsArrayBuffer(files[i]);
    const src = await PDFLib.PDFDocument.load(buf, { ignoreEncryption: true });
    const pages = await out.copyPages(src, src.getPageIndices());
    pages.forEach((p) => out.addPage(p));
    onProgress?.({ index: i, total: files.length, percent: ((i + 1) / files.length) * 100 });
  }

  const bytes = await out.save();
  return [{ name: options.outputName ? `${options.outputName}.pdf` : "merged.pdf", blob: new Blob([bytes], { type: "application/pdf" }), originalSize, ok: true }];
}

/* ---------------- Split PDF ---------------- */
// options: { mode: 'each' | 'ranges', ranges: '1-3,4-6' }
export async function splitPDF(files, options, { onProgress, isCancelled } = {}) {
  const PDFLib = await ensurePDFLib();
  const results = [];
  for (const file of files) {
    if (isCancelled?.()) break;
    assertPdf(file);
    const buf = await readAsArrayBuffer(file);
    const src = await PDFLib.PDFDocument.load(buf, { ignoreEncryption: true });
    const pageCount = src.getPageCount();
    const base = file.name.replace(/\.[^.]+$/, "");

    let groups;
    if (options.mode === "ranges" && options.ranges?.trim()) {
      groups = options.ranges.split(",").map((r) => parseRanges(r.trim(), pageCount));
    } else {
      groups = Array.from({ length: pageCount }, (_, i) => [i]);
    }

    for (let g = 0; g < groups.length; g++) {
      if (isCancelled?.()) break;
      const out = await PDFLib.PDFDocument.create();
      const pages = await out.copyPages(src, groups[g]);
      pages.forEach((p) => out.addPage(p));
      const bytes = await out.save();
      const label = groups.length === pageCount ? `page-${groups[g][0] + 1}` : `part-${g + 1}`;
      results.push({ name: `${base}-${label}.pdf`, blob: new Blob([bytes], { type: "application/pdf" }), originalSize: file.size / groups.length, ok: true });
      onProgress?.({ percent: ((g + 1) / groups.length) * 100 });
    }
  }
  return results;
}

/* ---------------- Rotate PDF pages ---------------- */
// options: { angle: 90|180|270, pages: '' (all) or range string }
export async function rotatePDF(files, options, { onProgress, isCancelled } = {}) {
  const PDFLib = await ensurePDFLib();
  const results = [];
  for (let i = 0; i < files.length; i++) {
    if (isCancelled?.()) break;
    const file = files[i];
    assertPdf(file);
    const buf = await readAsArrayBuffer(file);
    const doc = await PDFLib.PDFDocument.load(buf, { ignoreEncryption: true });
    const targets = parseRanges(options.pages, doc.getPageCount());
    targets.forEach((idx) => {
      const page = doc.getPage(idx);
      const current = page.getRotation().angle;
      page.setRotation(PDFLib.degrees((current + Number(options.angle || 90)) % 360));
    });
    const bytes = await doc.save();
    results.push({ name: `${file.name.replace(/\.[^.]+$/, "")}-rotated.pdf`, blob: new Blob([bytes], { type: "application/pdf" }), originalSize: file.size, ok: true });
    onProgress?.({ index: i, total: files.length, percent: ((i + 1) / files.length) * 100 });
  }
  return results;
}

/* ---------------- Extract PDF pages ---------------- */
// options: { pages: '1-3,7' }
export async function extractPDFPages(files, options, { onProgress, isCancelled } = {}) {
  const PDFLib = await ensurePDFLib();
  const results = [];
  for (let i = 0; i < files.length; i++) {
    if (isCancelled?.()) break;
    const file = files[i];
    assertPdf(file);
    const buf = await readAsArrayBuffer(file);
    const src = await PDFLib.PDFDocument.load(buf, { ignoreEncryption: true });
    const indices = parseRanges(options.pages, src.getPageCount());
    if (!indices.length) throw new Error("Enter a valid page range, e.g. 1-3,5.");
    const out = await PDFLib.PDFDocument.create();
    const pages = await out.copyPages(src, indices);
    pages.forEach((p) => out.addPage(p));
    const bytes = await out.save();
    results.push({ name: `${file.name.replace(/\.[^.]+$/, "")}-extracted.pdf`, blob: new Blob([bytes], { type: "application/pdf" }), originalSize: file.size, ok: true });
    onProgress?.({ index: i, total: files.length, percent: ((i + 1) / files.length) * 100 });
  }
  return results;
}

/* ---------------- Compress PDF (rasterize + re-encode, best effort) ---------------- */
// options: { quality: 0-1, scale: render scale (lower = smaller) }
export async function compressPDF(files, options, { onProgress, isCancelled } = {}) {
  const [PDFLib, pdfjsLib] = await Promise.all([ensurePDFLib(), ensurePDFJS()]);
  const results = [];
  const quality = options.quality ?? 0.7;
  const scale = options.scale ?? 1.2;

  for (let i = 0; i < files.length; i++) {
    if (isCancelled?.()) break;
    const file = files[i];
    assertPdf(file);
    try {
      const buf = await readAsArrayBuffer(file);
      const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
      const out = await PDFLib.PDFDocument.create();

      for (let p = 1; p <= pdf.numPages; p++) {
        if (isCancelled?.()) break;
        const page = await pdf.getPage(p);
        const viewport = page.getViewport({ scale });
        const canvas = document.createElement("canvas");
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        await page.render({ canvasContext: canvas.getContext("2d"), viewport }).promise;
        const jpegUrl = canvas.toDataURL("image/jpeg", quality);
        const jpegBytes = Uint8Array.from(atob(jpegUrl.split(",")[1]), (c) => c.charCodeAt(0));
        const img = await out.embedJpg(jpegBytes);
        const pdfPage = out.addPage([viewport.width, viewport.height]);
        pdfPage.drawImage(img, { x: 0, y: 0, width: viewport.width, height: viewport.height });
        onProgress?.({ index: i, total: files.length, percent: ((i + p / pdf.numPages) / files.length) * 100 });
      }

      const bytes = await out.save();
      results.push({ name: `${file.name.replace(/\.[^.]+$/, "")}-compressed.pdf`, blob: new Blob([bytes], { type: "application/pdf" }), originalSize: file.size, ok: true });
    } catch (err) {
      results.push({ name: file.name, error: "This PDF couldn't be compressed — it may be encrypted or corrupted.", ok: false, originalSize: file.size });
    }
  }
  return results;
}

/* ---------------- PDF -> Images ---------------- */
// options: { format: 'png'|'jpeg', scale }
export async function pdfToImages(files, options, { onProgress, isCancelled } = {}) {
  const pdfjsLib = await ensurePDFJS();
  const results = [];
  const format = options.format === "jpeg" ? "jpeg" : "png";
  const scale = options.scale ?? 2;

  for (let i = 0; i < files.length; i++) {
    if (isCancelled?.()) break;
    const file = files[i];
    try {
      const buf = await readAsArrayBuffer(file);
      const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
      const base = file.name.replace(/\.[^.]+$/, "");
      for (let p = 1; p <= pdf.numPages; p++) {
        if (isCancelled?.()) break;
        const page = await pdf.getPage(p);
        const viewport = page.getViewport({ scale });
        const canvas = document.createElement("canvas");
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        await page.render({ canvasContext: canvas.getContext("2d"), viewport }).promise;
        const blob = await new Promise((res) => canvas.toBlob(res, `image/${format}`, 0.92));
        results.push({ name: `${base}-page-${p}.${format === "jpeg" ? "jpg" : "png"}`, blob, originalSize: file.size / pdf.numPages, ok: true });
        onProgress?.({ index: i, total: files.length, percent: ((i + p / pdf.numPages) / files.length) * 100 });
      }
    } catch (err) {
      results.push({ name: file.name, error: "This PDF couldn't be rendered — it may be encrypted or corrupted.", ok: false, originalSize: file.size });
    }
  }
  return results;
}

/* ---------------- Word (.docx) -> PDF (best effort) ---------------- */
export async function wordToPDF(files, options, { onProgress, isCancelled } = {}) {
  await Promise.all([
    !window.mammoth ? loadScript(MAMMOTH_CDN) : Promise.resolve(),
    !window.html2canvas ? loadScript(HTML2CANVAS_CDN) : Promise.resolve(),
    !window.jspdf ? loadScript(JSPDF_CDN) : Promise.resolve(),
  ]);
  const { jsPDF } = window.jspdf;
  const results = [];

  const sandbox = document.createElement("div");
  sandbox.style.cssText = "position:fixed;left:-9999px;top:0;width:794px;background:#fff;color:#111;padding:40px;font-family:Georgia,serif;font-size:15px;line-height:1.6;";
  document.body.appendChild(sandbox);

  for (let i = 0; i < files.length; i++) {
    if (isCancelled?.()) break;
    const file = files[i];
    try {
      const buf = await readAsArrayBuffer(file);
      const { value: html } = await window.mammoth.convertToHtml({ arrayBuffer: buf });
      sandbox.innerHTML = html;
      onProgress?.({ index: i, total: files.length, percent: ((i + 0.3) / files.length) * 100 });

      const canvas = await window.html2canvas(sandbox, { scale: 2, useCORS: true });
      const doc = new jsPDF({ unit: "pt", format: "a4" });
      const pageW = doc.internal.pageSize.getWidth();
      const pageH = doc.internal.pageSize.getHeight();
      const imgW = pageW;
      const imgH = (canvas.height * imgW) / canvas.width;
      let heightLeft = imgH;
      let y = 0;
      const imgData = canvas.toDataURL("image/jpeg", 0.92);

      doc.addImage(imgData, "JPEG", 0, y, imgW, imgH);
      heightLeft -= pageH;
      while (heightLeft > 0) {
        y = heightLeft - imgH;
        doc.addPage();
        doc.addImage(imgData, "JPEG", 0, y, imgW, imgH);
        heightLeft -= pageH;
      }

      results.push({ name: `${file.name.replace(/\.[^.]+$/, "")}.pdf`, blob: doc.output("blob"), originalSize: file.size, ok: true });
      onProgress?.({ index: i, total: files.length, percent: ((i + 1) / files.length) * 100 });
    } catch (err) {
      results.push({ name: file.name, error: "Couldn't convert this document. Only .docx files are supported.", ok: false, originalSize: file.size });
    }
  }

  sandbox.remove();
  return results;
}
