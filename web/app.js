"use strict";
const $ = id => document.getElementById(id);
const t = NzI18n.t;
const HISTORY = "nazil.history.v1", PREFS = "nazil.prefs.v2", SUPPORTER = "nazil.supporter", DONE_COUNT = "nazil.doneCount";
let status = {}; // filled by loadStatus(): platform, versions, store edition…
let localFile = null; // a file from the device to convert: {path | id | webFile, name, size}

/* ---------- Platform bridge ----------
   One async RPC for every platform:
   - Windows (Electron) and phone browsers in LAN mode: POST /api/<method> to the local server.
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
      args = { ...args, url, args: NzYtdlp.buildArgs({ ...args, url }, { outDir: "__OUT__", cookiesFile: "__COOKIES__", store: isStore() }) };
      // Cover from a video frame or the user's image: native code runs these steps after the download.
      if (NzYtdlp.needsCover(args)) {
        const c = NzYtdlp.coverArgs, sec = NzYtdlp.toSeconds(args.coverAt) || 30;
        args.coverPlan = {
          mode: NzYtdlp.coverMode(args), image: args.coverImage || "",
          clips: [sec, 1].map(x => c.clip("__PAGE__", x, "__WORK__/clip.%(ext)s", "", isStore())),
          toJpeg: c.toJpeg("__SRC__", "__JPG__"),
          embed: c.embed("__AUDIO__." + args.kind, "__JPG__", "__OUT__"),
        };
      }
    }
    if (method === "convert") {
      // Native code runs these FFmpeg steps on a copy of the picked/shared file.
      const y = NzYtdlp, o = { ...args, title: args.meta !== false ? y.baseTitle(args.name) : "" };
      const audio = args.kind === "mp3" || args.kind === "m4a", sec = y.toSeconds(args.coverAt) || 30;
      args = { ...args, plan: {
        convert: y.convertArgs(o, "__IN__", "__OUT__", false),
        copy: args.kind === "mp4" && !args.from && !args.to ? y.convertArgs(o, "__IN__", "__OUT__", true) : null,
        cover: audio && args.cover !== "none" ? {
          mode: args.cover === "custom" ? "custom" : "frame", image: args.coverImage || "",
          frames: [sec, 1, 0].map(x => y.frameArgs("__SRC__", x, "__JPG__")),
          toJpeg: y.coverArgs.toJpeg("__SRC__", "__JPG__"),
          embed: y.coverArgs.embed("__AUDIO__." + args.kind, "__JPG__", "__OUT__"),
        } : null,
      } };
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
const icon = name => `<svg aria-hidden="true"><use href="#i-${name}"/></svg>`;
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
/** Short-lived notification. `text` is plain text (escaped here); errors stay longer. */
function toast(text, error = false) {
  if (!text) return;
  const el = document.createElement("div");
  el.className = "toast" + (error ? " error" : "");
  el.setAttribute("role", error ? "alert" : "status");
  el.innerHTML = `<span>${esc(t(text))}</span><button type="button" aria-label="${esc(t("إغلاق"))}">${icon("x")}</button>`;
  const close = () => el.remove();
  el.querySelector("button").onclick = close;
  const box = $("toasts");
  box.appendChild(el);
  while (box.children.length > 3) box.firstChild.remove();
  setTimeout(close, error ? 7000 : 3200);
}
const looksLikeUrl = s => /^https?:\/\/\S+\.\S+/i.test((s || "").trim());
/** All http(s) links in a piece of text, de-duplicated, in order. */
const extractUrls = text => [...new Set((String(text || "").match(/https?:\/\/[^\s"'<>]+/gi) || []).map(u => u.replace(/[),.;]+$/, "")))];
const kindOf = () => new FormData($("form")).get("kind");
const isAudio = k => k === "mp3" || k === "m4a";

/* ---------- Preferences ---------- */
const EXTRA_DEFAULTS = { meta: true, subs: false, sponsor: false, cover: "thumb", coverAt: "" };
const prefs = Object.assign({ kind: "mp3", quality: "1080", abr: "0", parallel: "3", autoClip: true, theme: "", rate: "", cookies: "",
  coverImage: "", coverName: "", useLogin: true }, EXTRA_DEFAULTS, store.get(PREFS, {}));
function savePrefs() {
  Object.assign(prefs, {
    kind: kindOf(), quality: $("quality").value, abr: $("abr").value,
    meta: $("meta").checked, subs: $("subs").checked, sponsor: $("sponsor").checked,
    parallel: $("parallel").value, autoClip: $("autoClip").checked, rate: $("rate").value, cookies: $("cookies").value, useLogin: $("useLogin").checked,
    cover: (document.querySelector("input[name=cover]:checked") || {}).value || "thumb", coverAt: $("coverAt").value.trim(),
  });
  store.set(PREFS, prefs);
  renderSummary();
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
  applyTheme();
  syncKind();
}
function applyTheme() {
  // Follow the device's light/dark setting until the user picks one.
  const light = prefs.theme ? prefs.theme === "light" : matchMedia("(prefers-color-scheme: light)").matches;
  document.body.classList.toggle("light", light);
  $("themeBtn").querySelector("use").setAttribute("href", light ? "#i-moon" : "#i-sun");
  document.querySelector('meta[name="theme-color"]').content = light ? "#f3f5f0" : "#0b0d11";
  if (android) rpc("theme", { light }).catch(() => {}); // match the Android status/navigation bars
  applyAccent();
}
function syncKind() {
  const kind = kindOf(), audio = isAudio(kind);
  $("videoQ").classList.toggle("off", audio || !!localFile); // a local file keeps its own resolution
  $("audioQ").classList.toggle("off", kind !== "mp3");
  $("coverBox").hidden = !audio;
  $("subsRow").hidden = audio;
  syncCover();
  renderSummary();
}
function syncCover() {
  const c = (document.querySelector("input[name=cover]:checked") || {}).value;
  $("coverFrame").hidden = c !== "frame";
  $("coverCustom").hidden = c !== "custom";
}

/* ---------- Add-ons: summary chips + drawer on small screens ---------- */
function activeExtras() {
  const audio = isAudio(kindOf()), out = [];
  if ($("playlist").checked) out.push(["layers", t("قائمة كاملة")]);
  const from = $("trimFrom").value.trim(), to = $("trimTo").value.trim();
  if (from || to) out.push(["scissors", `\u2066${from || "0:00"}–${to || "…"}\u2069`]); // LTR isolate so times don't flip in Arabic
  if (audio && prefs.cover !== "thumb") out.push(["image", t({ frame: "لقطة من الفيديو", custom: "صورة من جهازي", none: "بدون صورة" }[prefs.cover])]);
  if (!audio && prefs.subs) out.push(["cc", t("ترجمة")]);
  if (prefs.sponsor && !isStore()) out.push(["zap", "SponsorBlock"]);
  if (!prefs.meta) out.push(["tag", t("بلا بيانات")]);
  return out;
}
function renderSummary() {
  const list = activeExtras();
  $("summary").innerHTML = list.map(([i, label]) => `<span class="chip">${icon(i)}<bdi>${esc(label)}</bdi></span>`).join("");
  $("extrasCount").textContent = list.length || "";
}
function setExtras(open) {
  document.body.classList.toggle("extras-open", open);
  $("scrim").hidden = !open;
  $("extrasBtn").setAttribute("aria-expanded", String(open));
  if (open) $("extras").querySelector("input,button")?.focus({ preventScroll: true });
}
$("extrasBtn").addEventListener("click", () => setExtras(true));
$("extrasClose").addEventListener("click", () => setExtras(false));
$("scrim").addEventListener("click", () => setExtras(false));
$("extrasReset").addEventListener("click", () => {
  Object.assign(prefs, EXTRA_DEFAULTS);
  $("playlist").checked = false; $("trimFrom").value = ""; $("trimTo").value = "";
  store.set(PREFS, prefs);
  applyPrefs();
});
["playlist", "trimFrom", "trimTo"].forEach(id => $(id).addEventListener("input", renderSummary));

/* ---------- Tabs ---------- */
function selectTab(which) {
  const q = which === "queue";
  $("tabQueue").setAttribute("aria-selected", String(q));
  $("tabHistory").setAttribute("aria-selected", String(!q));
  $("queue").hidden = !q;
  $("historyPane").hidden = q;
}
$("tabQueue").addEventListener("click", () => selectTab("queue"));
$("tabHistory").addEventListener("click", () => selectTab("history"));

/* ---------- Preview ---------- */
let infoTimer, infoFor = "", lastInfo = null;
function queueInfo() {
  clearTimeout(infoTimer);
  const url = $("url").value.trim();
  $("clearUrl").hidden = !url;
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
  if (!allowedHere(url)) {
    infoFor = url; lastInfo = null;
    const box = $("preview");
    box.hidden = false; box.className = "preview loading";
    box.innerHTML = `<span class="err">${esc(t(STORE_ONLY))}</span>`;
    return;
  }
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
    if (i.playlist) { $("playlist").checked = true; renderSummary(); }
    if (i.height) {
      // Hide resolutions the source doesn't have.
      [...$("quality").options].forEach(o => { o.hidden = o.value !== "best" && +o.value > i.height; });
      if ($("quality").selectedOptions[0]?.hidden) $("quality").value = "best";
    }
  } catch (e) {
    if (url !== infoFor) return;
    lastInfo = null;
    box.className = "preview loading";
    box.innerHTML = `<span class="err">${esc(t(e.message))}</span>`;
  }
}

/* ---------- Queue ---------- */
let pollTimer;
const seen = new Set((() => { try { return JSON.parse(sessionStorage.getItem("nz.seen") || "[]"); } catch { return []; } })());
const emptyState = (ic, title, hint) => `<div class="empty">${icon(ic)}<b>${esc(t(title))}</b>${hint ? `<small>${esc(t(hint))}</small>` : ""}</div>`;
function renderJobs(jobs) {
  const box = $("queue");
  const active = jobs.filter(j => j.state === "queued" || j.state === "working").length;
  $("queueCount").textContent = active || "";
  if (!jobs.length) { box.innerHTML = emptyState("dl", "لا توجد تنزيلات بعد", "الصق رابطًا في الأعلى أو اسحبه إلى النافذة."); return; }
  box.innerHTML = jobs.map(j => {
    const pct = Math.max(0, Math.min(100, j.progress || 0));
    let line;
    if (j.state === "queued") line = `<span>${t("في الانتظار…")}</span>`;
    else if (j.state === "working") line = `<span>${j.stage === "cover" ? t("جارٍ إضافة الغلاف…") : j.stage === "post" ? t("جارٍ التحويل…") : j.stage === "convert" ? t("جارٍ التحويل") + " · " + pct.toFixed(0) + "%" : pct.toFixed(0) + "%"}${j.items > 1 ? ` · ${j.item || 1}/${j.items}` : ""}</span><span dir="ltr">${esc(j.speed || "")} ${j.eta ? "· " + esc(j.eta) : ""}</span>`;
    else if (j.state === "paused") line = `<span>${t("متوقف مؤقتًا")} · ${pct.toFixed(0)}%</span>`;
    else if (j.state === "done") line = `<span>${t("اكتمل")}${j.count > 1 ? ` · ${j.count} ${t("ملف")}` : ""}${j.warning ? ` · ${esc(t(j.warning))}` : ""}</span>` + (isWeb()
      ? `<span class="dl-links">${(j.names || []).map((n, i) => `<a href="/dl/${encodeURIComponent(j.id)}/${i}" download="${esc(n)}" title="${esc(n)}">${j.count > 1 ? i + 1 : t("تنزيل إلى هذا الجهاز")}</a>`).join("")}</span>`
      : `<a href="#" data-open="${esc(j.file || "")}">${t(j.count > 1 ? "فتح المجلد" : "فتح")}</a>`);
    else if (j.state === "cancelled") line = `<span>${t("أُلغي")}</span>`;
    else line = `<span>${esc(t(j.error || "تعذر إكمال العملية"))}</span>`;
    const b = (act, ic, label) => `<button type="button" data-act="${act}" data-id="${esc(j.id)}" title="${esc(t(label))}" aria-label="${esc(t(label))}">${icon(ic)}</button>`;
    const active = j.state === "queued" || j.state === "working";
    const btn = '<span class="job-actions">' + (
      active ? (j.local ? "" : b("pause", "pause", "إيقاف مؤقت")) + b("cancel", "x", "إلغاء")
      : j.state === "paused" ? b("resume", "play", "استئناف") + b("cancel", "x", "إلغاء")
      : j.state === "done" ? b("dismiss", "x", "إخفاء")
      : b("resume", "retry", "إعادة المحاولة") + b("dismiss", "x", "إخفاء")) + "</span>";
    return `<div class="job ${esc(j.state)}"><div class="job-top"><span class="file-icon">${esc(j.kind.toUpperCase())}</span><strong title="${esc(j.title)}">${esc(j.title)}</strong>${btn}</div><div class="bar"><i style="width:${j.state === "done" ? 100 : pct}%"></i></div><div class="job-line">${line}</div></div>`;
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
        try { sessionStorage.setItem("nz.seen", JSON.stringify([...seen])); } catch {}
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
  const done = store.get(DONE_COUNT, 0) + 1;
  store.set(DONE_COUNT, done);
  if (NUDGE_AT.includes(done) && !isSupporter() && canSupport()) $("nudge").hidden = false;
}
function renderHistory() {
  const all = store.get(HISTORY, []);
  $("historySearch").parentElement.hidden = all.length < 6;
  $("clearHistory").hidden = !all.length;
  const q = $("historySearch").value.trim().toLowerCase();
  const rows = (q ? all.filter(x => String(x.name).toLowerCase().includes(q)) : all).slice(0, 100);
  if (q && !rows.length) { $("history").innerHTML = emptyState("search", "لا نتائج"); return; }
  $("history").innerHTML = rows.length ? rows.map(x => `<div class="history-item"><span class="file-icon">${esc((x.kind || "").toUpperCase())}</span><div><strong title="${esc(x.name)}">${esc(x.name)}</strong><small>${new Date(x.at).toLocaleDateString(NzI18n.lang)}${x.count > 1 ? ` · ${x.count} ${t("ملف")}` : ""}</small></div>${x.web ? `<a href="${esc(x.file)}" download aria-label="${esc(t("تنزيل إلى هذا الجهاز"))}">${icon("dl")}</a>` : `<a href="#" data-open="${esc(x.file)}" aria-label="${esc(t("فتح الملف"))}">${icon("ext")}</a>`}</div>`).join("")
    : emptyState("history", "السجل فارغ", "ستظهر ملفاتك المكتملة هنا.");
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
  if (localFile) return convertLocal();
  const urls = extractUrls($("url").value);
  const url = urls[0] || $("url").value.trim();
  if (!looksLikeUrl(url)) { toast("ألصق رابطًا صحيحًا يبدأ بـ https://", true); $("url").focus(); return; }
  if (!urls.concat(url).every(allowedHere)) { toast(STORE_ONLY, true); return; }
  savePrefs();
  if (isAudio(prefs.kind) && prefs.cover === "custom" && !prefs.coverImage) { toast("اختر صورة الغلاف أولًا.", true); setExtras(true); return; }
  $("submit").disabled = true;
  try {
    const body = {
      url, kind: prefs.kind, quality: prefs.quality, abr: prefs.abr,
      playlist: $("playlist").checked, meta: prefs.meta, subs: prefs.subs, sponsor: prefs.sponsor,
      rate: prefs.rate, cookies: status.platform === "windows" ? prefs.cookies : "",
      cover: prefs.cover, coverAt: parseTime(prefs.coverAt), coverImage: prefs.coverImage, useLogin: prefs.useLogin,
      from: parseTime($("trimFrom").value), to: parseTime($("trimTo").value),
      title: lastInfo?.title || url,
    };
    if (urls.length > 1) {
      for (const u of urls) await rpc("download", { ...body, url: u, title: u, playlist: false });
      toast("أُضيفت الروابط إلى قائمة التنزيل ✓");
    } else {
      await rpc("download", body);
      toast("أُضيف إلى قائمة التنزيل ✓");
    }
    selectTab("queue");
    if (innerWidth <= 980) $("tabQueue").scrollIntoView({ behavior: "smooth", block: "start" });
    // One-off add-ons reset after use; lasting preferences (cover, metadata…) stay.
    $("url").value = ""; $("trimFrom").value = ""; $("trimTo").value = ""; $("playlist").checked = false;
    $("preview").hidden = true; $("clearUrl").hidden = true; infoFor = ""; lastInfo = null;
    renderSummary();
    pollJobs();
  } catch (err) {
    toast(err.message, true);
  } finally {
    $("submit").disabled = false;
  }
});

document.addEventListener("click", e => {
  const open = e.target.closest("[data-open]");
  if (open) { e.preventDefault(); rpc("open", { file: open.dataset.open }).catch(err => toast(err.message, true)); return; }
  const act = e.target.closest("[data-act]");
  if (act) rpc(act.dataset.act, { id: act.dataset.id }).then(pollJobs, err => toast(err.message, true));
});

$("url").addEventListener("input", () => { if (localFile && $("url").value.trim()) setLocalFile(null, true); queueInfo(); });
$("url").addEventListener("paste", e => {
  // A single-line input would glue pasted lines together; keep multiple links separated.
  const urls = extractUrls(e.clipboardData && e.clipboardData.getData("text"));
  if (urls.length > 1) { e.preventDefault(); $("url").value = urls.join(" "); }
  setTimeout(queueInfo, 0);
});
// Ctrl+V anywhere (outside a text field) pastes the link.
document.addEventListener("paste", e => {
  if (e.target.closest("input,textarea,select")) return;
  const urls = extractUrls(e.clipboardData && e.clipboardData.getData("text"));
  if (!urls.length) return;
  e.preventDefault();
  $("url").value = urls.join(" ");
  queueInfo();
  $("url").focus();
});

// Browse: the in-app browser shows a "Download with Nazzil" button on the platform's video pages.
function renderSites() {
  const list = isStore() ? NzSites.STORE_SITES : NzSites.SITES;
  $("siteGrid").innerHTML = list.map(x => `<button type="button" class="site" data-site="${x.id}" style="background:${x.color}" title="${esc(x.name)}" aria-label="${esc(x.name)}">${x.icon}</button>`).join("");
}
$("siteGrid").addEventListener("click", e => {
  const b = e.target.closest("[data-site]");
  if (!b) return;
  const site = NzSites.byId(b.dataset.site);
  if (isWeb()) {
    // In a phone browser there's no in-app browser: open the site in a new tab and paste the link back.
    window.open(site.mobileUrl || site.url, "_blank", "noopener");
    toast("افتح الفيديو، انسخ رابطه، ثم ارجع والصقه هنا.");
    return;
  }
  rpc("browse", { site: site.id, name: site.name, url: site.url, mobileUrl: site.mobileUrl || "", match: site.match })
    .catch(err => toast(err.message, true));
});
$("clearUrl").addEventListener("click", () => { $("url").value = ""; queueInfo(); $("url").focus(); });
$("pasteBtn").addEventListener("click", () => pasteFromClipboard(false));
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
  } catch (e) { toast(e.message, true); }
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
    if (!urls.length) { if (!silent) toast("لا يوجد رابط في الحافظة.", true); return; }
    if (joined !== $("url").value.trim()) { $("url").value = joined; queueInfo(); }
  } catch { if (!silent) toast("اسمح بالوصول إلى الحافظة أو الصق الرابط يدويًا.", true); }
}

// Drag a link anywhere onto the window.
let dragDepth = 0;
const isLinkDrag = e => [...(e.dataTransfer?.types || [])].some(x => x === "text/uri-list" || x === "text/plain");
document.addEventListener("dragenter", e => { if (!isLinkDrag(e)) return; e.preventDefault(); dragDepth++; $("dropOverlay").hidden = false; });
document.addEventListener("dragover", e => { if (isLinkDrag(e)) e.preventDefault(); });
document.addEventListener("dragleave", () => { if (--dragDepth <= 0) { dragDepth = 0; $("dropOverlay").hidden = true; } });
document.addEventListener("drop", e => {
  dragDepth = 0; $("dropOverlay").hidden = true;
  const text = e.dataTransfer.getData("text/uri-list") || e.dataTransfer.getData("text");
  const urls = extractUrls(text);
  if (!urls.length) return;
  e.preventDefault();
  $("url").value = urls.join(" ");
  queueInfo();
});
window.addEventListener("focus", () => { if (prefs.autoClip && !$("url").value) pasteFromClipboard(true); });

$("themeBtn").addEventListener("click", () => {
  prefs.theme = document.body.classList.contains("light") ? "dark" : "light";
  store.set(PREFS, prefs);
  applyTheme();
});
matchMedia("(prefers-color-scheme: light)").addEventListener?.("change", () => { if (!prefs.theme) applyTheme(); });
document.addEventListener("keydown", e => {
  if ((e.metaKey || e.ctrlKey) && e.key === "Enter") $("form").requestSubmit();
  if (e.key === "Escape" && document.body.classList.contains("extras-open")) setExtras(false);
});

/* ---------- Settings ---------- */
$("settingsBtn").addEventListener("click", () => $("settings").showModal());
$("pickFolder").addEventListener("click", async () => {
  try { const r = await rpc("pickFolder"); if (r.folder) $("folderPath").textContent = r.folder; } catch (e) { toast(e.message, true); }
});
const openFolder = () => rpc("open", { file: "" }).catch(e => toast(e.message, true));
$("openFolder").addEventListener("click", openFolder);
$("openFolderTop").addEventListener("click", openFolder);
$("updateBtn").addEventListener("click", async () => {
  const b = $("updateBtn");
  b.disabled = true; b.textContent = t("جارٍ التحديث…");
  try { const r = await rpc("update"); $("engineVer").textContent = `yt-dlp ${r.version || ""}`; b.textContent = t("مُحدَّث ✓"); }
  catch (e) { b.textContent = t("فشل"); toast(e.message, true); }
  finally { setTimeout(() => { b.disabled = false; b.textContent = t("تحديث"); }, 2500); }
});

async function loadStatus() {
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      status = await rpc("status");
      const ok = status.yt_dlp && status.ffmpeg;
      $("tools").textContent = ok ? t(platformText()) : `yt-dlp ${status.yt_dlp ? "✓" : "✗"} · FFmpeg ${status.ffmpeg ? "✓" : "✗"}`;
      $("engineVer").textContent = `yt-dlp ${status.version || ""}`;
      $("appVersion").textContent = status.appVersion || "";
      $("folderPath").textContent = status.folder || "—";
      $("pickFolder").hidden = !status.canPickFolder;
      $("cookiesRow").hidden = status.platform !== "windows"; // only the desktop can read browser cookies
      // In a phone browser (LAN mode) hide the controls that act on the computer itself.
      for (const id of ["folderRow", "loginRow", "engineRow", "openFolderTop"]) $(id).hidden = isWeb();
      $("lanRow").hidden = status.platform !== "windows";
      if (isStore()) applyStoreEdition();
      renderSupport(); loadProducts();
      if (status.platform === "windows") refreshLan();
      rpc("settings", { parallel: +prefs.parallel }).catch(() => {});
      checkForUpdate(status.appVersion);
      return;
    } catch { await new Promise(r => setTimeout(r, 700)); }
  }
  $("tools").textContent = t("الخدمة غير متصلة");
}

