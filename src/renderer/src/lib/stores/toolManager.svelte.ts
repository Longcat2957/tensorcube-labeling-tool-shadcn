/**
 * 도구 상태 관리 매니저
 * 현재 선택된 도구, 드로잉 상태 등을 관리하며
 * Canvas, LeftSidebar 등에서 공통으로 사용됩니다.
 */

// 도구 타입 정의
export type ToolType = 
  | 'select'   // 선택/이동 도구 (V)
  | 'box'      // 박스 생성 도구 (B)
  | 'pan';     // 패닝 도구

// 도구별 커서 매핑
const TOOL_CURSORS: Record<ToolType, string> = {
  select: 'default',
  box: 'crosshair',
  pan: 'grab'
};

// 도구별 설명
export const TOOL_DESCRIPTIONS: Record<ToolType, string> = {
  select: '선택 도구',
  box: '박스 생성 도구',
  pan: '이동 도구'
};

// 마우스 좌표 인터페이스 (원본 이미지 픽셀 좌표)
export interface ImageCoordinates {
  x: number;
  y: number;
}

// 드로잉 상태 인터페이스
export interface DrawingState {
  isDrawing: boolean;
  startPoint: ImageCoordinates | null;
  currentPoint: ImageCoordinates | null;
}

/**
 * 도구 매니저 생성 함수
 * Svelte 5의 $state rune를 사용하여 반응형 상태 관리
 */
export function createToolManager() {
  // 현재 선택된 도구
  let currentTool = $state<ToolType>('select');
  
  // 드로잉 상태
  let isDrawing = $state(false);
  let drawingStart = $state<ImageCoordinates | null>(null);
  let drawingCurrent = $state<ImageCoordinates | null>(null);
  
  // 현재 마우스 위치 (원본 이미지 픽셀 좌표) - Footer 등에서 표시용
  let mouseX = $state<number>(0);
  let mouseY = $state<number>(0);

  /**
   * 도구 변경
   */
  function setTool(tool: ToolType): void {
    // 드로잉 중이면 취소
    if (isDrawing) {
      cancelDrawing();
    }
    currentTool = tool;
  }

  /**
   * 현재 도구 가져오기
   */
  function getTool(): ToolType {
    return currentTool;
  }

  /**
   * 도구별 커서 반환
   */
  function getCursor(): string {
    return TOOL_CURSORS[currentTool];
  }

  /**
   * 드로잉 시작
   */
  function startDrawing(point: ImageCoordinates): void {
    isDrawing = true;
    drawingStart = point;
    drawingCurrent = point;
  }

  /**
   * 드로잉 중 좌표 업데이트
   */
  function updateDrawing(point: ImageCoordinates): void {
    if (isDrawing) {
      drawingCurrent = point;
    }
  }

  /**
   * 드로잉 종료
   */
  function endDrawing(): { start: ImageCoordinates | null; end: ImageCoordinates | null } {
    const result = {
      start: drawingStart,
      end: drawingCurrent
    };
    
    isDrawing = false;
    drawingStart = null;
    drawingCurrent = null;
    
    return result;
  }

  /**
   * 드로잉 취소
   */
  function cancelDrawing(): void {
    isDrawing = false;
    drawingStart = null;
    drawingCurrent = null;
  }

  /**
   * 특정 도구가 활성화되어 있는지 확인
   */
  function isToolActive(tool: ToolType): boolean {
    return currentTool === tool;
  }

  /**
   * 스크린 좌표를 이미지 픽셀 좌표로 변환
   * @param screenX - 캔버스상의 X 좌표
   * @param screenY - 캔버스상의 Y 좌표
   * @param imageOffsetX - 이미지의 화면상 좌상단 X 좌표
   * @param imageOffsetY - 이미지의 화면상 좌상단 Y 좌표
   * @param scale - 현재 줌 스케일
   */
  function screenToImage(
    screenX: number,
    screenY: number,
    imageOffsetX: number,
    imageOffsetY: number,
    scale: number
  ): ImageCoordinates {
    if (scale <= 0) {
      scale = 1; // 0으로 나누기 방지
    }
    
    return {
      x: Math.round((screenX - imageOffsetX) / scale),
      y: Math.round((screenY - imageOffsetY) / scale)
    };
  }

  /**
   * 이미지 픽셀 좌표를 스크린 좌표로 변환
   */
  function imageToScreen(
    imageX: number,
    imageY: number,
    imageOffsetX: number,
    imageOffsetY: number,
    scale: number
  ): { x: number; y: number } {
    return {
      x: imageX * scale + imageOffsetX,
      y: imageY * scale + imageOffsetY
    };
  }

  /**
   * 마우스 위치 업데이트 (CanvasArea에서 호출)
   */
  function updateMousePosition(x: number, y: number): void {
    mouseX = x;
    mouseY = y;
  }

  return {
    // 상태 getter
    get currentTool() { return currentTool; },
    get isDrawing() { return isDrawing; },
    get drawingStart() { return drawingStart; },
    get drawingCurrent() { return drawingCurrent; },
    get mouseX() { return mouseX; },
    get mouseY() { return mouseY; },
    
    // 메서드
    setTool,
    getTool,
    getCursor,
    isToolActive,
    
    // 드로잉 관련
    startDrawing,
    updateDrawing,
    endDrawing,
    cancelDrawing,
    
    // 마우스 위치
    updateMousePosition,
    
    // 좌표 변환
    screenToImage,
    imageToScreen
  };
}

// Context 키 심볼
export const TOOL_MANAGER_KEY = Symbol('toolManager');

// 타입 익스포트
export type ToolManager = ReturnType<typeof createToolManager>;