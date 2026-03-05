import { ElectronAPI } from '@electron-toolkit/preload'

export interface DialogApi {
  selectFolder: () => Promise<string | null>
  selectWorkspaceFolder: () => Promise<string | null>
  selectFolders: () => Promise<string[]>
}

export interface WorkspaceApi {
  create: (options: {
    name: string
    sourceFolders: string[]
    savePath: string
    labelingType: 1 | 2
    classes: { id: number; name: string }[]
  }) => Promise<{ success: boolean; path?: string; error?: string }>
  open: (
    workspacePath: string
  ) => Promise<{ success: boolean; config?: WorkspaceConfig; error?: string }>
  getInfo: (workspacePath: string) => Promise<WorkspaceInfo | null>
  getImageList: (workspacePath: string) => Promise<ImageInfo[]>
}

export interface LabelApi {
  read: (workspacePath: string, imageId: string) => Promise<LabelData | null>
  save: (
    workspacePath: string,
    imageId: string,
    data: Record<string, unknown>,
    completed?: boolean
  ) => Promise<boolean>
  getImagePath: (workspacePath: string, imageId: string) => Promise<string | null>
}

export interface UtilsApi {
  getWorkspaceImageUrl: (absolutePath: string) => string
}

export interface Api {
  dialog: DialogApi
  workspace: WorkspaceApi
  label: LabelApi
  utils: UtilsApi
}

// Types from main process
export interface WorkspaceConfig {
  workspace: string
  labeling_type: 1 | 2
  names: Record<number, string>
  image_count: number
  created_at: string
  last_modified_at: string
}

export interface WorkspaceInfo {
  name: string
  labelingType: string
  imageCount: number
  lastModified: string
  path: string
}

export interface ImageInfo {
  id: string
  filename: string
  width: number
  height: number
  status: 'none' | 'working' | 'completed'
}

export interface LabelData {
  image_info: {
    filename: string
    width: number
    height: number
  }
  annotations: (BBAnnotation | OBBAnnotation)[]
}

export interface BBAnnotation {
  id: string
  class_id: number
  bbox: [number, number, number, number]
}

export interface OBBAnnotation {
  id: string
  class_id: number
  obb: [number, number, number, number, number]
}

declare global {
  interface Window {
    electron: ElectronAPI
    api: Api
  }
}