/* ---------- File from the device (convert, no download) ---------- */
const fmtSize = b => b >= 1e9 ? (b / 1e9).toFixed(1) + " GB" : b >= 1e6 ? Math.round(b / 1e6) + " MB" : Math.max(1, Math.round(b / 1e3)) + " KB";
function setLocalFile(f, keepUrl) {
  localFile = f || null;
  const box = $("preview");
  if (localFile) {
    if (!keepUrl) { $("url").value = ""; $("clearUrl").hidden = true; }
    infoFor = ""; lastInfo = null;
    box.hidden = false; box.className = "preview file";
    box.innerHTML = `<span class="file-badge">${icon("file")}</span><div class="meta"><b>${esc(localFile.name)}</b><small>${esc(t("ملف من جهازك"))}${localFile.size ? " · " + fmtSize(localFile.size) : ""}</small></div><button type="button" class="icon-btn sm unfile" aria-label="${esc(t("إزالة الملف"))}">${icon("x")}</button>`;
    box.querySelector(".unfile").onclick = () => setLocalFile(null);
  } else if (box.classList.contains("file")) { box.hidden = true; box.className = "preview"; }
  syncFileMode();
}
function syncFileMode() {
  const webm = document.querySelector("input[name=kind][value=webm]");
  webm.disabled = !!localFile;
  if (localFile && webm.checked) document.querySelector("input[name=kind][value=mp4]").checked = true;
  syncKind();
  $("submit").querySelector("span").textContent = t(localFile ? "تحويل" : "تنزيل");
}
function pickWebFile() {
  const input = $("mediaFile");
  input.value = "";
  input.onchange = () => { const f = input.files[0]; if (f) setLocalFile({ webFile: f, name: f.name, size: f.size }); };
  input.click();
}
$("fileBtn").addEventListener("click", async () => {
  try {
    if (isWeb()) return pickWebFile();
    const r = await rpc("pickMedia");
    if (r && (r.path || r.id)) setLocalFile(r);
  } catch (e) { toast(e.message, true); }
});
async function convertLocal() {
  savePrefs();
  if (isAudio(prefs.kind) && prefs.cover === "custom" && !prefs.coverImage) { toast("اختر صورة الغلاف أولًا.", true); setExtras(true); return; }
  $("submit").disabled = true;
  try {
    let file = localFile;
    if (file.webFile) {
      // Phone browser (LAN mode): send the file to the computer, which converts it.
      toast("جارٍ رفع الملف…");
      const r = await fetch("/upload-media", { method: "POST", headers: { "x-name": encodeURIComponent(file.name) }, body: file.webFile });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "فشل الطلب");
      file = { path: j.path, name: j.name, size: j.size };
    }
    await rpc("convert", {
      file: file.path || "", fileId: file.id || "", name: file.name, kind: prefs.kind, abr: prefs.abr,
      from: parseTime($("trimFrom").value), to: parseTime($("trimTo").value), meta: prefs.meta,
      cover: prefs.cover, coverAt: parseTime(prefs.coverAt), coverImage: prefs.coverImage,
    });
    toast("أُضيف إلى قائمة التحويل ✓");
    selectTab("queue");
    if (innerWidth <= 980) $("tabQueue").scrollIntoView({ behavior: "smooth", block: "start" });
    $("trimFrom").value = ""; $("trimTo").value = "";
    setLocalFile(null);
    renderSummary();
    pollJobs();
  } catch (err) {
    toast(err.message, true);
  } finally {
    $("submit").disabled = false;
  }
}
// Files shared to the app (Android "Share → Nazzil" with a video/audio file).
window.nazzilSetFile = f => { if (f && (f.id || f.path)) { setLocalFile(f); toast("تم استلام الملف. اختر الصيغة ثم «تحويل»."); } };

