// 워크스페이스 메타데이터 (workspace.yaml)
export interface WorkspaceConfig {
  workspace: string
  labeling_type: 1 | 2 // 1: BB, 2: OBB
  names: Record<number, string>
  image_count: number
  created_at: string
  last_modified_at: string
}

// UI에서 사용할 워크스페이스 정보
export interface WorkspaceInfo {
  name: string
  labelingType: string
  imageCount: number
  lastModified: string
  path: string
}

// 워크스페이스 생성 옵션
export interface CreateWorkspaceOptions {
  name: string
  sourceFolders: string[]
  savePath: string
  labelingType: 1 | 2
  classes: { id: number; name: string }[]
}

// 워크스페이스 설정 수정 옵션
export interface UpdateWorkspaceOptions {
  workspace: string
  labelingType: 1 | 2
  classes: { id: number; name: string }[]
}

// 이미지 정보
export interface ImageInfo {
  id: string // 9자리 숫자
  filename: string
  width: number
  height: number
  status: 'none' | 'working' | 'completed'
}

// 라벨 어노테이션 (BB)
export interface BBAnnotation {
  id: string
  class_id: number
  bbox: [number, number, number, number] // [xmin, ymin, xmax, ymax]
}

// 라벨 어노테이션 (OBB)
export interface OBBAnnotation {
  id: string
  class_id: number
  obb: [number, number, number, number, number] // [cx, cy, w, h, angle]
}

// 라벨 데이터 파일 구조
export interface LabelData {
  image_info: {
    filename: string
    width: number
    height: number
  }
  annotations: (BBAnnotation | OBBAnnotation)[]
}

export type ExportFormat = 'yolo' | 'coco' | 'yolo-obb' | 'dota'
export type OutOfBoundsPolicy = 'clip' | 'skip' | 'none'

export interface ExportOptions {
  format: ExportFormat
  outputPath: string
  exportName: string
  includeCompletedOnly: boolean
  outOfBounds?: OutOfBoundsPolicy
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

// Export 사전 집계 (프리플라이트) 결과
export interface ExportPreflight {
  totalItems: number
  totalAnnotations: number
  outOfBoundsCount: number
  skippedCount: number
  splitCounts: { train: number; val: number; test: number }
  perClassCounts: Record<number, number>
  warnings: string[]
}

// IPC 응답 타입
export interface IpcResponse<T = void> {
  success: boolean
  data?: T
  error?: string
}
