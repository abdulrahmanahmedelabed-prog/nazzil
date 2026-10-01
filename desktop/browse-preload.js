// Runs inside the in-app YouTube window. Shows a floating "download this" button on video/playlist pages
// and hands the URL back to Nazzil's main window.
const { ipcRenderer } = require("electron");

const isVideo = u => /youtube\.com\/(watch|shorts\/|playlist|live\/)|youtu\.be\//.test(u);
const ar = (navigator.language || "").startsWith("ar") || document.documentElement.lang === "ar";
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
    b.addEventListener("click", () => ipcRenderer.send("nazzil:pick", location.href));
    document.documentElement.appendChild(b);
  }
  b.style.display = isVideo(location.href) ? "block" : "none";
}

// YouTube is a single-page app, so watch for URL changes rather than page loads.
window.addEventListener("DOMContentLoaded", () => {
  ensureButton();
  setInterval(ensureButton, 600);
});
