import type { 
  WorkspaceConfig, 
  WorkspaceInfo, 
  UpdateWorkspaceOptions,
  ImageInfo, 
  LabelData, 
  BBAnnotation 
} from '../../../../shared/types';

// Re-export BBAnnotation for use in other components
export type { BBAnnotation } from '../../../../shared/types';

// 워크스페이스 상태
let workspacePath = $state<string | null>(null);
let workspaceConfig = $state<WorkspaceConfig | null>(null);
let workspaceInfo = $state<WorkspaceInfo | null>(null);
let imageList = $state<ImageInfo[]>([]);
let currentImageIndex = $state<number>(-1);
let currentLabelData = $state<LabelData | null>(null);
let selectedClassId = $state<number>(0);
let autosaveTimer = $state<ReturnType<typeof setTimeout> | null>(null);
let autosaveVersion = $state(0);

// 히스토리 상태 (현재 이미지 단위)
let labelHistoryPast = $state<(LabelData | null)[]>([]);
let labelHistoryFuture = $state<(LabelData | null)[]>([]);

// 캔버스 상태
let zoomLevel = $state<number>(1.0);
let viewportX = $state<number>(0);
let viewportY = $state<number>(0);
let canvasWidth = $state<number>(0);
let canvasHeight = $state<number>(0);
let imageWidth = $state<number>(0);
let imageHeight = $state<number>(0);

// 선택된 라벨 ID
let selectedLabelId = $state<string | null>(null);

// 파생 상태
const isWorkspaceOpen = $derived(workspacePath !== null && workspaceConfig !== null);
const currentImage = $derived(currentImageIndex >= 0 ? imageList[currentImageIndex] : null);
const canUndo = $derived(labelHistoryPast.length > 0);
const canRedo = $derived(labelHistoryFuture.length > 0);

// 클래스 리스트 (UI용으로 변환)
const classList = $derived(() => {
  if (!workspaceConfig?.names) return [];
  return Object.entries(workspaceConfig.names).map(([id, name]) => ({
    id: parseInt(id),
    name,
    color: getClassColor(parseInt(id))
  }));
});

// 현재 이미지의 라벨 리스트
const currentLabels = $derived(() => {
  if (!currentLabelData?.annotations) return [];
  return currentLabelData.annotations.map((ann, index) => ({
    id: ann.id || `label-${index}`,
    classId: ann.class_id,
    className: workspaceConfig?.names?.[ann.class_id] ?? `Class ${ann.class_id}`,
    color: getClassColor(ann.class_id),
    visible: true
  }));
});

// 클래스별 색상 반환
function getClassColor(classId: number): string {
  const colors = [
    '#3b82f6', '#ef4444', '#22c55e', '#f59e0b', '#8b5cf6',
    '#ec4899', '#06b6d4', '#84cc16', '#f97316', '#6366f1'
  ];
  return colors[classId % colors.length];
}

function cloneLabelData(data: LabelData | null): LabelData | null {
  if (!data) return null;
  return JSON.parse(JSON.stringify(data)) as LabelData;
}

function resetHistory(): void {
  labelHistoryPast = [];
  labelHistoryFuture = [];
}

function applyLabelSnapshot(snapshot: LabelData | null): void {
  currentLabelData = cloneLabelData(snapshot);

  if (!currentLabelData?.annotations?.some((ann) => ann.id === selectedLabelId)) {
    selectedLabelId = null;
  }
}

function pushHistorySnapshot(): void {
  labelHistoryPast = [...labelHistoryPast, cloneLabelData(currentLabelData)];
  labelHistoryFuture = [];
}

function clearAutosaveTimer(): void {
  if (autosaveTimer) {
    clearTimeout(autosaveTimer);
    autosaveTimer = null;
  }
}

function scheduleAutosave(): void {
  if (!currentLabelData || !workspacePath || !currentImage) return;

  clearAutosaveTimer();
  const scheduledVersion = autosaveVersion + 1;
  autosaveVersion = scheduledVersion;

  autosaveTimer = setTimeout(() => {
    autosaveTimer = null;

    if (scheduledVersion !== autosaveVersion || !currentLabelData) {
      return;
    }

    void saveLabel(currentLabelData, false);
  }, 500);
}

// 워크스페이스 열기
async function openWorkspace(path: string): Promise<boolean> {
  const result = await window.api.workspace.open(path);
  
  if (result.success && result.config) {
    workspacePath = path;
    workspaceConfig = result.config;
    
    const info = await window.api.workspace.getInfo(path);
    workspaceInfo = info;
    
    const images = await window.api.workspace.getImageList(path);
    imageList = images;
    
    if (images.length > 0) {
      currentImageIndex = 0;
      await loadCurrentImageLabel();
    }
    
    return true;
  }
  
  return false;
}

