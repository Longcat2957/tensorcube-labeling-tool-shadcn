import { ElectronAPI } from '@electron-toolkit/preload'

export interface DialogApi {
  selectFolder: () => Promise<string | null>
  selectWorkspaceFolder: () => Promise<string | null>
  selectFolders: () => Promise<string[]>
  selectExportFolder: () => Promise<string | null>
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
  update: (
    workspacePath: string,
    options: UpdateWorkspaceOptions
  ) => Promise<{ success: boolean; config?: WorkspaceConfig; error?: string }>
  getInfo: (workspacePath: string) => Promise<WorkspaceInfo | null>
  getImageList: (workspacePath: string) => Promise<ImageInfo[]>
  export: (workspacePath: string, options: ExportOptions) => Promise<ExportResult>
  exportPreflight: (
    workspacePath: string,
    options: Pick<ExportOptions, 'includeCompletedOnly' | 'split'> & {
      outOfBounds?: 'clip' | 'skip' | 'none'
    }
  ) => Promise<ExportPreflight>
  getRecent: () => Promise<RecentWorkspace[]>
  removeRecent: (workspacePath: string) => Promise<RecentWorkspace[]>
  scanClassUsage: (workspacePath: string) => Promise<Record<number, number>>
  reassignClass: (
    workspacePath: string,
    fromClassId: number,
    toClassId: number | null
  ) => Promise<{ updatedFiles: number; updatedAnnotations: number; deletedAnnotations: number }>
}

export interface ExportPreflight {
  totalItems: number
  totalAnnotations: number
  outOfBoundsCount: number
  skippedCount: number
  splitCounts: { train: number; val: number; test: number }
  perClassCounts: Record<number, number>
  warnings: string[]
}

export interface RecentWorkspace {
  path: string
  name: string
  lastOpened: number
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

export interface UpdateWorkspaceOptions {
  workspace: string
  labelingType: 1 | 2
  classes: { id: number; name: string }[]
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

export type ExportFormat = 'yolo' | 'coco' | 'yolo-obb' | 'dota'

export interface ExportOptions {
  format: ExportFormat
  outputPath: string
  exportName: string
  includeCompletedOnly: boolean
  resize?: {
    enabled: boolean
    width: number
    height: number
  }
  split: {
    train: number
    val: number
    test: number
  }
}

export interface ExportResult {
  success: boolean
  outputPath?: string
  exportedCount?: number
  skippedCount?: number
  error?: string
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
