// Shared yt-dlp logic for Windows (Node) and Android (WebView): argument building, progress parsing, info summaries.
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.NzYtdlp = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const PROGRESS = "download:NZP|%(progress._percent_str)s|%(progress._speed_str)s|%(progress._eta_str)s|%(info.playlist_index)s|%(info.n_entries)s";
  const POST = "postprocess:NZS|%(progress.postprocessor)s";
  const HEIGHTS = ["best", "2160", "1440", "1080", "720", "480", "360"];
  const TIME = /^\d+(:\d{1,2}){0,2}(\.\d+)?$/;

  function validUrl(raw) {
    try {
      const u = new URL(String(raw).trim());
      if (u.protocol !== "https:" && u.protocol !== "http:") return null;
      if (/^(localhost|127\.|10\.|192\.168\.|0\.|\[)/i.test(u.hostname)) return null;
      return u.href;
    } catch { return null; }
  }

  /** opts: {url, kind, quality, abr, playlist, meta, subs, sponsor, from, to}; env: {outDir, ffmpeg?, tempDir?} */
  function buildArgs(opts, env) {
    const kind = ["mp3", "m4a", "mp4", "webm"].includes(opts.kind) ? opts.kind : "mp3";
    const q = HEIGHTS.includes(String(opts.quality)) ? String(opts.quality) : "1080";
    const abr = ["0", "320", "192", "128"].includes(String(opts.abr)) ? String(opts.abr) : "0";
    const audio = kind === "mp3" || kind === "m4a";
    const a = ["--newline", "--progress", "--quiet", "--no-warnings", "--no-mtime", "--no-colors",
      "--progress-template", PROGRESS, "--progress-template", POST,
      "--print", "after_move:NZF|%(filepath)s",
      "--retries", "10", "--fragment-retries", "10", "--concurrent-fragments", "4",
      "-P", env.outDir];
    if (env.ffmpeg) a.push("--ffmpeg-location", env.ffmpeg);
    // Per-job temp dir so parallel jobs for the same video don't clobber each other's intermediates.
    if (env.tempDir) a.push("-P", "temp:" + env.tempDir);

    if (opts.playlist) a.push("--yes-playlist", "-o", "%(playlist_title,playlist_id|Playlist).80B/%(playlist_index|0)03d - %(title).150B.%(ext)s");
    else a.push("--no-playlist", "-o", "%(title).150B [%(id)s].%(ext)s");

    if (kind === "mp3") a.push("-f", "ba/b", "-x", "--audio-format", "mp3", "--audio-quality", abr === "0" ? "0" : abr + "K");
    else if (kind === "m4a") a.push("-f", "ba[ext=m4a]/ba/b", "-x", "--audio-format", "m4a");
    else if (kind === "mp4") a.push("-f", "bv*+ba/b", "-S", (q === "best" ? "res" : "res:" + q) + ",vcodec:h264,acodec:m4a", "--merge-output-format", "mp4");
    else a.push("-f", "bv*+ba/b", "-S", (q === "best" ? "res" : "res:" + q) + ",vcodec:vp9,acodec:opus", "--merge-output-format", "webm/mkv");

    if (opts.meta) {
      a.push("--embed-metadata");
      if (kind !== "webm") a.push("--embed-thumbnail", "--convert-thumbnails", "jpg");
      if (!audio) a.push("--embed-chapters");
      if (opts.playlist && audio) a.push("--parse-metadata", "playlist_index:%(track_number)s");
    }
    if (opts.subs && !audio) a.push("--write-subs", "--write-auto-subs", "--sub-langs", "ar.*,en.*,-live_chat", "--embed-subs");
    if (opts.sponsor) a.push("--sponsorblock-remove", "sponsor,selfpromo,interaction");

    const from = TIME.test(opts.from || "") ? opts.from : "", to = TIME.test(opts.to || "") ? opts.to : "";
    if (from || to) a.push("--download-sections", `*${from || "0"}-${to || "inf"}`, "--force-keyframes-at-cuts");

    a.push("--", opts.url);
    return a;
  }

  const clean = s => { s = String(s || "").trim(); return s === "NA" || s === "None" || s === "Unknown" ? "" : s; };
  const ETA_AR = s => s && !/unknown/i.test(s) ? s.replace(/^00:/, "") : "";

  /** Returns a partial job update, {file} for a finished file, or null. */
  function parseLine(line) {
    line = String(line || "").trim();
    if (line.startsWith("NZP|")) {
      const [, pct, speed, eta, idx, n] = line.split("|");
      return { stage: "download", progress: parseFloat(pct) || 0, speed: clean(speed).replace(/iB/g, "B"), eta: ETA_AR(clean(eta)),
        item: parseInt(idx) || undefined, items: parseInt(n) || undefined };
    }
    if (line.startsWith("NZS|")) return { stage: "post", speed: "", eta: "" };
    if (line.startsWith("NZF|")) return { file: line.slice(4) };
    return null;
  }

  function summarizeInfo(j) {
    const site = j.extractor_key || j.ie_key || "";
    if (j._type === "playlist") {
      const first = (j.entries || [])[0] || {};
      const thumb = (j.thumbnails && j.thumbnails.length && j.thumbnails[j.thumbnails.length - 1].url) || (first.thumbnails && first.thumbnails.length && first.thumbnails[first.thumbnails.length - 1].url) || "";
      return { playlist: true, title: j.title, uploader: j.uploader || j.channel || "", count: j.playlist_count || (j.entries || []).length, thumbnail: thumb, site };
    }
    const heights = (j.formats || []).map(f => f.height || 0);
    return { playlist: false, title: j.title, uploader: j.uploader || j.channel || "", duration: j.duration || 0,
      thumbnail: j.thumbnail || "", height: Math.max(0, j.height || 0, ...heights) || 0, site };
  }

  return { buildArgs, parseLine, summarizeInfo, validUrl };
});
