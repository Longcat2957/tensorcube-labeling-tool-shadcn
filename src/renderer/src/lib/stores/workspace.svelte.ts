import type {
  WorkspaceConfig,
  WorkspaceInfo,
  UpdateWorkspaceOptions,
  ImageInfo,
  LabelData,
  BBAnnotation,
  OBBAnnotation,
  ExportOptions,
  ExportResult
} from '../../../../shared/types'

// Re-export BBAnnotation for use in other components
export type { BBAnnotation, OBBAnnotation } from '../../../../shared/types'

// 워크스페이스 상태
let workspacePath = $state<string | null>(null)
let workspaceConfig = $state<WorkspaceConfig | null>(null)
let workspaceInfo = $state<WorkspaceInfo | null>(null)
let imageList = $state<ImageInfo[]>([])
let currentImageIndex = $state<number>(-1)
let currentLabelData = $state<LabelData | null>(null)
let selectedClassId = $state<number>(0)
let autosaveTimer = $state<ReturnType<typeof setTimeout> | null>(null)
let autosaveVersion = $state(0)

// 히스토리 상태 (이미지별로 분리된 past/future 스택)
// 이미지 간 왕복 후에도 이전 상태를 복구할 수 있도록 per-image로 관리한다.
interface ImageHistory {
  past: (LabelData | null)[]
  future: (LabelData | null)[]
}
let historyByImage = $state<Record<string, ImageHistory>>({})
const HISTORY_LIMIT = 50

// 캔버스 상태
let zoomLevel = $state<number>(1.0)
let viewportX = $state<number>(0)
let viewportY = $state<number>(0)
let canvasWidth = $state<number>(0)
let canvasHeight = $state<number>(0)
let imageWidth = $state<number>(0)
let imageHeight = $state<number>(0)

// 선택된 라벨 ID (primary)
let selectedLabelId = $state<string | null>(null)
// 다중 선택 라벨 ID 목록 (primary는 이 배열의 마지막)
let selectedLabelIds = $state<string[]>([])

// 라벨 가시성 상태 (개별)
let labelVisibility = $state<Record<string, boolean>>({})

// 전역 라벨 숨김 (H 단축키)
let labelsHidden = $state<boolean>(false)

// 라벨 불투명도 (0~1) — 플로팅 바 Slider에서 조절
let labelOpacity = $state<number>(1)

// 저장 상태 (Footer 인디케이터)
export type SaveStatus = 'idle' | 'dirty' | 'saving' | 'saved' | 'error'
let saveStatus = $state<SaveStatus>('idle')
let lastSavedAt = $state<number | null>(null)

// 외부(Minimap 등)에서 요청한 팬 이동. 증가 시 CanvasArea가 이미지 위치를 갱신한다.
let panRequestTick = $state<number>(0)
let panRequestImageX = $state<number>(0)
let panRequestImageY = $state<number>(0)

// 내부 클립보드 (Copy/Paste). id 없이 shape·class·좌표만 저장한다.
type ClipboardEntry =
  | { kind: 'bb'; class_id: number; bbox: [number, number, number, number] }
  | { kind: 'obb'; class_id: number; obb: [number, number, number, number, number] }
let clipboard = $state<ClipboardEntry[]>([])

// 파생 상태
const isWorkspaceOpen = $derived(workspacePath !== null && workspaceConfig !== null)
const currentImage = $derived(currentImageIndex >= 0 ? imageList[currentImageIndex] : null)
const currentHistory = $derived.by(() => {
  const id = currentImageIndex >= 0 ? imageList[currentImageIndex]?.id : null
  if (!id) return null
  return historyByImage[id] ?? null
})
const canUndo = $derived((currentHistory?.past.length ?? 0) > 0)
const canRedo = $derived((currentHistory?.future.length ?? 0) > 0)
const labelingType = $derived(workspaceConfig?.labeling_type ?? 1)
const isBBMode = $derived((workspaceConfig?.labeling_type ?? 1) === 1)
const isOBBMode = $derived((workspaceConfig?.labeling_type ?? 1) === 2)

// 클래스 리스트 (UI용으로 변환)
const classList = $derived(() => {
  if (!workspaceConfig?.names) return []
  return Object.entries(workspaceConfig.names).map(([id, name]) => ({
    id: parseInt(id),
    name,
    color: getClassColor(parseInt(id))
  }))
})

