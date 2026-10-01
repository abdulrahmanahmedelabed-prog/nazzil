const { app, BrowserWindow, shell, Menu, dialog, Notification } = require("electron");
const path = require("path");
const { startServer } = require("./server");

const binDir = app.isPackaged ? path.join(process.resourcesPath, "bin") : path.join(__dirname, "bin");
let win, stopAll = () => {};

if (!app.requestSingleInstanceLock()) app.quit();

app.whenReady().then(async () => {
  Menu.setApplicationMenu(null);
  const started = await startServer({
    appVersion: app.getVersion(),
    notify: (title, kind) => {
      if (!Notification.isSupported() || (win && win.isFocused())) return;
      const ar = app.getLocale().startsWith("ar");
      const head = kind === "done" ? (ar ? "اكتمل التنزيل" : "Download complete") : (ar ? "فشل التنزيل" : "Download failed");
      const n = new Notification({ title: head, body: title, silent: kind !== "done" });
      n.on("click", () => { if (win) { win.show(); win.focus(); } });
      n.show();
    },
    webDir: path.join(__dirname, "web"),
    binDir,
    dataDir: app.getPath("userData"),
    defaultOut: path.join(app.getPath("downloads"), "Nazzil"),
    openPath: p => shell.openPath(p),
    pickFolder: async current => {
      const r = await dialog.showOpenDialog(win, { defaultPath: current, properties: ["openDirectory", "createDirectory"] });
      return r.canceled ? null : r.filePaths[0];
    },
  });
  const port = started.port;
  stopAll = started.stopAll;
  win = new BrowserWindow({
    width: 1180, height: 860, minWidth: 380, minHeight: 600,
    backgroundColor: "#0b0d11", title: "نزّل", autoHideMenuBar: true,
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  // Allow the page to read the clipboard for auto-paste.
  win.webContents.session.setPermissionRequestHandler((_wc, perm, cb) => cb(perm === "clipboard-read" || perm === "clipboard-sanitized-write"));
  win.webContents.session.setPermissionCheckHandler((_wc, perm) => perm === "clipboard-read" || perm === "clipboard-sanitized-write");
  win.webContents.setWindowOpenHandler(({ url }) => { if (/^https:\/\//.test(url)) shell.openExternal(url); return { action: "deny" }; });
  win.webContents.on("will-navigate", (e, url) => { if (!url.startsWith(`http://127.0.0.1:${port}/`)) e.preventDefault(); });
  win.loadURL(`http://127.0.0.1:${port}/`);
});

app.on("second-instance", () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });
app.on("before-quit", () => stopAll());
app.on("window-all-closed", () => app.quit());
