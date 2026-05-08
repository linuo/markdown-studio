const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('mdStudioDesktop', {
  openFileDialog: () => ipcRenderer.invoke('dialog:open-markdown'),
  getPendingOpenFile: () => ipcRenderer.invoke('file:get-pending-open'),
  saveFile: (payload) => ipcRenderer.invoke('file:save', payload),
  renameFile: (payload) => ipcRenderer.invoke('file:rename', payload),
  startWatchingFile: (filePath) => ipcRenderer.invoke('file:start-watch', filePath),
  stopWatchingFile: () => ipcRenderer.invoke('file:stop-watch'),
  updateWindowState: (payload) => ipcRenderer.invoke('window:update-state', payload),
  onExternalOpenFile: (callback) => {
    const handler = (_event, payload) => callback(payload)
    ipcRenderer.on('file:open-external', handler)
    return () => ipcRenderer.removeListener('file:open-external', handler)
  },
  onExternalFileChange: (callback) => {
    const handler = (_event, payload) => callback(payload)
    ipcRenderer.on('file:changed-on-disk', handler)
    return () => ipcRenderer.removeListener('file:changed-on-disk', handler)
  },
  onWatchError: (callback) => {
    const handler = (_event, payload) => callback(payload)
    ipcRenderer.on('file:watch-error', handler)
    return () => ipcRenderer.removeListener('file:watch-error', handler)
  },
  onAppCommand: (callback) => {
    const handler = (_event, command) => callback(command)
    ipcRenderer.on('app:command', handler)
    return () => ipcRenderer.removeListener('app:command', handler)
  },
})
