// Local-only HTTP API (127.0.0.1) that runs yt-dlp without a shell. Mirrors the original server.py contract.
const http = require("http"), fs = require("fs"), path = require("path"), crypto = require("crypto");
const { spawn } = require("child_process");

const ALLOWED_HOSTS = /^(www\.|m\.|music\.)?(youtube\.com|youtu\.be|youtube-nocookie\.com)$/i;
const MIME = { ".html": "text/html; charset=utf-8", ".css": "text/css", ".js": "text/javascript", ".mp3": "audio/mpeg", ".mp4": "video/mp4" };

function exe(binDir, name) {
  const local = path.join(binDir, process.platform === "win32" ? name + ".exe" : name);
  return fs.existsSync(local) ? local : name;
}
function has(cmd) {
  return new Promise(res => {
    const p = spawn(cmd, ["-version"], { windowsHide: true });
    p.on("error", () => res(false));
    p.on("close", code => res(code === 0));
  });
}
function validUrl(raw) {
  try { const u = new URL(String(raw).trim()); return u.protocol === "https:" && ALLOWED_HOSTS.test(u.hostname) ? u.href : null; }
  catch { return null; }
}
function json(res, code, body) { res.writeHead(code, { "Content-Type": "application/json; charset=utf-8" }); res.end(JSON.stringify(body)); }
function readBody(req) {
  return new Promise((res, rej) => { let d = ""; req.on("data", c => { d += c; if (d.length > 1e5) req.destroy(); }); req.on("end", () => res(d)); req.on("error", rej); });
}

function startServer({ webDir, binDir, outDir, openPath }) {
  webDir = path.resolve(webDir);
  fs.mkdirSync(outDir, { recursive: true });
  const ytdlp = exe(binDir, "yt-dlp"), ffmpeg = exe(binDir, "ffmpeg");
  const jobs = new Map();
  const safeFile = name => { const f = path.basename(decodeURIComponent(name)); const p = path.join(outDir, f); return fs.existsSync(p) ? p : null; };

  function runJob(id, url, kind) {
    const job = { state: "working", progress: 0 };
    jobs.set(id, job);
    const args = ["--no-playlist", "--newline", "--no-mtime", "--ffmpeg-location", path.dirname(ffmpeg) === "." ? ffmpeg : path.dirname(ffmpeg),
      "-P", outDir, "-o", "%(title).150B [%(id)s].%(ext)s", "--print", "after_move:filepath"];
    if (kind === "mp3") args.push("-x", "--audio-format", "mp3", "--audio-quality", "0");
    else args.push("-f", "bv*[ext=mp4]+ba[ext=m4a]/b[ext=mp4]/bv*+ba/b", "--merge-output-format", "mp4");
    args.push("--", url);
    const p = spawn(ytdlp, args, { windowsHide: true });
    let last = "", err = "";
    p.stdout.on("data", d => {
      for (const line of d.toString().split(/\r?\n/)) {
        const m = line.match(/\[download\]\s+([\d.]+)%/);
        if (m) job.progress = parseFloat(m[1]);
        else if (line.trim() && fs.existsSync(line.trim())) last = line.trim();
      }
    });
    p.stderr.on("data", d => { err += d.toString(); if (err.length > 4000) err = err.slice(-4000); });
    p.on("error", e => Object.assign(job, { state: "error", error: "تعذر تشغيل yt-dlp: " + e.message }));
    p.on("close", code => {
      if (job.state !== "working") return;
      if (code === 0 && last) Object.assign(job, { state: "done", file: path.basename(last), name: path.basename(last, path.extname(last)) });
      else Object.assign(job, { state: "error", error: (err.split("\n").reverse().find(l => l.includes("ERROR")) || "تعذر إكمال العملية").trim() });
    });
  }

  const server = http.createServer(async (req, res) => {
    const u = new URL(req.url, "http://127.0.0.1");
    try {
      if (u.pathname === "/api/status") return json(res, 200, { yt_dlp: await has(ytdlp), ffmpeg: await has(ffmpeg) });
      if (u.pathname === "/api/download" && req.method === "POST") {
        const body = JSON.parse(await readBody(req) || "{}");
        if (!body.rightsConfirmed) return json(res, 400, { error: "يجب تأكيد امتلاك حق التنزيل." });
        const url = validUrl(body.url);
        if (!url) return json(res, 400, { error: "الرابط غير صالح. ندعم روابط YouTube بصيغة https فقط." });
        const kind = body.kind === "mp4" ? "mp4" : "mp3";
        const id = crypto.randomUUID();
        runJob(id, url, kind);
        return json(res, 200, { jobId: id });
      }
      let m;
      if ((m = u.pathname.match(/^\/api\/jobs\/([\w-]+)$/))) return json(res, jobs.has(m[1]) ? 200 : 404, jobs.get(m[1]) || { state: "error", error: "المهمة غير موجودة" });
      if ((m = u.pathname.match(/^\/api\/open\/(.+)$/)) && req.method === "POST") {
        const p = safeFile(m[1]); if (p) openPath(p); return json(res, p ? 200 : 404, { ok: !!p });
      }
      if ((m = u.pathname.match(/^\/files\/(.+)$/))) {
        const p = safeFile(m[1]); if (!p) return json(res, 404, { error: "not found" });
        res.writeHead(200, { "Content-Type": MIME[path.extname(p)] || "application/octet-stream", "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(path.basename(p))}` });
        return fs.createReadStream(p).pipe(res);
      }
      const rel = u.pathname === "/" ? "index.html" : path.normalize(u.pathname).replace(/^[\\/]+/, "");
      const file = path.join(webDir, rel);
      if (!file.startsWith(webDir) || !fs.existsSync(file)) { res.writeHead(404); return res.end(); }
      res.writeHead(200, { "Content-Type": MIME[path.extname(file)] || "application/octet-stream" });
      fs.createReadStream(file).pipe(res);
    } catch (e) { json(res, 500, { error: String(e.message || e) }); }
  });
  return new Promise(resolve => server.listen(0, "127.0.0.1", () => resolve(server.address().port)));
}

module.exports = { startServer };
