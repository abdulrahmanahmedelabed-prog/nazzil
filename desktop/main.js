const { app, BrowserWindow, shell, Menu, dialog, Notification, ipcMain, session } = require("electron");
const fs = require("fs");
const { cookieJar } = require("./web/ytdlp.js");
const path = require("path");
const { startServer } = require("./server");

const binDir = app.isPackaged ? path.join(process.resourcesPath, "bin") : path.join(__dirname, "bin");
let win, browser, stopAll = () => {};

/** In-app browser for a platform; the floating button (browse-preload.js) sends the chosen URL back. */
let browserMatch = "";

/** Writes the in-app browser's sign-ins as cookies.txt so yt-dlp can download content that needs a login. */
async function exportCookies() {
  try {
    const list = await session.fromPartition("persist:browse").cookies.get({});
    const jar = cookieJar(list.map(c => ({ domain: c.domain, hostOnly: c.hostOnly, path: c.path, secure: c.secure,
      httpOnly: c.httpOnly, expires: c.session ? 0 : c.expirationDate, name: c.name, value: c.value })));
    fs.writeFileSync(cookiesFile(), jar, { mode: 0o600 });
  } catch {}
}
const cookiesFile = () => path.join(app.getPath("userData"), "browse-cookies.txt");
function openBrowser(site) {
  if (!site || !/^https:\/\//.test(site.url)) return;
  browserMatch = String(site.match || "");
  if (browser && !browser.isDestroyed()) { browser.loadURL(site.url); browser.setTitle(site.name); browser.focus(); return; }
  browser = new BrowserWindow({
    width: 1100, height: 820, parent: win, title: String(site.name || ""), autoHideMenuBar: true, backgroundColor: "#0f0f0f",
    // One persistent session so sign-ins (YouTube, Facebook, TikTok…) are remembered.
    webPreferences: { preload: path.join(__dirname, "browse-preload.js"), partition: "persist:browse", contextIsolation: true, sandbox: true },
  });
  // Present as plain Chrome: some sites refuse to sign in from a UA that mentions Electron.
  browser.webContents.setUserAgent(browser.webContents.getUserAgent().replace(/\s(Electron|nazzil|Nazzil)\/\S+/g, ""));
  // Popups (share dialogs, login windows) open in the same window; non-https links go to the system browser.
  browser.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https:\/\//.test(url)) browser.loadURL(url); else shell.openExternal(url);
    return { action: "deny" };
  });
  browser.webContents.on("will-navigate", (e, url) => { if (!/^https?:\/\//.test(url)) { e.preventDefault(); shell.openExternal(url); } });
  browser.on("closed", () => { browser = null; exportCookies(); });
  browser.loadURL(site.url);
}

// The preload asks which URLs count as downloadable for the current platform.
ipcMain.on("nazzil:pattern", e => { e.returnValue = browser && e.sender === browser.webContents ? browserMatch : ""; });

ipcMain.on("nazzil:pick", (e, url) => {
  if (!browser || e.sender !== browser.webContents || !/^https:\/\//.test(url)) return;
  exportCookies();
  win.webContents.executeJavaScript(`window.nazzilSetUrl && window.nazzilSetUrl(${JSON.stringify(String(url))})`);
  browser.close();
  win.show(); win.focus();
});

if (!app.requestSingleInstanceLock()) app.quit();

app.whenReady().then(async () => {
  Menu.setApplicationMenu(null);
  await exportCookies();
  const started = await startServer({
    cookiesFile: cookiesFile(),
    appVersion: app.getVersion(),
    browse: site => openBrowser(site),
    pickImage: async () => {
      const r = await dialog.showOpenDialog(win, { properties: ["openFile"], filters: [{ name: "Images", extensions: ["jpg", "jpeg", "png", "webp", "bmp", "gif"] }] });
      return r.canceled ? null : r.filePaths[0];
    },
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