// Your own YouTube videos: Google's official export (Takeout), then convert here.
$("takeoutBtn").addEventListener("click", () => $("takeout").showModal());
$("openTakeout").addEventListener("click", () => {
  const url = "https://takeout.google.com/";
  if (android) location.href = url; else window.open(url, "_blank", "noopener");
});

/* ---------- Support: keeps Nazzil free with no ads ---------- */
// Full edition / Windows: GitHub Sponsors. Google Play edition: Play Billing tips (prices come from Play).
const SUPPORT_URL = "https://github.com/sponsors/abdulrahmanahmedelabed-prog";
const ACCENTS = [["lime", "أخضر"], ["sky", "أزرق"], ["violet", "بنفسجي"], ["rose", "وردي"], ["amber", "ذهبي"], ["teal", "فيروزي"]];
const TIERS = { tip_coffee: "قهوة", supporter: "داعم", tip_gold: "داعم ذهبي" };
const NUDGE_AT = [10, 60, 250]; // finished downloads before a gentle "support?" banner (never for supporters)
let products = [];
const isSupporter = () => !!store.get(SUPPORTER, false);
const canSupport = () => !isStore() || products.length > 0; // the Play edition needs its products from Google Play
function applyAccent() {
  const a = isSupporter() ? prefs.accent : "";
  if (a && a !== "lime") document.body.dataset.accent = a; else delete document.body.dataset.accent;
}
function renderSupport() {
  const fan = isSupporter();
  $("supportBox").hidden = !canSupport() && !fan;
  $("supportText").textContent = t(fan ? "شكرًا لدعمك ❤" : "نزّل مجاني بلا إعلانات. دعمك يبقيه كذلك ويفتح ألوان الواجهة.");
  $("supportActions").innerHTML = products.length
    ? products.map(p => `<button type="button" class="btn sm${p.id === "supporter" ? " primary" : ""}" data-buy="${esc(p.id)}">${esc(t(TIERS[p.id] || p.id))} · <bdi>${esc(p.price)}</bdi></button>`).join("")
    : isStore() ? ""
    : `<button type="button" class="btn primary sm" data-sponsor>${icon("heart")}${esc(t("ادعم على GitHub"))}</button>` + (fan ? "" : `<button type="button" class="btn sm" data-honor>${esc(t("دعمتُ نزّل"))}</button>`);
  const current = fan ? prefs.accent || "lime" : "lime";
  $("accents").innerHTML = ACCENTS.map(([id, name]) => {
    const locked = !fan && id !== "lime";
    return `<button type="button" class="swatch" role="radio" data-c="${id}" aria-checked="${current === id}" aria-label="${esc(t(name))}" title="${esc(t(name))}"${locked ? " data-locked" : ""}>${locked ? icon("lock") : ""}</button>`;
  }).join("");
}
function becameSupporter() {
  store.set(SUPPORTER, true);
  $("nudge").hidden = true;
  toast("شكرًا لدعمك ❤");
  renderSupport(); applyAccent();
}
const openExternal = url => { if (android) location.href = url; else window.open(url, "_blank", "noopener"); };
$("supportBox").addEventListener("click", e => {
  const b = e.target.closest("button");
  if (!b) return;
  if (b.dataset.buy) rpc("buy", { id: b.dataset.buy }).catch(err => toast(err.message, true));
  else if ("sponsor" in b.dataset) openExternal(SUPPORT_URL);
  else if ("honor" in b.dataset) becameSupporter();
  else if (b.dataset.c) {
    if ("locked" in b.dataset) return toast("الألوان للداعمين. ادعم نزّل لفتحها.");
    prefs.accent = b.dataset.c; store.set(PREFS, prefs);
    applyAccent(); renderSupport();
  }
});
// Google Play answers a purchase here (ok, or failed=true when it wasn't just cancelled).
window.nazzilPurchase = (ok, failed) => { if (ok) becameSupporter(); else if (failed) toast("تعذر إتمام الشراء.", true); };
function loadProducts() {
  if (!android || !isStore()) return;
  rpc("products").then(r => {
    products = r.products || [];
    if (r.supporter && !isSupporter()) store.set(SUPPORTER, true); // restored from Google Play
    renderSupport(); applyAccent();
  }).catch(() => {});
}
$("nudgeYes").addEventListener("click", () => { $("nudge").hidden = true; $("settings").showModal(); $("supportBox").scrollIntoView({ block: "nearest" }); });
$("nudgeLater").addEventListener("click", () => { $("nudge").hidden = true; });