// 현재 이미지의 라벨 리스트
const currentLabels = $derived(() => {
  if (!currentLabelData?.annotations) return []
  return currentLabelData.annotations.map((ann, index) => ({
    id: ann.id || `label-${index}`,
    classId: ann.class_id,
    className: workspaceConfig?.names?.[ann.class_id] ?? `Class ${ann.class_id}`,
    color: getClassColor(ann.class_id),
    visible: labelVisibility[ann.id] ?? true
  }))
})

// 클래스별 색상 반환
function getClassColor(classId: number): string {
  const colors = [
    '#3b82f6',
    '#ef4444',
    '#22c55e',
    '#f59e0b',
    '#8b5cf6',
    '#ec4899',
    '#06b6d4',
    '#84cc16',
    '#f97316',
    '#6366f1'
  ]
  return colors[classId % colors.length]
}

function cloneLabelData(data: LabelData | null): LabelData | null {
  if (!data) return null
  // $state.snapshot으로 reactive proxy를 벗긴 뒤 structuredClone으로 깊은 복사
  return structuredClone($state.snapshot(data)) as LabelData
}

function clearAllHistory(): void {
  historyByImage = {}
}

function applyLabelSnapshot(snapshot: LabelData | null): void {
  currentLabelData = cloneLabelData(snapshot)

  const existingIds = new Set(currentLabelData?.annotations?.map((a) => a.id) ?? [])
  selectedLabelIds = selectedLabelIds.filter((id) => existingIds.has(id))
  if (selectedLabelId && !existingIds.has(selectedLabelId)) {
    selectedLabelId = selectedLabelIds[selectedLabelIds.length - 1] ?? null
  }
}

function pushHistorySnapshot(): void {
  const id = currentImage?.id
  if (!id) return
  const entry = historyByImage[id] ?? { past: [], future: [] }
  const nextPast = [...entry.past, cloneLabelData(currentLabelData)].slice(-HISTORY_LIMIT)
  historyByImage = { ...historyByImage, [id]: { past: nextPast, future: [] } }
}

function clearAutosaveTimer(): void {
  if (autosaveTimer) {
    clearTimeout(autosaveTimer)
    autosaveTimer = null
  }
}

function scheduleAutosave(): void {
  if (!currentLabelData || !workspacePath || !currentImage) return

  clearAutosaveTimer()
  saveStatus = 'dirty'
  const scheduledVersion = autosaveVersion + 1
  autosaveVersion = scheduledVersion

  autosaveTimer = setTimeout(() => {
    autosaveTimer = null

    if (scheduledVersion !== autosaveVersion || !currentLabelData) {
      return
    }

    void saveLabel(currentLabelData, false)
  }, 500)
}

// 워크스페이스 열기
async function openWorkspace(path: string): Promise<boolean> {
  const result = await window.api.workspace.open(path)

  if (result.success && result.config) {
    workspacePath = path
    workspaceConfig = result.config

    const info = await window.api.workspace.getInfo(path)
    workspaceInfo = info

    const images = await window.api.workspace.getImageList(path)
    imageList = images

    if (images.length > 0) {
      currentImageIndex = 0
      await loadCurrentImageLabel()
    }

    return true
  }

  return false
}

// 워크스페이스 닫기
function closeWorkspace(): void {
  clearAutosaveTimer()
  workspacePath = null
  workspaceConfig = null
  workspaceInfo = null
  imageList = []
  currentImageIndex = -1
  currentLabelData = null
  clearAllHistory()
}

// 현재 이미지 라벨 로드
// per-image 히스토리는 유지하므로 재방문 시 undo 스택이 그대로 남아있다.
async function loadCurrentImageLabel(): Promise<void> {
  if (!workspacePath || !currentImage) return

  clearAutosaveTimer()
  saveStatus = 'idle'
  lastSavedAt = null

  const data = await window.api.label.read(workspacePath, currentImage.id)
  currentLabelData = data
  selectedLabelId = null
  selectedLabelIds = []
  labelVisibility = {}
}

