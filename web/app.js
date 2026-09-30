"use strict";
const $ = id => document.getElementById(id);
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
      args = { ...args, url, args: NzYtdlp.buildArgs({ ...args, url }, { outDir: "__OUT__" }) };
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
const looksLikeUrl = t => /^https?:\/\/\S+\.\S+/i.test((t || "").trim());

/* ---------- Preferences ---------- */
const prefs = Object.assign({ kind: "mp3", quality: "1080", abr: "0", meta: true, subs: false, sponsor: false, parallel: "3", autoClip: true, theme: "dark" }, store.get(PREFS, {}));
function savePrefs() {
  Object.assign(prefs, {
    kind: new FormData($("form")).get("kind"), quality: $("quality").value, abr: $("abr").value,
    meta: $("meta").checked, subs: $("subs").checked, sponsor: $("sponsor").checked,
    parallel: $("parallel").value, autoClip: $("autoClip").checked,
  });
  store.set(PREFS, prefs);
}
function applyPrefs() {
  const k = document.querySelector(`input[name=kind][value="${prefs.kind}"]`);
  if (k) k.checked = true;
  $("quality").value = prefs.quality; $("abr").value = prefs.abr;
  $("meta").checked = prefs.meta; $("subs").checked = prefs.subs; $("sponsor").checked = prefs.sponsor;
  $("parallel").value = prefs.parallel; $("autoClip").checked = prefs.autoClip;
  if (prefs.theme === "light") document.body.classList.add("light");
  syncKind();
}
function syncKind() {
  const kind = new FormData($("form")).get("kind");
  const audio = kind === "mp3" || kind === "m4a";
  $("videoQ").classList.toggle("off", audio);
  $("abr").disabled = kind !== "mp3";
  $("audioQ").classList.toggle("off", kind !== "mp3");
}

/* ---------- Preview ---------- */
let infoTimer, infoFor = "", lastInfo = null;
function queueInfo() {
  clearTimeout(infoTimer);
  const url = $("url").value.trim();
  if (!looksLikeUrl(url)) { $("preview").hidden = true; lastInfo = null; infoFor = ""; return; }
  if (url === infoFor) return;
  infoTimer = setTimeout(() => loadInfo(url), 450);
}
async function loadInfo(url) {
  infoFor = url;
  const box = $("preview");
  box.hidden = false;
  box.className = "preview loading";
  box.innerHTML = '<div class="spin"></div> جارٍ جلب المعلومات…';
  try {
    const i = await rpc("info", { url });
    if (url !== infoFor) return;
    lastInfo = i;
    box.className = "preview";
    const chips = [
      i.playlist ? `قائمة · ${i.count || "?"} مقطع` : "",
      i.duration ? fmtDur(i.duration) : "",
      i.height ? (i.height >= 2160 ? "4K" : i.height + "p") : "",
      i.site || "",
    ].filter(Boolean).map(c => `<span class="chip">${esc(c)}</span>`).join("");
    box.innerHTML = `${i.thumbnail ? `<img src="${esc(i.thumbnail)}" alt="" referrerpolicy="no-referrer" onerror="this.remove()">` : ""}<div class="meta"><b>${esc(i.title || "بدون عنوان")}</b><small>${esc(i.uploader || "")}</small><div class="chips">${chips}</div></div>`;
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
    box.innerHTML = `<span style="color:var(--bad)">${esc(e.message)}</span>`;
  }
}

