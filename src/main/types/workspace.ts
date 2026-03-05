// 워크스페이스 메타데이터 (workspace.yaml)
export interface WorkspaceConfig {
  workspace: string;
  labeling_type: 1 | 2; // 1: BB, 2: OBB
  names: Record<number, string>;
  image_count: number;
  created_at: string;
  last_modified_at: string;
}

// UI에서 사용할 워크스페이스 정보
export interface WorkspaceInfo {
  name: string;
  labelingType: string;
  imageCount: number;
  lastModified: string;
  path: string;
}

// 워크스페이스 생성 옵션
export interface CreateWorkspaceOptions {
  name: string;
  sourceFolders: string[];
  savePath: string;
  labelingType: 1 | 2;
  classes: { id: number; name: string }[];
}

// 이미지 정보
export interface ImageInfo {
  id: string; // 9자리 숫자
  filename: string;
  width: number;
  height: number;
  status: 'none' | 'working' | 'completed';
}

// 라벨 어노테이션 (BB)
export interface BBAnnotation {
  id: string;
  class_id: number;
  bbox: [number, number, number, number]; // [xmin, ymin, xmax, ymax]
}

// 라벨 어노테이션 (OBB)
export interface OBBAnnotation {
  id: string;
  class_id: number;
  obb: [number, number, number, number, number]; // [cx, cy, w, h, angle]
}

// 라벨 데이터 파일 구조
export interface LabelData {
  image_info: {
    filename: string;
    width: number;
    height: number;
  };
  annotations: (BBAnnotation | OBBAnnotation)[];
}

// IPC 응답 타입
export interface IpcResponse<T = void> {
  success: boolean;
  data?: T;
  error?: string;
}