// Local-only RPC server (127.0.0.1) that drives yt-dlp without a shell.
const http = require("http"), fs = require("fs"), path = require("path"), crypto = require("crypto"), os = require("os");
const { spawn, execFile, execFileSync } = require("child_process");
const { buildArgs, parseLine, summarizeInfo, validUrl, needsCover, coverMode, coverArgs, toSeconds } = require("./web/ytdlp.js");

const MIME = { ".html": "text/html; charset=utf-8", ".css": "text/css", ".js": "text/javascript", ".svg": "image/svg+xml", ".png": "image/png" };
const EXE = process.platform === "win32" ? ".exe" : "";

function run(cmd, args, { timeout = 60000 } = {}) {
  return new Promise(resolve => {
    execFile(cmd, args, { windowsHide: true, timeout, maxBuffer: 64 * 1024 * 1024 }, (err, stdout, stderr) =>
      resolve({ ok: !err, stdout: String(stdout || ""), stderr: String(stderr || ""), err }));
  });
}
function lastError(text) {
  const line = String(text).split(/\r?\n/).reverse().find(l => /ERROR/.test(l)) || "";
  const msg = line.replace(/^.*?ERROR:\s*(\[[^\]]+\]\s*)?([\w-]+:\s*)?/, "").trim();
  if (/Unsupported URL/i.test(line)) return "هذا الموقع أو الرابط غير مدعوم.";
  if (/Private video|Sign in|login/i.test(line)) return "المحتوى خاص أو يتطلب تسجيل الدخول.";
  if (/not available|unavailable|removed/i.test(line)) return "المقطع غير متاح.";
  if (/HTTP Error 404|Not Found/i.test(line)) return "الرابط غير موجود. تأكد منه وحاول مجددًا.";
  if (/Unable to download webpage|Failed to resolve|timed out|Connection/i.test(line)) return "تعذر الاتصال. تحقق من الإنترنت ثم أعد المحاولة.";
  if (/HTTP Error 403|Forbidden/i.test(line)) return "رفض الموقع الطلب. جرّب تحديث محرك التنزيل من الإعدادات.";
  return msg || "تعذر إكمال العملية.";
}