// 이미지 이동
async function goToImage(index: number): Promise<void> {
  if (index >= 0 && index < imageList.length) {
    // 이미지 전환 전 현재 라벨 저장
    if (currentLabelData && workspacePath && currentImage) {
      clearAutosaveTimer()
      await saveLabel(currentLabelData, false)
    }
    currentImageIndex = index
    await loadCurrentImageLabel()
  }
}

async function nextImage(): Promise<void> {
  if (currentImageIndex < imageList.length - 1) {
    await goToImage(currentImageIndex + 1)
  }
}

async function prevImage(): Promise<void> {
  if (currentImageIndex > 0) {
    await goToImage(currentImageIndex - 1)
  }
}

// 라벨 저장
async function saveLabel(data: LabelData, completed: boolean = false): Promise<boolean> {
  if (!workspacePath || !currentImage) return false

  saveStatus = 'saving'

  // $state 프록시를 벗긴 snapshot을 IPC로 전송 (Electron structured clone 대응)
  const plainData = $state.snapshot(data)
  const success = await window.api.label.save(workspacePath, currentImage.id, plainData, completed)

  if (success) {
    currentLabelData = data
    lastSavedAt = Date.now()
    saveStatus = 'saved'

    // 이미지 상태 업데이트
    imageList = imageList.map((img, idx) => {
      if (idx === currentImageIndex) {
        return { ...img, status: completed ? 'completed' : 'working' }
      }
      return img
    })
  } else {
    saveStatus = 'error'
  }

  return success
}

// 워크스페이스 상태 업데이트
function updateWorkspaceConfig(config: WorkspaceConfig): void {
  workspaceConfig = config
}

async function updateWorkspaceConfigFile(options: UpdateWorkspaceOptions): Promise<boolean> {
  if (!workspacePath) return false

  const previousClassIds = workspaceConfig
    ? Object.keys(workspaceConfig.names)
        .map((id) => parseInt(id))
        .sort((a, b) => a - b)
    : []

  const result = await window.api.workspace.update(workspacePath, options)

  if (!result.success || !result.config) {
    return false
  }

  workspaceConfig = result.config

  const info = await window.api.workspace.getInfo(workspacePath)
  workspaceInfo = info

  const validClassIds = Object.keys(result.config.names)
    .map((id) => parseInt(id))
    .sort((a, b) => a - b)

  if (!validClassIds.includes(selectedClassId)) {
    selectedClassId = validClassIds[0] ?? 0
  } else if (validClassIds.length > previousClassIds.length) {
    const newlyAddedClassId = validClassIds.find((id) => !previousClassIds.includes(id))
    if (newlyAddedClassId !== undefined) {
      selectedClassId = newlyAddedClassId
    }
  }

  if (currentLabelData && currentLabelData.annotations.length > 0) {
    const selectedLabelExists = currentLabelData.annotations.some(
      (ann) => ann.id === selectedLabelId
    )
    if (!selectedLabelExists) {
      selectedLabelId = null
    }
  }

  return true
}

async function exportDataset(options: ExportOptions): Promise<ExportResult> {
  if (!workspacePath) {
    return {
      success: false,
      error: '열려 있는 워크스페이스가 없습니다.'
    }
  }

  return await window.api.workspace.export(workspacePath, options)
}

// Context key
export const WORKSPACE_MANAGER_KEY = Symbol('workspaceManager')

// 선택된 클래스 ID 설정
function setSelectedClassId(id: number): void {
  selectedClassId = id
}

// 캔버스 상태 관리
function setZoomLevel(level: number): void {
  zoomLevel = Math.max(0.1, Math.min(5, level))
}

function setViewport(x: number, y: number): void {
  viewportX = x
  viewportY = y
}

function setCanvasSize(width: number, height: number): void {
  canvasWidth = width
  canvasHeight = height
}

function setImageSize(width: number, height: number): void {
  imageWidth = width
  imageHeight = height
}

function resetCanvasState(): void {
  zoomLevel = 1.0
  viewportX = 0
  viewportY = 0
}

// 라벨 관리 메서드
function setSelectedLabelId(id: string | null): void {
  selectedLabelId = id
  selectedLabelIds = id ? [id] : []
}

