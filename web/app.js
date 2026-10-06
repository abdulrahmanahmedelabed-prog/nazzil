"use strict";
const $ = id => document.getElementById(id);
const t = NzI18n.t;
const HISTORY = "nazil.history.v1", PREFS = "nazil.prefs.v2";

/* ---------- Platform bridge ----------
   One async RPC for both platforms:
   - Windows (Electron): POST /api/<method> to the local server.
   - Android: window.NazzilAndroid.call(method, json, id) → native calls window.__nzReply(id, json). */
const android = window.NazzilAndroid;
const pending = new Map();
let seq = 0;
window.__nzReply = (id, json) => {
  const p = pending.get(id);
  if (!p) return;
  pending.delete(id);
  const r = JSON.parse(json);
  r && r.error && r.__rpcError ? p.reject(new Error(r.error)) : p.resolve(r);
};
function rpc(method, args = {}) {
  if (android) {
    // Android runs yt-dlp natively; arguments come from the shared builder so behaviour matches Windows.
    if (method === "download") {
      const url = NzYtdlp.validUrl(args.url);
      if (!url) return Promise.reject(new Error("الرابط غير صالح. استخدم رابطًا يبدأ بـ https://"));
      // "__COOKIES__" is replaced natively with the in-app browser's sign-ins (or dropped if there are none).
      args = { ...args, url, args: NzYtdlp.buildArgs({ ...args, url }, { outDir: "__OUT__", cookiesFile: "__COOKIES__" }) };
      // Cover from a video frame or the user's image: native code runs these steps after the download.
      if (NzYtdlp.needsCover(args)) {
        const c = NzYtdlp.coverArgs, sec = NzYtdlp.toSeconds(args.coverAt) || 30;
        args.coverPlan = {
          mode: NzYtdlp.coverMode(args), image: args.coverImage || "",
          clips: [sec, 1].map(x => c.clip("__PAGE__", x, "__WORK__/clip.%(ext)s")),
          toJpeg: c.toJpeg("__SRC__", "__JPG__"),
          embed: c.embed("__AUDIO__." + args.kind, "__JPG__", "__OUT__"),
        };
      }
    }
    if (method === "info") {
      const url = NzYtdlp.validUrl(args.url);
      if (!url) return Promise.reject(new Error("الرابط غير صالح. استخدم رابطًا يبدأ بـ https://"));
      return rpcNative(method, { url }).then(r => NzYtdlp.summarizeInfo(JSON.parse(r.__raw)));
    }
    return rpcNative(method, args);
  }
  return rpcHttp(method, args);
}
function rpcNative(method, args) {
  return new Promise((resolve, reject) => {
    const id = ++seq;
    pending.set(id, { resolve, reject });
    android.call(method, JSON.stringify(args), id);
  });
}
function rpcHttp(method, args) {
  return fetch(`/api/${method}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(args) })
    .then(async r => { const j = await r.json(); if (!r.ok) throw new Error(j.error || "فشل الطلب"); return j; });
}

/* ---------- Helpers ---------- */
const esc = v => String(v ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[c]));
const store = {
  get(k, d) { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
};
function fmtDur(s) {
  if (!s) return "";
  s = Math.round(s);
  const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), x = s % 60;
  return (h ? h + ":" + String(m).padStart(2, "0") : m) + ":" + String(x).padStart(2, "0");
}
function show(html, error = false) {
  const el = $("message");
  el.hidden = !html;
  el.className = "message" + (error ? " error" : "");
  el.innerHTML = html || "";
}
const looksLikeUrl = s => /^https?:\/\/\S+\.\S+/i.test((s || "").trim());
/** All http(s) links in a piece of text, de-duplicated, in order. */
const extractUrls = text => [...new Set((String(text || "").match(/https?:\/\/[^\s"'<>]+/gi) || []).map(u => u.replace(/[),.;]+$/, "")))];

/* ---------- Preferences ---------- */
const prefs = Object.assign({ kind: "mp3", quality: "1080", abr: "0", meta: true, subs: false, sponsor: false, parallel: "3", autoClip: true, theme: "", rate: "", cookies: "", cover: "thumb", coverAt: "", coverImage: "", coverName: "", useLogin: true }, store.get(PREFS, {}));
function savePrefs() {
  Object.assign(prefs, {
    kind: new FormData($("form")).get("kind"), quality: $("quality").value, abr: $("abr").value,
    meta: $("meta").checked, subs: $("subs").checked, sponsor: $("sponsor").checked,
    parallel: $("parallel").value, autoClip: $("autoClip").checked, rate: $("rate").value, cookies: $("cookies").value, useLogin: $("useLogin").checked,
    cover: (document.querySelector("input[name=cover]:checked") || {}).value || "thumb", coverAt: $("coverAt").value.trim(),
  });
  store.set(PREFS, prefs);
}
function applyPrefs() {
  const k = document.querySelector(`input[name=kind][value="${prefs.kind}"]`);
  if (k) k.checked = true;
  $("quality").value = prefs.quality; $("abr").value = prefs.abr;
  $("meta").checked = prefs.meta; $("subs").checked = prefs.subs; $("sponsor").checked = prefs.sponsor;
  $("parallel").value = prefs.parallel; $("autoClip").checked = prefs.autoClip;
  $("rate").value = prefs.rate; $("cookies").value = prefs.cookies; $("useLogin").checked = prefs.useLogin;
  const c = document.querySelector(`input[name=cover][value="${prefs.cover}"]`);
  if (c) c.checked = true;
  $("coverAt").value = prefs.coverAt; $("coverName").textContent = prefs.coverName || "";
  // Follow the device's light/dark setting until the user picks one.
  const light = prefs.theme ? prefs.theme === "light" : matchMedia("(prefers-color-scheme: light)").matches;
  document.body.classList.toggle("light", light);
  syncKind();
}
function syncKind() {
  const kind = new FormData($("form")).get("kind");
  const audio = kind === "mp3" || kind === "m4a";
  $("videoQ").classList.toggle("off", audio);
  $("abr").disabled = kind !== "mp3";
  $("audioQ").classList.toggle("off", kind !== "mp3");
  $("coverBox").hidden = !audio;
  syncCover();
}
function syncCover() {
  const c = (document.querySelector("input[name=cover]:checked") || {}).value;
  $("coverFrame").hidden = c !== "frame";
  $("coverCustom").hidden = c !== "custom";
}

/* ---------- Preview ---------- */
let infoTimer, infoFor = "", lastInfo = null;
function queueInfo() {
  clearTimeout(infoTimer);
  const url = $("url").value.trim();
  const urls = extractUrls(url);
  if (urls.length > 1) {
    infoFor = url; lastInfo = null;
    const box = $("preview");
    box.hidden = false; box.className = "preview";
    box.innerHTML = `<div class="meta" style="width:100%"><b>${urls.length} ${esc(t("روابط ستُضاف كلها إلى قائمة التنزيل"))}</b><div class="batch">${urls.slice(0, 50).map(u => `<span>${esc(u)}</span>`).join("")}</div></div>`;
    return;
  }
  if (!looksLikeUrl(url)) { $("preview").hidden = true; lastInfo = null; infoFor = ""; return; }
  if (url === infoFor) return;
  infoTimer = setTimeout(() => loadInfo(url), 450);
}
async function loadInfo(url) {
  infoFor = url;
  const box = $("preview");
  box.hidden = false;
  box.className = "preview loading";
  box.innerHTML = `<div class="spin"></div> ${esc(t("جارٍ جلب المعلومات…"))}`;
  try {
    const i = await rpc("info", { url });
    if (url !== infoFor) return;
    lastInfo = i;
    box.className = "preview";
    const chips = [
      i.playlist ? `${t("قائمة")} · ${i.count || "?"} ${t("مقطع")}` : "",
      i.duration ? fmtDur(i.duration) : "",
      i.height ? (i.height >= 2160 ? "4K" : i.height + "p") : "",
      i.site || "",
    ].filter(Boolean).map(c => `<span class="chip">${esc(c)}</span>`).join("");
    box.innerHTML = `${i.thumbnail ? `<img src="${esc(i.thumbnail)}" alt="" referrerpolicy="no-referrer" onerror="this.remove()">` : ""}<div class="meta"><b>${esc(i.title || t("بدون عنوان"))}</b><small>${esc(i.uploader || "")}</small><div class="chips">${chips}</div></div>`;
    if (i.playlist) $("playlist").checked = true;
    if (i.height) {
      // Hide resolutions the source doesn't have.
      [...$("quality").options].forEach(o => { o.hidden = o.value !== "best" && +o.value > i.height; });
      if ($("quality").selectedOptions[0]?.hidden) $("quality").value = "best";
    }
  } catch (e) {
    if (url !== infoFor) return;
    lastInfo = null;
    box.className = "preview loading";
    box.innerHTML = `<span style="color:var(--bad)">${esc(t(e.message))}</span>`;
  }
}

/* ---------- Queue ---------- */
let pollTimer;
const seen = new Set(JSON.parse(sessionStorage.getItem("nz.seen") || "[]"));
function renderJobs(jobs) {
  const box = $("queue");
  const active = jobs.filter(j => j.state === "queued" || j.state === "working").length;
  $("queueCount").textContent = active ? `· ${active} ${t("جارٍ")}` : "";
  if (!jobs.length) { box.innerHTML = `<div class="history-empty">${esc(t("لا توجد تنزيلات جارية"))}</div>`; return; }
  box.innerHTML = jobs.map(j => {
    const pct = Math.max(0, Math.min(100, j.progress || 0));
    let line;
    if (j.state === "queued") line = `<span>${t("في الانتظار…")}</span>`;
    else if (j.state === "working") line = `<span>${j.stage === "cover" ? t("جارٍ إضافة الغلاف…") : j.stage === "post" ? t("جارٍ التحويل…") : pct.toFixed(0) + "%"}${j.items > 1 ? ` · ${j.item || 1}/${j.items}` : ""}</span><span dir="ltr">${esc(j.speed || "")} ${j.eta ? "· " + esc(j.eta) : ""}</span>`;
    else if (j.state === "paused") line = `<span>${t("متوقف مؤقتًا")} · ${pct.toFixed(0)}%</span>`;
    else if (j.state === "done") line = `<span>${t("اكتمل")}${j.count > 1 ? ` · ${j.count} ${t("ملف")}` : ""}${j.warning ? ` · ${esc(t(j.warning))}` : ""}</span>` + (isWeb()
      ? `<span class="dl-links">${(j.names || []).map((n, i) => `<a href="/dl/${encodeURIComponent(j.id)}/${i}" download="${esc(n)}" title="${esc(n)}">${j.count > 1 ? i + 1 : t("تنزيل إلى هذا الجهاز")}</a>`).join("")}</span>`
      : `<a href="#" data-open="${esc(j.file || "")}">${t(j.count > 1 ? "فتح المجلد" : "فتح")}</a>`);
    else if (j.state === "cancelled") line = `<span>${t("أُلغي")}</span>`;
    else line = `<span>${esc(t(j.error || "تعذر إكمال العملية"))}</span>`;
    const b = (act, icon, label) => `<button data-act="${act}" data-id="${esc(j.id)}" title="${esc(t(label))}" aria-label="${esc(t(label))}">${icon}</button>`;
    const active = j.state === "queued" || j.state === "working";
    const btn = '<span class="job-actions">' + (
      active ? b("pause", "⏸", "إيقاف مؤقت") + b("cancel", "✕", "إلغاء")
      : j.state === "paused" ? b("resume", "▶", "استئناف") + b("cancel", "✕", "إلغاء")
      : j.state === "done" ? b("dismiss", "–", "إخفاء")
      : b("resume", "↻", "إعادة المحاولة") + b("dismiss", "–", "إخفاء")) + "</span>";
    return `<div class="job ${esc(j.state)}"><div class="job-top"><span class="file-icon">${esc(j.kind.toUpperCase())}</span><strong title="${esc(j.title)}">${esc(j.title)}</strong>${btn}</div><div class="bar"><i style="width:${j.state === "done" ? 100 : pct}%"></i></div><small>${line}</small></div>`;
  }).join("");
}
async function pollJobs() {
  clearTimeout(pollTimer);
  try {
    const { jobs } = await rpc("jobs");
    renderJobs(jobs);
    for (const j of jobs) {
      if (j.state === "done" && !seen.has(j.id)) {
        seen.add(j.id);
        sessionStorage.setItem("nz.seen", JSON.stringify([...seen]));
        saveHistory({ file: isWeb() ? `/dl/${j.id}/0` : j.file, web: isWeb(), name: j.title, kind: j.kind, count: j.count, at: Date.now() });
      }
    }
    const busy = jobs.some(j => j.state === "queued" || j.state === "working");
    pollTimer = setTimeout(pollJobs, busy ? 800 : 4000);
  } catch {
    pollTimer = setTimeout(pollJobs, 3000);
  }
}

/* ---------- History ---------- */
function saveHistory(item) {
  const rows = [item, ...store.get(HISTORY, []).filter(x => x.file !== item.file)].slice(0, 300);
  store.set(HISTORY, rows);
  renderHistory();
}
function renderHistory() {
  const all = store.get(HISTORY, []);
  $("historySearch").hidden = all.length < 6;
  const q = $("historySearch").value.trim().toLowerCase();
  const rows = (q ? all.filter(x => String(x.name).toLowerCase().includes(q)) : all).slice(0, 60);
  if (q && !rows.length) { $("history").innerHTML = `<div class="history-empty">${esc(t("لا نتائج"))}</div>`; return; }
  $("history").innerHTML = rows.length ? rows.map(x => `<div class="history-item"><span class="file-icon">${esc((x.kind || "").toUpperCase())}</span><div><strong title="${esc(x.name)}">${esc(x.name)}</strong><small>${new Date(x.at).toLocaleDateString(NzI18n.lang)}${x.count > 1 ? ` · ${x.count} ${t("ملف")}` : ""}</small></div>${x.web ? `<a href="${esc(x.file)}" download aria-label="${esc(t("تنزيل إلى هذا الجهاز"))}">↓</a>` : `<a href="#" data-open="${esc(x.file)}" aria-label="${esc(t("فتح الملف"))}">↗</a>`}</div>`).join("")
    : `<div class="history-empty">${esc(t("لا توجد تنزيلات بعد"))}<br><small>${esc(t("ستظهر ملفاتك هنا"))}</small></div>`;
}

/* ---------- Actions ---------- */
function parseTime(v) {
  v = (v || "").trim();
  if (!v) return "";
  if (!/^\d+(:\d{1,2}){0,2}(\.\d+)?$/.test(v)) throw new Error(t("صيغة وقت القص غير صحيحة. مثال: 1:30"));
  return v;
}
$("form").addEventListener("submit", async e => {
  e.preventDefault();
  const urls = extractUrls($("url").value);
  const url = urls[0] || $("url").value.trim();
  if (!looksLikeUrl(url)) { show(esc(t("ألصق رابطًا صحيحًا يبدأ بـ https://")), true); $("url").focus(); return; }
  savePrefs();
  const audioKind = prefs.kind === "mp3" || prefs.kind === "m4a";
  if (audioKind && prefs.cover === "custom" && !prefs.coverImage) { show(esc(t("اختر صورة الغلاف أولًا.")), true); return; }
  $("submit").disabled = true;
  try {
    const body = {
      url, kind: prefs.kind, quality: prefs.quality, abr: prefs.abr,
      playlist: $("playlist").checked, meta: prefs.meta, subs: prefs.subs, sponsor: prefs.sponsor,
      rate: prefs.rate, cookies: status.platform === "android" ? "" : prefs.cookies,
      cover: prefs.cover, coverAt: parseTime(prefs.coverAt), coverImage: prefs.coverImage, useLogin: prefs.useLogin,
      from: parseTime($("trimFrom").value), to: parseTime($("trimTo").value),
      title: lastInfo?.title || url,
    };
    if (urls.length > 1) {
      for (const u of urls) await rpc("download", { ...body, url: u, title: u, playlist: false });
      show(esc(t("أُضيفت الروابط إلى قائمة التنزيل ✓")));
    } else {
      await rpc("download", body);
      show(esc(t("أُضيف إلى قائمة التنزيل ✓")));
    }
    if (innerWidth < 760) $("queue").scrollIntoView({ behavior: "smooth", block: "center" });
    setTimeout(() => show(""), 2500);
    $("url").value = ""; $("trimFrom").value = ""; $("trimTo").value = ""; $("playlist").checked = false;
    $("preview").hidden = true; infoFor = ""; lastInfo = null;
    pollJobs();
  } catch (err) {
    show(esc(t(err.message)), true);
  } finally {
    $("submit").disabled = false;
  }
});

document.addEventListener("click", e => {
  const open = e.target.closest("[data-open]");
  if (open) { e.preventDefault(); rpc("open", { file: open.dataset.open }).catch(err => show(esc(t(err.message)), true)); return; }
  const act = e.target.closest("[data-act]");
  if (act) rpc(act.dataset.act, { id: act.dataset.id }).then(pollJobs, err => show(esc(t(err.message)), true));
});

$("url").addEventListener("input", queueInfo);
$("url").addEventListener("paste", e => {
  // A single-line input would glue pasted lines together; keep multiple links separated.
  const urls = extractUrls(e.clipboardData && e.clipboardData.getData("text"));
  if (urls.length > 1) { e.preventDefault(); $("url").value = urls.join(" "); }
  setTimeout(queueInfo, 0);
});
// Browse: pick a platform, then the in-app browser shows a download button on its video pages.
$("siteGrid").innerHTML = NzSites.SITES.map(x => `<button type="button" class="site" data-site="${x.id}"><i style="background:${x.color}">${x.icon}</i><span>${esc(x.name)}</span></button>`).join("");
$("browseBtn").addEventListener("click", () => $("sites").showModal());
$("siteGrid").addEventListener("click", e => {
  const b = e.target.closest("[data-site]");
  if (!b) return;
  const site = NzSites.byId(b.dataset.site);
  $("sites").close();
  if (isWeb()) {
    // In a phone browser there's no in-app browser: open the site in a new tab and paste the link back.
    window.open(site.mobileUrl || site.url, "_blank", "noopener");
    show(esc(t("افتح الفيديو، انسخ رابطه، ثم ارجع والصقه هنا.")));
    return;
  }
  rpc("browse", { site: site.id, name: site.name, url: site.url, mobileUrl: site.mobileUrl || "", match: site.match })
    .catch(err => show(esc(t(err.message)), true));
});
$("clearUrl").addEventListener("click", () => { $("url").value = ""; queueInfo(); $("url").focus(); });
$("clearHistory").addEventListener("click", () => { store.set(HISTORY, []); $("historySearch").value = ""; renderHistory(); });
$("historySearch").addEventListener("input", renderHistory);
document.querySelectorAll("input[name=cover]").forEach(r => r.addEventListener("change", () => { syncCover(); savePrefs(); }));
$("coverAt").addEventListener("change", savePrefs);
$("pickCover").addEventListener("click", async () => {
  try {
    const r = isWeb() ? await uploadCover() : await rpc("pickImage");
    if (!r || !r.path) return;
    prefs.coverImage = r.path; prefs.coverName = r.name || r.path;
    $("coverName").textContent = prefs.coverName;
    savePrefs();
    show("");
  } catch (e) { show(esc(t(e.message)), true); }
});
document.querySelectorAll("input[name=kind]").forEach(r => r.addEventListener("change", () => { syncKind(); savePrefs(); }));
["quality", "abr", "meta", "subs", "sponsor", "parallel", "autoClip", "rate", "cookies", "useLogin"].forEach(id => $(id).addEventListener("change", () => {
  savePrefs();
  if (id === "parallel") rpc("settings", { parallel: +prefs.parallel }).catch(() => {});
}));

async function pasteFromClipboard(silent) {
  try {
    const text = (await navigator.clipboard.readText() || "").trim();
    const urls = extractUrls(text), joined = urls.join(" ");
    if (urls.length && joined !== $("url").value.trim()) { $("url").value = joined; queueInfo(); if (!silent) show(esc(t("تم لصق الرابط من الحافظة."))); }
  } catch {}
}
const drop = $("dropzone");
["dragenter", "dragover"].forEach(n => drop.addEventListener(n, e => { e.preventDefault(); drop.classList.add("drag"); }));
["dragleave", "drop"].forEach(n => drop.addEventListener(n, e => { e.preventDefault(); drop.classList.remove("drag"); }));
drop.addEventListener("drop", e => {
  const text = e.dataTransfer.getData("text/uri-list") || e.dataTransfer.getData("text");
  const urls = extractUrls(text);
  if (urls.length) { $("url").value = urls.join(" "); queueInfo(); }
});
drop.addEventListener("click", () => pasteFromClipboard(false));
drop.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); pasteFromClipboard(false); } });
window.addEventListener("focus", () => { if (prefs.autoClip && !$("url").value) pasteFromClipboard(true); });

$("themeBtn").addEventListener("click", () => {
  document.body.classList.toggle("light");
  prefs.theme = document.body.classList.contains("light") ? "light" : "dark";
  store.set(PREFS, prefs);
});
document.addEventListener("keydown", e => { if ((e.metaKey || e.ctrlKey) && e.key === "Enter") $("form").requestSubmit(); });

/* ---------- Settings ---------- */
let status = {};
$("settingsBtn").addEventListener("click", () => $("settings").showModal());
$("pickFolder").addEventListener("click", async () => {
  try { const r = await rpc("pickFolder"); if (r.folder) $("folderPath").textContent = r.folder; } catch (e) { show(esc(t(e.message)), true); }
});
$("openFolder").addEventListener("click", () => rpc("open", { file: "" }).catch(() => {}));
$("updateBtn").addEventListener("click", async () => {
  const b = $("updateBtn");
  b.disabled = true; b.textContent = t("جارٍ التحديث…");
  try { const r = await rpc("update"); $("engineVer").textContent = `yt-dlp ${r.version || ""}`; b.textContent = t("مُحدَّث ✓"); }
  catch (e) { b.textContent = t("فشل"); show(esc(t(e.message)), true); }
  finally { setTimeout(() => { b.disabled = false; b.textContent = t("تحديث"); }, 2500); }
});

async function loadStatus() {
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      status = await rpc("status");
      $("tools").textContent = `yt-dlp ${status.yt_dlp ? "✓" : "✗"}  ·  FFmpeg ${status.ffmpeg ? "✓" : "✗"}`;
      $("engineVer").textContent = `yt-dlp ${status.version || ""}`;
      $("folderPath").textContent = status.folder || "—";
      $("pickFolder").hidden = !status.canPickFolder;
      $("platform").textContent = t(platformText());
      $("cookiesRow").hidden = status.platform !== "windows"; // only the desktop can read browser cookies
      // In a phone browser (LAN mode) hide the controls that act on the computer itself.
      for (const id of ["folderRow", "loginRow", "engineRow"]) $(id).hidden = isWeb();
      $("lanRow").hidden = status.platform !== "windows";
      if (status.platform === "windows") refreshLan();
      rpc("settings", { parallel: +prefs.parallel }).catch(() => {});
      checkForUpdate(status.appVersion);
      return;
    } catch { await new Promise(r => setTimeout(r, 700)); }
  }
  $("tools").textContent = t("الخدمة غير متصلة");
}

/* ---------- Phone access (LAN) ---------- */
const isWeb = () => status.platform === "web";
function uploadCover() {
  return new Promise((resolve, reject) => {
    const input = $("coverFile");
    input.value = "";
    input.onchange = async () => {
      const f = input.files[0];
      if (!f) return resolve(null);
      try {
        const r = await fetch("/upload", { method: "POST", headers: { "x-name": encodeURIComponent(f.name) }, body: f });
        const j = await r.json();
        if (!r.ok) throw new Error(j.error || "فشل الطلب");
        resolve(j);
      } catch (e) { reject(e); }
    };
    input.click();
  });
}
async function refreshLan(enable) {
  try {
    const r = await rpc("lan", enable === undefined ? {} : { enable });
    $("lanToggle").checked = r.enabled;
    $("lanPanel").hidden = !r.enabled;
    if (r.enabled && !r.hasNetwork) { $("lanUrl").textContent = t("لا توجد شبكة. اتصل بالواي فاي أولًا."); $("lanQr").hidden = true; return; }
    $("lanUrl").textContent = r.url || "";
    $("lanQr").hidden = !r.qr;
    if (r.qr) $("lanQr").src = r.qr;
  } catch (e) { show(esc(t(e.message)), true); }
}
$("lanToggle").addEventListener("change", () => refreshLan($("lanToggle").checked));
$("lanReset").addEventListener("click", () => refreshLan("reset"));

/* ---------- App updates ---------- */
const RELEASES = "https://api.github.com/repos/abdulrahmanahmedelabed-prog/nazzil/releases/latest";
const newer = (a, b) => {
  const x = String(a).replace(/^v/, "").split(".").map(Number), y = String(b).replace(/^v/, "").split(".").map(Number);
  for (let i = 0; i < 3; i++) { if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0); }
  return false;
};
async function checkForUpdate(current) {
  if (!current) return;
  try {
    const r = await fetch(RELEASES, { headers: { Accept: "application/vnd.github+json" } });
    if (!r.ok) return; // e.g. the repository is private
    const rel = await r.json();
    if (!newer(rel.tag_name, current)) return;
    const bar = $("updateBar");
    bar.href = rel.html_url;
    bar.textContent = `${t("إصدار جديد متاح")}: ${rel.tag_name} — ${t("اضغط للتحميل")}`;
    bar.hidden = false;
  } catch {}
}

// Android hands us a URL shared from another app.
window.nazzilSetUrl = url => { $("url").value = extractUrls(url).join(" ") || url; queueInfo(); show(esc(t("تم استلام الرابط. اختر الصيغة وأضفه للتنزيل."))); };

const platformText = () => status.platform === "android" ? "يعمل محليًا على Android" : status.platform === "web" ? "يعمل عبر كمبيوترك" : "يعمل محليًا على Windows";
function applyLang() {
  NzI18n.translatePage();
  $("langBtn").textContent = NzI18n.lang === "en" ? "ع" : "EN";
  if (status.platform) $("platform").textContent = t(platformText());
  renderHistory();
  pollJobs();
}
$("langBtn").addEventListener("click", () => { NzI18n.set(NzI18n.lang === "en" ? "ar" : "en"); applyLang(); });

applyPrefs();
applyLang();
loadStatus().then(() => { if (prefs.autoClip) pasteFromClipboard(true); });
