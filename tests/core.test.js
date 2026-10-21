// Unit tests for the shared logic used by both the Windows and Android apps. Run: node --test "tests/*.test.js"
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const y = require("../web/ytdlp.js");
const { SITES, byId } = require("../web/sites.js");
const root = path.join(__dirname, "..");
const read = f => fs.readFileSync(path.join(root, f), "utf8");

test("validUrl accepts public http(s) links and rejects local or odd ones", () => {
  assert.equal(y.validUrl("https://www.youtube.com/watch?v=abc"), "https://www.youtube.com/watch?v=abc");
  for (const bad of ["file:///etc/passwd", "javascript:alert(1)", "http://127.0.0.1:8090/", "http://localhost/x", "http://192.168.1.5/", "not a url"]) {
    assert.equal(y.validUrl(bad), null, bad);
  }
});

test("buildArgs: formats, qualities and the URL always last after --", () => {
  for (const kind of ["mp3", "m4a", "mp4", "webm"]) {
    const a = y.buildArgs({ url: "https://x.com/a/status/1", kind }, { outDir: "/out" });
    assert.deepEqual(a.slice(-2), ["--", "https://x.com/a/status/1"]);
    assert.ok(a.includes("--no-playlist"));
  }
  const mp3 = y.buildArgs({ url: "https://u.example/v", kind: "mp3", abr: "192" }, { outDir: "/o" });
  assert.equal(mp3[mp3.indexOf("--audio-quality") + 1], "192K");
  const mp4 = y.buildArgs({ url: "https://u.example/v", kind: "mp4", quality: "720" }, { outDir: "/o" });
  assert.match(mp4[mp4.indexOf("-S") + 1], /^res:720,/);
});

test("buildArgs ignores unknown/injected option values", () => {
  const a = y.buildArgs({ url: "https://u.example/v", kind: "--exec", quality: "rm -rf", abr: "9999", rate: "--exec", cookies: "evil", from: "1;2" }, { outDir: "/o" });
  assert.ok(!a.includes("--exec") && !a.includes("rm -rf") && !a.includes("evil"));
  assert.ok(!a.includes("-r") && !a.includes("--download-sections"));
  assert.ok(a.includes("-x")); // fell back to mp3
});

test("buildArgs: trim, playlist, sponsor, speed, cookies, JS runtime", () => {
  const a = y.buildArgs({ url: "https://u.example/v", kind: "mp4", from: "0:10", to: "1:30", playlist: true, sponsor: true, rate: "2M", cookies: "firefox" },
    { outDir: "/o", cookiesFile: "/c.txt", jsRuntime: "deno:/d/deno" });
  assert.equal(a[a.indexOf("--download-sections") + 1], "*0:10-1:30");
  assert.ok(a.includes("--yes-playlist") && a.includes("--sponsorblock-remove"));
  assert.equal(a[a.indexOf("-r") + 1], "2M");
  assert.equal(a[a.indexOf("--cookies-from-browser") + 1], "firefox");
  assert.ok(!a.includes("--cookies"), "browser cookies win over the in-app sign-ins");
  assert.equal(a[a.indexOf("--js-runtimes") + 1], "deno:/d/deno");
  const login = y.buildArgs({ url: "https://u.example/v", kind: "mp4" }, { outDir: "/o", cookiesFile: "/c.txt" });
  assert.equal(login[login.indexOf("--cookies") + 1], "/c.txt");
  const optOut = y.buildArgs({ url: "https://u.example/v", kind: "mp4", useLogin: false }, { outDir: "/o", cookiesFile: "/c.txt" });
  assert.ok(!optOut.includes("--cookies"));
});

test("cover modes", () => {
  const embeds = o => y.buildArgs({ url: "https://u.example/v", kind: "mp3", meta: true, ...o }, { outDir: "/o" }).includes("--embed-thumbnail");
  assert.equal(embeds({ cover: "thumb" }), true);
  assert.equal(embeds({ cover: "none" }), false);
  assert.equal(embeds({ cover: "frame" }), false);
  assert.equal(y.coverMode({ cover: "custom" }), "thumb", "custom without an image falls back");
  assert.equal(y.needsCover({ kind: "mp3", cover: "frame" }), true);
  assert.equal(y.needsCover({ kind: "mp4", cover: "frame" }), false);
  assert.equal(y.toSeconds("1:15"), 75);
  assert.equal(y.toSeconds("bad"), 0);
  assert.ok(y.coverArgs.embed("/a.mp3", "/c.jpg", "/o.mp3").includes("-id3v2_version"));
  assert.ok(!y.coverArgs.embed("/a.m4a", "/c.jpg", "/o.m4a").includes("-id3v2_version"));
});

