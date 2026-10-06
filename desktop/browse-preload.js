// Runs inside the in-app browser. Shows a floating "download" button on video/post pages of the chosen
// platform (pattern from web/sites.js, supplied by the main process) and hands the URL back to Nazzil.
const { ipcRenderer } = require("electron");

let re = null;
try { const src = ipcRenderer.sendSync("nazzil:pattern"); if (src) re = new RegExp(src, "i"); } catch {}
const isMedia = u => (re ? re.test(u) : false);
const ar = (navigator.language || "").toLowerCase().startsWith("ar");
const label = ar ? "⬇ تنزيل بـ نزّل" : "⬇ Download with Nazzil";

function ensureButton() {
  let b = document.getElementById("__nazzil_btn");
  if (!b) {
    b = document.createElement("button");
    b.id = "__nazzil_btn";
    b.textContent = label;
    Object.assign(b.style, {
      position: "fixed", zIndex: 2147483647, bottom: "24px", left: "50%", transform: "translateX(-50%)",
      padding: "14px 26px", border: "0", borderRadius: "14px", background: "#c9ff67", color: "#11170d",
      font: "900 16px 'Segoe UI', Tahoma, sans-serif", cursor: "pointer", boxShadow: "0 12px 40px #0008", display: "none",
    });
    b.addEventListener("click", e => { e.stopPropagation(); ipcRenderer.send("nazzil:pick", location.href); });
    (document.body || document.documentElement).appendChild(b);
  }
  b.style.display = isMedia(location.href) ? "block" : "none";
}

// These sites are single-page apps, so watch for URL changes rather than page loads.
window.addEventListener("DOMContentLoaded", () => {
  ensureButton();
  setInterval(ensureButton, 600);
});