// 워크스페이스 닫기
function closeWorkspace(): void {
  clearAutosaveTimer();
  workspacePath = null;
  workspaceConfig = null;
  workspaceInfo = null;
  imageList = [];
  currentImageIndex = -1;
  currentLabelData = null;
  resetHistory();
}

// 현재 이미지 라벨 로드
async function loadCurrentImageLabel(): Promise<void> {
  if (!workspacePath || !currentImage) return;

  clearAutosaveTimer();
  
  const data = await window.api.label.read(workspacePath, currentImage.id);
  currentLabelData = data;
  resetHistory();
  selectedLabelId = null;
}

// 이미지 이동
async function goToImage(index: number): Promise<void> {
  if (index >= 0 && index < imageList.length) {
    // 이미지 전환 전 현재 라벨 저장
    if (currentLabelData && workspacePath && currentImage) {
      clearAutosaveTimer();
      await saveLabel(currentLabelData, false);
    }
    currentImageIndex = index;
    await loadCurrentImageLabel();
  }
}

async function nextImage(): Promise<void> {
  if (currentImageIndex < imageList.length - 1) {
    await goToImage(currentImageIndex + 1);
  }
}

async function prevImage(): Promise<void> {
  if (currentImageIndex > 0) {
    await goToImage(currentImageIndex - 1);
  }
}

// 라벨 저장
async function saveLabel(data: LabelData, completed: boolean = false): Promise<boolean> {
  if (!workspacePath || !currentImage) return false;
  
  // $state 반응형 프록시를 순수 객체로 변환 후 IPC 전송 (structured clone 대응)
  const plainData = JSON.parse(JSON.stringify(data));
  const success = await window.api.label.save(workspacePath, currentImage.id, plainData, completed);
  
  if (success) {
    currentLabelData = data;
    
    // 이미지 상태 업데이트
    imageList = imageList.map((img, idx) => {
      if (idx === currentImageIndex) {
        return { ...img, status: completed ? 'completed' : 'working' };
      }
      return img;
    });
  }
  
  return success;
}

// 워크스페이스 상태 업데이트
function updateWorkspaceConfig(config: WorkspaceConfig): void {
  workspaceConfig = config;
}

async function updateWorkspaceConfigFile(options: UpdateWorkspaceOptions): Promise<boolean> {
  if (!workspacePath) return false;

  const previousClassIds = workspaceConfig
    ? Object.keys(workspaceConfig.names).map((id) => parseInt(id)).sort((a, b) => a - b)
    : [];

  const result = await window.api.workspace.update(workspacePath, options);

  if (!result.success || !result.config) {
    return false;
  }

  workspaceConfig = result.config;

  const info = await window.api.workspace.getInfo(workspacePath);
  workspaceInfo = info;

  const validClassIds = Object.keys(result.config.names)
    .map((id) => parseInt(id))
    .sort((a, b) => a - b);

  if (!validClassIds.includes(selectedClassId)) {
    selectedClassId = validClassIds[0] ?? 0;
  } else if (validClassIds.length > previousClassIds.length) {
    const newlyAddedClassId = validClassIds.find((id) => !previousClassIds.includes(id));
    if (newlyAddedClassId !== undefined) {
      selectedClassId = newlyAddedClassId;
    }
  }

  if (currentLabelData && currentLabelData.annotations.length > 0) {
    const selectedLabelExists = currentLabelData.annotations.some((ann) => ann.id === selectedLabelId);
    if (!selectedLabelExists) {
      selectedLabelId = null;
    }
  }

  return true;
}

// Context key
export const WORKSPACE_MANAGER_KEY = Symbol('workspaceManager');

// 선택된 클래스 ID 설정
function setSelectedClassId(id: number): void {
  selectedClassId = id;
}

// 캔버스 상태 관리
function setZoomLevel(level: number): void {
  zoomLevel = Math.max(0.1, Math.min(5, level));
}

function setViewport(x: number, y: number): void {
  viewportX = x;
  viewportY = y;
}

function setCanvasSize(width: number, height: number): void {
  canvasWidth = width;
  canvasHeight = height;
}

function setImageSize(width: number, height: number): void {
  imageWidth = width;
  imageHeight = height;
}

function resetCanvasState(): void {
  zoomLevel = 1.0;
  viewportX = 0;
  viewportY = 0;
}

