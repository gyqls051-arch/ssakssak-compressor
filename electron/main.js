const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
let autoUpdater = null;
try { ({ autoUpdater } = require('electron-updater')); } catch { /* dev env without dep */ }
const path = require('node:path');
const fs = require('node:fs');
const { TranscodeJob, listPresets, detectEncoders } = require('./transcode');
const { runFfprobe } = require('./ffprobe');

function resolveBinary(name) {
  const local = path.join(__dirname, '..', 'resources', 'bin', name);
  if (fs.existsSync(local)) return local;
  const packaged = path.join(process.resourcesPath, 'bin', name);
  if (fs.existsSync(packaged)) return packaged;
  return null;
}

let win = null;
let job = null;
let ffmpegBin = null;
let ffprobeBin = null;
let encoder = null;

function createWindow() {
  win = new BrowserWindow({
    width: 760,
    height: 640,
    minWidth: 640,
    minHeight: 520,
    autoHideMenuBar: true,
    backgroundColor: '#faf7f1',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  win.loadFile(path.join(__dirname, '..', 'index.html'));
}

app.whenReady().then(async () => {
  ffmpegBin = resolveBinary('ffmpeg.exe');
  ffprobeBin = resolveBinary('ffprobe.exe');
  if (ffmpegBin) encoder = await detectEncoders(ffmpegBin);
  createWindow();

  if (app.isPackaged && autoUpdater) {
    autoUpdater.autoDownload = true;
    autoUpdater.on('error', (err) => console.warn('[updater]', err && err.message));
    void autoUpdater.checkForUpdatesAndNotify();
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  job?.cancel();
  if (process.platform !== 'darwin') app.quit();
});

// ---------- IPC ----------

ipcMain.handle('presets', () => ({ presets: listPresets(), encoder: Array.isArray(encoder) ? encoder.join(' → ') : encoder, ready: !!(ffmpegBin && ffprobeBin) }));

ipcMain.handle('select-files', async () => {
  const r = await dialog.showOpenDialog(win, {
    properties: ['openFile', 'multiSelections'],
    filters: [{ name: '동영상', extensions: ['mp4', 'mkv', 'mov', 'avi', 'webm', 'm4v', 'wmv', 'flv', 'ts', 'mts', 'm2ts', 'mpg', 'mpeg'] }],
  });
  return r.canceled ? [] : r.filePaths;
});

ipcMain.handle('probe', async (_e, filePath) => {
  if (!ffprobeBin) throw new Error('ffprobe.exe를 찾을 수 없습니다 (resources/bin)');
  if (typeof filePath !== 'string' || !fs.existsSync(filePath)) throw new Error('파일이 없습니다');
  const info = await runFfprobe(ffprobeBin, filePath);
  return {
    duration: parseFloat(info.format?.duration) || 0,
    bitrate: parseInt(info.format?.bit_rate, 10) || 0,
    size: parseInt(info.format?.size, 10) || 0,
  };
});

ipcMain.handle('transcode', async (e, { input, presetKey, outputDir }) => {
  if (!ffmpegBin) throw new Error('ffmpeg.exe를 찾을 수 없습니다 (resources/bin)');
  if (typeof input !== 'string' || !fs.existsSync(input)) throw new Error('입력 파일이 없습니다');
  if (job) throw new Error('이미 변환이 진행 중입니다');

  const info = await runFfprobe(ffprobeBin, input).catch(() => null);
  const duration = parseFloat(info?.format?.duration) || 0;
  const inputBitrate = parseInt(info?.format?.bit_rate, 10) || 0;

  const preset = listPresets().find((p) => p.key === presetKey);
  if (!preset) throw new Error('알 수 없는 프리셋');

  const dir = (typeof outputDir === 'string' && outputDir) || path.dirname(input);
  const base = path.basename(input).replace(/\.[^.]+$/, '');
  let output = path.join(dir, `${base}_압축${preset.ext}`);
  for (let i = 2; fs.existsSync(output); i++) {
    output = path.join(dir, `${base}_압축_${i}${preset.ext}`);
  }

  job = new TranscodeJob({
    ffmpegBin, input, output, presetKey, duration, inputBitrate, encoders: encoder,
    onProgress: (p) => { if (!e.sender.isDestroyed()) e.sender.send('progress', p); },
  });

  try {
    await job.run();
    const outSize = fs.statSync(output).size;
    return { ok: true, output, outSize };
  } finally {
    job = null;
  }
});

ipcMain.handle('cancel', () => { job?.cancel(); });

ipcMain.handle('reveal', (_e, p) => {
  if (typeof p === 'string' && fs.existsSync(p)) shell.showItemInFolder(p);
});

const ALLOWED_EXTERNAL = new Set(['offcut.dev', 'www.offcut.dev', 'ssakkimchi.com', 'www.ssakkimchi.com']);
ipcMain.handle('open-external', (_e, url) => {
  try {
    const u = new URL(String(url));
    if (u.protocol === 'https:' && ALLOWED_EXTERNAL.has(u.hostname)) shell.openExternal(u.href);
  } catch { /* ignore malformed */ }
});
