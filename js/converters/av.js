/* ==========================================================================
   NovaConvert — converters/av.js
   Audio & video conversion powered by ffmpeg.wasm. This is the one part of
   the app that needs a real transcoding engine, so it's loaded lazily and
   only the first time an audio/video tool is opened (the core is ~25MB).
   Everything still runs locally in the browser — nothing is uploaded.
   ========================================================================== */
import { loadScript, readAsArrayBuffer } from "../utils.js?v=3";

const FFMPEG_CDN = "https://unpkg.com/@ffmpeg/ffmpeg@0.11.6/dist/ffmpeg.min.js";
const FFMPEG_CORE = "https://unpkg.com/@ffmpeg/core@0.11.0/dist/ffmpeg-core.js";

let ffmpegInstance = null;

async function ensureFFmpeg(onProgress) {
  if (!window.FFmpeg) await loadScript(FFMPEG_CDN);
  if (!ffmpegInstance) {
    const { createFFmpeg } = window.FFmpeg;
    ffmpegInstance = createFFmpeg({ log: false, corePath: FFMPEG_CORE });
  }
  if (!ffmpegInstance.isLoaded()) {
    onProgress?.({ percent: 2, stage: "Downloading conversion engine (first time only)…" });
    await ffmpegInstance.load();
  }
  return ffmpegInstance;
}

function extFor(file) {
  const m = file.name.match(/\.([^.]+)$/);
  return m ? m[1].toLowerCase() : "bin";
}

const VIDEO_CODECS = {
  mp4: ["-c:v", "libx264", "-preset", "ultrafast", "-c:a", "aac"],
  webm: ["-c:v", "libvpx", "-c:a", "libvorbis"],
  mov: ["-c:v", "libx264", "-preset", "ultrafast", "-c:a", "aac"],
  avi: ["-c:v", "mpeg4", "-c:a", "libmp3lame"],
};

const RES_PRESETS = {
  original: null,
  "1080p": "1920:1080",
  "720p": "1280:720",
  "480p": "854:480",
  "360p": "640:360",
};

async function runFFmpeg(ffmpeg, inputName, inputBytes, args, outputName, onFrameProgress) {
  ffmpeg.FS("writeFile", inputName, inputBytes);
  ffmpeg.setProgress(({ ratio }) => {
    if (Number.isFinite(ratio)) onFrameProgress?.(Math.min(99, Math.max(0, ratio * 100)));
  });
  await ffmpeg.run("-i", inputName, ...args, outputName);
  const data = ffmpeg.FS("readFile", outputName);
  try {
    ffmpeg.FS("unlink", inputName);
    ffmpeg.FS("unlink", outputName);
  } catch {
    /* best effort cleanup */
  }
  return data;
}

/* ---------------- Audio Converter ---------------- */
// options: { targetFormat: mp3|wav|ogg|aac, bitrate: '128'|'192'|'256'|'320' }
export async function convertAudio(files, options, { onProgress, isCancelled } = {}) {
  const results = [];
  const target = options.targetFormat || "mp3";
  const codecArgs = { mp3: ["-c:a", "libmp3lame"], wav: ["-c:a", "pcm_s16le"], ogg: ["-c:a", "libvorbis"], aac: ["-c:a", "aac"] }[target] || [];

  const ffmpeg = await ensureFFmpeg((p) => onProgress?.({ percent: p.percent, stage: p.stage }));
  if (isCancelled?.()) return [];

  for (let i = 0; i < files.length; i++) {
    if (isCancelled?.()) break;
    const file = files[i];
    try {
      const bytes = new Uint8Array(await readAsArrayBuffer(file));
      const inputName = `in_${i}.${extFor(file)}`;
      const outputName = `out_${i}.${target}`;
      const args = [...codecArgs];
      if (target !== "wav") args.push("-b:a", `${options.bitrate || 192}k`);

      const data = await runFFmpeg(ffmpeg, inputName, bytes, args, outputName, (pct) =>
        onProgress?.({ index: i, total: files.length, percent: ((i + pct / 100) / files.length) * 100 })
      );
      results.push({ name: `${file.name.replace(/\.[^.]+$/, "")}.${target}`, blob: new Blob([data.buffer], { type: `audio/${target}` }), originalSize: file.size, ok: true });
    } catch (err) {
      results.push({ name: file.name, error: "This audio file couldn't be converted — it may be corrupted or an unsupported codec.", ok: false, originalSize: file.size });
    }
  }
  return results;
}

/* ---------------- Trim Audio ---------------- */
// options: { start: 'hh:mm:ss', end: 'hh:mm:ss' }
export async function trimAudio(files, options, { onProgress, isCancelled } = {}) {
  const results = [];
  const ffmpeg = await ensureFFmpeg((p) => onProgress?.({ percent: p.percent, stage: p.stage }));
  if (isCancelled?.()) return [];

  for (let i = 0; i < files.length; i++) {
    if (isCancelled?.()) break;
    const file = files[i];
    try {
      const ext = extFor(file);
      const bytes = new Uint8Array(await readAsArrayBuffer(file));
      const inputName = `in_${i}.${ext}`;
      const outputName = `out_${i}.${ext}`;
      const args = [];
      if (options.start) args.push("-ss", options.start);
      if (options.end) args.push("-to", options.end);
      args.push("-c", "copy");

      const data = await runFFmpeg(ffmpeg, inputName, bytes, args, outputName, (pct) =>
        onProgress?.({ index: i, total: files.length, percent: ((i + pct / 100) / files.length) * 100 })
      );
      results.push({ name: `${file.name.replace(/\.[^.]+$/, "")}-trimmed.${ext}`, blob: new Blob([data.buffer]), originalSize: file.size, ok: true });
    } catch (err) {
      results.push({ name: file.name, error: "Couldn't trim this file. Try a start/end time within the clip's length.", ok: false, originalSize: file.size });
    }
  }
  return results;
}

