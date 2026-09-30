"use strict";
const $ = id => document.getElementById(id);
const HISTORY = "nazil.history.v1";
let timer;

// Platform adapter: Android exposes a JS bridge, Windows (Electron) serves a local HTTP API.
const bridge = window.NazzilAndroid;
const api = bridge ? {
  status: async () => JSON.parse(bridge.status()),
  download: async body => {
    const r = JSON.parse(bridge.download(JSON.stringify(body)));
    if (r.error) throw new Error(r.error);
    return r;
  },
  job: async id => JSON.parse(bridge.job(id)),
  fileLink: file => `href="#" data-open="${escapeHtml(file)}"`,
} : {
  status: async () => (await fetch("/api/status")).json(),
  download: async body => {
    const r = await fetch("/api/download", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const j = await r.json();
    if (!r.ok) throw new Error(j.error || "فشل الطلب");
    return j;
  },
  job: async id => (await fetch(`/api/jobs/${id}`)).json(),
  fileLink: file => `href="/files/${encodeURIComponent(file)}" data-open="${escapeHtml(file)}"`,
};

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[c]));
}
function show(html, error = false) {
  const el = $("message");
  el.hidden = false;
  el.className = "message" + (error ? " error" : "");
  el.innerHTML = html;
}
function history() {
  try { return JSON.parse(localStorage.getItem(HISTORY) || "[]"); } catch { return []; }
}
function saveHistory(item) {
  const rows = [item, ...history().filter(x => x.file !== item.file)].slice(0, 8);
  try { localStorage.setItem(HISTORY, JSON.stringify(rows)); } catch {}
  renderHistory();
}
function renderHistory() {
  const box = $("history"), rows = history();
  if (!rows.length) {
    box.innerHTML = '<div class="history-empty">لا توجد تنزيلات بعد<br><small>ستظهر ملفاتك هنا</small></div>';
    return;
  }
  box.innerHTML = rows.map(x => `<div class="history-item"><span class="file-icon">${escapeHtml(x.kind.toUpperCase())}</span><div><strong title="${escapeHtml(x.name)}">${escapeHtml(x.name)}</strong><small>${new Date(x.at).toLocaleDateString("ar")}</small></div><a ${api.fileLink(x.file)} aria-label="فتح الملف">↓</a></div>`).join("");
}

// Clicking a file link opens it with the system (both platforms handle data-open).
document.addEventListener("click", e => {
  const a = e.target.closest("a[data-open]");
  if (!a) return;
  e.preventDefault();
  const file = a.dataset.open;
  if (bridge) bridge.open(file);
  else fetch(`/api/open/${encodeURIComponent(file)}`, { method: "POST" });
});

async function status() {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const s = await api.status();
      $("tools").textContent = `yt-dlp ${s.yt_dlp ? "✓" : "✗"}  ·  FFmpeg ${s.ffmpeg ? "✓" : "✗"}`;
      return;
    } catch { await new Promise(r => setTimeout(r, 700)); }
  }
  $("tools").textContent = "الخدمة غير متصلة";
}

async function poll(id, kind) {
  clearTimeout(timer);
  try {
    const j = await api.job(id);
    if (j.state === "working") {
      show(`جارٍ التنزيل والتحويل… ${j.progress ? Math.round(j.progress) + "%" : ""}`);
      timer = setTimeout(() => poll(id, kind), 1000);
    } else if (j.state === "done") {
      show(`اكتمل الملف وحُفظ في مجلد التنزيلات — <a ${api.fileLink(j.file)}>فتح الملف</a>`);
      saveHistory({ file: j.file, name: j.name, kind, at: Date.now() });
      $("submit").disabled = false;
    } else {
      show(escapeHtml(j.error || "تعذر إكمال العملية"), true);
      $("submit").disabled = false;
    }
  } catch {
    $("submit").disabled = false;
    show("انقطع الاتصال بالخدمة. أعد تشغيل التطبيق ثم حاول مرة أخرى.", true);
  }
}

$("form").addEventListener("submit", async e => {
  e.preventDefault();
  $("submit").disabled = true;
  const kind = new FormData(e.target).get("kind");
  show("جارٍ بدء العملية…");
  try {
    const j = await api.download({ url: $("url").value, kind, rightsConfirmed: $("rights").checked });
    poll(j.jobId, kind);
  } catch (err) {
    show(escapeHtml(err instanceof TypeError ? "الخدمة غير متصلة. أعد تشغيل التطبيق." : err.message), true);
    $("submit").disabled = false;
  }
});

$("clearUrl").addEventListener("click", () => { $("url").value = ""; $("url").focus(); });
$("clearHistory").addEventListener("click", () => { try { localStorage.removeItem(HISTORY); } catch {} renderHistory(); });

const drop = $("dropzone");
["dragenter", "dragover"].forEach(n => drop.addEventListener(n, e => { e.preventDefault(); drop.classList.add("drag"); }));
["dragleave", "drop"].forEach(n => drop.addEventListener(n, e => { e.preventDefault(); drop.classList.remove("drag"); }));
drop.addEventListener("drop", e => {
  const text = e.dataTransfer.getData("text");
  if (text) { $("url").value = text; show("تم وضع الرابط. اختر الصيغة وابدأ التنزيل."); }
});
// On mobile there's no drag & drop: tapping the zone pastes from the clipboard.
drop.addEventListener("click", async () => {
  try {
    const text = await navigator.clipboard.readText();
    if (text) { $("url").value = text.trim(); show("تم لصق الرابط من الحافظة."); }
  } catch {}
});

$("themeBtn").addEventListener("click", () => {
  document.body.classList.toggle("light");
  try { localStorage.setItem("nazil.theme", document.body.classList.contains("light") ? "light" : "dark"); } catch {}
});
try { if (localStorage.getItem("nazil.theme") === "light") document.body.classList.add("light"); } catch {}

document.addEventListener("keydown", e => { if ((e.metaKey || e.ctrlKey) && e.key === "Enter") $("form").requestSubmit(); });

// Android can hand us a shared URL (Share → نزّل).
window.nazzilSetUrl = url => { $("url").value = url; show("تم استلام الرابط. اختر الصيغة وابدأ التنزيل."); };

status();
renderHistory();
