// Offline queue on the desktop server: a download cut off by a lost connection waits as "offline"
// (not "error"), then restarts by itself and finishes when the connection is back.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const root = path.join(__dirname, "..");

test("a download without internet waits, then finishes when the connection returns", { skip: process.platform === "win32" }, async () => {
  // server.js loads ./web/ytdlp.js (copied next to it when the app is packaged).
  const link = path.join(root, "desktop", "web");
  const made = !fs.existsSync(link);
  if (made) fs.symlinkSync(path.join(root, "web"), link, "dir");
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "nazzil-"));
  const bin = path.join(tmp, "bin"), out = path.join(tmp, "out"), mode = path.join(tmp, "mode");
  fs.mkdirSync(bin);
  fs.writeFileSync(mode, "fail");
  // A stand-in for yt-dlp: fails like a dropped connection, or "downloads" a file.
  fs.writeFileSync(path.join(bin, "yt-dlp"), `#!/usr/bin/env node
const fs = require("fs");
if (fs.readFileSync(${JSON.stringify(mode)}, "utf8") === "fail") {
  console.error("ERROR: [generic] Unable to download webpage: <urlopen error [Errno -3] Temporary failure in name resolution>");
  process.exit(1);
}
fs.mkdirSync(${JSON.stringify(out)}, { recursive: true });
const f = ${JSON.stringify(path.join(out, "clip.mp4"))};
fs.writeFileSync(f, "video");
console.log("NZF|" + f);
`, { mode: 0o755 });

  let net = false;
  const { startServer } = require("../desktop/server.js");
  const srv = await startServer({ webDir: path.join(root, "web"), binDir: bin, dataDir: path.join(tmp, "data"), defaultOut: out,
    openPath() {}, pickFolder() {}, isOnline: async () => net, netEvery: 100 });
  const api = (m, body = {}) => fetch(`http://127.0.0.1:${srv.port}/api/${m}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then(r => r.json());
  const stateOf = async id => (await api("jobs")).jobs.find(j => j.id === id);
  const waitFor = async (id, want) => {
    for (let i = 0; i < 100; i++) { const j = await stateOf(id); if (j && j.state === want) return j; await new Promise(r => setTimeout(r, 50)); }
    return stateOf(id);
  };
  try {
    const { jobId: id } = await api("download", { url: "https://example.org/video", kind: "mp4", quality: "720" });
    assert.equal((await waitFor(id, "offline")).state, "offline", "no internet: waits instead of failing");
    await new Promise(r => setTimeout(r, 300));
    assert.equal((await stateOf(id)).state, "offline", "keeps waiting while offline");
    fs.writeFileSync(mode, "ok");
    net = true;
    const done = await waitFor(id, "done");
    assert.equal(done.state, "done", "starts by itself when back online");
    assert.ok(fs.existsSync(path.join(out, "clip.mp4")));
  } finally {
    srv.stopAll(); srv.close();
    if (made) fs.unlinkSync(link);
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