/* ---------- Store edition (Google Play: "Nazzil Open") ---------- */
const STORE_ONLY = "هذه النسخة تنزّل من المصادر المفتوحة فقط: Internet Archive وWikimedia Commons وPeerTube والبودكاست والروابط المباشرة.";
const isStore = () => !!status.store;
const allowedHere = u => !isStore() || NzYtdlp.storeAllows(u);
function applyStoreEdition() {
  renderSites();
  const brand = $("brandName");
  brand.textContent = t("نزّل مفتوح");
  brand.setAttribute("data-no-i18n", ""); // keep the edition name when the language changes (set again in applyLang)
  // Options that only make sense for platforms this edition doesn't support.
  for (const id of ["sponsorRow", "cookiesRow", "loginRow", "engineRow"]) $(id).hidden = true;
  $("sponsor").checked = false;
  const input = $("url");
  input.dataset.i18nPlaceholder = "الصق رابطًا من مصدر مفتوح أو رابط ملف مباشر…";
  input.placeholder = t(input.dataset.i18nPlaceholder);
  // One-time explanation of what this edition downloads.
  if (!store.get("nazil.storeNotice", false)) {
    $("storeNotice").showModal();
    $("storeNotice").addEventListener("close", () => store.set("nazil.storeNotice", true), { once: true });
  }
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
  } catch (e) { toast(e.message, true); }
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
  if (!current || status.store) return; // store builds are updated by the store
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

