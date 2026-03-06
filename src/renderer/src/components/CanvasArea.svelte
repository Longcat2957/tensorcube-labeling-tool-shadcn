<script lang="ts">
  import { getContext, onMount, onDestroy, tick } from "svelte";
  import { Canvas, FabricImage, Rect } from "fabric";
  import { WORKSPACE_MANAGER_KEY, type WorkspaceManager } from "$lib/stores/workspace.svelte.js";
  import { TOOL_MANAGER_KEY, type ToolManager } from "$lib/stores/toolManager.svelte.js";
  import { KEYBOARD_MANAGER_KEY, type KeyboardManager } from "$lib/stores/keyboardManager.svelte.js";
  import { 
    createLabelBox, 
    createOBBLabelBox,
    createLabelBadge,
    createDrawingBox, 
    type LabelBadgeObjects,
    type LabelBoxRect,
    updateBoxPosition, 
    updateLabelBadgePosition,
    setBoxSelectedStyle,
    normalizeBbox,
    screenToImage,
    bboxToObb,
    screenToObb,
    normalizeObbRectAfterModify
  } from "$lib/canvas/boxRenderer.js";
  import type { BBAnnotation, OBBAnnotation } from "$lib/stores/workspace.svelte.js";

  const workspaceManager = getContext<WorkspaceManager>(WORKSPACE_MANAGER_KEY);
  const toolManager = getContext<ToolManager>(TOOL_MANAGER_KEY);
  const keyboardManager = getContext<KeyboardManager>(KEYBOARD_MANAGER_KEY);

  let canvasEl: HTMLCanvasElement;
  let canvasContainer: HTMLDivElement;
  let fabricCanvas: Canvas | null = null;
  let currentImageObject: FabricImage | null = null;
  let isInitialized = false;

  // 줌 범위 설정
  const MIN_ZOOM = 0.1;
  const MAX_ZOOM = 5.0;
  const ZOOM_STEP = 0.1;

  // 패닝 상태
  let isPanning = false;
  let panStartX = 0;
  let panStartY = 0;
  let imgStartLeft = 0;
  let imgStartTop = 0;

  // 드로잉 박스 상태
  let drawingBox: Rect | null = null;

  // 현재 로딩 요청 중인 이미지 ID (중복/선점 취소 패턴)
  let loadingImageId: string | null = null;

  interface CanvasLabelObjects {
    rect: LabelBoxRect;
    badge: LabelBadgeObjects;
  }

  // 라벨 박스 맵 (labelId -> render objects)
  let labelBoxes = new Map<string, CanvasLabelObjects>();

  function clearCanvasOverlays(): void {
    if (!fabricCanvas) return;

    if (drawingBox) {
      fabricCanvas.remove(drawingBox);
      drawingBox = null;
    }

    labelBoxes.forEach((objects) => {
      fabricCanvas.remove(objects.rect);
      fabricCanvas.remove(objects.badge.background);
      fabricCanvas.remove(objects.badge.text);
    });
    labelBoxes.clear();
  }

  function clearCurrentImage(): void {
    if (!fabricCanvas || !currentImageObject) return;

    fabricCanvas.remove(currentImageObject);
    currentImageObject = null;
  }

  /**
   * 이미지의 화면상 좌상단 좌표 계산
   */
  function getImageOffset(): { x: number; y: number } {
    if (!currentImageObject) {
      return { x: 0, y: 0 };
    }

    const imgWidth = currentImageObject.width || 1;
    const imgHeight = currentImageObject.height || 1;
    const scale = currentImageObject.scaleX || 1;
    const imgCenterX = currentImageObject.left || 0;
    const imgCenterY = currentImageObject.top || 0;

    // origin이 center이므로 좌상단 좌표 계산
    const imgLeft = imgCenterX - (imgWidth * scale) / 2;
    const imgTop = imgCenterY - (imgHeight * scale) / 2;

    return { x: imgLeft, y: imgTop };
  }

  /**
   * 스크린 좌표를 원본 이미지 픽셀 좌표로 변환
   */
  function screenToImagePixel(screenX: number, screenY: number): { x: number; y: number } {
    if (!currentImageObject) {
      return { x: 0, y: 0 };
    }

    const imgWidth = currentImageObject.width || 1;
    const imgHeight = currentImageObject.height || 1;
    const scale = currentImageObject.scaleX || 1;
    const imgCenterX = currentImageObject.left || 0;
    const imgCenterY = currentImageObject.top || 0;

    // 이미지 좌상단 좌표 계산 (origin이 center이므로)
    const imgLeft = imgCenterX - (imgWidth * scale) / 2;
    const imgTop = imgCenterY - (imgHeight * scale) / 2;

    // 스크린 좌표를 원본 픽셀 좌표로 변환
    const imageX = Math.round((screenX - imgLeft) / scale);
    const imageY = Math.round((screenY - imgTop) / scale);

    return { x: imageX, y: imageY };
  }

  /**
   * 도구에 따른 마우스 다운 핸들러
   */
  function handleMouseDown(opt: any): void {
    if (!fabricCanvas || !currentImageObject) return;

    // Fabric.js v7: scenePoint를 사용하여 캔버스 좌표 가져오기
    const pointer = opt.scenePoint || { x: 0, y: 0 };
    const imageCoords = screenToImagePixel(pointer.x, pointer.y);

    console.log(`Mouse down at canvas (${pointer.x.toFixed(1)}, ${pointer.y.toFixed(1)}) -> image (${imageCoords.x}, ${imageCoords.y})`);

    // 현재 선택된 객체가 있는지 확인 (박스 수정 중인지 체크)
    const activeObject = fabricCanvas.getActiveObject();
    const isModifyingBox = activeObject && (activeObject as any).data?.type === 'label';

    switch (toolManager.currentTool) {
      case 'select':
        // select 도구에서도 패닝 동작 (기본 동작)
        // 하지만 박스가 선택되어 있으면 패닝하지 않음 (박스 이동/크기조절 허용)
        if (!activeObject) {
          isPanning = true;
          panStartX = pointer.x;
          panStartY = pointer.y;
          imgStartLeft = currentImageObject.left || 0;
          imgStartTop = currentImageObject.top || 0;
          fabricCanvas.defaultCursor = 'grabbing';
          fabricCanvas.hoverCursor = 'grabbing';
        }
        break;
      
      case 'box':
        // 박스 수정 중이면 새 박스 생성 방지
        if (isModifyingBox) {
          console.log('Box modification in progress, skipping new box creation');
          return;
        }
        // 박스 그리기 시작
        toolManager.startDrawing(imageCoords);
        console.log('Box tool: 드로잉 시작', imageCoords);
        break;
      
      case 'pan':
        // 패닝 시작
        isPanning = true;
        panStartX = pointer.x;
        panStartY = pointer.y;
        imgStartLeft = currentImageObject.left || 0;
        imgStartTop = currentImageObject.top || 0;
        fabricCanvas.defaultCursor = 'grabbing';
        fabricCanvas.hoverCursor = 'grabbing';
        break;
    }
  }

  /**
   * 마우스 이동 핸들러
   */
  function handleMouseMove(opt: any): void {
    if (!fabricCanvas || !currentImageObject) return;

    // Fabric.js v7: scenePoint를 사용하여 캔버스 좌표 가져오기
    const pointer = opt.scenePoint || { x: 0, y: 0 };
    const imageCoords = screenToImagePixel(pointer.x, pointer.y);

    // 현재 마우스 위치 업데이트 (toolManager에 저장 - Footer에서 사용)
    toolManager.updateMousePosition(imageCoords.x, imageCoords.y);

    // 패닝 중이면 이미지 이동
    if (isPanning) {
      const deltaX = pointer.x - panStartX;
      const deltaY = pointer.y - panStartY;
      
      currentImageObject.set({
        left: imgStartLeft + deltaX,
        top: imgStartTop + deltaY,
      });
      
      updateViewportState();
      updateAllBoxPositions();
      fabricCanvas.requestRenderAll();
      return;
    }

    // 드로잉 중이면 좌표 업데이트 및 박스 렌더링
    if (toolManager.isDrawing) {
      toolManager.updateDrawing(imageCoords);
      updateDrawingBox();
    }
  }

  /**
   * 마우스 업 핸들러
   */
  function handleMouseUp(): void {
    if (!fabricCanvas || !currentImageObject) return;

    // 패닝 종료
    if (isPanning) {
      isPanning = false;
      // pan 도구일 때 커서 복원
      if (toolManager.currentTool === 'pan') {
        fabricCanvas.defaultCursor = 'grab';
        fabricCanvas.hoverCursor = 'grab';
      } else {
        fabricCanvas.defaultCursor = 'default';
        fabricCanvas.hoverCursor = 'default';
      }
      return;
    }

    if (toolManager.isDrawing) {
      const result = toolManager.endDrawing();
      console.log('Drawing ended:', result);
      
      // 박스 생성 완료
      if (result.start && result.end && toolManager.currentTool === 'box') {
        createLabelFromDrawing(result.start, result.end);
      }
      
      // 드로잉 박스 제거
      removeDrawingBox();
    }
  }

  /**
   * 드로잉 박스 업데이트
   */
  function updateDrawingBox(): void {
    if (!fabricCanvas || !toolManager.drawingStart || !toolManager.drawingCurrent) return;

    const scale = currentImageObject?.scaleX || 1;
    const offset = getImageOffset();

    // 기존 드로잉 박스 제거
    if (drawingBox) {
      fabricCanvas.remove(drawingBox);
    }

    // 새 드로잉 박스 생성
    drawingBox = createDrawingBox(
      toolManager.drawingStart,
      toolManager.drawingCurrent,
      scale,
      offset.x,
      offset.y,
      workspaceManager.selectedClassId
    );

    fabricCanvas.add(drawingBox);
    fabricCanvas.requestRenderAll();
  }

  /**
   * 드로잉 박스 제거
   */
  function removeDrawingBox(): void {
    if (drawingBox && fabricCanvas) {
      fabricCanvas.remove(drawingBox);
      drawingBox = null;
      fabricCanvas.requestRenderAll();
    }
  }

  /**
   * 드로잉 완료 후 라벨 생성
   */
  function createLabelFromDrawing(
    start: { x: number; y: number },
    end: { x: number; y: number }
  ): void {
    // 최소 크기 체크 (3픽셀 이상)
    const width = Math.abs(end.x - start.x);
    const height = Math.abs(end.y - start.y);
    if (width < 3 || height < 3) {
      console.log('Box too small, ignoring');
      return;
    }

    // bbox 정규화
    const bbox = normalizeBbox(start.x, start.y, end.x, end.y);

    // 고유 ID 생성
    const id = `label-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    if (workspaceManager.isOBBMode) {
      const annotation: OBBAnnotation = {
        id,
        class_id: workspaceManager.selectedClassId,
        obb: bboxToObb(bbox),
      };

      workspaceManager.addOBBAnnotation(annotation);
      console.log('OBB label created:', annotation);
      return;
    }

    const annotation: BBAnnotation = {
      id,
      class_id: workspaceManager.selectedClassId,
      bbox,
    };

    workspaceManager.addBBAnnotation(annotation);

    console.log('Label created:', annotation);
  }

  /**
   * 캔버스에 라벨 박스 추가
   */
  function addBoxToCanvas(annotation: BBAnnotation | OBBAnnotation): void {
    if (!fabricCanvas || !currentImageObject) return;

    const existingObjects = labelBoxes.get(annotation.id);
    if (existingObjects) {
      fabricCanvas.remove(existingObjects.rect);
      fabricCanvas.remove(existingObjects.badge.background);
      fabricCanvas.remove(existingObjects.badge.text);
      labelBoxes.delete(annotation.id);
    }

    const scale = currentImageObject.scaleX || 1;
    const offset = getImageOffset();

    const className = workspaceManager.workspaceConfig?.names?.[annotation.class_id] ?? `Class ${annotation.class_id}`;
    const rect = 'bbox' in annotation
      ? createLabelBox(annotation, scale, offset.x, offset.y)
      : createOBBLabelBox(annotation, scale, offset.x, offset.y);
    const badge = createLabelBadge(annotation, className, scale, offset.x, offset.y);
    
    // 선택 이벤트 핸들러
    rect.on('selected', () => {
      // pan 모드에서는 박스 선택을 즉시 취소
      if (toolManager.currentTool === 'pan') {
        fabricCanvas?.discardActiveObject();
        fabricCanvas?.requestRenderAll();
        return;
      }
      workspaceManager.setSelectedLabelId(annotation.id);
      setBoxSelectedStyle(rect, true);
      fabricCanvas?.requestRenderAll();
    });

    rect.on('deselected', () => {
      if (workspaceManager.selectedLabelId === annotation.id) {
        workspaceManager.setSelectedLabelId(null);
      }
      setBoxSelectedStyle(rect, false);
      fabricCanvas?.requestRenderAll();
    });

    // 수정 이벤트 핸들러 (이동/리사이즈 완료 시)
    rect.on('modified', () => {
      if (!currentImageObject) return;
      const scale = currentImageObject.scaleX || 1;
      const offset = getImageOffset();

      // rect의 현재 스크린 좌표 → 이미지 픽셀 좌표로 역변환
      if ('obb' in annotation) {
        const newObb = screenToObb(rect, scale, offset.x, offset.y);
        workspaceManager.updateOBBAnnotation(annotation.id, newObb);
        normalizeObbRectAfterModify(rect, newObb, scale, offset.x, offset.y);
      } else {
        const newBbox = screenToImage(
          {
            left: rect.left,
            top: rect.top,
            width: rect.getScaledWidth(),
            height: rect.getScaledHeight(),
          },
          scale,
          offset.x,
          offset.y
        );

        workspaceManager.updateBBAnnotation(annotation.id, newBbox);
      }

      // 뱃지 위치도 rect에 맞춰 동기화
      const objects = labelBoxes.get(annotation.id);
      if (objects) {
        if ('obb' in annotation) {
          const updated = workspaceManager.getOBBAnnotationById(annotation.id);
          if (updated) {
            updateLabelBadgePosition(objects.badge, updated.obb, scale, offset.x, offset.y);
          }
        } else {
          const updated = workspaceManager.getBBAnnotationById(annotation.id);
          if (updated) {
            updateLabelBadgePosition(objects.badge, updated.bbox, scale, offset.x, offset.y);
          }
        }
      }
      rect.setCoords();
      fabricCanvas?.requestRenderAll();
      console.log('Box modified:', annotation.id);
    });

    if (workspaceManager.selectedLabelId === annotation.id) {
      setBoxSelectedStyle(rect, true);
    }

    fabricCanvas.add(badge.background);
    fabricCanvas.add(badge.text);
    fabricCanvas.add(rect);
    fabricCanvas.bringObjectToFront(rect);
    labelBoxes.set(annotation.id, { rect, badge });

    // 현재 도구에 맞는 커서를 신규 박스에도 즉시 적용
    const currentTool = toolManager.currentTool;
    if (currentTool === 'box') {
      rect.hoverCursor = 'crosshair';
      rect.moveCursor = 'crosshair';
    } else if (currentTool === 'pan') {
      rect.hoverCursor = 'grab';
      rect.moveCursor = 'grab';
    } else {
      rect.hoverCursor = 'move';
      rect.moveCursor = 'move';
    }

    fabricCanvas.requestRenderAll();
  }

  /**
   * 캔버스에서 라벨 박스 제거
   */
  function removeBoxFromCanvas(labelId: string): void {
    if (!fabricCanvas) return;

    const objects = labelBoxes.get(labelId);
    if (objects) {
      fabricCanvas.remove(objects.rect);
      fabricCanvas.remove(objects.badge.background);
      fabricCanvas.remove(objects.badge.text);
      labelBoxes.delete(labelId);
      fabricCanvas.requestRenderAll();
    }
  }

  /**
   * 모든 라벨 박스 위치 업데이트 (줌/패닝 후)
   */
  function updateAllBoxPositions(): void {
    if (!fabricCanvas || !currentImageObject) return;

    const scale = currentImageObject.scaleX || 1;
    const offset = getImageOffset();

    labelBoxes.forEach((objects, labelId) => {
      const bbAnnotation = workspaceManager.getBBAnnotationById(labelId);
      const obbAnnotation = workspaceManager.getOBBAnnotationById(labelId);
      const annotation = bbAnnotation ?? obbAnnotation;

      if (annotation) {
        const coords = 'bbox' in annotation ? annotation.bbox : annotation.obb;
        updateBoxPosition(objects.rect, coords, scale, offset.x, offset.y);
        updateLabelBadgePosition(objects.badge, coords, scale, offset.x, offset.y);
      }
    });

    fabricCanvas.requestRenderAll();
  }

  /**
   * 저장된 라벨들을 캔버스에 렌더링
   */
  function renderLabels(): void {
    if (!fabricCanvas) return;

    clearCanvasOverlays();

    // 현재 라벨 데이터에서 BBAnnotation만 렌더링
    const labelData = workspaceManager.currentLabelData;
    if (!labelData || !labelData.annotations) return;

    labelData.annotations.forEach((ann) => {
      // bbox가 있는 경우만 BB로 처리
      if ('bbox' in ann || 'obb' in ann) {
        addBoxToCanvas(ann as BBAnnotation | OBBAnnotation);
      }
    });
  }

  // 캔버스 초기화
  async function initCanvas(): Promise<void> {
    if (!canvasEl || !canvasContainer) {
      console.error("Canvas element or container not found");
      return;
    }

    // 컨테이너 크기 가져오기
    const width = canvasContainer.clientWidth;
    const height = canvasContainer.clientHeight;

    console.log("Initializing canvas with dimensions:", width, height);

    fabricCanvas = new Canvas(canvasEl, {
      backgroundColor: "#2a2a2a",
      selection: false,  // 드래그 선택 박스 비활성화
    });

    fabricCanvas.setDimensions({ width, height });
    workspaceManager.setCanvasSize(width, height);

    // 마우스 이벤트 등록
    fabricCanvas.on("mouse:wheel", handleMouseWheel);
    fabricCanvas.on("mouse:down", handleMouseDown);
    fabricCanvas.on("mouse:move", handleMouseMove);
    fabricCanvas.on("mouse:up", handleMouseUp);

    // 객체 선택 이벤트 (빈 영역 클릭 시 선택 해제)
    fabricCanvas.on("selection:cleared", () => {
      workspaceManager.setSelectedLabelId(null);
    });

    isInitialized = true;
    console.log("Canvas initialized successfully");
  }

  // 캔버스 크기 조절
  function resizeCanvas(): void {
    if (!fabricCanvas || !canvasContainer) return;

    const width = canvasContainer.clientWidth;
    const height = canvasContainer.clientHeight;

    if (width === 0 || height === 0) return;

    console.log("Resizing canvas to:", width, height);

    fabricCanvas.setDimensions({ width, height });
    workspaceManager.setCanvasSize(width, height);

    // 이미지가 있으면 다시 맞춤
    if (currentImageObject) {
      fitImageToCanvas();
      updateAllBoxPositions();
      fabricCanvas.requestRenderAll();
    }
  }

  // 이미지 로드
  async function loadImage(): Promise<void> {
    if (!fabricCanvas) return;
    if (!workspaceManager.workspacePath || !workspaceManager.currentImage) return;

    // 이 로드 요청의 타겟 이미지 ID를 시작 시점에 캡처
    const targetId = workspaceManager.currentImage.id;

    // 이미 같은 이미지가 표시/로딩 중이면 스킵
    if (targetId === loadingImageId && currentImageObject) return;

    // 이 요청을 최신 로드로 등록 (이전 진행 중인 로드를 선점)
    loadingImageId = targetId;

    try {
      clearCanvasOverlays();
      clearCurrentImage();

      // 이미지 경로 가져오기 (비동기)
      const imagePath = await window.api.label.getImagePath(
        workspaceManager.workspacePath!,
        targetId
      );

      // await 이후: 더 최신 로드 요청이 선점했으면 폐기
      if (loadingImageId !== targetId || !fabricCanvas) return;

      if (!imagePath) {
        console.error("이미지 경로를 찾을 수 없습니다.");
        return;
      }

      const imageUrl = window.api.utils.getWorkspaceImageUrl(imagePath);

      // 이미지 로드 (비동기)
      const img = await FabricImage.fromURL(imageUrl, { crossOrigin: "anonymous" });

      // await 이후: 더 최신 로드 요청이 선점했으면 폐기
      if (loadingImageId !== targetId || !fabricCanvas) {
        return;
      }

      clearCurrentImage();

      currentImageObject = img;
      workspaceManager.setImageSize(img.width || 0, img.height || 0);

      img.set({
        selectable: false,
        evented: false,
        originX: 'center',
        originY: 'center',
      });

      fabricCanvas.add(img);
      fitImageToCanvas();
      renderLabels();
      fabricCanvas.requestRenderAll();

      console.log("Image loaded:", targetId);
    } catch (error) {
      console.error("이미지 로드 실패:", error);
    }
  }

  // 이미지를 캔버스에 맞게 조절
  function fitImageToCanvas(): void {
    if (!fabricCanvas || !currentImageObject) return;

    const canvasWidth = fabricCanvas.width || 1;
    const canvasHeight = fabricCanvas.height || 1;
    const imgWidth = currentImageObject.width || 1;
    const imgHeight = currentImageObject.height || 1;

    console.log("Fitting image - canvas:", canvasWidth, canvasHeight, "image:", imgWidth, imgHeight);

    // 이미지가 캔버스에 꽉 차도록 스케일 계산 (여백 5%)
    const scaleX = (canvasWidth * 0.95) / imgWidth;
    const scaleY = (canvasHeight * 0.95) / imgHeight;
    const scale = Math.min(scaleX, scaleY);

    console.log("Calculated scale:", scale);

    // 이미지 스케일 및 중앙 위치 적용
    // originX, originY가 'center'이므로 left, top은 이미지 중앙 좌표
    currentImageObject.set({
      scaleX: scale,
      scaleY: scale,
      left: canvasWidth / 2,
      top: canvasHeight / 2,
    });

    // 줌 레벨 설정
    workspaceManager.setZoomLevel(scale);
    
    // 뷰포트 상태 업데이트
    updateViewportState();
  }

  // 마우스 휠 핸들러 (Ctrl + 휠로 줌)
  function handleMouseWheel(event: { e: WheelEvent }): void {
    if (!fabricCanvas) return;

    const e = event.e;

    // Ctrl 키가 눌려있을 때만 줌 동작
    if (!e.ctrlKey) return;

    e.preventDefault();

    const delta = e.deltaY;
    let newZoom = workspaceManager.zoomLevel;

    if (delta < 0) {
      // 위로 스크롤 = 확대
      newZoom = Math.min(MAX_ZOOM, newZoom + ZOOM_STEP);
    } else {
      // 아래로 스크롤 = 축소
      newZoom = Math.max(MIN_ZOOM, newZoom - ZOOM_STEP);
    }

    console.log("Zoom:", newZoom);
    applyZoom(newZoom);
  }

  // 줌 적용
  function applyZoom(newZoom: number): void {
    if (!fabricCanvas || !currentImageObject) return;

    const canvasWidth = fabricCanvas.width || 1;
    const canvasHeight = fabricCanvas.height || 1;
    const oldZoom = currentImageObject.scaleX || 1;
    const oldLeft = currentImageObject.left ?? canvasWidth / 2;
    const oldTop = currentImageObject.top ?? canvasHeight / 2;

    // 패닝 오프셋을 스케일 비율에 맞게 보정 (화면 중심 기준)
    const ratio = newZoom / oldZoom;
    const newLeft = canvasWidth / 2 + (oldLeft - canvasWidth / 2) * ratio;
    const newTop = canvasHeight / 2 + (oldTop - canvasHeight / 2) * ratio;

    workspaceManager.setZoomLevel(newZoom);

    currentImageObject.set({
      scaleX: newZoom,
      scaleY: newZoom,
      left: newLeft,
      top: newTop,
    });

    updateViewportState();
    updateAllBoxPositions();
    fabricCanvas.requestRenderAll();
  }

  // 뷰포트 상태 업데이트
  function updateViewportState(): void {
    if (!currentImageObject || !fabricCanvas) return;

    const imgWidth = currentImageObject.width || 0;
    const imgHeight = currentImageObject.height || 0;
    const scale = currentImageObject.scaleX || 1;

    // 이미지 중심 기준으로 뷰포트 계산
    // originX, originY가 center이므로 left, top은 이미지 중심
    const imgCenterX = currentImageObject.left || 0;
    const imgCenterY = currentImageObject.top || 0;

    // 이미지 좌상단 좌표 (미니맵에서 사용)
    const imgLeft = imgCenterX - (imgWidth * scale) / 2;
    const imgTop = imgCenterY - (imgHeight * scale) / 2;

    workspaceManager.setViewport(imgLeft, imgTop);
  }

  // 리사이즈 옵저버
  let resizeObserver: ResizeObserver | null = null;

  // 키보드 핸들러 클린업 함수들
  let cleanupHandlers: (() => void)[] = [];

  /**
   * 도구 변경 시 커서 업데이트 (캔버스 + 모든 라벨 박스)
   */
  function updateCursor(): void {
    if (!fabricCanvas) return;

    let canvasCursor: string;
    let boxHoverCursor: string;
    let boxMoveCursor: string;

    switch (toolManager.currentTool) {
      case 'pan':
        canvasCursor = 'grab';
        boxHoverCursor = 'grab';
        boxMoveCursor = 'grab';
        break;
      case 'box':
        canvasCursor = 'crosshair';
        boxHoverCursor = 'crosshair';
        boxMoveCursor = 'crosshair';
        break;
      default:
        canvasCursor = 'default';
        boxHoverCursor = 'move';
        boxMoveCursor = 'move';
    }

    fabricCanvas.defaultCursor = canvasCursor;
    fabricCanvas.hoverCursor = canvasCursor;

    // 모든 라벨 박스의 커서도 동기화
    labelBoxes.forEach(({ rect }) => {
      rect.hoverCursor = boxHoverCursor;
      rect.moveCursor = boxMoveCursor;
    });
  }

  function selectAdjacentClass(direction: -1 | 1): void {
    const classes = workspaceManager.classList;
    if (classes.length === 0) return;

    const currentIndex = classes.findIndex((cls) => cls.id === workspaceManager.selectedClassId);
    const safeIndex = currentIndex >= 0 ? currentIndex : 0;
    const nextIndex = (safeIndex + direction + classes.length) % classes.length;

    workspaceManager.setSelectedClassId(classes[nextIndex].id);
  }

  // 현재 이미지 변경 감지
  $effect(() => {
    if (workspaceManager.currentImage && fabricCanvas && isInitialized) {
      loadImage();
    }
  });

  // 도구 변경 시 커서 업데이트
  $effect(() => {
    if (fabricCanvas && isInitialized) {
      updateCursor();
    }
  });

  // 라벨 데이터 변경 감지 (삭제 등)
  $effect(() => {
    const currentLabels = workspaceManager.currentLabels;
    if (!fabricCanvas || !isInitialized) return;
    if (!currentImageObject) return;

    // 현재 캔버스에 있는 라벨 ID 집합 (스냅샷)
    const canvasLabelIds = new Set(labelBoxes.keys());

    // 새로운 라벨 ID 집합
    const newLabelIds = new Set(currentLabels.map(l => l.id));

    // 삭제된 라벨 제거
    canvasLabelIds.forEach(id => {
      if (!newLabelIds.has(id)) {
        removeBoxFromCanvas(id);
      }
    });

    const labelData = workspaceManager.currentLabelData;
    if (!labelData?.annotations) return;

    const scale = currentImageObject.scaleX || 1;
    const offset = getImageOffset();

    // 추가/갱신 동기화
    labelData.annotations.forEach((ann) => {
      if (!('bbox' in ann) && !('obb' in ann)) return;

      const annotation = ann as BBAnnotation | OBBAnnotation;
      const existingObjects = labelBoxes.get(annotation.id);

      if (!existingObjects) {
        addBoxToCanvas(annotation);
        return;
      }

      const coords = 'bbox' in annotation ? annotation.bbox : annotation.obb;
      updateBoxPosition(existingObjects.rect, coords, scale, offset.x, offset.y);
      updateLabelBadgePosition(existingObjects.badge, coords, scale, offset.x, offset.y);
      setBoxSelectedStyle(existingObjects.rect, workspaceManager.selectedLabelId === annotation.id);
      existingObjects.rect.setCoords();
    });

    fabricCanvas.requestRenderAll();
  });

  onMount(async () => {
    console.log("CanvasArea mounted");
    await tick();
    await initCanvas();
    
    // ResizeObserver로 컨테이너 크기 변화 감지
    if (canvasContainer) {
      resizeObserver = new ResizeObserver(() => {
        resizeCanvas();
      });
      resizeObserver.observe(canvasContainer);
    }

    // 키보드 단축키 핸들러 등록
    // C 키: 이미지 중앙 정렬
    cleanupHandlers.push(
      keyboardManager.onAction('center-image', () => {
        if (currentImageObject && fabricCanvas) {
          fitImageToCanvas();
          updateAllBoxPositions();
          fabricCanvas.requestRenderAll();
          console.log('Image centered');
        }
      })
    );

    // P 키: 패닝 도구 선택
    cleanupHandlers.push(
      keyboardManager.onAction('pan-tool', () => {
        toolManager.setTool('pan');
        console.log('Pan tool selected');
      })
    );

    cleanupHandlers.push(
      keyboardManager.onAction('prev-class', () => {
        selectAdjacentClass(-1);
        console.log('Previous class selected:', workspaceManager.selectedClassId);
      })
    );

    cleanupHandlers.push(
      keyboardManager.onAction('next-class', () => {
        selectAdjacentClass(1);
        console.log('Next class selected:', workspaceManager.selectedClassId);
      })
    );

    // Delete 키: 선택된 라벨 삭제
    cleanupHandlers.push(
      keyboardManager.onAction('delete', () => {
        const selectedId = workspaceManager.selectedLabelId;
        if (selectedId) {
          workspaceManager.deleteLabel(selectedId);
          console.log('Label deleted:', selectedId);
        }
      })
    );

    cleanupHandlers.push(
      keyboardManager.onAction('undo', () => {
        workspaceManager.undo();
        console.log('Undo applied');
      })
    );

    cleanupHandlers.push(
      keyboardManager.onAction('redo', () => {
        workspaceManager.redo();
        console.log('Redo applied');
      })
    );

    // 워크스페이스가 열려있으면 이미지 로드
    if (workspaceManager.currentImage) {
      await loadImage();
    }
  });

  onDestroy(() => {
    console.log("CanvasArea destroyed");
    
    // 키보드 핸들러 클린업
    cleanupHandlers.forEach(cleanup => cleanup());
    cleanupHandlers = [];
    
    if (resizeObserver) {
      resizeObserver.disconnect();
    }
    if (fabricCanvas) {
      fabricCanvas.dispose();
      fabricCanvas = null;
    }
  });
</script>

<main
  class="flex-1 h-full bg-muted/20 relative overflow-hidden"
  role="img"
  aria-label="이미지 캔버스"
>
  <div bind:this={canvasContainer} class="absolute inset-0 w-full h-full">
    <canvas bind:this={canvasEl}></canvas>
  </div>

  {#if !workspaceManager.currentImage}
    <div class="absolute inset-0 flex items-center justify-center text-muted-foreground">
      <p>이미지를 선택해주세요</p>
    </div>
  {/if}
</main>