test("parseLine reads progress, post-processing, files and pages", () => {
  assert.deepEqual(y.parseLine("NZP| 42.5%|  3.10MiB/s|00:12|2|10"), { stage: "download", progress: 42.5, speed: "3.10MB/s", eta: "12", item: 2, items: 10 });
  assert.deepEqual(y.parseLine("NZS|FFmpegExtractAudio"), { stage: "post", speed: "", eta: "" });
  assert.deepEqual(y.parseLine("NZF|/o/a.mp3"), { file: "/o/a.mp3" });
  assert.deepEqual(y.parseLine("NZW|https://u.example/v"), { page: "https://u.example/v" });
  assert.equal(y.parseLine("[download] something"), null);
});

test("cookieJar writes Netscape format and drops YouTube/Google cookies", () => {
  const jar = y.cookieJar([
    { domain: ".instagram.com", name: "sessionid", value: "a", secure: true, httpOnly: true, expires: 1900000000 },
    { domain: "www.facebook.com", hostOnly: true, name: "c_user", value: "1" },
    { domain: ".youtube.com", name: "SID", value: "x" },
    { domain: "accounts.google.com", name: "G", value: "y" },
    { domain: ".x.com", name: "bad\tname", value: "z" },
  ]);
  assert.match(jar, /^# Netscape HTTP Cookie File/);
  assert.match(jar, /#HttpOnly_\.instagram\.com\tTRUE\t\/\tTRUE\t1900000000\tsessionid\ta/);
  assert.match(jar, /\nwww\.facebook\.com\tFALSE\t\/\tFALSE\t0\tc_user\t1/);
  assert.doesNotMatch(jar, /youtube|google|bad/);
});

test("every platform pattern matches its video pages and not its home page", () => {
  const cases = {
    youtube: ["https://www.youtube.com/watch?v=abc", "https://m.youtube.com/shorts/x", "https://youtu.be/abc"],
    facebook: ["https://www.facebook.com/p/videos/123/", "https://www.facebook.com/reel/9", "https://fb.watch/x/"],
    tiktok: ["https://www.tiktok.com/@u/video/7234567890", "https://vm.tiktok.com/ZM1/"],
    instagram: ["https://www.instagram.com/reel/Cab-1/", "https://www.instagram.com/p/Cxy/"],
    x: ["https://x.com/u/status/1", "https://twitter.com/u/status/2"],
    soundcloud: ["https://soundcloud.com/artist/track-name"],
    vimeo: ["https://vimeo.com/123456"],
    twitch: ["https://www.twitch.tv/videos/1", "https://www.twitch.tv/s/clip/Abc"],
    dailymotion: ["https://www.dailymotion.com/video/x8a"],
    reddit: ["https://www.reddit.com/r/v/comments/abc/t/"],
  };
  assert.equal(SITES.length, Object.keys(cases).length);
  for (const s of SITES) {
    const re = new RegExp(s.match, "i");
    for (const u of cases[s.id]) assert.ok(re.test(u), `${s.id} should match ${u}`);
    assert.ok(!re.test(s.url), `${s.id} should not match its start page`);
    assert.match(s.url, /^https:\/\//);
  }
  assert.equal(byId("tiktok").name, "TikTok");
});

test("English translation covers every Arabic string in the page and app", () => {
  const ctx = { window: {}, localStorage: { getItem: () => "en", setItem() {} }, navigator: { language: "en" }, document: {} };
  vm.runInNewContext(read("web/i18n.js"), ctx);
  const { t } = ctx.window.NzI18n;
  const html = read("web/index.html").replace(/<script[\s\S]*?<\/script>/g, "").replace(/<svg[\s\S]*?<\/svg>/g, "");
  const noI18n = /data-no-i18n/;
  const texts = [...html.matchAll(/<([a-z0-9]+)([^>]*)>([^<>]*[؀-ۿ][^<>]*)</g)].filter(m => !noI18n.test(m[2])).map(m => m[3].trim());
  const attrs = [...html.matchAll(/(?:placeholder|aria-label|title)="([^"]*[؀-ۿ][^"]*)"/g)].map(m => m[1]);
  const app = read("web/app.js");
  const dynamic = [...app.matchAll(/(?:\bt|toast|emptyState)\((?:"[^"]*",\s*)?"([^"]*[؀-ۿ][^"]*)"/g)].map(m => m[1]);
  const missing = [...new Set([...texts, ...attrs, ...dynamic])].filter(s => t(s) === s);
  assert.deepEqual(missing, []);
});

test("Windows and Android report the same version", () => {
  const pkg = JSON.parse(read("desktop/package.json")).version;
  const gradle = read("android/app/build.gradle.kts").match(/versionName = "([^"]+)"/)[1];
  assert.equal(gradle, pkg);
});

test("store edition: only sources that allow downloading", () => {
  const allow = ["https://archive.org/details/night_of_the_living_dead", "https://commons.wikimedia.org/wiki/File:A.webm",
    "https://framatube.org/w/kkGMgK9ZtnKfYAgnEtQxbv", "https://example.org/podcast/episode-12.mp3", "https://feeds.example.org/show.rss"];
  const block = ["https://www.youtube.com/watch?v=1", "https://m.youtube.com/shorts/1", "https://youtu.be/1", "https://music.youtube.com/watch?v=1",
    "https://www.youtube-nocookie.com/embed/1", "https://YOUTUBE.COM./watch?v=1", "https://www.facebook.com/x/videos/1", "https://fb.watch/x",
    "https://www.instagram.com/reel/x", "https://www.tiktok.com/@a/video/1", "https://vm.tiktok.com/x", "https://x.com/a/status/1",
    "https://twitter.com/a/status/1", "https://www.twitch.tv/videos/1", "https://www.dailymotion.com/video/x", "https://soundcloud.com/a/b",
    "https://vimeo.com/1", "https://open.spotify.com/track/1", "javascript:alert(1)", "file:///etc/passwd"];
  for (const u of allow) assert.ok(y.storeAllows(u), "should allow " + u);
  for (const u of block) assert.ok(!y.storeAllows(u), "should block " + u);
  // The store build pins yt-dlp to the allowed extractors and drops SponsorBlock/cookies.
  const a = y.buildArgs({ url: allow[0], kind: "mp3", sponsor: true, cookies: "chrome" }, { outDir: "/o", store: true, cookiesFile: "/c.txt" });
  assert.equal(a[a.indexOf("--use-extractors") + 1], y.STORE.extractors);
  assert.ok(!a.includes("--sponsorblock-remove") && !a.includes("--cookies") && !a.includes("--cookies-from-browser"));
  assert.ok(!y.STORE.extractors.split(",").some(e => /youtube|facebook|instagram|tiktok|twitter/i.test(e)));
  assert.ok(y.coverArgs.clip(allow[0], 5, "/w/c.%(ext)s", "", true).includes("--use-extractors"));
});

test("store edition: Kotlin policy matches the JavaScript one exactly", () => {
  const kt = read("android/app/src/main/java/app/nazzil/StorePolicy.kt");
  const ktRegex = kt.match(/private val BLOCKED = Regex\("((?:[^"\\]|\\.)*)"/)[1].replace(/\\\\/g, "\\");
  assert.equal(ktRegex, y.STORE.blocked.source);
  assert.equal(kt.match(/const val EXTRACTORS = "([^"]+)"/)[1], y.STORE.extractors);
});

test("store edition: its platforms are all allowed and none of the full edition's are", () => {
  const { STORE_SITES } = require("../web/sites.js");
  for (const s of STORE_SITES) assert.ok(y.storeAllows(s.url), s.id);
  for (const s of SITES) assert.ok(!y.storeAllows(s.url), s.id + " must not be reachable in the store edition");
});
