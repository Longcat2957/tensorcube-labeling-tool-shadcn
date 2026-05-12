/**
 * autoUpdater 래퍼.
 *
 * - 패키징된 빌드에서만 동작 (dev 에서는 모든 함수가 no-op).
 * - autoUpdater 의 lifecycle 이벤트를 단일 채널 `app:updateEvent` 로 renderer 에 전달.
 * - 수동 체크 / 설치 / 버전 조회 IPC 핸들러를 제공한다.
 */

import { app, BrowserWindow, ipcMain } from 'electron'
import { is } from '@electron-toolkit/utils'
import pkg from 'electron-updater'

const { autoUpdater } = pkg

export type UpdateEvent =
  | { type: 'checking' }
  | { type: 'available'; version: string }
  | { type: 'not-available'; version: string }
  | { type: 'progress'; percent: number }
  | { type: 'downloaded'; version: string }
  | { type: 'error'; message: string }

const UPDATE_EVENT_CHANNEL = 'app:updateEvent'

let mainWindowRef: BrowserWindow | null = null
let listenersAttached = false
let updateDownloaded = false

function broadcast(event: UpdateEvent): void {
  const win = mainWindowRef
  if (!win || win.isDestroyed()) return
  win.webContents.send(UPDATE_EVENT_CHANNEL, event)
}

function attachListenersOnce(): void {
  if (listenersAttached) return
  listenersAttached = true

  autoUpdater.on('checking-for-update', () => broadcast({ type: 'checking' }))
  autoUpdater.on('update-available', (info) =>
    broadcast({ type: 'available', version: info?.version ?? 'unknown' })
  )
  autoUpdater.on('update-not-available', (info) =>
    broadcast({ type: 'not-available', version: info?.version ?? app.getVersion() })
  )
  autoUpdater.on('download-progress', (p) =>
    broadcast({ type: 'progress', percent: Math.round(p?.percent ?? 0) })
  )
  autoUpdater.on('update-downloaded', (info) => {
    updateDownloaded = true
    broadcast({ type: 'downloaded', version: info?.version ?? 'unknown' })
  })
  autoUpdater.on('error', (err) =>
    broadcast({ type: 'error', message: err?.message ?? String(err) })
  )
}

/**
 * 메인 윈도우 ready 후 호출. 이벤트 listener 부착 + 자동 체크 1회 실행.
 * dev 환경에서는 윈도우 참조만 저장하고 listener/체크는 건너뛴다.
 */
export function initializeAutoUpdater(window: BrowserWindow): void {
  mainWindowRef = window

  if (is.dev) return

  autoUpdater.logger = null
  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true

  attachListenersOnce()

  autoUpdater.checkForUpdates().catch((err) => {
    console.warn('[autoUpdater] initial check failed:', err?.message ?? err)
  })
}

export function registerAutoUpdaterHandlers(): void {
  ipcMain.handle('app:getVersion', () => app.getVersion())
  ipcMain.handle('app:isPackaged', () => app.isPackaged)

  ipcMain.handle('app:checkForUpdates', async () => {
    if (is.dev) {
      return {
        ok: false,
        reason: 'dev'
      }
    }
    try {
      const result = await autoUpdater.checkForUpdates()
      return { ok: true, version: result?.updateInfo?.version ?? null }
    } catch (err) {
      return {
        ok: false,
        reason: 'error',
        message: err instanceof Error ? err.message : String(err)
      }
    }
  })

  ipcMain.handle('app:installUpdate', () => {
    if (!updateDownloaded) {
      return { ok: false, reason: 'not-downloaded' }
    }
    // quitAndInstall(isSilent, isForceRunAfter)
    autoUpdater.quitAndInstall(false, true)
    return { ok: true }
  })
}
