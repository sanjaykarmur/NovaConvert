/* ==========================================================================
   NovaConvert — converters/image.js
   Pure client-side image conversion using the Canvas API. Covers every
   image conversion in the brief (JPG/PNG/WebP/BMP/GIF) plus resize and
   quality-adjustable compression. No third-party library needed.
   ========================================================================== */

const MIME = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  bmp: "image/bmp",
  gif: "image/gif",
};

/** Decodes a File/Blob into an HTMLImageElement. */
function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error(`"${file.name}" could not be read — it may be corrupted or an unsupported image format.`));
    };
    img.src = url;
  });
}

function canvasToBlob(canvas, mime, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Encoding failed for this format in your browser."))),
      mime,
      quality
    );
  });
}

/**
 * Converts a batch of image files to a target format with optional resize
 * and quality settings.
 * options: { targetFormat, quality (0-1), resizeMode: 'none'|'exact'|'percent',
 *            width, height, keepAspect, percent, preserveTransparency }
 */
export async function convertImages(files, options, { onProgress, isCancelled } = {}) {
  const results = [];
  const targetMime = MIME[options.targetFormat] || "image/png";
  const supportsAlpha = targetMime === "image/png" || targetMime === "image/webp" || targetMime === "image/bmp";

  for (let i = 0; i < files.length; i++) {
    if (isCancelled?.()) break;
    const file = files[i];
    onProgress?.({ index: i, total: files.length, fileName: file.name, percent: (i / files.length) * 100 });

    try {
      const img = await loadImage(file);
      let { width, height } = img;

      if (options.resizeMode === "exact" && options.width) {
        width = options.width;
        height = options.keepAspect ? Math.round((img.height / img.width) * width) : options.height || height;
      } else if (options.resizeMode === "percent" && options.percent) {
        width = Math.round(img.width * (options.percent / 100));
        height = Math.round(img.height * (options.percent / 100));
      }

      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");

      // Flatten to white background for formats without alpha support, so
      // transparent PNGs converting to JPG don't turn black.
      if (!supportsAlpha || options.preserveTransparency === false) {
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, width, height);
      }
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(img, 0, 0, width, height);

      const quality = options.quality ?? 0.9;
      const blob = await canvasToBlob(canvas, targetMime, targetMime === "image/png" ? undefined : quality);
      const name = `${file.name.replace(/\.[^.]+$/, "")}.${options.targetFormat}`;

      results.push({ name, blob, originalSize: file.size, ok: true });
    } catch (err) {
      results.push({ name: file.name, error: err.message, ok: false, originalSize: file.size });
    }
  }

  onProgress?.({ index: files.length, total: files.length, percent: 100 });
  return results;
}

/** Reads basic metadata (dimensions) for the metadata viewer / previews. */
export async function getImageDimensions(file) {
  try {
    const img = await loadImage(file);
    return { width: img.naturalWidth, height: img.naturalHeight };
  } catch {
    return null;
  }
}
