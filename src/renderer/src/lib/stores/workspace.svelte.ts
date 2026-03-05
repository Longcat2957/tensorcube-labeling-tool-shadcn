// Types
interface WorkspaceConfig {
  workspace: string;
  labeling_type: 1 | 2;
  names: Record<number, string>;
  image_count: number;
  created_at: string;
  last_modified_at: string;
}

interface WorkspaceInfo {
  name: string;
  labelingType: string;
  imageCount: number;
  lastModified: string;
  path: string;
}

interface ImageInfo {
  id: string;
  filename: string;
  width: number;
  height: number;
  status: 'none' | 'working' | 'completed';
}

interface LabelData {
  image_info: {
    filename: string;
    width: number;
    height: number;
  };
  annotations: { id: string; class_id: number }[];
}

// 워크스페이스 상태
let workspacePath = $state<string | null>(null);
let workspaceConfig = $state<WorkspaceConfig | null>(null);
let workspaceInfo = $state<WorkspaceInfo | null>(null);
let imageList = $state<ImageInfo[]>([]);
let currentImageIndex = $state<number>(-1);
let currentLabelData = $state<LabelData | null>(null);
let selectedClassId = $state<number>(0);

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
    
    // 메서드
    openWorkspace,
    closeWorkspace,
    goToImage,
    nextImage,
    prevImage,
    saveLabel,
    updateWorkspaceConfig,
    loadCurrentImageLabel,
    setSelectedClassId
  };
}

export type WorkspaceManager = ReturnType<typeof createWorkspaceManager>;