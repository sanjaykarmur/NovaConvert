/* ==========================================================================
   NovaConvert — converters/misc.js
   Small standalone utilities that don't fit image/pdf/av: QR code
   generation, Base64 encode/decode, and plain Text ↔ PDF.
   ========================================================================== */
import { loadScript, readAsArrayBuffer, readAsText } from "../utils.js";

const QRCODE_CDN = "https://cdnjs.cloudflare.com/ajax/libs/qrcode-generator/1.4.4/qrcode.min.js";
const JSPDF_CDN = "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js";
const PDFJS_CDN = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";
const PDFJS_WORKER = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";

function dataURLtoBlob(dataUrl) {
  const [head, b64] = dataUrl.split(",");
  const mime = head.match(/:(.*?);/)[1];
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

/* ---------------- QR Code Generator ---------------- */
// options: { text, errorCorrection: 'L'|'M'|'Q'|'H', size }
export async function generateQRCode(_files, options, { onProgress } = {}) {
  onProgress?.({ percent: 30 });

  if (!window.qrcode) await loadScript(QRCODE_CDN);

  const text = (options.text || "").trim();
  if (!text) throw new Error("Enter some text or a URL to encode first.");

  const qr = window.qrcode(0, options.errorCorrection || "M");
  qr.addData(text);
  qr.make();

  const size = options.size || 320;
  const cellSize = Math.max(2, Math.round(size / qr.getModuleCount()));

  // qrcode-generator creates GIF here, so convert it to a real PNG.
  const gifDataUrl = qr.createDataURL(cellSize, 4);

  const img = new Image();

  const pngBlob = await new Promise((resolve, reject) => {
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.width;
      canvas.height = img.height;

      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0);

      canvas.toBlob(
        blob => blob ? resolve(blob) : reject(new Error("Failed to create PNG.")),
        "image/png"
      );
    };

    img.onerror = () => reject(new Error("Failed to generate QR code."));
    img.src = gifDataUrl;
  });

  const previewDataUrl = URL.createObjectURL(pngBlob);

  onProgress?.({ percent: 100 });

  return [{
    name: "qr-code.png",
    blob: pngBlob,
    originalSize: pngBlob.size,
    ok: true,
    previewDataUrl
  }];
}

/* ---------------- Base64 Encode / Decode ---------------- */
// options: { mode: 'encode'|'decode', outputName }
export async function base64Convert(files, options, { onProgress, isCancelled } = {}) {
  const results = [];
  for (let i = 0; i < files.length; i++) {
    if (isCancelled?.()) break;
    const file = files[i];
    onProgress?.({ index: i, total: files.length, percent: (i / files.length) * 100 });
    try {
      if (options.mode === "decode") {
        const text = (await readAsText(file)).trim().replace(/^data:.*;base64,/, "");
        const bin = atob(text);
        const bytes = new Uint8Array(bin.length);
        for (let j = 0; j < bin.length; j++) bytes[j] = bin.charCodeAt(j);
        const name = options.outputName || file.name.replace(/\.[^.]+$/, "") || "decoded.bin";
        results.push({ name, blob: new Blob([bytes]), originalSize: file.size, ok: true });
      } else {
        const buf = await readAsArrayBuffer(file);
        let binary = "";
        const bytes = new Uint8Array(buf);
        const chunk = 0x8000;
        for (let j = 0; j < bytes.length; j += chunk) {
          binary += String.fromCharCode(...bytes.subarray(j, j + chunk));
        }
        const b64 = btoa(binary);
        const name = `${file.name}.base64.txt`;
        results.push({ name, blob: new Blob([b64], { type: "text/plain" }), originalSize: file.size, ok: true });
      }
    } catch (err) {
      results.push({ name: file.name, error: "Couldn't process this file — it may not be valid Base64 text.", ok: false, originalSize: file.size });
    }
  }
  return results;
}

/* ---------------- Text -> PDF ---------------- */
// options: { fontSize, pageSize }
export async function textToPDF(files, options, { onProgress, isCancelled } = {}) {
  if (!window.jspdf) await loadScript(JSPDF_CDN);
  const { jsPDF } = window.jspdf;
  const results = [];
  for (let i = 0; i < files.length; i++) {
    if (isCancelled?.()) break;
    const file = files[i];
    onProgress?.({ index: i, total: files.length, percent: (i / files.length) * 100 });
    try {
      const text = await readAsText(file);
      const doc = new jsPDF({ unit: "pt", format: options.pageSize || "a4" });
      const fontSize = options.fontSize || 12;
      doc.setFont("helvetica");
      doc.setFontSize(fontSize);
      const margin = 48;
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const lines = doc.splitTextToSize(text || " ", pageWidth - margin * 2);
      const lineHeight = fontSize * 1.4;
      let y = margin;
      lines.forEach((line) => {
        if (y > pageHeight - margin) {
          doc.addPage();
          y = margin;
        }
        doc.text(line, margin, y);
        y += lineHeight;
      });
      const blob = doc.output("blob");
      results.push({ name: `${file.name.replace(/\.[^.]+$/, "")}.pdf`, blob, originalSize: file.size, ok: true });
    } catch (err) {
      results.push({ name: file.name, error: "Couldn't convert this text file.", ok: false, originalSize: file.size });
    }
  }
  return results;
}

/* ---------------- PDF -> Text ---------------- */
export async function pdfToText(files, options, { onProgress, isCancelled } = {}) {
  if (!window.pdfjsLib) {
    await loadScript(PDFJS_CDN);
    window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER;
  }
  const results = [];
  for (let i = 0; i < files.length; i++) {
    if (isCancelled?.()) break;
    const file = files[i];
    onProgress?.({ index: i, total: files.length, percent: (i / files.length) * 100 });
    try {
      const buf = await readAsArrayBuffer(file);
      const pdf = await window.pdfjsLib.getDocument({ data: buf }).promise;
      let text = "";
      for (let p = 1; p <= pdf.numPages; p++) {
        if (isCancelled?.()) break;
        const page = await pdf.getPage(p);
        const content = await page.getTextContent();
        text += content.items.map((it) => it.str).join(" ") + "\n\n";
        onProgress?.({ index: i, total: files.length, percent: ((i + p / pdf.numPages) / files.length) * 100 });
      }
      results.push({ name: `${file.name.replace(/\.[^.]+$/, "")}.txt`, blob: new Blob([text], { type: "text/plain" }), originalSize: file.size, ok: true });
    } catch (err) {
      results.push({ name: file.name, error: "This PDF couldn't be read — it may be encrypted, scanned, or corrupted.", ok: false, originalSize: file.size });
    }
  }
  return results;
  }
