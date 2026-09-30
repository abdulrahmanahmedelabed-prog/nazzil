const { app, BrowserWindow, shell, Menu } = require("electron");
const path = require("path");
const { startServer } = require("./server");

const binDir = app.isPackaged ? path.join(process.resourcesPath, "bin") : path.join(__dirname, "bin");
const webDir = path.join(__dirname, "web");

if (!app.requestSingleInstanceLock()) app.quit();

app.whenReady().then(async () => {
  Menu.setApplicationMenu(null);
  const outDir = path.join(app.getPath("downloads"), "Nazzil");
  const port = await startServer({ webDir, binDir, outDir, openPath: p => shell.openPath(p) });
  const win = new BrowserWindow({
    width: 1180, height: 820, minWidth: 380, minHeight: 600,
    backgroundColor: "#15161a", title: "نزّل", autoHideMenuBar: true,
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  win.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: "deny" }; });
  win.loadURL(`http://127.0.0.1:${port}/`);
});

app.on("second-instance", () => { const w = BrowserWindow.getAllWindows()[0]; if (w) { if (w.isMinimized()) w.restore(); w.focus(); } });
app.on("window-all-closed", () => app.quit());