/** Shift-click 다중 선택: 세트에 없으면 추가, 있으면 제거 */
function toggleLabelSelection(id: string): void {
  if (selectedLabelIds.includes(id)) {
    selectedLabelIds = selectedLabelIds.filter((x) => x !== id)
    selectedLabelId = selectedLabelIds[selectedLabelIds.length - 1] ?? null
  } else {
    selectedLabelIds = [...selectedLabelIds, id]
    selectedLabelId = id
  }
}

function clearSelection(): void {
  selectedLabelId = null
  selectedLabelIds = []
}

function toggleLabelVisibility(labelId: string): void {
  labelVisibility[labelId] = !(labelVisibility[labelId] ?? true)
}

function isLabelVisible(labelId: string): boolean {
  return labelVisibility[labelId] ?? true
}

function toggleLabelsHidden(): void {
  labelsHidden = !labelsHidden
}

function setLabelOpacity(value: number): void {
  labelOpacity = Math.max(0, Math.min(1, value))
}

/**
 * 외부(Minimap 드래그)에서 특정 이미지 좌표가 캔버스 중앙에 오도록 팬 이동 요청.
 * CanvasArea가 $effect로 tick 증가를 감지해 실제 fabric 이미지 위치를 갱신한다.
 */
function requestPanToImagePoint(imageX: number, imageY: number): void {
  panRequestImageX = imageX
  panRequestImageY = imageY
  panRequestTick += 1
}

// ============================================
// Copy / Paste
// ============================================

function annotationToClipboardEntry(ann: BBAnnotation | OBBAnnotation): ClipboardEntry {
  if ('bbox' in ann) {
    return {
      kind: 'bb',
      class_id: ann.class_id,
      bbox: [...ann.bbox] as [number, number, number, number]
    }
  }
  return {
    kind: 'obb',
    class_id: ann.class_id,
    obb: [...ann.obb] as [number, number, number, number, number]
  }
}

/**
 * 현재 선택된 라벨(들)을 내부 클립보드에 복사.
 * 다중 선택이 도입되면 selectedLabelIds 기준으로 확장한다.
 */
function copySelectedLabels(): number {
  if (!currentLabelData?.annotations) return 0
  const ids =
    selectedLabelIds.length > 0 ? selectedLabelIds : selectedLabelId ? [selectedLabelId] : []
  if (ids.length === 0) return 0

  const entries: ClipboardEntry[] = []
  for (const id of ids) {
    const ann = currentLabelData.annotations.find((a) => a.id === id)
    if (ann) entries.push(annotationToClipboardEntry(ann))
  }
  clipboard = entries
  return entries.length
}

/**
 * 클립보드 엔트리를 현재 이미지의 어노테이션으로 붙여넣기 (새 UUID 부여).
 * 현재 라벨링 모드와 다른 shape은 스킵한다.
 */
function pasteClipboard(): number {
  if (clipboard.length === 0 || !currentImage) return 0

  const bbMode = isBBMode
  const newAnnotations: (BBAnnotation | OBBAnnotation)[] = []
  for (const entry of clipboard) {
    if (bbMode && entry.kind === 'bb') {
      newAnnotations.push({
        id: crypto.randomUUID(),
        class_id: entry.class_id,
        bbox: [...entry.bbox] as [number, number, number, number]
      })
    } else if (!bbMode && entry.kind === 'obb') {
      newAnnotations.push({
        id: crypto.randomUUID(),
        class_id: entry.class_id,
        obb: [...entry.obb] as [number, number, number, number, number]
      })
    }
  }
  if (newAnnotations.length === 0) return 0

  pushHistorySnapshot()
  const base: LabelData = currentLabelData ?? {
    image_info: {
      filename: currentImage.filename,
      width: imageWidth,
      height: imageHeight
    },
    annotations: []
  }
  currentLabelData = {
    ...base,
    annotations: [...base.annotations, ...newAnnotations]
  }
  selectedLabelIds = newAnnotations.map((a) => a.id)
  selectedLabelId = newAnnotations[newAnnotations.length - 1]?.id ?? null
  scheduleAutosave()
  return newAnnotations.length
}

// Ctrl+S: 디바운스 autosave 대기 없이 즉시 현재 상태를 디스크에 flush
async function flushSave(): Promise<boolean> {
  if (!currentLabelData || !workspacePath || !currentImage) return false
  clearAutosaveTimer()
  return await saveLabel(currentLabelData, false)
}

