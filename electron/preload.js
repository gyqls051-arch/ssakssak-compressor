const { contextBridge, ipcRenderer, webUtils } = require('electron');

contextBridge.exposeInMainWorld('ssak', {
  pathForFile: (f) => webUtils.getPathForFile(f),
  presets: () => ipcRenderer.invoke('presets'),
  selectFiles: () => ipcRenderer.invoke('select-files'),
  probe: (p) => ipcRenderer.invoke('probe', p),
  transcode: (args) => ipcRenderer.invoke('transcode', args),
  cancel: () => ipcRenderer.invoke('cancel'),
  reveal: (p) => ipcRenderer.invoke('reveal', p),
  openExternal: (url) => ipcRenderer.invoke('open-external', url),
  onProgress: (fn) => {
    const h = (_e, p) => fn(p);
    ipcRenderer.on('progress', h);
    return () => ipcRenderer.removeListener('progress', h);
  },
});
