import type {
  WorkspaceConfig,
  WorkspaceInfo,
  UpdateWorkspaceOptions,
  ImageInfo,
  LabelData,
  BBAnnotation,
  OBBAnnotation,
  PolygonAnnotation,
  ExportOptions,
  ExportResult
} from '../../../../shared/types'

// Re-export BBAnnotation for use in other components
export type { BBAnnotation, OBBAnnotation, PolygonAnnotation } from '../../../../shared/types'

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

/**
 * 이미지 간 이동 중인지 플래그. 재진입 호출(rapid D press 등)을 차단해
 * goToImage가 중첩되며 currentImage / currentLabelData / saveLabel이
 * 서로 다른 이미지에 대해 돌아가는 race를 방지한다.
 * reactive일 필요 없음(렌더링 의존성 없음) — module-local mutable.
 */
let isNavigating = false

/**
 * 저장 동시성 락 — 모든 saveLabel 호출은 이전 save 완료 후 순차 실행된다.
 * main process의 saveLabelData 가 unlink → write 순서로 atomic이 아니므로,
 * 두 호출이 동시에 같은 imageId의 파일을 조작하면 데이터가 소실되거나
 * `_W` / `_C` 가 동시에 남는 inconsistent 상태가 발생할 수 있다.
 * Promise chain으로 직렬화해 IPC 단위에서 한 번에 하나의 save만 실행시킨다.
 */
let savePromise: Promise<unknown> = Promise.resolve()

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

// 워크스페이스 통계 (요청 시 IPC로 로드)
import type { WorkspaceStats } from '../../../../shared/types'
let workspaceStats = $state<WorkspaceStats | null>(null)
let statsLoading = $state(false)

// 이미지 리스트 필터 상태
export type StatusFilter = 'none' | 'working' | 'completed'
export interface ImageFilter {
  /** 비어있으면 모든 상태 허용 */
  statuses: StatusFilter[]
  /** 특정 클래스 포함 이미지만 (null이면 비활성) */
  classId: number | null
  /** 박스 0개만 (true) / 1개 이상만 (false) / 모두 (null) */
  boxesEmpty: boolean | null
}
let imageFilter = $state<ImageFilter>({ statuses: [], classId: null, boxesEmpty: null })

// 그리드(썸네일) 뷰 토글
let gridViewActive = $state<boolean>(false)

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
const isPolygonMode = $derived((workspaceConfig?.labeling_type ?? 1) === 3)
const isKeypointMode = $derived((workspaceConfig?.labeling_type ?? 1) === 4)

