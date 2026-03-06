import type { 
  WorkspaceConfig, 
  WorkspaceInfo, 
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
  workspacePath = null;
  workspaceConfig = null;
  workspaceInfo = null;
  imageList = [];
  currentImageIndex = -1;
  currentLabelData = null;
}

// 현재 이미지 라벨 로드
async function loadCurrentImageLabel(): Promise<void> {
  if (!workspacePath || !currentImage) return;
  
  const data = await window.api.label.read(workspacePath, currentImage.id);
  currentLabelData = data;
}

// 이미지 이동
async function goToImage(index: number): Promise<void> {
  if (index >= 0 && index < imageList.length) {
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
  
  const success = await window.api.label.save(workspacePath, currentImage.id, data as unknown as Record<string, unknown>, completed);
  
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
}

function deleteLabel(labelId: string): void {
  if (!currentLabelData) return;
  
  currentLabelData = {
    ...currentLabelData,
    annotations: currentLabelData.annotations.filter(ann => ann.id !== labelId)
  };
  
  if (selectedLabelId === labelId) {
    selectedLabelId = null;
  }
}

function getBBAnnotationById(labelId: string): BBAnnotation | undefined {
  if (!currentLabelData) return undefined;
  return currentLabelData.annotations.find(ann => ann.id === labelId) as BBAnnotation | undefined;
}

function updateBBAnnotation(labelId: string, bbox: [number, number, number, number]): void {
  if (!currentLabelData) return;
  const ann = currentLabelData.annotations.find(a => a.id === labelId) as BBAnnotation | undefined;
  if (ann) {
    ann.bbox = bbox;
  }
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
    loadCurrentImageLabel,
    setSelectedClassId,
    
    // 라벨 관리 메서드
    setSelectedLabelId,
    addBBAnnotation,
    updateBBAnnotation,
    deleteLabel,
    getBBAnnotationById,
    
    // 캔버스 메서드
    setZoomLevel,
    setViewport,
    setCanvasSize,
    setImageSize,
    resetCanvasState
  };
}

export type WorkspaceManager = ReturnType<typeof createWorkspaceManager>;