// 워크스페이스 메타데이터 (workspace.yaml)
// labeling_type:
//   1: BB (axis-aligned bounding box)
//   2: OBB (oriented bounding box)
//   3: Polygon (segmentation)
//   4: Keypoint (COCO Pose 호환)
export type LabelingType = 1 | 2 | 3 | 4

export interface WorkspaceConfig {
  workspace: string
  labeling_type: LabelingType
  names: Record<number, string>
  image_count: number
  created_at: string
  last_modified_at: string
  /** Keypoint 워크스페이스(=4)일 때 정의되는 keypoint schema. */
  keypoint_schema?: KeypointSchema
}

/**
 * Keypoint 정의 — class별이 아닌 워크스페이스 단위 schema (COCO Pose 일반 사용 패턴).
 * 더 복잡한 클래스별 schema가 필요하면 후속에 확장.
 */
export interface KeypointSchema {
  /** keypoint 이름 순서 — index가 KeypointAnnotation.keypoints의 인덱스가 된다. */
  names: string[]
  /** skeleton edges (1-indexed pair of names index). */
  skeleton?: [number, number][]
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
  labelingType: LabelingType
  classes: { id: number; name: string }[]
  keypointSchema?: KeypointSchema
}

// 워크스페이스 설정 수정 옵션
export interface UpdateWorkspaceOptions {
  workspace: string
  labelingType: LabelingType
  classes: { id: number; name: string }[]
  keypointSchema?: KeypointSchema
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

// 라벨 어노테이션 (Polygon)
// points: [[x0,y0], [x1,y1], ...] — 절대 픽셀 좌표, 시계/반시계 무관, 마지막→첫번째 자동 연결.
export interface PolygonAnnotation {
  id: string
  class_id: number
  polygon: [number, number][]
}

// 라벨 어노테이션 (Keypoint)
// COCO Pose 호환: visibility 플래그 (0=라벨 없음, 1=라벨됨/가려짐, 2=라벨됨/보임)
// keypoints는 KeypointSchema.names와 같은 길이; 값이 없는 keypoint도 v=0 항목으로 채운다.
// bbox는 옵션 — keypoint 그룹의 둘러싸는 BB.
export interface KeypointAnnotation {
  id: string
  class_id: number
  keypoints: { x: number; y: number; v: 0 | 1 | 2 }[]
  bbox?: [number, number, number, number]
}

// 라벨 데이터 파일 구조
//
// 스키마 버전:
// - v1 (암묵적): { image_info, annotations } — 0.1.0 RC 까지의 형식
// - v2: { version: 2, image_info, annotations, tags? } — Phase 13a 도입
//
// 디스크에서 읽을 때 v1은 자동으로 v2로 마이그레이션된다 (label.read 핸들러).
// 저장은 항상 v2로 한다.
export const LABEL_SCHEMA_VERSION = 2 as const

export interface LabelData {
  /** 스키마 버전. 누락(v1) 또는 2(v2). */
  version?: typeof LABEL_SCHEMA_VERSION
  image_info: {
    filename: string
    width: number
    height: number
  }
  annotations: (BBAnnotation | OBBAnnotation | PolygonAnnotation | KeypointAnnotation)[]
  /** 이미지 단위 다중 태그 (A-3). 누락 시 [] */
  tags?: string[]
}

/** 모든 어노테이션 종류 통합 타입. */
export type AnyAnnotation = BBAnnotation | OBBAnnotation | PolygonAnnotation | KeypointAnnotation

export type ExportFormat =
  | 'yolo'
  | 'coco'
  | 'yolo-obb'
  | 'dota'
  | 'yolo-seg'
  | 'coco-seg'
  | 'coco-keypoints'
export type OutOfBoundsPolicy = 'clip' | 'skip' | 'none'

export interface ExportOptions {
  format: ExportFormat
  outputPath: string
  exportName: string
  includeCompletedOnly: boolean
  /** true 이면 어노테이션이 1개 이상 있는 이미지만 내보낸다. 검수 완료 여부와 독립적으로 동작. */
  requireAnnotations?: boolean
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

// 스냅샷 / 백업
export interface SnapshotInfo {
  id: string // YYYYMMDD-HHMMSS
  createdAt: number
  fileCount: number
  byteSize: number
}

// 무결성 검사
export type IntegrityIssueKind = 'orphanLabel' | 'missingLabel' | 'badIdPattern' | 'schemaViolation'

export interface IntegrityIssue {
  kind: IntegrityIssueKind
  message: string
  target: string
  autoFixable: boolean
}

export interface IntegrityReport {
  issues: IntegrityIssue[]
  scanned: {
    images: number
    labels: number
  }
}

export interface IntegrityAutoFixResult {
  fixed: number
  failed: number
  details: { kind: IntegrityIssueKind; target: string; ok: boolean; reason?: string }[]
}

// Validation
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

// 워크스페이스 통계
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
