const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('mpasatDesktop', {
  runtime: 'desktop',
  software: {
    check: () => ipcRenderer.invoke('software:check'),
    status: () => ipcRenderer.invoke('software:status'),
    apply: () => ipcRenderer.invoke('software:apply'),
    probe: () => ipcRenderer.invoke('software:probe'),
    ackApplied: () => ipcRenderer.invoke('software:ackApplied'),
  },
});
