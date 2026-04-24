import { app, shell, BrowserWindow, protocol } from 'electron'
import { join } from 'path'
import { readFile } from 'fs/promises'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import pkg from 'electron-updater'
const { autoUpdater } = pkg
import icon from '../../resources/icon.png?asset'
import { registerDialogHandlers } from './ipc/dialogHandler.js'
import { registerWorkspaceHandlers } from './ipc/workspaceHandler.js'
import { registerLabelHandlers } from './ipc/labelHandler.js'
import { loadWindowState, attachWindowStateTracker } from './services/windowState.js'

async function createWindow(): Promise<void> {
  const state = await loadWindowState()

  const mainWindow = new BrowserWindow({
    width: state.width,
    height: state.height,
    x: state.x,
    y: state.y,
    minWidth: 960,
    minHeight: 640,
    show: false,
    autoHideMenuBar: true,
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  if (state.isMaximized) {
    mainWindow.maximize()
  }

  attachWindowStateTracker(mainWindow)

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // HMR for renderer base on electron-vite cli.
  // Load the remote URL for development or the local html file for production.
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

// Register custom protocol for loading workspace images
function registerWorkspaceProtocol(): void {
  protocol.handle('workspace', async (request) => {
    try {
      // URL format: workspace://path/to/image.jpg
      const filePath = decodeURIComponent(request.url.slice('workspace://'.length))
      const data = await readFile(filePath)
      const ext = filePath.toLowerCase().split('.').pop() || 'jpg'
      const mimeTypes: Record<string, string> = {
        jpg: 'image/jpeg',
        jpeg: 'image/jpeg',
        png: 'image/png',
        gif: 'image/gif',
        webp: 'image/webp',
        bmp: 'image/bmp'
      }
      const mimeType = mimeTypes[ext] || 'image/jpeg'
      return new Response(data, {
        headers: { 'Content-Type': mimeType }
      })
    } catch {
      return new Response('File not found', { status: 404 })
    }
  })
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(() => {
  // Set app user model id for windows
  electronApp.setAppUserModelId('com.electron')

  // Register custom protocol for workspace images
  registerWorkspaceProtocol()

  // Default open or close DevTools by F12 in development
  // and ignore CommandOrControl + R in production.
  // see https://github.com/alex8088/electron-toolkit/tree/master/packages/utils
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // Register IPC handlers
  registerDialogHandlers()
  registerWorkspaceHandlers()
  registerLabelHandlers()

  // Check for updates in packaged builds. Dev/HMR runs skip this.
  if (!is.dev) {
    autoUpdater.logger = null
    autoUpdater.autoDownload = true
    autoUpdater.autoInstallOnAppQuit = true
    autoUpdater.checkForUpdatesAndNotify().catch((err) => {
      console.warn('[autoUpdater] check failed:', err?.message ?? err)
    })
  }

  void createWindow()

  app.on('activate', function () {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) void createWindow()
  })
})

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and require them here.
