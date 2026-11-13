const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('hicallDesktop', {
  isDesktop: true,
  getSources: () => ipcRenderer.invoke('desktop:get-sources'),
  prepareCapture: (sourceId, options) =>
    ipcRenderer.invoke('desktop:prepare-capture', sourceId, options ?? {}),
});