// Android back button: close whatever is open first; returns false when there's nothing to close.
window.nazzilBack = () => {
  const dlg = document.querySelector("dialog[open]");
  if (dlg) { dlg.close(); return true; }
  if (document.body.classList.contains("extras-open")) { setExtras(false); return true; }
  return false;
};

// Android (share sheet / in-app browser) hands us a URL.
window.nazzilSetUrl = url => {
  $("url").value = extractUrls(url).join(" ") || url;
  queueInfo();
  if (extractUrls(url).every(allowedHere)) toast("تم استلام الرابط. اختر الصيغة وأضفه للتنزيل."); else toast(STORE_ONLY, true);
};

const platformText = () => status.platform === "android" ? "يعمل محليًا على Android" : status.platform === "web" ? "يعمل عبر كمبيوترك" : "يعمل محليًا على Windows";
function applyLang() {
  NzI18n.translatePage();
  if (!isWeb()) rpc("lang", { lang: NzI18n.lang }).catch(() => {}); // notifications follow the app's language
  $("langCode").textContent = NzI18n.lang.toUpperCase();
  $("langSel").value = NzI18n.lang;
  $("submit").querySelector("span").textContent = t(localFile ? "تحويل" : "تنزيل");
  if (isStore()) $("brandName").textContent = t("نزّل مفتوح");
  if (status.platform && status.yt_dlp && status.ffmpeg) $("tools").textContent = t(platformText());
  renderSummary();
  renderHistory();
  renderSupport();
  pollJobs();
}
// Each language is listed in its own name, so anyone can find theirs.
$("langSel").innerHTML = NzI18n.LANGS.filter(([c]) => NzI18n.has(c)).map(([c, name]) => `<option value="${c}" lang="${c}">${esc(name)}</option>`).join("");
$("langSel").addEventListener("change", e => { NzI18n.set(e.target.value); applyLang(); });

renderSites();
applyPrefs();
applyLang();
loadStatus().then(() => { if (prefs.autoClip) pasteFromClipboard(true); });
