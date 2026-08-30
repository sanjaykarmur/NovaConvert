/* ==========================================================================
   NovaConvert — toolsConfig.js
   Every tool in the app is one entry in TOOLS below: metadata for the card
   and search index, an options schema the UI renders automatically into a
   form, and a `run` function that does the actual conversion. Adding a new
   conversion format means adding one object here — no other file needs to
   change for a straightforward new tool.
   ========================================================================== */
import { convertImages } from "./converters/image.js";
import { createZip, extractZip } from "./converters/zip.js";
import { generateQRCode, base64Convert, textToPDF, pdfToText } from "./converters/misc.js";
import { mergePDFs, splitPDF, rotatePDF, extractPDFPages, compressPDF, pdfToImages, wordToPDF, photosToPDF } from "./converters/pdf.js";
import { convertAudio, trimAudio, convertVideo, extractAudio, compressVideo } from "./converters/av.js";

export const CATEGORIES = [
  { id: "images", label: "Images", icon: "image" },
  { id: "documents", label: "Documents", icon: "file-text" },
  { id: "audio", label: "Audio", icon: "music" },
  { id: "video", label: "Video", icon: "video" },
  { id: "other", label: "Other", icon: "package" },
];

const QUALITY_FIELD = { key: "quality", label: "Quality", type: "range", min: 0.1, max: 1, step: 0.05, default: 0.85, hint: "value" };