/* ---------------- Video Converter ---------------- */
// options: { targetFormat: mp4|webm|mov|avi, resolution: 'original'|'1080p'|..., fps: 'original'|'24'|'30'|'60' }
export async function convertVideo(files, options, { onProgress, isCancelled } = {}) {
  const results = [];
  const target = options.targetFormat || "mp4";
  const ffmpeg = await ensureFFmpeg((p) => onProgress?.({ percent: p.percent, stage: p.stage }));
  if (isCancelled?.()) return [];

  for (let i = 0; i < files.length; i++) {
    if (isCancelled?.()) break;
    const file = files[i];
    try {
      const bytes = new Uint8Array(await readAsArrayBuffer(file));
      const inputName = `in_${i}.${extFor(file)}`;
      const outputName = `out_${i}.${target}`;
      const args = [...(VIDEO_CODECS[target] || [])];
      const scale = RES_PRESETS[options.resolution];
      if (scale) args.push("-vf", `scale=${scale}`);
      if (options.fps && options.fps !== "original") args.push("-r", String(options.fps));

      const data = await runFFmpeg(ffmpeg, inputName, bytes, args, outputName, (pct) =>
        onProgress?.({ index: i, total: files.length, percent: ((i + pct / 100) / files.length) * 100 })
      );
      results.push({ name: `${file.name.replace(/\.[^.]+$/, "")}.${target}`, blob: new Blob([data.buffer], { type: `video/${target}` }), originalSize: file.size, ok: true });
    } catch (err) {
      results.push({ name: file.name, error: "This video couldn't be converted — it may be corrupted or use an unsupported codec.", ok: false, originalSize: file.size });
    }
  }
  return results;
}

/* ---------------- Extract Audio from Video ---------------- */
// options: { targetFormat: mp3|wav|ogg|aac }
export async function extractAudio(files, options, { onProgress, isCancelled } = {}) {
  const results = [];
  const target = options.targetFormat || "mp3";
  const codecArgs = { mp3: ["-c:a", "libmp3lame"], wav: ["-c:a", "pcm_s16le"], ogg: ["-c:a", "libvorbis"], aac: ["-c:a", "aac"] }[target] || [];
  const ffmpeg = await ensureFFmpeg((p) => onProgress?.({ percent: p.percent, stage: p.stage }));
  if (isCancelled?.()) return [];

  for (let i = 0; i < files.length; i++) {
    if (isCancelled?.()) break;
    const file = files[i];
    try {
      const bytes = new Uint8Array(await readAsArrayBuffer(file));
      const inputName = `in_${i}.${extFor(file)}`;
      const outputName = `out_${i}.${target}`;
      const args = ["-vn", ...codecArgs];

      const data = await runFFmpeg(ffmpeg, inputName, bytes, args, outputName, (pct) =>
        onProgress?.({ index: i, total: files.length, percent: ((i + pct / 100) / files.length) * 100 })
      );
      results.push({ name: `${file.name.replace(/\.[^.]+$/, "")}.${target}`, blob: new Blob([data.buffer], { type: `audio/${target}` }), originalSize: file.size, ok: true });
    } catch (err) {
      results.push({ name: file.name, error: "Couldn't extract audio from this video.", ok: false, originalSize: file.size });
    }
  }
  return results;
}

/* ---------------- Compress Video ---------------- */
// options: { crf: 18-40 (lower = better quality, larger file), resolution }
export async function compressVideo(files, options, { onProgress, isCancelled } = {}) {
  const results = [];
  const ffmpeg = await ensureFFmpeg((p) => onProgress?.({ percent: p.percent, stage: p.stage }));
  if (isCancelled?.()) return [];

  for (let i = 0; i < files.length; i++) {
    if (isCancelled?.()) break;
    const file = files[i];
    try {
      const ext = extFor(file) === "webm" ? "webm" : "mp4";
      const bytes = new Uint8Array(await readAsArrayBuffer(file));
      const inputName = `in_${i}.${extFor(file)}`;
      const outputName = `out_${i}.${ext}`;
      const args = ext === "webm"
        ? ["-c:v", "libvpx", "-crf", String(options.crf ?? 32), "-b:v", "0", "-c:a", "libvorbis"]
        : ["-c:v", "libx264", "-preset", "veryfast", "-crf", String(options.crf ?? 28), "-c:a", "aac"];
      const scale = RES_PRESETS[options.resolution];
      if (scale) args.push("-vf", `scale=${scale}`);

      const data = await runFFmpeg(ffmpeg, inputName, bytes, args, outputName, (pct) =>
        onProgress?.({ index: i, total: files.length, percent: ((i + pct / 100) / files.length) * 100 })
      );
      results.push({ name: `${file.name.replace(/\.[^.]+$/, "")}-compressed.${ext}`, blob: new Blob([data.buffer], { type: `video/${ext}` }), originalSize: file.size, ok: true });
    } catch (err) {
      results.push({ name: file.name, error: "This video couldn't be compressed.", ok: false, originalSize: file.size });
    }
  }
  return results;
}

/** Best-effort cancel: terminates the ffmpeg worker so the current run stops. Next call reloads it. */
export function killFFmpeg() {
  try {
    ffmpegInstance?.exit();
  } catch {
    /* ignore */
  }
  ffmpegInstance = null;
}