// 필터 적용된 이미지 리스트
const filteredImageList = $derived.by(() => {
  const f = imageFilter
  const stats = workspaceStats
  const noStatusFilter = f.statuses.length === 0
  const noClassFilter = f.classId === null
  const noBoxFilter = f.boxesEmpty === null
  if (noStatusFilter && noClassFilter && noBoxFilter) return imageList

  return imageList.filter((img) => {
    if (!noStatusFilter && !f.statuses.includes(img.status as StatusFilter)) return false
    if (!noBoxFilter && stats) {
      const cnt = stats.boxCountById[img.id] ?? 0
      if (f.boxesEmpty === true && cnt > 0) return false
      if (f.boxesEmpty === false && cnt === 0) return false
    }
    if (!noClassFilter && stats) {
      const classes = stats.classesById[img.id] ?? []
      if (!classes.includes(f.classId!)) return false
    }
    return true
  })
})

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
  // 이미지 전환 중에는 autosave 스케줄 자체를 막아 stale 데이터가
  // 새 이미지의 라벨 파일에 쓰이는 race를 방지한다.
  if (isNavigating) return

  clearAutosaveTimer()
  saveStatus = 'dirty'
  const scheduledVersion = autosaveVersion + 1
  autosaveVersion = scheduledVersion
  // 스케줄 시점의 이미지 id를 캡처. fire 시점에 currentImage가 바뀌어 있으면 drop.
  const scheduledImageId = currentImage.id

  autosaveTimer = setTimeout(() => {
    autosaveTimer = null

    if (scheduledVersion !== autosaveVersion || !currentLabelData) return
    // 이미지가 이미 바뀌었으면 이전 이미지의 데이터를 새 이미지 파일에 쓰지 않도록 drop.
    if (!currentImage || currentImage.id !== scheduledImageId) return
    if (isNavigating) return

    void saveLabel(currentLabelData, currentImage.status === 'completed')
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
  isNavigating = false
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
//
// 동시성 안전장치:
// - isNavigating 플래그로 재진입 차단. rapid D / 마우스 클릭 다발에도 1회만 처리.
// - pre-save는 saveStatus가 'dirty'일 때만 수행 — 이미 저장된 이미지를 다시 쓰지 않는다.
//   특히 Check 모드에서 Space로 _C 마킹 직후 자동 next 시 _W로 되돌아가는 버그 방지.
// - pre-save의 completed 플래그는 현재 이미지의 status를 보존 ('working' 또는 'completed').
async function goToImage(index: number): Promise<void> {
  if (index < 0 || index >= imageList.length) return
  if (index === currentImageIndex) return
  if (isNavigating) return

  isNavigating = true
  try {
    if (saveStatus === 'dirty' && currentLabelData && workspacePath && currentImage) {
      clearAutosaveTimer()
      await saveLabel(currentLabelData, currentImage.status === 'completed')
    } else {
      // dirty가 아니면 보류된 timer만 취소 (혹시 남아있을 수 있음)
      clearAutosaveTimer()
    }
    currentImageIndex = index
    await loadCurrentImageLabel()
  } finally {
    isNavigating = false
  }
}

/**
 * 다음/이전 이미지 — 필터가 활성화된 경우 필터된 리스트 안에서만 이동.
 * 필터 비활성 또는 현재 이미지가 필터 결과에 없으면 전체 imageList에서 다음/이전.
 */
function findNextFilteredIndex(direction: 1 | -1): number | null {
  const filtered = filteredImageList
  if (filtered.length === 0) return null
  if (filtered.length === imageList.length) {
    // 필터 비활성 — 전체 리스트 기준
    const next = currentImageIndex + direction
    return next >= 0 && next < imageList.length ? next : null
  }

  const currentId = imageList[currentImageIndex]?.id
  const filteredIdx = filtered.findIndex((i) => i.id === currentId)
  if (filteredIdx === -1) {
    // 현재가 필터에 없으면 첫/마지막 필터 항목으로
    const target = direction === 1 ? filtered[0] : filtered[filtered.length - 1]
    return imageList.findIndex((i) => i.id === target.id)
  }
  const nextFilteredIdx = filteredIdx + direction
  if (nextFilteredIdx < 0 || nextFilteredIdx >= filtered.length) return null
  const targetId = filtered[nextFilteredIdx].id
  return imageList.findIndex((i) => i.id === targetId)
}

async function nextImage(): Promise<void> {
  const next = findNextFilteredIndex(1)
  if (next !== null && next !== currentImageIndex) {
    await goToImage(next)
  }
}

async function prevImage(): Promise<void> {
  const prev = findNextFilteredIndex(-1)
  if (prev !== null && prev !== currentImageIndex) {
    await goToImage(prev)
  }
}

// 라벨 저장
//
// 동시성 안전장치:
// - targetImageId / targetWorkspacePath 를 IPC 호출 *전*에 동기적으로 캡처한다.
//   await 사이에 currentImage / workspacePath 가 바뀌어도 IPC는 올바른 대상에 쓴다.
// - savePromise 체인으로 IPC를 직렬화 — 이전 save가 끝나야 다음 save IPC가 시작된다.
//   같은 파일에 대한 unlink/write race를 막는다 (main의 saveLabelData가 atomic이 아님).
// - imageList 는 idx가 아닌 id로 매칭해서 갱신 — currentImageIndex가 미세하게
//   shift되더라도 엉뚱한 항목이 갱신되지 않는다.
// - 사용자에게 보이는 reactive 상태(currentLabelData/saveStatus/lastSavedAt)는
//   "저장 완료 시점에 여전히 같은 이미지를 보고 있을 때"만 갱신한다.
//   백그라운드 save가 새 이미지의 화면을 덮어쓰는 것을 막는다.
async function saveLabel(data: LabelData, completed: boolean = false): Promise<boolean> {
  if (!workspacePath || !currentImage) return false

  const targetWorkspacePath = workspacePath
  const targetImageId = currentImage.id

  // 호출 시점에 사용자가 보고 있던 이미지에 대해서만 saveStatus를 'saving'으로 표시
  saveStatus = 'saving'

  // $state 프록시를 벗긴 snapshot을 IPC로 전송 (Electron structured clone 대응)
  const plainData = $state.snapshot(data)

  // 직전 save가 끝날 때까지 대기 후 IPC 실행 — Promise 체인 기반 mutex
  const previous = savePromise
  const myTurn = (async (): Promise<boolean> => {
    // 이전 save가 reject되더라도 chain이 끊기지 않도록 swallow
    await previous.catch(() => undefined)

    const success = await window.api.label.save(
      targetWorkspacePath,
      targetImageId,
      plainData,
      completed
    )

    // 저장된 이미지의 status는 항상 id-키로 갱신 (인덱스 시프트와 무관)
    if (success) {
      imageList = imageList.map((img) =>
        img.id === targetImageId ? { ...img, status: completed ? 'completed' : 'working' } : img
      )
    }

    // 사용자가 여전히 같은 이미지를 보고 있을 때만 visible state 갱신
    const stillOnSameImage =
      currentImage !== null &&
      currentImage.id === targetImageId &&
      workspacePath === targetWorkspacePath

    if (stillOnSameImage) {
      if (success) {
        currentLabelData = data
        lastSavedAt = Date.now()
        saveStatus = 'saved'
      } else {
        saveStatus = 'error'
      }
    }

    return success
  })()

  // 다음 save가 이 작업을 await할 수 있도록 chain 갱신.
  // 에러는 chain에서 swallow — 후속 save는 멈추지 않는다.
  savePromise = myTurn.catch(() => undefined)
  return myTurn
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

// ============================================
// Image-level Tags (A-3)
// ============================================

function ensureLabelData(): LabelData {
  if (currentLabelData) return currentLabelData
  if (!currentImage) {
    throw new Error('현재 이미지가 없는 상태에서 라벨 데이터를 생성할 수 없음')
  }
  const fresh: LabelData = {
    image_info: {
      filename: currentImage.filename,
      width: imageWidth,
      height: imageHeight
    },
    annotations: [],
    tags: []
  }
  currentLabelData = fresh
  return fresh
}

function addCurrentTag(tag: string): boolean {
  const t = tag.trim()
  if (!t || !currentImage) return false
  const data = ensureLabelData()
  const existing = data.tags ?? []
  if (existing.includes(t)) return false
  pushHistorySnapshot()
  currentLabelData = { ...data, tags: [...existing, t] }
  scheduleAutosave()
  return true
}

function removeCurrentTag(tag: string): boolean {
  if (!currentLabelData?.tags || currentLabelData.tags.length === 0) return false
  if (!currentLabelData.tags.includes(tag)) return false
  pushHistorySnapshot()
  currentLabelData = {
    ...currentLabelData,
    tags: currentLabelData.tags.filter((t) => t !== tag)
  }
  scheduleAutosave()
  return true
}

/**
 * 직전 이미지(currentImageIndex - 1)의 모든 어노테이션을
 * 현재 이미지에 복제한다. 현재 라벨링 모드와 일치하는 항목만 복제.
 * 좌표는 그대로 (이미지 크기 차이는 사용자가 인지하고 사용한다는 가정).
 * 반환: 복제된 어노테이션 수.
 */
async function replicatePreviousImageLabels(): Promise<number> {
  if (!workspacePath || !currentImage || currentImageIndex <= 0) return 0
  const prev = imageList[currentImageIndex - 1]
  if (!prev) return 0

  const prevData = await window.api.label.read(workspacePath, prev.id)
  if (!prevData?.annotations || prevData.annotations.length === 0) return 0

  const bbMode = isBBMode
  const newAnnotations: (BBAnnotation | OBBAnnotation)[] = []
  for (const ann of prevData.annotations) {
    if (bbMode && 'bbox' in ann) {
      newAnnotations.push({
        id: crypto.randomUUID(),
        class_id: ann.class_id,
        bbox: [...ann.bbox] as [number, number, number, number]
      })
    } else if (!bbMode && 'obb' in ann) {
      newAnnotations.push({
        id: crypto.randomUUID(),
        class_id: ann.class_id,
        obb: [...ann.obb] as [number, number, number, number, number]
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

/**
 * 현재 이미지의 완료(`_C`) 상태를 토글하고 즉시 저장한다.
 * 'completed' → 'working', 그 외(none/working) → 'completed'.
 * Review 모드에서 Space로 빠르게 검수 마킹할 때 사용.
 */
async function toggleCurrentCompletion(): Promise<boolean> {
  if (!workspacePath || !currentImage) return false
  clearAutosaveTimer()
  // 라벨 데이터가 아직 없으면(파일이 비어있거나 없음) 빈 어노테이션 라벨로 초기화하여 토글 허용
  const dataToSave: LabelData = currentLabelData ?? {
    image_info: {
      filename: currentImage.filename,
      width: imageWidth,
      height: imageHeight
    },
    annotations: []
  }
  const nextCompleted = currentImage.status !== 'completed'
  const ok = await saveLabel(dataToSave, nextCompleted)
  if (ok) {
    console.log(
      `[Review] ${currentImage.id} → ${nextCompleted ? 'completed (_C)' : 'working (_W)'}`
    )
  }
  return ok
}

// Ctrl+S: 디바운스 autosave 대기 없이 즉시 현재 상태를 디스크에 flush.
// 검수 완료(_C) 상태는 보존 — 명시적 저장이 _W로 되돌리지 않도록.
async function flushSave(): Promise<boolean> {
  if (!currentLabelData || !workspacePath || !currentImage) return false
  clearAutosaveTimer()
  return await saveLabel(currentLabelData, currentImage.status === 'completed')
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

function addPolygonAnnotation(annotation: PolygonAnnotation): void {
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

function updatePolygonAnnotation(labelId: string, polygon: [number, number][]): void {
  if (!currentLabelData) return
  const ann = currentLabelData.annotations.find((a) => a.id === labelId) as
    | PolygonAnnotation
    | undefined
  if (!ann) return

  // 같은 폴리곤이면 무시 (좌표 비교)
  const hasChanged =
    ann.polygon.length !== polygon.length ||
    ann.polygon.some((p, i) => p[0] !== polygon[i][0] || p[1] !== polygon[i][1])
  if (!hasChanged) return

  pushHistorySnapshot()

  currentLabelData = {
    ...currentLabelData,
    annotations: currentLabelData.annotations.map((annotation) => {
      if (annotation.id !== labelId || !('polygon' in annotation)) return annotation
      return { ...annotation, polygon }
    })
  }

  scheduleAutosave()
}

function getPolygonAnnotationById(labelId: string): PolygonAnnotation | undefined {
  if (!currentLabelData) return undefined
  return currentLabelData.annotations.find((ann) => ann.id === labelId) as
    | PolygonAnnotation
    | undefined
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

/**
 * 현재 단일 선택된 박스의 크기를 axis(`w`/`h`) 방향으로 delta(px) 만큼 조절.
 * - BB: 좌상단 고정, xmax/ymax만 이동 (delta>0 = 늘림)
 * - OBB: 중심 고정, w/h 만 변경 (delta>0 = 늘림)
 * - 최소 1px 보장 (그 이하 요청은 1로 클램프)
 * - Polygon / Keypoint / 다중 선택 / 미선택은 no-op
 * - undo/redo 통합 + autosave 트리거
 */
function resizeSelectedBox(axis: 'w' | 'h', delta: number): boolean {
  if (!currentLabelData) return false
  if (selectedLabelIds.length !== 1) return false
  const id = selectedLabelIds[0]
  const ann = currentLabelData.annotations.find((a) => a.id === id)
  if (!ann) return false

  if ('bbox' in ann) {
    const [xmin, ymin, xmax, ymax] = ann.bbox
    let newXmax = xmax
    let newYmax = ymax
    if (axis === 'w') newXmax = Math.max(xmin + 1, xmax + delta)
    else newYmax = Math.max(ymin + 1, ymax + delta)
    if (newXmax === xmax && newYmax === ymax) return false
    updateBBAnnotation(id, [xmin, ymin, newXmax, newYmax])
    return true
  }
  if ('obb' in ann) {
    const [cx, cy, w, h, angle] = ann.obb
    let newW = w
    let newH = h
    if (axis === 'w') newW = Math.max(1, w + delta)
    else newH = Math.max(1, h + delta)
    if (newW === w && newH === h) return false
    updateOBBAnnotation(id, [cx, cy, newW, newH, angle])
    return true
  }
  // polygon / keypoint 등 — 키보드 resize 비대상
  return false
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
    get filteredImageList() {
      return filteredImageList
    },
    get imageFilter() {
      return imageFilter
    },
    setImageFilter(next: Partial<ImageFilter>) {
      imageFilter = { ...imageFilter, ...next }
    },
    clearImageFilter() {
      imageFilter = { statuses: [], classId: null, boxesEmpty: null }
    },
    get workspaceStats() {
      return workspaceStats
    },
    get statsLoading() {
      return statsLoading
    },
    get gridViewActive() {
      return gridViewActive
    },
    setGridViewActive(v: boolean) {
      gridViewActive = v
    },
    toggleGridView() {
      gridViewActive = !gridViewActive
    },
    async refreshStats() {
      if (!workspacePath) return
      statsLoading = true
      try {
        workspaceStats = await window.api.workspace.computeStats(workspacePath)
      } catch (err) {
        console.error('통계 로드 실패', err)
        workspaceStats = null
      } finally {
        statsLoading = false
      }
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
    get isPolygonMode() {
      return isPolygonMode
    },
    get isKeypointMode() {
      return isKeypointMode
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
    replicatePreviousImageLabels,
    toggleCurrentCompletion,
    addCurrentTag,
    removeCurrentTag,
    get currentTags() {
      return currentLabelData?.tags ?? []
    },
    addBBAnnotation,
    addOBBAnnotation,
    addPolygonAnnotation,
    updateBBAnnotation,
    updateOBBAnnotation,
    updatePolygonAnnotation,
    getPolygonAnnotationById,
    deleteLabel,
    getBBAnnotationById,
    getOBBAnnotationById,
    resizeSelectedBox,
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
