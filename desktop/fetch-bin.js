// Downloads yt-dlp.exe and ffmpeg.exe into ./bin for packaging (run on CI or locally before `npm run dist`).
const fs = require("fs"), path = require("path"), { execFileSync } = require("child_process");
const bin = path.join(__dirname, "bin");
fs.mkdirSync(bin, { recursive: true });
async function get(url, dest) {
  const r = await fetch(url, { redirect: "follow" });
  if (!r.ok) throw new Error(`${url}: ${r.status}`);
  fs.writeFileSync(dest, Buffer.from(await r.arrayBuffer()));
}
(async () => {
  await get("https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe", path.join(bin, "yt-dlp.exe"));
  const zip = path.join(bin, "ffmpeg.zip");
  await get("https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-win64-gpl.zip", zip);
  const out = path.join(bin, "ffmpeg-tmp");
  execFileSync("tar", ["-xf", zip, "-C", bin]);
  const dir = fs.readdirSync(bin).find(d => d.startsWith("ffmpeg-master"));
  for (const exe of ["ffmpeg.exe", "ffprobe.exe"]) fs.copyFileSync(path.join(bin, dir, "bin", exe), path.join(bin, exe));
  fs.rmSync(path.join(bin, dir), { recursive: true, force: true });
  fs.rmSync(zip, { force: true });
  fs.rmSync(out, { recursive: true, force: true });
  console.log("bin ready:", fs.readdirSync(bin));
})().catch(e => { console.error(e); process.exit(1); });
