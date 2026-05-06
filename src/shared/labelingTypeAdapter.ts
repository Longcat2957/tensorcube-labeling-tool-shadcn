/**
 * LabelingTypeAdapter 인터페이스
 *
 * 향후 Phase 14+에서 BB/OBB/Polygon/Keypoint 등 라벨링 모달리티 분기를
 * `isBBMode/isOBBMode` 식별자 비교로 흩뿌리는 대신, 어댑터 객체를
 * 통해 일관된 API로 다루기 위한 추상화.
 *
 * 본 단계(Phase 13a)에서는 인터페이스/타입만 정의한다.
 * 실제 BB/OBB 어댑터 구현체와 코드 마이그레이션은 Phase 14에서 수행한다.
 *
 * 모달리티 추가 비용을 줄이는 것이 목표이며, 인터페이스가 충분히
 * 일반적이지 않으면 Phase 14에서 추가/수정한다.
 */

import type { BBAnnotation, OBBAnnotation, LabelData } from './types.js'

export type LabelingTypeId = 1 | 2 | 3 | 4 // 1: BB, 2: OBB, 3: Polygon (예정), 4: Keypoint (예정)

/**
 * 어댑터가 다루는 어노테이션 형태. 추후 PolygonAnnotation / KeypointAnnotation 추가.
 */
export type AnyAnnotation = BBAnnotation | OBBAnnotation

/**
 * Export 어댑터: 어노테이션을 특정 포맷의 라인/오브젝트로 변환.
 */
export interface ExportAdapter<TLine = string> {
  /** YOLO/DOTA 등 한 줄 단위 포맷 변환 */
  serializeAnnotation: (ann: AnyAnnotation, imageWidth: number, imageHeight: number) => TLine | null
}

/**
 * 라벨링 모달리티 어댑터 - 캔버스/저장/내보내기 분기를 추상화.
 *
 * Phase 14에서 `bbAdapter`, `obbAdapter` 인스턴스가 추가된다.
 * 본 인터페이스는 추후 시그니처 조정 가능 (실험 단계).
 */
export interface LabelingTypeAdapter {
  readonly id: LabelingTypeId
  readonly displayName: string

  /** 새 어노테이션의 빈 형태 — UI에서 빈 어노테이션 prepop에 사용. */
  emptyAnnotation: () => Omit<AnyAnnotation, 'id' | 'class_id'>

  /** 어노테이션이 이 어댑터가 다루는 형식인지 검사. */
  matches: (ann: AnyAnnotation) => boolean

  /** 어노테이션을 axis-aligned bounding box로 환산 (통계/검증용). */
  toAabb: (ann: AnyAnnotation) => [xmin: number, ymin: number, xmax: number, ymax: number]
}

/**
 * 워크스페이스의 labeling_type → 어댑터 조회용 (Phase 14에서 구현 채움).
 * 현재는 placeholder — 실제 BB/OBB는 기존 isBBMode/isOBBMode를 그대로 사용한다.
 */
export const ADAPTER_REGISTRY: Partial<Record<LabelingTypeId, LabelingTypeAdapter>> = {}

/**
 * LabelData의 어노테이션이 모두 주어진 labeling_type에 부합하는지 검사 (헬퍼).
 * 무결성 검사 등에서 활용 가능.
 */
export function annotationsMatchType(data: LabelData, labelingType: LabelingTypeId): boolean {
  if (!data.annotations) return true
  for (const ann of data.annotations) {
    if (labelingType === 1 && !('bbox' in ann)) return false
    if (labelingType === 2 && !('obb' in ann)) return false
  }
  return true
}
