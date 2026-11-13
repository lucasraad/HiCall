const { app, BrowserWindow, desktopCapturer, ipcMain, session, shell } = require('electron');
const path = require('path');

const PRODUCTION_URL = 'https://hicall.syntrosis.com';
const LOCAL_URL = 'http://localhost:4200';

// HW accel ligado → NVENC/MediaFoundation no getDisplayMedia nativo (jogos).
// Não religar disableHardwareAcceleration: OpenH264 em 1080p movimento caía a ~22.
// webrtc-max-cpu 100: o default 85% corta FPS de screen share sob carga.
app.commandLine.appendSwitch('disable-features', 'WebRtcHideLocalIpsWithMdns');
app.commandLine.appendSwitch('allow-loopback-in-peer-connection');
app.commandLine.appendSwitch('disable-renderer-backgrounding');
app.commandLine.appendSwitch('disable-background-timer-throttling');
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');
app.commandLine.appendSwitch('webrtc-max-cpu-consumption-percentage', '100');
app.commandLine.appendSwitch('enable-gpu-rasterization');

/** Fonte escolhida no picker Angular; vale até o próximo prepare-capture. */
let pendingCaptureSourceId = null;
/** Se true, o picker pediu som do computador. */
let pendingIncludeSystemAudio = true;

function appUrl() {
  if (process.env.HICALL_URL) {
    return process.env.HICALL_URL;
  }
  if (process.argv.includes('--local')) {
    return LOCAL_URL;
  }
  return PRODUCTION_URL;
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#18181b',
    autoHideMenuBar: true,
    title: 'HiCall',
    icon: path.join(__dirname, 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      backgroundThrottling: false,
    },
  });

  win.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: 'deny' };
  });

  const url = appUrl();
  win.webContents.on('render-process-gone', (_event, details) => {
    console.error('[hicall] renderer gone', details.reason, details.exitCode);
  });
  if (process.env.HICALL_E2E === '1') {
    console.log('[e2e] load', url);
    win.webContents.on('did-start-navigation', (_e, nav) => console.log('[e2e] start', nav));
    win.webContents.on('did-finish-load', () => console.log('[e2e] loaded', win.webContents.getURL()));
    win.webContents.on('did-fail-load', (_e, code, desc, failedUrl) => console.log('[e2e] fail', code, desc, failedUrl));
  }
  void win.loadURL(url);
}

async function findSourceById(sourceId) {
  const sources = await desktopCapturer.getSources({
    types: ['screen', 'window'],
    thumbnailSize: { width: 1, height: 1 },
  });
  return sources.find((source) => source.id === sourceId) ?? null;
}

function registerDesktopCapture() {
  ipcMain.handle('desktop:get-sources', async () => {
    const sources = await desktopCapturer.getSources({
      types: ['screen', 'window'],
      thumbnailSize: { width: 320, height: 180 },
      fetchWindowIcons: false,
    });

    return sources
      .filter((source) => source.name && source.name !== 'HiCall')
      .map((source) => ({
        id: source.id,
        name: source.name,
        type: source.id.startsWith('screen:') ? 'screen' : 'window',
        thumbnail: source.thumbnail.toDataURL(),
      }));
  });

  ipcMain.handle('desktop:prepare-capture', (_event, sourceId, options = {}) => {
    pendingCaptureSourceId = typeof sourceId === 'string' ? sourceId : null;
    pendingIncludeSystemAudio = options?.includeSystemAudio !== false;
    return { ok: true };
  });

  session.defaultSession.setDisplayMediaRequestHandler(async (request, callback) => {
    const sourceId = pendingCaptureSourceId;
    const includeAudio = pendingIncludeSystemAudio;
    const source = sourceId ? await findSourceById(sourceId) : null;
    if (!source) {
      callback({});
      return;
    }

    // NÃO usar loopbackWithMute: o Chromium chama
    // IAudioEndpointVolume::SetMute(true) e silencia o Windows inteiro.
    // audio: 'loopback' só se o picker pediu som E o getDisplayMedia pediu áudio.
    // restrictOwnAudio no renderer (Electron 43.4+, Windows 11) exclui a
    // janela do HiCall; não é exclusão do processo inteiro.
    // Electron 44.x crasha o renderer neste Windows (0x80000003); o app
    // fica em 43.4.0 de propósito.
    const audioRequested = request?.audioRequested === true;
    if (includeAudio && audioRequested) {
      callback({ video: source, audio: 'loopback' });
    } else {
      callback({ video: source });
    }
  });

  session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => {
    if (permission === 'media' || permission === 'display-capture' || permission === 'fullscreen') {
      callback(true);
      return;
    }
    callback(false);
  });
}

function startE2eBridge() {
  if (process.env.HICALL_E2E !== '1') {
    return;
  }
  const http = require('http');
  const port = Number(process.env.HICALL_E2E_PORT || 9340);
  console.log(`[e2e] bridge 127.0.0.1:${port}`);
  http.createServer((req, res) => {
    const win = BrowserWindow.getAllWindows()[0];
    const json = (status, payload) => {
      res.writeHead(status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(payload));
    };
    if (!win) {
      json(503, { ok: false, error: 'no-window' });
      return;
    }
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
    });
    req.on('end', () => {
      const payload = body ? JSON.parse(body) : {};
      if (req.method === 'GET' && req.url === '/info') {
        json(200, {
          ok: true,
          result: {
            url: win.webContents.getURL(),
            title: win.getTitle(),
            loading: win.webContents.isLoading(),
          },
        });
        return;
      }
      if (req.method === 'POST' && req.url === '/eval') {
        win.webContents.executeJavaScript(payload.expression, true)
          .then((result) => json(200, { ok: true, result }))
          .catch((err) => json(500, { ok: false, error: String(err) }));
        return;
      }
      if (req.method === 'POST' && req.url === '/goto') {
        void win.loadURL(payload.url);
        json(200, { ok: true });
        return;
      }
      if (req.method === 'POST' && req.url === '/click') {
        const x = Number(payload.x) || 0;
        const y = Number(payload.y) || 0;
        const clickCount = Number(payload.clickCount) || 1;
        win.webContents.sendInputEvent({ type: 'mouseMove', x, y });
        win.webContents.sendInputEvent({ type: 'mouseDown', x, y, button: 'left', clickCount });
        win.webContents.sendInputEvent({ type: 'mouseUp', x, y, button: 'left', clickCount });
        json(200, { ok: true });
        return;
      }
      if (req.method === 'POST' && req.url === '/type') {
        for (const ch of String(payload.text || '')) {
          win.webContents.sendInputEvent({ type: 'char', keyCode: ch });
        }
        json(200, { ok: true });
        return;
      }
      json(404, { ok: false });
    });
  }).listen(port, '127.0.0.1');
}

app.whenReady().then(() => {
  registerDesktopCapture();
  createWindow();
  startE2eBridge();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
