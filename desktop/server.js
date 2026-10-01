// Local-only RPC server (127.0.0.1) that drives yt-dlp without a shell.
const http = require("http"), fs = require("fs"), path = require("path"), crypto = require("crypto");
const { spawn, execFile, execFileSync } = require("child_process");
const { buildArgs, parseLine, summarizeInfo, validUrl } = require("./web/ytdlp.js");

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

function startServer({ webDir, binDir, dataDir, defaultOut, openPath, pickFolder, notify = () => {}, appVersion = "" }) {
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
  function pump() {
    saveQueue();
    if (shuttingDown) return;
    const working = [...jobs.values()].filter(j => j.state === "working").length;
    const next = [...jobs.values()].filter(j => j.state === "queued");
    for (let i = 0; i < Math.min(parallel - working, next.length); i++) start(next[i]);
  }
  function start(job) {
    job.state = "working";
    const tempDir = path.join(dataDir, "tmp", job.id);
    const args = buildArgs(job.opts, { outDir: settings.folder, ffmpeg, tempDir });
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
          if (ev.file) { if (!job.files.includes(ev.file)) job.files.push(ev.file); }
          else if (job.state === "working") Object.assign(job, ev);
        }
      };
    };
    p.stdout.on("data", reader());
    const errReader = reader();
    p.stderr.on("data", d => { errReader(d); err += d.toString(); if (err.length > 8000) err = err.slice(-8000); });
    p.on("error", e => Object.assign(job, { state: "error", error: "تعذر تشغيل yt-dlp: " + e.message }));
    p.on("close", code => {
      job.proc = null;
      // Paused jobs keep their partial files so resuming continues where it stopped.
      if (job.state !== "paused" && job.state !== "stopping") fs.rm(tempDir, { recursive: true, force: true }, () => {});
      if (job.state === "working") {
        if (code === 0 && job.files.length) {
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
  function killTree(p) {
    if (!p) return;
    if (process.platform === "win32") execFile("taskkill", ["/pid", String(p.pid), "/T", "/F"], { windowsHide: true }, () => {});
    else p.kill("SIGTERM");
  }
  const publicJob = j => ({ id: j.id, kind: j.opts.kind, title: j.title, state: j.state, progress: j.progress, speed: j.speed, eta: j.eta,
    item: j.item, items: j.items, stage: j.stage, file: j.file, count: j.count, error: j.error });

  const methods = {
    async status() {
      const [v, f] = await Promise.all([run(ytdlp, ["--version"], { timeout: 15000 }), run(ffmpeg, ["-version"], { timeout: 15000 })]);
      return { yt_dlp: v.ok, ffmpeg: f.ok, version: v.stdout.trim(), folder: settings.folder, canPickFolder: true, platform: "windows", appVersion };
    },
    async info({ url }) {
      const u = validUrl(url);
      if (!u) throw new Error("الرابط غير صالح. استخدم رابطًا يبدأ بـ https://");
      const r = await run(ytdlp, ["-J", "--flat-playlist", "--no-warnings", "--playlist-end", "500", "--", u], { timeout: 45000 });
      if (!r.ok) throw new Error(lastError(r.stderr));
      return summarizeInfo(JSON.parse(r.stdout));
    },
    async download(body) {
      if (!body.rightsConfirmed) throw new Error("يجب تأكيد امتلاك حق التنزيل.");
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
      const r = await run(ytdlp, ["-U"], { timeout: 120000 });
      if (!r.ok) throw new Error(lastError(r.stderr + r.stdout) || "فشل التحديث");
      const v = await run(ytdlp, ["--version"]);
      return { version: v.stdout.trim() };
    },
  };

  const server = http.createServer(async (req, res) => {
    const u = new URL(req.url, "http://127.0.0.1");
    const send = (code, body) => { res.writeHead(code, { "Content-Type": "application/json; charset=utf-8" }); res.end(JSON.stringify(body)); };
    const m = u.pathname.match(/^\/api\/(\w+)$/);
    if (m) {
      // Only accept same-origin requests so other local web pages can't drive the downloader.
      const origin = req.headers.origin;
      if (req.method !== "POST" || (origin && origin !== `http://127.0.0.1:${server.address().port}`)) return send(403, { error: "forbidden" });
      const fn = methods[m[1]];
      if (!fn) return send(404, { error: "unknown method" });
      let raw = "";
      req.on("data", c => { raw += c; if (raw.length > 1e5) req.destroy(); });
      req.on("end", async () => {
        try { send(200, await fn(JSON.parse(raw || "{}"))); }
        catch (e) { send(400, { error: String(e.message || e) }); }
      });
      return;
    }
    const rel = u.pathname === "/" ? "index.html" : path.normalize(decodeURIComponent(u.pathname)).replace(/^[\\/]+/, "");
    const file = path.join(webDir, rel);
    if (!file.startsWith(webDir + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { "Content-Type": MIME[path.extname(file)] || "application/octet-stream", "Cache-Control": "no-cache" });
    fs.createReadStream(file).pipe(res);
  });
  // Stop yt-dlp children on quit (Windows doesn't kill them with the parent). Their partial files are kept,
  // and the queue file still lists them as working, so they resume on next launch.
  const stopAll = () => {
    shuttingDown = true;
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
  return new Promise(resolve => server.listen(0, "127.0.0.1", () => { pump(); resolve({ port: server.address().port, stopAll }); }));
}

module.exports = { startServer };
