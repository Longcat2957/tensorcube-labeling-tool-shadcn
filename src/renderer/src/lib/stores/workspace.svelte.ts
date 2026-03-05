// Types are globally available via preload/index.d.ts

// 워크스페이스 상태
let workspacePath = $state<string | null>(null);
let workspaceConfig = $state<WorkspaceConfig | null>(null);
let workspaceInfo = $state<WorkspaceInfo | null>(null);
let imageList = $state<ImageInfo[]>([]);
let currentImageIndex = $state<number>(-1);
let currentLabelData = $state<LabelData | null>(null);

// 파생 상태
const isWorkspaceOpen = $derived(workspacePath !== null && workspaceConfig !== null);
const currentImage = $derived(currentImageIndex >= 0 ? imageList[currentImageIndex] : null);
const classes = $derived(workspaceConfig?.names ?? {});

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
    get classes() { return classes; },
    
    // 메서드
    openWorkspace,
    closeWorkspace,
    goToImage,
    nextImage,
    prevImage,
    saveLabel,
    updateWorkspaceConfig,
    loadCurrentImageLabel
  };
}

export type WorkspaceManager = ReturnType<typeof createWorkspaceManager>;