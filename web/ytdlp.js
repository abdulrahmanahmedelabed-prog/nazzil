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
  const RATES = ["500K", "1M", "2M", "5M", "10M"];
  const BROWSERS = ["chrome", "edge", "firefox", "brave", "opera", "vivaldi"];

  function validUrl(raw) {
    try {
      const u = new URL(String(raw).trim());
      if (u.protocol !== "https:" && u.protocol !== "http:") return null;
      if (/^(localhost|127\.|10\.|192\.168\.|0\.|\[)/i.test(u.hostname)) return null;
      return u.href;
    } catch { return null; }
  }

  /** opts: {url, kind, quality, abr, playlist, meta, subs, sponsor, from, to, rate, cookies}; env: {outDir, ffmpeg?, tempDir?, cookiesFile?, jsRuntime?, store?} */
  function buildArgs(opts, env) {
    const kind = ["mp3", "m4a", "mp4", "webm"].includes(opts.kind) ? opts.kind : "mp3";
    const q = HEIGHTS.includes(String(opts.quality)) ? String(opts.quality) : "1080";
    const abr = ["0", "320", "192", "128"].includes(String(opts.abr)) ? String(opts.abr) : "0";
    const audio = kind === "mp3" || kind === "m4a";
    const a = ["--newline", "--progress", "--quiet", "--no-warnings", "--no-mtime", "--no-colors",
      "--progress-template", PROGRESS, "--progress-template", POST,
      "--print", "after_move:NZW|%(webpage_url)s", "--print", "after_move:NZF|%(filepath)s",
      "--retries", "10", "--fragment-retries", "10", "--concurrent-fragments", "4",
      "-P", env.outDir];
    if (env.ffmpeg) a.push("--ffmpeg-location", env.ffmpeg);
    if (env.jsRuntime) a.push("--js-runtimes", env.jsRuntime);
    if (env.store) a.push("--use-extractors", STORE.extractors); // e.g. "deno:C:\\…\\deno.exe" (YouTube needs a JS runtime)
    // Per-job temp dir so parallel jobs for the same video don't clobber each other's intermediates.
    if (env.tempDir) a.push("-P", "temp:" + env.tempDir);

    if (opts.playlist) a.push("--yes-playlist", "-o", "%(playlist_title,playlist_id|Playlist).80B/%(playlist_index|0)03d - %(title).150B.%(ext)s");
    else a.push("--no-playlist", "-o", "%(title).150B [%(id)s].%(ext)s");

    if (kind === "mp3") a.push("-f", "ba/b", "-x", "--audio-format", "mp3", "--audio-quality", abr === "0" ? "0" : abr + "K");
    else if (kind === "m4a") a.push("-f", "ba[ext=m4a]/ba/b", "-x", "--audio-format", "m4a");
    else if (kind === "mp4") a.push("-f", "bv*+ba/b", "-S", (q === "best" ? "res" : "res:" + q) + ",vcodec:h264,acodec:m4a", "--merge-output-format", "mp4");
    else a.push("-f", "bv*+ba/b", "-S", (q === "best" ? "res" : "res:" + q) + ",vcodec:vp9,acodec:opus", "--merge-output-format", "webm/mkv");

    // Audio cover: "thumb" lets yt-dlp embed the site thumbnail; "frame"/"custom" are embedded afterwards
    // by the app (see coverArgs); "none" embeds nothing.
    const cover = audio ? coverMode(opts) : "thumb";
    if (opts.meta) {
      a.push("--embed-metadata");
      if (!audio) a.push("--embed-chapters");
      if (opts.playlist && audio) a.push("--parse-metadata", "playlist_index:%(track_number)s");
    }
    // Audio: the cover choice decides. Video: the thumbnail follows the metadata switch.
    const thumb = audio ? cover === "thumb" : opts.meta && kind !== "webm";
    if (thumb) a.push("--embed-thumbnail", "--convert-thumbnails", "jpg");
    if (opts.subs && !audio) a.push("--write-subs", "--write-auto-subs", "--sub-langs", "ar.*,en.*,-live_chat", "--embed-subs");
    if (opts.sponsor && !env.store) a.push("--sponsorblock-remove", "sponsor,selfpromo,interaction");
    if (RATES.includes(opts.rate)) a.push("-r", opts.rate);
    // Age-restricted / members-only content: reuse the user's own browser session.
    if (BROWSERS.includes(opts.cookies) && !env.store) a.push("--cookies-from-browser", opts.cookies);
    // Otherwise reuse the sign-ins made in Nazzil's own browser (exported by the platform as cookies.txt).
    else if (env.cookiesFile && opts.useLogin !== false && !env.store) a.push("--cookies", env.cookiesFile);

    const from = TIME.test(opts.from || "") ? opts.from : "", to = TIME.test(opts.to || "") ? opts.to : "";
    if (from || to) a.push("--download-sections", `*${from || "0"}-${to || "inf"}`, "--force-keyframes-at-cuts");

    a.push("--", opts.url);
    return a;
  }

  const COVERS = ["thumb", "frame", "custom", "none"];
  function coverMode(opts) {
    const c = COVERS.includes(opts.cover) ? opts.cover : "thumb";
    return c === "custom" && !opts.coverImage ? "thumb" : c;
  }
  /** "1:30" / "90" → seconds (0 when empty or invalid). */
  function toSeconds(t) {
    if (!TIME.test(String(t || ""))) return 0;
    return String(t).split(":").reduce((acc, part) => acc * 60 + parseFloat(part), 0);
  }
  /** Does this job need the app to embed a cover after yt-dlp finishes? */
  function needsCover(opts) {
    const audio = opts.kind === "mp3" || opts.kind === "m4a";
    return audio && (coverMode(opts) === "frame" || coverMode(opts) === "custom");
  }

  /** Arguments for each cover step; file paths are filled in by the platform. */
  const coverArgs = {
    // yt-dlp: fetch ~2 seconds of video around the chosen time (works for any site yt-dlp supports).
    clip: (pageUrl, seconds, outTemplate, cookies, store) => {
      const a = ["--no-playlist", "--no-warnings", "--quiet", "-f", "bv*[height<=720]/bv*/b",
        "--download-sections", `*${seconds}-${seconds + 2}`, "-o", outTemplate];
      if (BROWSERS.includes(cookies)) a.push("--cookies-from-browser", cookies);
      if (store) a.push("--use-extractors", STORE.extractors);
      a.push("--", pageUrl);
      return a;
    },
    // ffmpeg: first frame of a local video, or any user image, → a reasonably sized JPEG.
    toJpeg: (src, out) => ["-y", "-loglevel", "error", "-i", src, "-frames:v", "1", "-vf", "scale='min(1280,iw)':-2", "-q:v", "2", out],
    // ffmpeg: put the JPEG into the audio file as its attached picture, without re-encoding the audio.
    embed: (audio, jpg, out) => {
      const a = ["-y", "-loglevel", "error", "-i", audio, "-i", jpg, "-map", "0:a", "-map", "1:v", "-c", "copy", "-map_metadata", "0", "-disposition:v:0", "attached_pic"];
      if (/\.mp3$/i.test(audio)) a.push("-id3v2_version", "3", "-metadata:s:v", "title=Album cover", "-metadata:s:v", "comment=Cover (front)");
      a.push(out);
      return a;
    },
  };

  // YouTube rotates its sign-in cookies and may flag reused ones, and works without them for nearly
  // everything, so the in-app browser's YouTube/Google cookies are not handed to yt-dlp.
  const SKIP_COOKIES = /(^|\.)(youtube\.com|google\.[a-z.]+|youtu\.be|googlevideo\.com)$/i;

  /**
   * Netscape cookies.txt (the format yt-dlp reads) from a list of
   * {domain, hostOnly?, path?, secure?, expires? (unix s), name, value, httpOnly?}.
   */
  function cookieJar(list) {
    const lines = ["# Netscape HTTP Cookie File", "# Generated by Nazzil from its in-app browser", ""];
    for (const c of list || []) {
      const host = String(c.domain || "").trim();
      if (!host || !c.name || SKIP_COOKIES.test(host.replace(/^\./, ""))) continue;
      if (/[\t\r\n]/.test(c.name + c.value)) continue;
      const domain = c.hostOnly ? host.replace(/^\./, "") : (host.startsWith(".") ? host : "." + host);
      const expires = Math.max(0, Math.floor(Number(c.expires) || 0));
      lines.push([(c.httpOnly ? "#HttpOnly_" : "") + domain, domain.startsWith(".") ? "TRUE" : "FALSE", c.path || "/",
        c.secure ? "TRUE" : "FALSE", String(expires), c.name, c.value ?? ""].join("\t"));
    }
    return lines.join("\n") + "\n";
  }

  /* ---------- Converting a file from the device (no download involved) ----------
     Used for "File from my device", files shared to the app, and Google Takeout exports. */
  const LOCAL_KINDS = ["mp3", "m4a", "mp4"];
  /**
   * FFmpeg arguments to convert/trim a local media file.
   * o: {kind, abr, from, to, meta, title}; copy=true tries a fast remux (only for untrimmed MP4).
   */
  function convertArgs(o, input, output, copy = false) {
    const kind = LOCAL_KINDS.includes(o.kind) ? o.kind : "mp3";
    const abr = ["0", "320", "192", "128"].includes(String(o.abr)) ? String(o.abr) : "0";
    const a = ["-y", "-hide_banner", "-nostats", "-loglevel", "info", "-progress", "pipe:1"];
    const from = TIME.test(o.from || "") ? toSeconds(o.from) : 0;
    const to = TIME.test(o.to || "") ? toSeconds(o.to) : 0;
    if (from) a.push("-ss", String(from));
    a.push("-i", input);
    if (to > from) a.push("-t", String(to - from));
    if (kind === "mp3") a.push("-vn", "-map", "0:a:0", "-c:a", "libmp3lame", ...(abr === "0" ? ["-q:a", "0"] : ["-b:a", abr + "k"]));
    else if (kind === "m4a") a.push("-vn", "-map", "0:a:0", "-c:a", "aac", "-b:a", "256k");
    else if (copy) a.push("-map", "0:v:0?", "-map", "0:a:0?", "-c", "copy", "-movflags", "+faststart");
    else a.push("-map", "0:v:0?", "-map", "0:a:0?", "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart");
    if (o.meta !== false) {
      a.push("-map_metadata", "0");
      if (o.title) a.push("-metadata", "title=" + String(o.title).slice(0, 200));
    } else a.push("-map_metadata", "-1");
    if (kind === "mp3") a.push("-id3v2_version", "3");
    a.push(output);
    return a;
  }
  /** One frame of a local video at `seconds` → JPEG (for the audio cover). */
  const frameArgs = (src, seconds, out) => ["-y", "-loglevel", "error", "-ss", String(seconds), "-i", src, "-frames:v", "1", "-vf", "scale='min(1280,iw)':-2", "-q:v", "2", out];
  /** Parses FFmpeg's stderr "Duration: 00:01:02.50" and -progress "out_time_us=…" lines (seconds). */
  function ffDuration(line) {
    const m = /Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/.exec(line);
    return m ? (+m[1]) * 3600 + (+m[2]) * 60 + parseFloat(m[3]) : 0;
  }
  function ffTime(line) {
    const m = /^out_time_(?:us|ms)=(\d+)/.exec(String(line).trim());
    return m ? +m[1] / 1e6 : -1;
  }
  /** "My video (2024).mov" → "My video (2024)" */
  const baseTitle = name => String(name || "").replace(/\.[^.\/\\]{1,6}$/, "").slice(0, 200);

  /* ---------- Store edition ("Nazzil Open", Google Play) ----------
     Only sources whose terms or licenses permit downloading. Enforced in three layers:
     1) storeAllows() before anything is fetched (page + native code),
     2) yt-dlp only gets these extractors (--use-extractors), so links embedded in other pages can't escape,
     3) the store build never updates yt-dlp at runtime (Play forbids downloading executable code). */
  const STORE = {
    extractors: "archive.org,wikimedia.org,PeerTube,PeerTube:Playlist,generic",
    // Never contacted in the store edition, even through the generic extractor.
    blocked: /(^|\.)(youtube\.com|youtu\.be|youtube-nocookie\.com|youtubekids\.com|googlevideo\.com|ytimg\.com|facebook\.com|fb\.watch|fbcdn\.net|instagram\.com|cdninstagram\.com|tiktok\.com|tiktokcdn\.com|twitter\.com|x\.com|twimg\.com|twitch\.tv|dailymotion\.com|dai\.ly|reddit\.com|redd\.it|soundcloud\.com|vimeo\.com|spotify\.com|netflix\.com|disneyplus\.com|primevideo\.com|amazon\.[a-z.]+|apple\.com|deezer\.com|anghami\.com|shahid\.net|osn\.com)$/i,
  };
  /** Store edition: is this link from a source that may be downloaded? */
  function storeAllows(raw) {
    try {
      const u = new URL(String(raw).trim());
      return (u.protocol === "https:" || u.protocol === "http:") && !STORE.blocked.test(u.hostname.replace(/\.$/, ""));
    } catch { return false; }
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
    if (line.startsWith("NZW|")) return { page: line.slice(4) };
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

  return { buildArgs, parseLine, summarizeInfo, validUrl, needsCover, coverMode, coverArgs, toSeconds, cookieJar, storeAllows, STORE,
    convertArgs, frameArgs, ffDuration, ffTime, baseTitle, LOCAL_KINDS };
});
