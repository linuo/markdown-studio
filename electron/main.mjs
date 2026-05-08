import electron from 'electron'
import { existsSync, watch, watchFile, unwatchFile } from 'node:fs'
import { readFile, rename, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const { app, BrowserWindow, Menu, dialog, ipcMain } = electron

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const isDev = !app.isPackaged
const rendererPath = path.join(__dirname, '..', 'dist', 'index.html')

let mainWindow = null
let pendingOpenPath = null
let activeFileWatcher = null
let activeWatchedPath = null
let activeWatchTimer = null
let activeWatchedDir = null
let activeWatchedName = null
let activeWatchedMtimeMs = null
let activePollingListener = null

function getWindow() {
  return BrowserWindow.getAllWindows()[0] ?? null
}

function getFilePathFromArgs(argv = process.argv) {
  return argv.find((arg) => {
    if (!arg) return false
    const lower = arg.toLowerCase()
    if (!(lower.endsWith('.md') || lower.endsWith('.markdown'))) return false
    return existsSync(arg)
  }) ?? null
}

async function readMarkdownFile(filePath) {
  const stats = await readFileStats(filePath)
  const content = await readFile(filePath, 'utf8')
  return {
    path: filePath,
    name: path.basename(filePath),
    content,
    modifiedAt: stats.mtimeMs,
  }
}

async function readFileStats(filePath) {
  return stat(filePath)
}

function normalizeMarkdownFilename(nextName, currentName) {
  const trimmed = nextName.trim()
  if (!trimmed) {
    throw new Error('Filename cannot be empty')
  }

  const currentExt = path.extname(currentName)
  if (!path.extname(trimmed) && currentExt) {
    return `${trimmed}${currentExt}`
  }

  return trimmed
}

function clearActiveWatcher() {
  if (activeWatchTimer) {
    clearTimeout(activeWatchTimer)
    activeWatchTimer = null
  }

  if (activeFileWatcher) {
    activeFileWatcher.close()
    activeFileWatcher = null
  }

  if (activeWatchedPath && activePollingListener) {
    unwatchFile(activeWatchedPath, activePollingListener)
    activePollingListener = null
  }

  activeWatchedPath = null
  activeWatchedDir = null
  activeWatchedName = null
  activeWatchedMtimeMs = null
}

async function emitFileChangeIfNeeded(source = 'unknown') {
  if (!mainWindow || !activeWatchedPath) return

  try {
    const stats = await readFileStats(activeWatchedPath)
    if (activeWatchedMtimeMs === stats.mtimeMs) {
      return
    }

    activeWatchedMtimeMs = stats.mtimeMs
    const payload = await readMarkdownFile(activeWatchedPath)
    mainWindow.webContents.send('file:changed-on-disk', payload)
  } catch (error) {
    if (!existsSync(activeWatchedPath)) {
      activeWatchedMtimeMs = null
    }

    mainWindow.webContents.send('file:watch-error', {
      path: activeWatchedPath,
      message: error instanceof Error ? error.message : String(error),
    })
  }
}

function watchFilePath(filePath) {
  clearActiveWatcher()

  if (!filePath || !existsSync(filePath)) {
    return
  }

  activeWatchedPath = filePath
  activeWatchedDir = path.dirname(filePath)
  activeWatchedName = path.basename(filePath)

  void readFileStats(filePath)
    .then((stats) => {
      activeWatchedMtimeMs = stats.mtimeMs
    })
    .catch(() => {
      activeWatchedMtimeMs = null
    })

  activeFileWatcher = watch(activeWatchedDir, (_eventType, changedName) => {
    if (!activeWatchedPath || !activeWatchedName) return

    if (changedName && changedName !== activeWatchedName) {
      return
    }

    if (activeWatchTimer) {
      clearTimeout(activeWatchTimer)
    }

    activeWatchTimer = setTimeout(() => {
      void emitFileChangeIfNeeded('fs.watch')
    }, 150)
  })

  activePollingListener = (currentStats, previousStats) => {
    if (currentStats.mtimeMs === 0 && previousStats.mtimeMs !== 0) {
      void emitFileChangeIfNeeded('fs.watchFile')
      return
    }

    if (currentStats.mtimeMs !== previousStats.mtimeMs) {
      void emitFileChangeIfNeeded('fs.watchFile')
    }
  }

  watchFile(filePath, { interval: 1000 }, activePollingListener)
}

async function openFileByPath(filePath) {
  pendingOpenPath = filePath

  if (!mainWindow || mainWindow.webContents.isLoading()) {
    return
  }

  try {
    const payload = await readMarkdownFile(filePath)
    watchFilePath(filePath)
    mainWindow.webContents.send('file:open-external', payload)
    pendingOpenPath = null
  } catch (error) {
    dialog.showErrorBox('Open Failed', error instanceof Error ? error.message : String(error))
  }
}

function sendAppCommand(command) {
  const window = getWindow()
  if (!window) return
  window.webContents.send('app:command', command)
}

function createMenu() {
  const template = [
    {
      label: 'File',
      submenu: [
        { label: 'New Markdown', accelerator: 'CmdOrCtrl+T', click: () => sendAppCommand('new-tab') },
        { label: 'Open…', accelerator: 'CmdOrCtrl+O', click: () => sendAppCommand('open') },
        { label: 'Save', accelerator: 'CmdOrCtrl+S', click: () => sendAppCommand('save') },
        { label: 'Save As…', accelerator: 'Shift+CmdOrCtrl+S', click: () => sendAppCommand('save-as') },
        { type: 'separator' },
        { role: process.platform === 'darwin' ? 'close' : 'quit' },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
      ],
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
  ]

  if (process.platform === 'darwin') {
    template.unshift({
      label: app.name,
      submenu: [{ role: 'about' }, { type: 'separator' }, { role: 'services' }, { type: 'separator' }, { role: 'hide' }, { role: 'hideOthers' }, { role: 'unhide' }, { type: 'separator' }, { role: 'quit' }],
    })
  }

  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 980,
    minHeight: 640,
    title: 'MD Studio',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  })

  mainWindow.on('closed', () => {
    clearActiveWatcher()
    mainWindow = null
  })

  await mainWindow.loadFile(rendererPath)

  if (isDev) {
    mainWindow.webContents.openDevTools({ mode: 'detach' })
  }

  if (pendingOpenPath) {
    await openFileByPath(pendingOpenPath)
  }
}

