import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

// Dialog APIs
const dialog = {
  selectFolder: () => ipcRenderer.invoke('dialog:selectFolder'),
  selectWorkspaceFolder: () => ipcRenderer.invoke('dialog:selectWorkspaceFolder'),
  selectFolders: () => ipcRenderer.invoke('dialog:selectFolders'),
  selectExportFolder: () => ipcRenderer.invoke('dialog:selectExportFolder')
}

// Workspace APIs
const workspace = {
  create: (options: {
    name: string
    sourceFolders: string[]
    savePath: string
    labelingType: 1 | 2
    classes: { id: number; name: string }[]
  }) => ipcRenderer.invoke('workspace:create', options),
  open: (workspacePath: string) => ipcRenderer.invoke('workspace:open', workspacePath),
  update: (
    workspacePath: string,
    options: {
      workspace: string
      labelingType: 1 | 2
      classes: { id: number; name: string }[]
    }
  ) => ipcRenderer.invoke('workspace:update', workspacePath, options),
  getInfo: (workspacePath: string) => ipcRenderer.invoke('workspace:getInfo', workspacePath),
  getImageList: (workspacePath: string) => ipcRenderer.invoke('workspace:getImageList', workspacePath),
  export: (workspacePath: string, options: Record<string, unknown>) =>
    ipcRenderer.invoke('workspace:export', workspacePath, options)
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

// Custom APIs for renderer
const api = {
  dialog,
  workspace,
  label,
  utils
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
