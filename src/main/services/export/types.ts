/**
 * Export 관련 타입 정의
 */

import type { BBAnnotation, OBBAnnotation } from '../../../shared/types.js'

// 내보내기 가능한 아이템
export interface ExportableItem {
  imageId: string
  imageFilename: string
  imagePath: string
  labelData: {
    image_info: {
      filename: string
      width: number
      height: number
    }
    annotations: (BBAnnotation | OBBAnnotation)[]
  }
  split: 'train' | 'val' | 'test'
}

// 스케일된 이미지 크기
export interface ScaledSize {
  width: number
  height: number
}

// 포맷 익스포터 인터페이스
export interface FormatExporter {
  name: string
  extension: string

  // 데이터셋 디렉토리 구조 생성
  prepareDirectories(basePath: string, splits: Set<string>): Promise<void>

  // 단일 아이템 처리
  processItem(
    item: ExportableItem,
    basePath: string,
    classes: Record<number, string>,
    resize?: { width: number; height: number }
  ): Promise<void>

  // 후처리 (COCO의 경우 annotations.json 생성 등)
  finalize?(
    items: ExportableItem[],
    basePath: string,
    classes: Record<number, string>
  ): Promise<void>
}

// 좌표 스케일링 결과
export interface ScaledBbox {
  x1: number
  y1: number
  x2: number
  y2: number
}

export interface ScaledObb {
  cx: number
  cy: number
  width: number
  height: number
  angle: number
}

// YOLO 라벨 라인
export interface YoloLabelLine {
  classId: number
  data: number[]
}

// COCO 포맷 구조
export interface CocoImage {
  id: number
  file_name: string
  width: number
  height: number
}

export interface CocoAnnotation {
  id: number
  image_id: number
  category_id: number
  bbox: [number, number, number, number] // [x, y, width, height]
  area: number
  iscrowd: 0
}

export interface CocoCategory {
  id: number
  name: string
}

export interface CocoDataset {
  images: CocoImage[]
  annotations: CocoAnnotation[]
  categories: CocoCategory[]
}