/* ---------- Queue ---------- */
let pollTimer;
const seen = new Set(JSON.parse(sessionStorage.getItem("nz.seen") || "[]"));
function renderJobs(jobs) {
  const box = $("queue");
  const active = jobs.filter(j => j.state === "queued" || j.state === "working").length;
  $("queueCount").textContent = active ? `· ${active} جارٍ` : "";
  if (!jobs.length) { box.innerHTML = '<div class="history-empty">لا توجد تنزيلات جارية</div>'; return; }
  box.innerHTML = jobs.map(j => {
    const pct = Math.max(0, Math.min(100, j.progress || 0));
    let line;
    if (j.state === "queued") line = `<span>في الانتظار…</span>`;
    else if (j.state === "working") line = `<span>${j.stage === "post" ? "جارٍ التحويل…" : pct.toFixed(0) + "%"}${j.items > 1 ? ` · ${j.item || 1}/${j.items}` : ""}</span><span dir="ltr">${esc(j.speed || "")} ${j.eta ? "· " + esc(j.eta) : ""}</span>`;
    else if (j.state === "done") line = `<span>اكتمل${j.count > 1 ? ` · ${j.count} ملف` : ""}</span><a href="#" data-open="${esc(j.file || "")}">${j.count > 1 ? "فتح المجلد" : "فتح"}</a>`;
    else if (j.state === "cancelled") line = `<span>أُلغي</span>`;
    else line = `<span>${esc(j.error || "تعذر إكمال العملية")}</span>`;
    const btn = (j.state === "queued" || j.state === "working")
      ? `<button data-cancel="${esc(j.id)}" title="إلغاء" aria-label="إلغاء">✕</button>`
      : `<button data-dismiss="${esc(j.id)}" title="إخفاء" aria-label="إخفاء">–</button>`;
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
        saveHistory({ file: j.file, name: j.title, kind: j.kind, count: j.count, at: Date.now() });
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
  const rows = [item, ...store.get(HISTORY, []).filter(x => x.file !== item.file)].slice(0, 30);
  store.set(HISTORY, rows);
  renderHistory();
}
function renderHistory() {
  const rows = store.get(HISTORY, []);
  $("history").innerHTML = rows.length ? rows.map(x => `<div class="history-item"><span class="file-icon">${esc((x.kind || "").toUpperCase())}</span><div><strong title="${esc(x.name)}">${esc(x.name)}</strong><small>${new Date(x.at).toLocaleDateString("ar")}${x.count > 1 ? ` · ${x.count} ملف` : ""}</small></div><a href="#" data-open="${esc(x.file)}" aria-label="فتح الملف">↗</a></div>`).join("")
    : '<div class="history-empty">لا توجد تنزيلات بعد<br><small>ستظهر ملفاتك هنا</small></div>';
}

/* ---------- Actions ---------- */
function parseTime(t) {
  t = (t || "").trim();
  if (!t) return "";
  if (!/^\d+(:\d{1,2}){0,2}(\.\d+)?$/.test(t)) throw new Error("صيغة وقت القص غير صحيحة. مثال: 1:30");
  return t;
}
$("form").addEventListener("submit", async e => {
  e.preventDefault();
  const url = $("url").value.trim();
  if (!looksLikeUrl(url)) { show("ألصق رابطًا صحيحًا يبدأ بـ https://", true); $("url").focus(); return; }
  if (!$("rights").checked) { show("أكّد أن لديك الحق في تنزيل هذا المحتوى.", true); return; }
  savePrefs();
  $("submit").disabled = true;
  try {
    const body = {
      url, kind: prefs.kind, quality: prefs.quality, abr: prefs.abr,
      playlist: $("playlist").checked, meta: prefs.meta, subs: prefs.subs, sponsor: prefs.sponsor,
      from: parseTime($("trimFrom").value), to: parseTime($("trimTo").value),
      title: lastInfo?.title || url, rightsConfirmed: true,
    };
    await rpc("download", body);
    show("أُضيف إلى قائمة التنزيل ✓");
    if (innerWidth < 760) $("queue").scrollIntoView({ behavior: "smooth", block: "center" });
    setTimeout(() => show(""), 2500);
    $("url").value = ""; $("trimFrom").value = ""; $("trimTo").value = ""; $("playlist").checked = false;
    $("preview").hidden = true; infoFor = ""; lastInfo = null;
    pollJobs();
  } catch (err) {
    show(esc(err.message), true);
  } finally {
    $("submit").disabled = false;
  }
});

document.addEventListener("click", e => {
  const open = e.target.closest("[data-open]");
  if (open) { e.preventDefault(); rpc("open", { file: open.dataset.open }).catch(err => show(esc(err.message), true)); return; }
  const cancel = e.target.closest("[data-cancel]");
  if (cancel) { rpc("cancel", { id: cancel.dataset.cancel }).then(pollJobs); return; }
  const dismiss = e.target.closest("[data-dismiss]");
  if (dismiss) rpc("dismiss", { id: dismiss.dataset.dismiss }).then(pollJobs);
});

$("url").addEventListener("input", queueInfo);
$("url").addEventListener("paste", () => setTimeout(queueInfo, 0));
$("clearUrl").addEventListener("click", () => { $("url").value = ""; queueInfo(); $("url").focus(); });
$("clearHistory").addEventListener("click", () => { store.set(HISTORY, []); renderHistory(); });
document.querySelectorAll("input[name=kind]").forEach(r => r.addEventListener("change", () => { syncKind(); savePrefs(); }));
["quality", "abr", "meta", "subs", "sponsor", "parallel", "autoClip"].forEach(id => $(id).addEventListener("change", () => {
  savePrefs();
  if (id === "parallel") rpc("settings", { parallel: +prefs.parallel }).catch(() => {});
}));

async function pasteFromClipboard(silent) {
  try {
    const text = (await navigator.clipboard.readText() || "").trim();
    if (looksLikeUrl(text) && text !== $("url").value.trim()) { $("url").value = text; queueInfo(); if (!silent) show("تم لصق الرابط من الحافظة."); }
  } catch {}
}
const drop = $("dropzone");
["dragenter", "dragover"].forEach(n => drop.addEventListener(n, e => { e.preventDefault(); drop.classList.add("drag"); }));
["dragleave", "drop"].forEach(n => drop.addEventListener(n, e => { e.preventDefault(); drop.classList.remove("drag"); }));
drop.addEventListener("drop", e => {
  const text = e.dataTransfer.getData("text/uri-list") || e.dataTransfer.getData("text");
  if (text) { $("url").value = text.split("\n")[0].trim(); queueInfo(); }
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
  try { const r = await rpc("pickFolder"); if (r.folder) $("folderPath").textContent = r.folder; } catch (e) { show(esc(e.message), true); }
});
$("openFolder").addEventListener("click", () => rpc("open", { file: "" }).catch(() => {}));
$("updateBtn").addEventListener("click", async () => {
  const b = $("updateBtn");
  b.disabled = true; b.textContent = "جارٍ التحديث…";
  try { const r = await rpc("update"); $("engineVer").textContent = `yt-dlp ${r.version || ""}`; b.textContent = "مُحدَّث ✓"; }
  catch (e) { b.textContent = "فشل"; show(esc(e.message), true); }
  finally { setTimeout(() => { b.disabled = false; b.textContent = "تحديث"; }, 2500); }
});

async function loadStatus() {
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      status = await rpc("status");
      $("tools").textContent = `yt-dlp ${status.yt_dlp ? "✓" : "✗"}  ·  FFmpeg ${status.ffmpeg ? "✓" : "✗"}`;
      $("engineVer").textContent = `yt-dlp ${status.version || ""}`;
      $("folderPath").textContent = status.folder || "—";
      $("pickFolder").hidden = !status.canPickFolder;
      $("platform").textContent = status.platform === "android" ? "يعمل محليًا على Android" : "يعمل محليًا على Windows";
      rpc("settings", { parallel: +prefs.parallel }).catch(() => {});
      return;
    } catch { await new Promise(r => setTimeout(r, 700)); }
  }
  $("tools").textContent = "الخدمة غير متصلة";
}

// Android hands us a URL shared from another app.
window.nazzilSetUrl = url => { $("url").value = url; queueInfo(); show("تم استلام الرابط. اختر الصيغة وأضفه للتنزيل."); };

applyPrefs();
renderHistory();
loadStatus().then(() => { if (prefs.autoClip) pasteFromClipboard(true); });
pollJobs();