function addBBAnnotation(annotation: BBAnnotation): void {
  pushHistorySnapshot()

  if (!currentLabelData) {
    // 라벨 데이터가 없으면 새로 생성
    currentLabelData = {
      image_info: {
        filename: currentImage?.filename || '',
        width: imageWidth,
        height: imageHeight
      },
      annotations: [annotation]
    }
  } else {
    currentLabelData = {
      ...currentLabelData,
      annotations: [...currentLabelData.annotations, annotation]
    }
  }

  scheduleAutosave()
}

function addOBBAnnotation(annotation: OBBAnnotation): void {
  pushHistorySnapshot()

  if (!currentLabelData) {
    currentLabelData = {
      image_info: {
        filename: currentImage?.filename || '',
        width: imageWidth,
        height: imageHeight
      },
      annotations: [annotation]
    }
  } else {
    currentLabelData = {
      ...currentLabelData,
      annotations: [...currentLabelData.annotations, annotation]
    }
  }

  scheduleAutosave()
}

function deleteLabel(labelId: string): void {
  if (!currentLabelData) return
  if (!currentLabelData.annotations.some((ann) => ann.id === labelId)) return

  pushHistorySnapshot()

  currentLabelData = {
    ...currentLabelData,
    annotations: currentLabelData.annotations.filter((ann) => ann.id !== labelId)
  }

  if (selectedLabelId === labelId) {
    selectedLabelId = null
  }
  if (selectedLabelIds.includes(labelId)) {
    selectedLabelIds = selectedLabelIds.filter((x) => x !== labelId)
  }

  scheduleAutosave()
}

/** 현재 선택된 라벨(들) 일괄 삭제 */
function deleteSelectedLabels(): number {
  if (!currentLabelData) return 0
  const targets =
    selectedLabelIds.length > 0
      ? new Set(selectedLabelIds)
      : selectedLabelId
        ? new Set([selectedLabelId])
        : new Set<string>()
  if (targets.size === 0) return 0
  const existing = currentLabelData.annotations.filter((a) => targets.has(a.id))
  if (existing.length === 0) return 0

  pushHistorySnapshot()
  currentLabelData = {
    ...currentLabelData,
    annotations: currentLabelData.annotations.filter((a) => !targets.has(a.id))
  }
  clearSelection()
  scheduleAutosave()
  return existing.length
}

function getBBAnnotationById(labelId: string): BBAnnotation | undefined {
  if (!currentLabelData) return undefined
  return currentLabelData.annotations.find((ann) => ann.id === labelId) as BBAnnotation | undefined
}

function getOBBAnnotationById(labelId: string): OBBAnnotation | undefined {
  if (!currentLabelData) return undefined
  return currentLabelData.annotations.find((ann) => ann.id === labelId) as OBBAnnotation | undefined
}

function updateBBAnnotation(labelId: string, bbox: [number, number, number, number]): void {
  if (!currentLabelData) return
  const ann = currentLabelData.annotations.find((a) => a.id === labelId) as BBAnnotation | undefined
  if (!ann) return

  const hasChanged = ann.bbox.some((value, index) => value !== bbox[index])
  if (!hasChanged) return

  pushHistorySnapshot()

  currentLabelData = {
    ...currentLabelData,
    annotations: currentLabelData.annotations.map((annotation) => {
      if (annotation.id !== labelId || !('bbox' in annotation)) {
        return annotation
      }

      return {
        ...annotation,
        bbox
      }
    })
  }

  scheduleAutosave()
}

function updateOBBAnnotation(labelId: string, obb: [number, number, number, number, number]): void {
  if (!currentLabelData) return
  const ann = currentLabelData.annotations.find((a) => a.id === labelId) as
    | OBBAnnotation
    | undefined
  if (!ann) return

  const hasChanged = ann.obb.some((value, index) => value !== obb[index])
  if (!hasChanged) return

  pushHistorySnapshot()

  currentLabelData = {
    ...currentLabelData,
    annotations: currentLabelData.annotations.map((annotation) => {
      if (annotation.id !== labelId || !('obb' in annotation)) {
        return annotation
      }

      return {
        ...annotation,
        obb
      }
    })
  }

  scheduleAutosave()
}