// 라벨 관리 메서드
function setSelectedLabelId(id: string | null): void {
  selectedLabelId = id;
}

function addBBAnnotation(annotation: BBAnnotation): void {
  pushHistorySnapshot();

  if (!currentLabelData) {
    // 라벨 데이터가 없으면 새로 생성
    currentLabelData = {
      image_info: {
        filename: currentImage?.filename || '',
        width: imageWidth,
        height: imageHeight
      },
      annotations: [annotation]
    };
  } else {
    currentLabelData = {
      ...currentLabelData,
      annotations: [...currentLabelData.annotations, annotation]
    };
  }

  scheduleAutosave();
}

function deleteLabel(labelId: string): void {
  if (!currentLabelData) return;
  if (!currentLabelData.annotations.some((ann) => ann.id === labelId)) return;

  pushHistorySnapshot();
  
  currentLabelData = {
    ...currentLabelData,
    annotations: currentLabelData.annotations.filter(ann => ann.id !== labelId)
  };
  
  if (selectedLabelId === labelId) {
    selectedLabelId = null;
  }

  scheduleAutosave();
}

function getBBAnnotationById(labelId: string): BBAnnotation | undefined {
  if (!currentLabelData) return undefined;
  return currentLabelData.annotations.find(ann => ann.id === labelId) as BBAnnotation | undefined;
}

function updateBBAnnotation(labelId: string, bbox: [number, number, number, number]): void {
  if (!currentLabelData) return;
  const ann = currentLabelData.annotations.find(a => a.id === labelId) as BBAnnotation | undefined;
  if (!ann) return;

  const hasChanged = ann.bbox.some((value, index) => value !== bbox[index]);
  if (!hasChanged) return;

  pushHistorySnapshot();

  currentLabelData = {
    ...currentLabelData,
    annotations: currentLabelData.annotations.map((annotation) => {
      if (annotation.id !== labelId || !('bbox' in annotation)) {
        return annotation;
      }

      return {
        ...annotation,
        bbox,
      };
    }),
  };

  scheduleAutosave();
}

function undo(): void {
  if (labelHistoryPast.length === 0) return;

  const previous = labelHistoryPast[labelHistoryPast.length - 1];
  labelHistoryPast = labelHistoryPast.slice(0, -1);
  labelHistoryFuture = [cloneLabelData(currentLabelData), ...labelHistoryFuture];
  applyLabelSnapshot(previous);
  scheduleAutosave();
}

function redo(): void {
  if (labelHistoryFuture.length === 0) return;

  const next = labelHistoryFuture[0];
  labelHistoryFuture = labelHistoryFuture.slice(1);
  labelHistoryPast = [...labelHistoryPast, cloneLabelData(currentLabelData)];
  applyLabelSnapshot(next);
  scheduleAutosave();
}

// Store export
export function createWorkspaceManager() {
  return {
    // 상태
    get workspacePath() { return workspacePath; },
    get workspaceConfig() { return workspaceConfig; },
    get workspaceInfo() { return workspaceInfo; },
    get imageList() { return imageList; },
    get currentImageIndex() { return currentImageIndex; },
    get currentLabelData() { return currentLabelData; },
    get isWorkspaceOpen() { return isWorkspaceOpen; },
    get currentImage() { return currentImage; },
    get classList() { return classList(); },
    get currentLabels() { return currentLabels(); },
    get selectedClassId() { return selectedClassId; },
    get selectedLabelId() { return selectedLabelId; },
    get canUndo() { return canUndo; },
    get canRedo() { return canRedo; },
    
    // 캔버스 상태
    get zoomLevel() { return zoomLevel; },
    get viewportX() { return viewportX; },
    get viewportY() { return viewportY; },
    get canvasWidth() { return canvasWidth; },
    get canvasHeight() { return canvasHeight; },
    get imageWidth() { return imageWidth; },
    get imageHeight() { return imageHeight; },
    
    // 메서드
    openWorkspace,
    closeWorkspace,
    goToImage,
    nextImage,
    prevImage,
    saveLabel,
    updateWorkspaceConfig,
    updateWorkspaceConfigFile,
    loadCurrentImageLabel,
    setSelectedClassId,
    
    // 라벨 관리 메서드
    setSelectedLabelId,
    addBBAnnotation,
    updateBBAnnotation,
    deleteLabel,
    getBBAnnotationById,
    undo,
    redo,
    
    // 캔버스 메서드
    setZoomLevel,
    setViewport,
    setCanvasSize,
    setImageSize,
    resetCanvasState
  };
}

export type WorkspaceManager = ReturnType<typeof createWorkspaceManager>;