export const TOOLS = [
  /* ==================== IMAGES ==================== */
  {
    id: "image-convert",
    name: "Image Converter",
    category: "images",
    icon: "image",
    accept: ".jpg,.jpeg,.png,.webp,.bmp,.gif,image/*",
    multiple: true,
    keywords: "jpg png webp bmp gif resize compress transparency",
    description: "Convert between JPG, PNG, WebP, BMP and GIF. Resize and compress with an adjustable quality slider — transparency is preserved on formats that support it.",
    options: [
      { key: "targetFormat", label: "Convert to", type: "select", default: "png", options: [
        { value: "png", label: "PNG" }, { value: "jpg", label: "JPG" }, { value: "webp", label: "WebP" }, { value: "bmp", label: "BMP" },
      ] },
      { ...QUALITY_FIELD, showIf: (v) => v.targetFormat === "jpg" || v.targetFormat === "webp" },
      { key: "resizeMode", label: "Resize", type: "select", default: "none", options: [
        { value: "none", label: "Keep original size" }, { value: "percent", label: "Scale by percent" }, { value: "exact", label: "Exact dimensions" },
      ] },
      { key: "percent", label: "Scale", type: "range", min: 10, max: 200, step: 5, default: 100, hint: "percent", showIf: (v) => v.resizeMode === "percent" },
      { key: "width", label: "Width (px)", type: "number", min: 1, max: 8000, default: 800, showIf: (v) => v.resizeMode === "exact" },
      { key: "keepAspect", label: "Keep aspect ratio", type: "checkbox", default: true, showIf: (v) => v.resizeMode === "exact" },
      { key: "height", label: "Height (px)", type: "number", min: 1, max: 8000, default: 600, showIf: (v) => v.resizeMode === "exact" && !v.keepAspect },
      { key: "preserveTransparency", label: "Preserve transparency (PNG/WebP)", type: "checkbox", default: true },
    ],
    run: convertImages,
  },

  /* ==================== DOCUMENTS ==================== */
  {
    id: "word-to-pdf",
    name: "Word → PDF",
    category: "documents",
    icon: "file-text",
    accept: ".docx",
    multiple: true,
    keywords: "docx word document pdf",
    description: "Turn .docx documents into PDF, rendered entirely in your browser.",
    options: [],
    run: wordToPDF,
  },
  {
    id: "photo-to-pdf",
    name: "Photo to PDF",
    category: "documents",
    icon: "image",
    accept: ".jpg,.jpeg,.png,.webp,.bmp,.gif,image/*",
    multiple: true,
    orderMatters: true,
    keywords: "photo photos image images picture pictures jpg png pdf combine",
    description: "Combine one or more photos into a single PDF, one photo per page, in the exact order you select them.",
    options: [],
    run: photosToPDF,
  },
  {
    id: "pdf-to-images",
    name: "PDF → Images",
    category: "documents",
    icon: "image",
    accept: ".pdf",
    multiple: true,
    keywords: "pdf jpg png export pages",
    description: "Export every page of a PDF as a high-resolution PNG or JPG image.",
    options: [
      { key: "format", label: "Image format", type: "select", default: "png", options: [{ value: "png", label: "PNG" }, { value: "jpeg", label: "JPG" }] },
      { key: "scale", label: "Resolution", type: "select", default: "2", options: [{ value: "1", label: "Standard" }, { value: "2", label: "High (2x)" }, { value: "3", label: "Very high (3x)" }] },
    ],
    run: (files, opts, ctx) => pdfToImages(files, { ...opts, scale: Number(opts.scale) }, ctx),
  },
  {
    id: "pdf-merge",
    name: "Merge PDFs",
    category: "documents",
    icon: "file-text",
    accept: ".pdf",
    multiple: true,
    orderMatters: true,
    keywords: "pdf combine join merge",
    description: "Combine multiple PDFs into a single document, in the order you add them.",
    options: [{ key: "outputName", label: "Output file name", type: "text", default: "merged" }],
    run: mergePDFs,
  },
  {
    id: "pdf-split",
    name: "Split PDF",
    category: "documents",
    icon: "file-text",
    accept: ".pdf",
    multiple: false,
    keywords: "pdf split separate pages",
    description: "Split a PDF into individual pages, or into custom page ranges.",
    options: [
      { key: "mode", label: "Split by", type: "select", default: "each", options: [{ value: "each", label: "Every page" }, { value: "ranges", label: "Custom ranges" }] },
      { key: "ranges", label: "Ranges", type: "text", default: "", hint: "e.g. 1-3,4-6", showIf: (v) => v.mode === "ranges" },
    ],
    run: splitPDF,
  },
  {
    id: "pdf-rotate",
    name: "Rotate PDF Pages",
    category: "documents",
    icon: "file-text",
    accept: ".pdf",
    multiple: true,
    keywords: "pdf rotate orientation",
    description: "Rotate all or specific pages of a PDF by 90, 180, or 270 degrees.",
    options: [
      { key: "angle", label: "Rotate by", type: "select", default: "90", options: [{ value: "90", label: "90°" }, { value: "180", label: "180°" }, { value: "270", label: "270°" }] },
      { key: "pages", label: "Pages", type: "text", default: "", hint: "blank = all pages, e.g. 1-2" },
    ],
    run: rotatePDF,
  },
  {
    id: "pdf-extract",
    name: "Extract PDF Pages",
    category: "documents",
    icon: "file-text",
    accept: ".pdf",
    multiple: false,
    keywords: "pdf extract pages export",
    description: "Pull specific pages out of a PDF into a new document.",
    options: [{ key: "pages", label: "Pages to extract", type: "text", default: "", hint: "e.g. 1-3,5" }],
    run: extractPDFPages,
  },
  {
    id: "pdf-compress",
    name: "Compress PDF",
    category: "documents",
    icon: "file-text",
    accept: ".pdf",
    multiple: true,
    keywords: "pdf compress reduce size",
    description: "Shrink PDF file size by re-encoding each page at a lower quality. Best for scan- or image-heavy PDFs.",
    options: [{ ...QUALITY_FIELD, default: 0.6, label: "Compression quality" }],
    run: compressPDF,
  },
  {
    id: "pdf-to-text",
    name: "PDF → Text",
    category: "documents",
    icon: "file-text",
    accept: ".pdf",
    multiple: true,
    keywords: "pdf text extract",
    description: "Extract the raw text content of a PDF into a plain .txt file.",
    options: [],
    run: pdfToText,
  },
  {
    id: "text-to-pdf",
    name: "Text → PDF",
    category: "documents",
    icon: "file-text",
    accept: ".txt",
    multiple: true,
    keywords: "text pdf write",
    description: "Turn plain text files into a nicely paginated PDF.",
    options: [
      { key: "fontSize", label: "Font size", type: "number", min: 8, max: 24, default: 12 },
      { key: "pageSize", label: "Page size", type: "select", default: "a4", options: [{ value: "a4", label: "A4" }, { value: "letter", label: "Letter" }] },
    ],
    run: textToPDF,
  },

  /* ==================== AUDIO ==================== */
  {
    id: "audio-convert",
    name: "Audio Converter",
    category: "audio",
    icon: "music",
    accept: ".mp3,.wav,.ogg,.aac,.m4a,audio/*",
    multiple: true,
    keywords: "mp3 wav ogg aac bitrate",
    description: "Convert between MP3, WAV, OGG, and AAC with adjustable bitrate. Runs a real audio engine in your browser.",
    options: [
      { key: "targetFormat", label: "Convert to", type: "select", default: "mp3", options: [{ value: "mp3", label: "MP3" }, { value: "wav", label: "WAV" }, { value: "ogg", label: "OGG" }, { value: "aac", label: "AAC" }] },
      { key: "bitrate", label: "Bitrate", type: "select", default: "192", options: [{ value: "128", label: "128 kbps" }, { value: "192", label: "192 kbps" }, { value: "256", label: "256 kbps" }, { value: "320", label: "320 kbps" }], showIf: (v) => v.targetFormat !== "wav" },
    ],
    run: convertAudio,
  },
  {
    id: "audio-trim",
    name: "Trim Audio",
    category: "audio",
    icon: "music",
    accept: ".mp3,.wav,.ogg,.aac,.m4a,audio/*",
    multiple: true,
    keywords: "audio trim cut clip",
    description: "Cut an audio clip down to a start and end time, keeping the original format and quality.",
    options: [
      { key: "start", label: "Start time", type: "text", default: "00:00:00", hint: "hh:mm:ss" },
      { key: "end", label: "End time", type: "text", default: "", hint: "hh:mm:ss, blank = end" },
    ],
    run: trimAudio,
  },

  /* ==================== VIDEO ==================== */
  {
    id: "video-convert",
    name: "Video Converter",
    category: "video",
    icon: "video",
    accept: ".mp4,.webm,.mov,.avi,video/*",
    multiple: true,
    keywords: "mp4 webm mov avi resolution fps",
    description: "Convert between MP4, WebM, MOV, and AVI. Optionally change resolution and frame rate at the same time.",
    options: [
      { key: "targetFormat", label: "Convert to", type: "select", default: "mp4", options: [{ value: "mp4", label: "MP4" }, { value: "webm", label: "WebM" }, { value: "mov", label: "MOV" }, { value: "avi", label: "AVI" }] },
      { key: "resolution", label: "Resolution", type: "select", default: "original", options: [{ value: "original", label: "Original" }, { value: "1080p", label: "1080p" }, { value: "720p", label: "720p" }, { value: "480p", label: "480p" }, { value: "360p", label: "360p" }] },
      { key: "fps", label: "Frame rate", type: "select", default: "original", options: [{ value: "original", label: "Original" }, { value: "24", label: "24 fps" }, { value: "30", label: "30 fps" }, { value: "60", label: "60 fps" }] },
    ],
    run: convertVideo,
  },
  {
    id: "video-extract-audio",
    name: "Extract Audio from Video",
    category: "video",
    icon: "music",
    accept: ".mp4,.webm,.mov,.avi,video/*",
    multiple: true,
    keywords: "video audio extract mp3",
    description: "Pull just the audio track out of a video file.",
    options: [{ key: "targetFormat", label: "Audio format", type: "select", default: "mp3", options: [{ value: "mp3", label: "MP3" }, { value: "wav", label: "WAV" }, { value: "ogg", label: "OGG" }, { value: "aac", label: "AAC" }] }],
    run: extractAudio,
  },
  {
    id: "video-compress",
    name: "Compress Video",
    category: "video",
    icon: "video",
    accept: ".mp4,.webm,.mov,.avi,video/*",
    multiple: true,
    keywords: "video compress shrink size",
    description: "Reduce video file size with an adjustable quality level, with an optional resolution downscale.",
    options: [
      { key: "crf", label: "Quality (lower = larger, better)", type: "range", min: 18, max: 40, step: 1, default: 28, hint: "crf" },
      { key: "resolution", label: "Resolution", type: "select", default: "original", options: [{ value: "original", label: "Original" }, { value: "1080p", label: "1080p" }, { value: "720p", label: "720p" }, { value: "480p", label: "480p" }] },
    ],
    run: compressVideo,
  },

  /* ==================== OTHER ==================== */
  {
    id: "zip-create",
    name: "Create ZIP",
    category: "other",
    icon: "package",
    accept: "*",
    multiple: true,
    keywords: "zip archive compress bundle",
    description: "Bundle any files into a single ZIP archive.",
    options: [{ key: "archiveName", label: "Archive name", type: "text", default: "archive" }],
    run: createZip,
  },
  {
    id: "zip-extract",
    name: "Extract ZIP",
    category: "other",
    icon: "package",
    accept: ".zip",
    multiple: true,
    keywords: "zip unzip extract archive",
    description: "Unpack every file inside a ZIP archive.",
    options: [],
    run: extractZip,
  },
  {
    id: "qr-generate",
    name: "QR Code Generator",
    category: "other",
    icon: "qr",
    accept: null,
    multiple: false,
    noFiles: true,
    keywords: "qr code generator url text",
    description: "Turn any text or URL into a downloadable QR code.",
    options: [
      { key: "text", label: "Text or URL", type: "textarea", default: "" },
      { key: "errorCorrection", label: "Error correction", type: "select", default: "M", options: [{ value: "L", label: "Low" }, { value: "M", label: "Medium" }, { value: "Q", label: "Quartile" }, { value: "H", label: "High" }] },
      { key: "size", label: "Size (px)", type: "number", min: 120, max: 1000, default: 320 },
    ],
    run: generateQRCode,
  },
  {
    id: "base64-encode",
    name: "Base64 Encode",
    category: "other",
    icon: "code",
    accept: "*",
    multiple: true,
    keywords: "base64 encode file text",
    description: "Encode any file into a Base64 text representation.",
    options: [{ key: "mode", label: "mode", type: "hidden", default: "encode" }],
    run: base64Convert,
  },
  {
    id: "base64-decode",
    name: "Base64 Decode",
    category: "other",
    icon: "code",
    accept: ".txt,.base64,text/plain",
    multiple: true,
    keywords: "base64 decode file text",
    description: "Decode a Base64 text file back into its original file.",
    options: [
      { key: "mode", label: "mode", type: "hidden", default: "decode" },
      { key: "outputName", label: "Output file name", type: "text", default: "", hint: "include extension, e.g. photo.png" },
    ],
    run: base64Convert,
  },
];

export function getTool(id) {
  return TOOLS.find((t) => t.id === id);
}

export function toolMatchesQuery(tool, query) {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return `${tool.name} ${tool.description} ${tool.keywords}`.toLowerCase().includes(q);
}