const gotSingleInstanceLock = app.requestSingleInstanceLock()

if (!gotSingleInstanceLock) {
  app.quit()
}

app.on('open-file', (event, filePath) => {
  event.preventDefault()
  void openFileByPath(filePath)
})

app.on('second-instance', (_event, argv) => {
  const window = getWindow()
  if (window) {
    if (window.isMinimized()) window.restore()
    window.focus()
  }

  const filePath = getFilePathFromArgs(argv)
  if (filePath) {
    void openFileByPath(filePath)
  }
})

app.whenReady().then(async () => {
  const launchFilePath = getFilePathFromArgs()
  if (launchFilePath) {
    pendingOpenPath = launchFilePath
  }

  createMenu()
  await createWindow()

  app.on('activate', async () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      await createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

ipcMain.handle('dialog:open-markdown', async () => {
  const window = getWindow()
  if (!window) return null

  const result = await dialog.showOpenDialog(window, {
    properties: ['openFile'],
    filters: [{ name: 'Markdown', extensions: ['md', 'markdown'] }],
  })

  if (result.canceled || result.filePaths.length === 0) {
    return null
  }

  return readMarkdownFile(result.filePaths[0])
})

ipcMain.handle('file:get-pending-open', async () => {
  if (!pendingOpenPath) return null
  const payload = await readMarkdownFile(pendingOpenPath)
  watchFilePath(pendingOpenPath)
  pendingOpenPath = null
  return payload
})

ipcMain.handle('file:save', async (_event, { path: targetPath, content, defaultPath, saveAs = false }) => {
  const window = getWindow()
  if (!window) return null

  let resolvedPath = targetPath

  if (!resolvedPath || saveAs) {
    const result = await dialog.showSaveDialog(window, {
      defaultPath: defaultPath ?? targetPath ?? 'untitled.md',
      filters: [{ name: 'Markdown', extensions: ['md', 'markdown'] }],
    })

    if (result.canceled || !result.filePath) {
      return null
    }

    resolvedPath = result.filePath
  }

  await writeFile(resolvedPath, content, 'utf8')
  const stats = await readFileStats(resolvedPath)
  watchFilePath(resolvedPath)
  activeWatchedMtimeMs = stats.mtimeMs

  return {
    path: resolvedPath,
    name: path.basename(resolvedPath),
    modifiedAt: stats.mtimeMs,
  }
})

ipcMain.handle('file:rename', async (_event, { path: currentPath, nextName }) => {
  const normalizedName = normalizeMarkdownFilename(nextName, path.basename(currentPath))
  const nextPath = path.join(path.dirname(currentPath), normalizedName)

  if (nextPath !== currentPath) {
    await rename(currentPath, nextPath)
  }

  const stats = await readFileStats(nextPath)
  watchFilePath(nextPath)
  activeWatchedMtimeMs = stats.mtimeMs

  return {
    path: nextPath,
    name: path.basename(nextPath),
    modifiedAt: stats.mtimeMs,
  }
})

ipcMain.handle('file:start-watch', async (_event, filePath) => {
  watchFilePath(filePath)
})

ipcMain.handle('file:stop-watch', async () => {
  clearActiveWatcher()
})

ipcMain.handle('window:update-state', (event, { edited, filePath }) => {
  const window = BrowserWindow.fromWebContents(event.sender)
  if (!window) return

  window.setDocumentEdited(Boolean(edited))
  window.setRepresentedFilename(filePath ?? '')
  window.setTitle(`${path.basename(filePath ?? 'untitled.md')}${edited ? ' ●' : ''} - MD Studio`)
})
