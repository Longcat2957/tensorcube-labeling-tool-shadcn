import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

// Dialog APIs
const dialog = {
  selectFolder: () => ipcRenderer.invoke('dialog:selectFolder'),
  selectWorkspaceFolder: () => ipcRenderer.invoke('dialog:selectWorkspaceFolder'),
  selectFolders: () => ipcRenderer.invoke('dialog:selectFolders'),
  selectExportFolder: () => ipcRenderer.invoke('dialog:selectExportFolder'),
  selectVideoFile: () => ipcRenderer.invoke('dialog:selectVideoFile')
}

// Workspace APIs
const workspace = {
  create: (options: {
    name: string
    sourceFolders: string[]
    savePath: string
    labelingType: 1 | 2 | 3 | 4
    classes: { id: number; name: string }[]
    keypointSchema?: { names: string[]; skeleton?: [number, number][] }
  }) => ipcRenderer.invoke('workspace:create', options),
  open: (workspacePath: string) => ipcRenderer.invoke('workspace:open', workspacePath),
  update: (
    workspacePath: string,
    options: {
      workspace: string
      labelingType: 1 | 2 | 3 | 4
      classes: { id: number; name: string }[]
      keypointSchema?: { names: string[]; skeleton?: [number, number][] }
    }
  ) => ipcRenderer.invoke('workspace:update', workspacePath, options),
  getInfo: (workspacePath: string) => ipcRenderer.invoke('workspace:getInfo', workspacePath),
  getImageList: (workspacePath: string) =>
    ipcRenderer.invoke('workspace:getImageList', workspacePath),
  export: (workspacePath: string, options: Record<string, unknown>) =>
    ipcRenderer.invoke('workspace:export', workspacePath, options),
  exportPreflight: (workspacePath: string, options: Record<string, unknown>) =>
    ipcRenderer.invoke('workspace:exportPreflight', workspacePath, options),
  getRecent: () => ipcRenderer.invoke('workspace:getRecent'),
  removeRecent: (workspacePath: string) =>
    ipcRenderer.invoke('workspace:removeRecent', workspacePath),
  scanClassUsage: (workspacePath: string) =>
    ipcRenderer.invoke('workspace:scanClassUsage', workspacePath),
  reassignClass: (workspacePath: string, fromClassId: number, toClassId: number | null) =>
    ipcRenderer.invoke('workspace:reassignClass', workspacePath, fromClassId, toClassId),
  // 스냅샷
  createSnapshot: (workspacePath: string) =>
    ipcRenderer.invoke('workspace:createSnapshot', workspacePath),
  listSnapshots: (workspacePath: string) =>
    ipcRenderer.invoke('workspace:listSnapshots', workspacePath),
  deleteSnapshot: (workspacePath: string, id: string) =>
    ipcRenderer.invoke('workspace:deleteSnapshot', workspacePath, id),
  restoreSnapshot: (workspacePath: string, id: string) =>
    ipcRenderer.invoke('workspace:restoreSnapshot', workspacePath, id),
  // 무결성 검사
  integrityCheck: (workspacePath: string) =>
    ipcRenderer.invoke('workspace:integrityCheck', workspacePath),
  integrityAutoFix: (workspacePath: string, issues: unknown[]) =>
    ipcRenderer.invoke('workspace:integrityAutoFix', workspacePath, issues),
  // 통계
  computeStats: (workspacePath: string) =>
    ipcRenderer.invoke('workspace:computeStats', workspacePath),
  // 썸네일
  ensureThumbnail: (workspacePath: string, imageId: string) =>
    ipcRenderer.invoke('workspace:ensureThumbnail', workspacePath, imageId),
  // Validation
  runValidation: (workspacePath: string, rules: Record<string, unknown>) =>
    ipcRenderer.invoke('workspace:runValidation', workspacePath, rules)
}

// Label APIs
const label = {
  read: (workspacePath: string, imageId: string) =>
    ipcRenderer.invoke('label:read', workspacePath, imageId),
  save: (
    workspacePath: string,
    imageId: string,
    data: Record<string, unknown>,
    completed: boolean = false
  ) => ipcRenderer.invoke('label:save', workspacePath, imageId, data, completed),
  getImagePath: (workspacePath: string, imageId: string) =>
    ipcRenderer.invoke('label:getImagePath', workspacePath, imageId)
}

// Utility functions
const utils = {
  // workspace:// 프로토콜 URL 생성
  getWorkspaceImageUrl: (absolutePath: string): string => {
    return `workspace://${absolutePath}`
  }
}

// 데이터 준비 유틸 APIs
const utilities = {
  sampleImages: (options: Record<string, unknown>) =>
    ipcRenderer.invoke('utility:sampleImages', options),
  batchResize: (options: Record<string, unknown>) =>
    ipcRenderer.invoke('utility:batchResize', options),
  convertFormat: (options: Record<string, unknown>) =>
    ipcRenderer.invoke('utility:convertFormat', options),
  probeFfmpeg: () => ipcRenderer.invoke('utility:probeFfmpeg'),
  extractVideoFrames: (requestId: string, options: Record<string, unknown>) =>
    ipcRenderer.invoke('utility:extractVideoFrames', requestId, options),
  onVideoProgress: (
    cb: (data: { requestId: string; frame: number; outTimeSec: number }) => void
  ) => {
    const handler = (_e: unknown, data: { requestId: string; frame: number; outTimeSec: number }) =>
      cb(data)
    ipcRenderer.on('utility:videoProgress', handler)
    return () => ipcRenderer.removeListener('utility:videoProgress', handler)
  },
  dedupeImages: (options: Record<string, unknown>) =>
    ipcRenderer.invoke('utility:dedupeImages', options),
  analyzeQuality: (options: Record<string, unknown>) =>
    ipcRenderer.invoke('utility:analyzeQuality', options)
}

// Custom APIs for renderer
const api = {
  dialog,
  workspace,
  label,
  utils,
  utilities
}

// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI
  // @ts-ignore (define in dts)
  window.api = api
}