function startServer({ webDir, binDir, dataDir, defaultOut, openPath, pickFolder, notify = () => {}, appVersion = "", browse = () => {}, pickImage = async () => null, cookiesFile = "" }) {
  webDir = path.resolve(webDir);
  fs.mkdirSync(dataDir, { recursive: true });
  const settingsFile = path.join(dataDir, "settings.json");
  const settings = Object.assign({ folder: defaultOut, produced: [] }, (() => { try { return JSON.parse(fs.readFileSync(settingsFile, "utf8")); } catch { return {}; } })());
  const saveSettings = () => fs.writeFile(settingsFile, JSON.stringify(settings), () => {});

  // Keep a writable copy of yt-dlp so `-U` self-updates work even from Program Files.
  let ytdlp = path.join(binDir, "yt-dlp" + EXE);
  const userYt = path.join(dataDir, "yt-dlp" + EXE);
  try {
    if (fs.existsSync(ytdlp) && (!fs.existsSync(userYt) || fs.statSync(userYt).size === 0)) fs.copyFileSync(ytdlp, userYt);
    if (fs.existsSync(userYt)) ytdlp = userYt;
  } catch {}
  if (!fs.existsSync(ytdlp)) ytdlp = "yt-dlp";
  const ffmpeg = fs.existsSync(path.join(binDir, "ffmpeg" + EXE)) ? path.join(binDir, "ffmpeg" + EXE) : "ffmpeg";

  const jobs = new Map();
  const queueFile = path.join(dataDir, "queue.json");

  // Unfinished downloads survive closing the app: interrupted ones continue, paused ones stay paused.
  try {
    for (const j of JSON.parse(fs.readFileSync(queueFile, "utf8"))) {
      jobs.set(j.id, { ...j, state: j.state === "paused" ? "paused" : "queued", files: j.files || [], speed: "", eta: "" });
    }
  } catch {}
  let saveTimer, shuttingDown = false;
  function saveQueue() {
    if (shuttingDown) return; // stopAll already wrote the final queue
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      const keep = [...jobs.values()].filter(j => ["queued", "working", "paused"].includes(j.state))
        .map(({ id, opts, title, state, progress, files }) => ({ id, opts, title, state, progress, files }));
      fs.writeFile(queueFile, JSON.stringify(keep), () => {});
    }, 300);
  }
  let parallel = 3;

  function remember(p) {
    settings.produced = [p, ...settings.produced.filter(x => x !== p)].slice(0, 300);
    saveSettings();
  }
  // While yt-dlp updates itself its .exe is replaced, so no job may start (Windows locks running executables).
  let updating = false;
  const cookies = () => (cookiesFile && fs.existsSync(cookiesFile) && fs.statSync(cookiesFile).size > 80 ? cookiesFile : "");
  async function selfUpdate() {
    updating = true;
    try {
      const r = await run(ytdlp, ["-U"], { timeout: 120000 });
      if (r.ok) { settings.lastUpdate = Date.now(); saveSettings(); }
      return r;
    } finally {
      updating = false;
      pump();
    }
  }

  function pump() {
    saveQueue();
    if (shuttingDown || updating) return;
    const working = [...jobs.values()].filter(j => j.state === "working").length;
    const next = [...jobs.values()].filter(j => j.state === "queued");
    for (let i = 0; i < Math.min(parallel - working, next.length); i++) start(next[i]);
  }
  function start(job) {
    job.state = "working";
    const tempDir = path.join(dataDir, "tmp", job.id);
    const args = buildArgs(job.opts, { outDir: settings.folder, ffmpeg, tempDir, cookiesFile: cookies() });
    const p = spawn(ytdlp, args, { windowsHide: true });
    job.proc = p;
    let err = "";
    // Progress arrives on stdout, post-processing and errors on stderr: parse both.
    const reader = () => {
      let buf = "";
      return d => {
        buf += d.toString();
        const lines = buf.split(/\r?\n/); buf = lines.pop();
        for (const line of lines) {
          const ev = parseLine(line);
          if (!ev) continue;
          if (ev.page) job.lastPage = ev.page;
          else if (ev.file) { if (!job.files.includes(ev.file)) job.files.push(ev.file); (job.pages ||= {})[ev.file] = job.lastPage; }
          else if (job.state === "working") Object.assign(job, ev);
        }
      };
    };
    p.stdout.on("data", reader());
    const errReader = reader();
    p.stderr.on("data", d => { errReader(d); err += d.toString(); if (err.length > 8000) err = err.slice(-8000); });
    p.on("error", e => Object.assign(job, { state: "error", error: "تعذر تشغيل yt-dlp: " + e.message }));
    p.on("close", async code => {
      job.proc = null;
      // Paused jobs keep their partial files so resuming continues where it stopped.
      if (job.state !== "paused" && job.state !== "stopping") fs.rm(tempDir, { recursive: true, force: true }, () => {});
      if (job.state === "working") {
        if (code === 0 && job.files.length) {
          if (needsCover(job.opts)) {
            Object.assign(job, { stage: "cover", speed: "", eta: "" });
            for (const f of job.files) {
              if (job.state !== "working") break;
              try { await applyCover(f, (job.pages || {})[f], job.opts, job.id); }
              catch (e) { job.warning = "تعذر إضافة صورة الغلاف."; }
            }
            if (job.state !== "working") { pump(); return; }
          }
          const file = job.files.length > 1 ? path.dirname(job.files[0]) : job.files[0];
          Object.assign(job, { state: "done", progress: 100, file, count: job.files.length });
          notify(job.title, "done");
          remember(file);
        } else {
          Object.assign(job, { state: "error", error: code === 0 ? "لم يُنشأ أي ملف." : lastError(err) });
          notify(job.title, "error");
        }
      }
      pump();
    });
  }
  /** Builds the chosen cover (video frame or user image) and embeds it into an audio file. */
  async function applyCover(file, pageUrl, opts, id) {
    if (!fs.existsSync(file)) return;
    const work = path.join(dataDir, "tmp", id + "-cover");
    fs.mkdirSync(work, { recursive: true });
    try {
      const jpg = path.join(work, "cover.jpg");
      if (coverMode(opts) === "frame") {
        if (!pageUrl) throw new Error("no page url");
        // Try the chosen second; if the video is shorter than that, fall back to the first second.
        for (const sec of [toSeconds(opts.coverAt) || 30, 1]) {
          for (const f of fs.readdirSync(work)) fs.rmSync(path.join(work, f), { force: true });
          await run(ytdlp, ["--ffmpeg-location", ffmpeg, ...(cookies() && !opts.cookies && opts.useLogin !== false ? ["--cookies", cookies()] : []), ...coverArgs.clip(pageUrl, sec, path.join(work, "clip.%(ext)s"), opts.cookies)], { timeout: 120000 });
          const clip = fs.readdirSync(work).find(f => f.startsWith("clip."));
          if (clip && (await run(ffmpeg, coverArgs.toJpeg(path.join(work, clip), jpg))).ok && fs.existsSync(jpg)) break;
        }
      } else {
        if (!opts.coverImage || !fs.existsSync(opts.coverImage)) throw new Error("image missing");
        await run(ffmpeg, coverArgs.toJpeg(opts.coverImage, jpg));
      }
      if (!fs.existsSync(jpg)) throw new Error("no cover produced");
      const out = path.join(work, "out" + path.extname(file));
      const r = await run(ffmpeg, coverArgs.embed(file, jpg, out), { timeout: 120000 });
      if (!r.ok || !fs.existsSync(out)) throw new Error(r.stderr || "embed failed");
      fs.copyFileSync(out, file);
    } finally {
      fs.rmSync(work, { recursive: true, force: true });
    }
  }

  function killTree(p) {
    if (!p) return;
    if (process.platform === "win32") execFile("taskkill", ["/pid", String(p.pid), "/T", "/F"], { windowsHide: true }, () => {});
    else p.kill("SIGTERM");
  }
  const publicJob = j => ({ id: j.id, kind: j.opts.kind, title: j.title, state: j.state, progress: j.progress, speed: j.speed, eta: j.eta,
    item: j.item, items: j.items, stage: j.stage, file: j.file, count: j.count, error: j.error, warning: j.warning,
    names: j.state === "done" ? j.files.map(f => path.basename(f)) : undefined });

  const methods = {
    async status(_, ctx = {}) {
      const [v, f] = await Promise.all([run(ytdlp, ["--version"], { timeout: 15000 }), run(ffmpeg, ["-version"], { timeout: 15000 })]);
      if (ctx.remote) return { yt_dlp: v.ok, ffmpeg: f.ok, version: v.stdout.trim(), folder: "", canPickFolder: false, platform: "web", appVersion };
      return { yt_dlp: v.ok, ffmpeg: f.ok, version: v.stdout.trim(), folder: settings.folder, canPickFolder: true, platform: "windows", appVersion };
    },
    async info({ url }) {
      const u = validUrl(url);
      if (!u) throw new Error("الرابط غير صالح. استخدم رابطًا يبدأ بـ https://");
      const login = cookies() ? ["--cookies", cookies()] : [];
      const r = await run(ytdlp, ["-J", "--flat-playlist", "--no-warnings", "--playlist-end", "500", ...login, "--", u], { timeout: 45000 });
      if (!r.ok) throw new Error(lastError(r.stderr));
      return summarizeInfo(JSON.parse(r.stdout));
    },
    async download(body) {
      const url = validUrl(body.url);
      if (!url) throw new Error("الرابط غير صالح. استخدم رابطًا يبدأ بـ https://");
      const id = crypto.randomUUID();
      jobs.set(id, { id, opts: { ...body, url }, title: String(body.title || url).slice(0, 200), state: "queued", progress: 0, files: [] });
      pump();
      return { jobId: id };
    },
    async jobs() { return { jobs: [...jobs.values()].reverse().map(publicJob) }; },
    async cancel({ id }) {
      const j = jobs.get(id);
      if (j && ["working", "queued", "paused"].includes(j.state)) {
        const wasPaused = j.state === "paused";
        j.state = "cancelled";
        killTree(j.proc);
        if (wasPaused) fs.rm(path.join(dataDir, "tmp", j.id), { recursive: true, force: true }, () => {});
        pump();
      }
      return { ok: true };
    },
    async pickImage() {
      const file = await pickImage();
      return file ? { path: file, name: path.basename(file) } : {};
    },
    async browse({ site }) {
      const { byId } = require("./web/sites.js");
      const def = byId(site) || byId("youtube");
      browse(def);
      return { ok: true };
    },
    async pause({ id }) {
      const j = jobs.get(id);
      if (j && (j.state === "working" || j.state === "queued")) { j.state = "paused"; j.speed = ""; j.eta = ""; killTree(j.proc); pump(); }
      return { ok: true };
    },
    // Resume a paused job or retry a failed/cancelled one.
    async resume({ id }) {
      const j = jobs.get(id);
      if (j && !j.proc && ["paused", "error", "cancelled"].includes(j.state)) { Object.assign(j, { state: "queued", error: "" }); pump(); }
      return { ok: true };
    },
    async dismiss({ id }) {
      const j = jobs.get(id);
      if (j && !j.proc) {
        jobs.delete(id);
        if (j.state === "paused") fs.rm(path.join(dataDir, "tmp", id), { recursive: true, force: true }, () => {});
        saveQueue();
      }
      return { ok: true };
    },
    async lan({ enable }) {
      if (enable === true) { settings.lanEnabled = true; saveSettings(); await startLan(); }
      if (enable === false) { settings.lanEnabled = false; saveSettings(); stopLan(); }
      if (enable === "reset") { stopLan(); settings.lanToken = ""; saveSettings(); if (settings.lanEnabled) await startLan(); }
      const url = lanUrl();
      let qr = "";
      try { if (url) qr = await require("qrcode").toDataURL(url, { margin: 1, width: 240 }); } catch {}
      return { enabled: !!lanServer, url, qr, hasNetwork: !!lanAddress() };
    },
    async settings({ parallel: n }) { if (n >= 1 && n <= 5) { parallel = n; pump(); } return { ok: true }; },
    async open({ file }) {
      const target = file ? path.resolve(file) : settings.folder;
      const allowed = !file || settings.produced.includes(target);
      if (!allowed || !fs.existsSync(target)) throw new Error("الملف غير موجود. ربما نُقل أو حُذف.");
      openPath(target);
      return { ok: true };
    },
    async pickFolder() {
      const folder = await pickFolder(settings.folder);
      if (folder) { settings.folder = folder; saveSettings(); }
      return { folder: settings.folder };
    },
    async update() {
      if ([...jobs.values()].some(j => j.state === "working")) throw new Error("أوقف التنزيلات الجارية مؤقتًا ثم حدّث.");
      const r = await selfUpdate();
      if (!r.ok) throw new Error(lastError(r.stderr + r.stdout) || "فشل التحديث");
      const v = await run(ytdlp, ["--version"]);
      return { version: v.stdout.trim() };
    },
  };

  // Methods a phone/tablet on the LAN may call. Everything that acts on the PC itself (opening files or
  // folders, dialogs, the in-app browser, updating the engine, LAN settings) stays local-only.
  const REMOTE_OK = new Set(["status", "info", "download", "jobs", "cancel", "pause", "resume", "dismiss", "settings"]);
  const uploadsDir = path.join(dataDir, "uploads");
  const IMAGE_EXT = /\.(jpe?g|png|webp|bmp|gif)$/i;

  /** Shared request handler; `remote` is true for the LAN listener (token already verified). */
  function handle(req, res, remote, ownOrigin) {
    const u = new URL(req.url, "http://localhost");
    const send = (code, body, headers = {}) => { res.writeHead(code, { "Content-Type": "application/json; charset=utf-8", ...headers }); res.end(JSON.stringify(body)); };
    const origin = req.headers.origin;
    const sameOrigin = !origin || origin === ownOrigin(req);
    const m = u.pathname.match(/^\/api\/(\w+)$/);
    if (m) {
      // Only same-origin POSTs, so other web pages can't drive the downloader.
      if (req.method !== "POST" || !sameOrigin) return send(403, { error: "forbidden" });
      const fn = methods[m[1]];
      if (!fn || (remote && !REMOTE_OK.has(m[1]))) return send(404, { error: "unknown method" });
      let raw = "";
      req.on("data", c => { raw += c; if (raw.length > 1e5) req.destroy(); });
      req.on("end", async () => {
        try {
          const args = JSON.parse(raw || "{}");
          // A remote client may only use cover images it uploaded itself.
          if (remote && args.coverImage && path.dirname(path.resolve(args.coverImage)) !== uploadsDir) delete args.coverImage;
          send(200, await fn(args, { remote }));
        } catch (e) { send(400, { error: String(e.message || e) }); }
      });
      return;
    }
    // Cover image upload from a browser (phone): raw bytes, name in a header, images only, 15 MB max.
    if (u.pathname === "/upload" && req.method === "POST") {
      if (!sameOrigin) return send(403, { error: "forbidden" });
      const name = path.basename(decodeURIComponent(String(req.headers["x-name"] || "image.jpg")));
      if (!IMAGE_EXT.test(name)) return send(400, { error: "image files only" });
      const chunks = []; let size = 0;
      req.on("data", c => { size += c.length; if (size > 15e6) req.destroy(); else chunks.push(c); });
      req.on("end", () => {
        fs.mkdirSync(uploadsDir, { recursive: true });
        const dest = path.join(uploadsDir, crypto.randomUUID() + path.extname(name).toLowerCase());
        fs.writeFileSync(dest, Buffer.concat(chunks));
        send(200, { path: dest, name });
      });
      return;
    }
    // Finished files, streamed to the browser that asked for them ("download to this device").
    const dl = u.pathname.match(/^\/dl\/([\w-]+)\/(\d+)$/);
    if (dl) {
      const job = jobs.get(dl[1]);
      const file = job && job.state === "done" && job.files[+dl[2]];
      if (!file || !fs.existsSync(file)) { res.writeHead(404); return res.end(); }
      const stat = fs.statSync(file);
      res.writeHead(200, {
        "Content-Type": { ".mp3": "audio/mpeg", ".m4a": "audio/mp4", ".mp4": "video/mp4", ".webm": "video/webm", ".mkv": "video/x-matroska" }[path.extname(file).toLowerCase()] || "application/octet-stream",
        "Content-Length": stat.size,
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(path.basename(file))}`,
      });
      return fs.createReadStream(file).pipe(res);
    }
    const rel = u.pathname === "/" ? "index.html" : path.normalize(decodeURIComponent(u.pathname)).replace(/^[\\/]+/, "");
    const file = path.join(webDir, rel);
    if (!file.startsWith(webDir + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { "Content-Type": MIME[path.extname(file)] || "application/octet-stream", "Cache-Control": "no-cache" });
    fs.createReadStream(file).pipe(res);
  }

  const server = http.createServer((req, res) => handle(req, res, false, () => `http://127.0.0.1:${server.address().port}`));

  /* ---------- LAN access (phone/tablet browsers on the same Wi-Fi) ---------- */
  let lanServer = null;
  const LAN_PORT = 8090;
  function lanAddress() {
    const nets = Object.values(os.networkInterfaces()).flat().filter(n => n && n.family === "IPv4" && !n.internal);
    const priv = nets.find(n => /^(192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.)/.test(n.address));
    return (priv || nets[0] || {}).address || "";
  }
  function lanUrl() {
    const ip = lanAddress();
    return lanServer && ip ? `http://${ip}:${lanServer.address().port}/?k=${settings.lanToken}` : "";
  }
  const parseCookies = h => Object.fromEntries(String(h || "").split(";").map(x => x.trim().split("=")).filter(x => x[0]).map(([k, ...v]) => [k, v.join("=")]));
  const safeEq = (a, b) => { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && crypto.timingSafeEqual(x, y); };
  function startLan() {
    if (lanServer) return Promise.resolve();
    if (!settings.lanToken) { settings.lanToken = crypto.randomBytes(18).toString("base64url"); saveSettings(); }
    lanServer = http.createServer((req, res) => {
      const u = new URL(req.url, "http://localhost");
      // The QR link carries the key once; it's then kept in a cookie that other sites can't send.
      if (u.searchParams.has("k")) {
        if (!safeEq(u.searchParams.get("k"), settings.lanToken)) { res.writeHead(403); return res.end("Invalid link"); }
        res.writeHead(302, { Location: "/", "Set-Cookie": `nzk=${settings.lanToken}; HttpOnly; SameSite=Strict; Path=/; Max-Age=31536000` });
        return res.end();
      }
      if (!safeEq(parseCookies(req.headers.cookie).nzk || "", settings.lanToken)) {
        res.writeHead(403, { "Content-Type": "text/html; charset=utf-8" });
        return res.end('<meta name="viewport" content="width=device-width"><p style="font:16px sans-serif;padding:24px" dir="rtl">امسح رمز QR من إعدادات نزّل على الكمبيوتر.<br>Scan the QR code in Nazzil\'s settings on your computer.</p>');
      }
      handle(req, res, true, r => `http://${r.headers.host}`);
    });
    return new Promise(resolve => {
      lanServer.once("error", () => { lanServer.listen(0, "0.0.0.0", resolve); }); // port busy → any free port
      lanServer.listen(LAN_PORT, "0.0.0.0", resolve);
    });
  }
  function stopLan() { if (lanServer) { lanServer.close(); lanServer = null; } }
  if (settings.lanEnabled) startLan();
  // Stop yt-dlp children on quit (Windows doesn't kill them with the parent). Their partial files are kept,
  // and the queue file still lists them as working, so they resume on next launch.
  const stopAll = () => {
    shuttingDown = true;
    stopLan();
    clearTimeout(saveTimer);
    const keep = [...jobs.values()].filter(j => ["queued", "working", "paused"].includes(j.state))
      .map(({ id, opts, title, state, progress, files }) => ({ id, opts, title, state, progress, files }));
    try { fs.writeFileSync(queueFile, JSON.stringify(keep)); } catch {}
    for (const j of jobs.values()) {
      if (!j.proc) continue;
      j.state = "stopping";
      // Synchronous so the children are gone before the app exits.
      try {
        if (process.platform === "win32") execFileSync("taskkill", ["/pid", String(j.proc.pid), "/T", "/F"], { windowsHide: true, stdio: "ignore" });
        else j.proc.kill("SIGTERM");
      } catch {}
    }
  };
  // Keep yt-dlp current automatically: sites change often and an old engine is the #1 cause of failures.
  // Checked at launch (at most once a day), before any queued download starts.
  const stale = !settings.lastUpdate || Date.now() - settings.lastUpdate > 24 * 3600 * 1000;
  const ready = stale && fs.existsSync(ytdlp) ? selfUpdate().catch(() => {}) : Promise.resolve();
  return new Promise(resolve => server.listen(0, "127.0.0.1", () => { ready.then(pump); resolve({ port: server.address().port, stopAll }); }));
}

module.exports = { startServer };
