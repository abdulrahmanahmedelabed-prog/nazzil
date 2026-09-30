const { app, BrowserWindow, shell, Menu, dialog, clipboard } = require("electron");
const path = require("path");
const { startServer } = require("./server");

const binDir = app.isPackaged ? path.join(process.resourcesPath, "bin") : path.join(__dirname, "bin");
let win;

if (!app.requestSingleInstanceLock()) app.quit();

app.whenReady().then(async () => {
  Menu.setApplicationMenu(null);
  const port = await startServer({
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
app.on("window-all-closed", () => app.quit());