function undo(): void {
  const id = currentImage?.id
  if (!id) return
  const entry = historyByImage[id]
  if (!entry || entry.past.length === 0) return

  const previous = entry.past[entry.past.length - 1]
  const nextPast = entry.past.slice(0, -1)
  const nextFuture = [cloneLabelData(currentLabelData), ...entry.future]
  historyByImage = { ...historyByImage, [id]: { past: nextPast, future: nextFuture } }
  applyLabelSnapshot(previous)
  scheduleAutosave()
}

function redo(): void {
  const id = currentImage?.id
  if (!id) return
  const entry = historyByImage[id]
  if (!entry || entry.future.length === 0) return

  const next = entry.future[0]
  const nextFuture = entry.future.slice(1)
  const nextPast = [...entry.past, cloneLabelData(currentLabelData)].slice(-HISTORY_LIMIT)
  historyByImage = { ...historyByImage, [id]: { past: nextPast, future: nextFuture } }
  applyLabelSnapshot(next)
  scheduleAutosave()
}

// Store export
export function createWorkspaceManager() {
  return {
    // 상태
    get workspacePath() {
      return workspacePath
    },
    get workspaceConfig() {
      return workspaceConfig
    },
    get workspaceInfo() {
      return workspaceInfo
    },
    get imageList() {
      return imageList
    },
    get currentImageIndex() {
      return currentImageIndex
    },
    get currentLabelData() {
      return currentLabelData
    },
    get isWorkspaceOpen() {
      return isWorkspaceOpen
    },
    get currentImage() {
      return currentImage
    },
    get classList() {
      return classList()
    },
    get currentLabels() {
      return currentLabels()
    },
    get selectedClassId() {
      return selectedClassId
    },
    get selectedLabelId() {
      return selectedLabelId
    },
    get selectedLabelIds() {
      return selectedLabelIds
    },
    get clipboardSize() {
      return clipboard.length
    },
    get canUndo() {
      return canUndo
    },
    get canRedo() {
      return canRedo
    },
    get labelingType() {
      return labelingType
    },
    get isBBMode() {
      return isBBMode
    },
    get isOBBMode() {
      return isOBBMode
    },

    // 캔버스 상태
    get zoomLevel() {
      return zoomLevel
    },
    get viewportX() {
      return viewportX
    },
    get viewportY() {
      return viewportY
    },
    get canvasWidth() {
      return canvasWidth
    },
    get canvasHeight() {
      return canvasHeight
    },
    get imageWidth() {
      return imageWidth
    },
    get imageHeight() {
      return imageHeight
    },
    get labelsHidden() {
      return labelsHidden
    },
    get labelOpacity() {
      return labelOpacity
    },
    get saveStatus() {
      return saveStatus
    },
    get lastSavedAt() {
      return lastSavedAt
    },
    get panRequestTick() {
      return panRequestTick
    },
    get panRequestImageX() {
      return panRequestImageX
    },
    get panRequestImageY() {
      return panRequestImageY
    },

    // 메서드
    openWorkspace,
    closeWorkspace,
    goToImage,
    nextImage,
    prevImage,
    saveLabel,
    updateWorkspaceConfig,
    updateWorkspaceConfigFile,
    exportDataset,
    loadCurrentImageLabel,
    setSelectedClassId,

    // 라벨 관리 메서드
    setSelectedLabelId,
    toggleLabelSelection,
    clearSelection,
    deleteSelectedLabels,
    toggleLabelVisibility,
    isLabelVisible,
    toggleLabelsHidden,
    setLabelOpacity,
    requestPanToImagePoint,
    flushSave,
    copySelectedLabels,
    pasteClipboard,
    addBBAnnotation,
    addOBBAnnotation,
    updateBBAnnotation,
    updateOBBAnnotation,
    deleteLabel,
    getBBAnnotationById,
    getOBBAnnotationById,
    undo,
    redo,

    // 캔버스 메서드
    setZoomLevel,
    setViewport,
    setCanvasSize,
    setImageSize,
    resetCanvasState
  }
}

export type WorkspaceManager = ReturnType<typeof createWorkspaceManager>
