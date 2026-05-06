import { ElectronAPI } from '@electron-toolkit/preload'

export interface DialogApi {
  selectFolder: () => Promise<string | null>
  selectWorkspaceFolder: () => Promise<string | null>
  selectFolders: () => Promise<string[]>
  selectExportFolder: () => Promise<string | null>
  selectVideoFile: () => Promise<string | null>
}

export interface WorkspaceApi {
  create: (options: {
    name: string
    sourceFolders: string[]
    savePath: string
    labelingType: 1 | 2 | 3 | 4
    classes: { id: number; name: string }[]
    keypointSchema?: { names: string[]; skeleton?: [number, number][] }
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
      requireAnnotations?: boolean
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
  // 스냅샷
  createSnapshot: (workspacePath: string) => Promise<SnapshotInfo>
  listSnapshots: (workspacePath: string) => Promise<SnapshotInfo[]>
  deleteSnapshot: (workspacePath: string, id: string) => Promise<boolean>
  restoreSnapshot: (workspacePath: string, id: string) => Promise<boolean>
  // 무결성 검사
  integrityCheck: (workspacePath: string) => Promise<IntegrityReport>
  integrityAutoFix: (
    workspacePath: string,
    issues: IntegrityIssue[]
  ) => Promise<IntegrityAutoFixResult>
  // 통계
  computeStats: (workspacePath: string) => Promise<WorkspaceStats>
  // 썸네일
  ensureThumbnail: (
    workspacePath: string,
    imageId: string
  ) => Promise<{ imageId: string; thumbPath: string; cached: boolean }>
  // Validation
  runValidation: (workspacePath: string, rules: ValidationRules) => Promise<ValidationReport>
}

export interface ValidationRules {
  minBoxArea?: number
  minBoxSide?: number
  allowOutOfBounds?: boolean
  duplicateIou?: number
  minBoxesPerClass?: number
}
export type ValidationViolationKind =
  | 'tooSmall'
  | 'tooThin'
  | 'outOfBounds'
  | 'duplicate'
  | 'classUnderMin'
export interface ValidationViolation {
  kind: ValidationViolationKind
  imageId: string
  message: string
  annotationId?: string
  classId?: number
}
export interface ValidationReport {
  rules: ValidationRules
  violations: ValidationViolation[]
  byImage: Record<string, number>
  byKind: Record<ValidationViolationKind, number>
  scanned: { images: number; annotations: number }
}

export interface HistogramBin {
  label: string
  min: number
  max: number | null
  count: number
}

export interface WorkspaceStats {
  totalImages: number
  totalLabelFiles: number
  totalAnnotations: number
  emptyImages: number
  status: { none: number; working: number; completed: number }
  perClassCounts: Record<number, number>
  sizeHistogram: HistogramBin[]
  aspectHistogram: HistogramBin[]
  boxCountById: Record<string, number>
  classesById: Record<string, number[]>
}

export interface SnapshotInfo {
  id: string
  createdAt: number
  fileCount: number
  byteSize: number
}

export type IntegrityIssueKind = 'orphanLabel' | 'missingLabel' | 'badIdPattern' | 'schemaViolation'

export interface IntegrityIssue {
  kind: IntegrityIssueKind
  message: string
  target: string
  autoFixable: boolean
}

export interface IntegrityReport {
  issues: IntegrityIssue[]
  scanned: { images: number; labels: number }
}

export interface IntegrityAutoFixResult {
  fixed: number
  failed: number
  details: { kind: IntegrityIssueKind; target: string; ok: boolean; reason?: string }[]
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

export interface SamplingOptionsRenderer {
  sourceDir: string
  targetDir: string
  count: number
  seed?: number
}
export interface SamplingResult {
  copied: number
  total: number
  files: string[]
}

export type ResizeMode = 'maxSide' | 'fixed' | 'scale'
export type ResizeFit = 'contain' | 'cover' | 'fill' | 'inside' | 'outside'
export interface BatchResizeOptionsRenderer {
  sourceDir: string
  targetDir: string
  mode: ResizeMode
  width?: number
  height?: number
  scale?: number
  fit?: ResizeFit
  quality?: number
}
export interface BatchResult {
  processed: number
  failed: number
  total: number
  errors: { file: string; reason: string }[]
}

export type OutputFormat = 'jpg' | 'png' | 'webp'
export interface ConvertOptionsRenderer {
  sourceDir: string
  targetDir: string
  format: OutputFormat
  quality?: number
  applyExifRotation?: boolean
}

export type ExtractMode = 'fps' | 'every' | 'all'
export type FrameFormat = 'jpg' | 'png'
export interface VideoExtractOptionsRenderer {
  videoPath: string
  targetDir: string
  mode: ExtractMode
  fps?: number
  everyN?: number
  startSec?: number
  endSec?: number
  format?: FrameFormat
  quality?: number
}
export interface VideoExtractResult {
  extracted: number
  targetDir: string
}
export interface FfmpegProbe {
  available: boolean
  path?: string
  version?: string
}
export interface VideoProgress {
  requestId: string
  frame: number
  outTimeSec: number
}

export interface DedupeOptionsRenderer {
  sourceDir: string
  threshold?: number
}
export interface DedupeGroup {
  hash: string
  files: string[]
}
export interface DedupeResultRenderer {
  groups: DedupeGroup[]
  totalFiles: number
  duplicateFiles: number
}

export type QualityFlag = 'blur' | 'tooDark' | 'tooBright' | 'lowContrast' | 'tooSmall'
export interface QualityOptionsRenderer {
  sourceDir: string
  blurThreshold?: number
  brightnessMin?: number
  brightnessMax?: number
  stdevMin?: number
  minSide?: number
}
export interface QualityItemRenderer {
  file: string
  width: number
  height: number
  mean: number
  stdev: number
  laplacianVar: number
  flags: QualityFlag[]
}
export interface QualityResultRenderer {
  items: QualityItemRenderer[]
  flagged: number
  total: number
}

export interface UtilitiesApi {
  sampleImages: (options: SamplingOptionsRenderer) => Promise<SamplingResult>
  batchResize: (options: BatchResizeOptionsRenderer) => Promise<BatchResult>
  convertFormat: (options: ConvertOptionsRenderer) => Promise<BatchResult>
  probeFfmpeg: () => Promise<FfmpegProbe>
  extractVideoFrames: (
    requestId: string,
    options: VideoExtractOptionsRenderer
  ) => Promise<VideoExtractResult>
  onVideoProgress: (cb: (data: VideoProgress) => void) => () => void
  dedupeImages: (options: DedupeOptionsRenderer) => Promise<DedupeResultRenderer>
  analyzeQuality: (options: QualityOptionsRenderer) => Promise<QualityResultRenderer>
}

export interface Api {
  dialog: DialogApi
  workspace: WorkspaceApi
  label: LabelApi
  utils: UtilsApi
  utilities: UtilitiesApi
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
