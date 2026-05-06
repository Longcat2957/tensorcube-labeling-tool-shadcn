/**
 * 라벨 JSON 스키마 마이그레이션
 *
 * 현재 지원 버전:
 *  - v1 (암묵적, version 필드 없음): { image_info, annotations }
 *  - v2: { version: 2, image_info, annotations, tags? }
 *
 * 읽기 시 v1 → v2로 자동 변환한다 (디스크 자체는 변경하지 않음 — 다음 저장 시점에 v2로 기록).
 * 저장 시 항상 v2를 강제한다.
 */

import { LABEL_SCHEMA_VERSION, type LabelData } from '../../shared/types.js'

export function migrateToV2(input: unknown): LabelData | null {
  if (!input || typeof input !== 'object') return null
  const o = input as Record<string, unknown>

  const image_info =
    o.image_info && typeof o.image_info === 'object'
      ? (o.image_info as { filename: string; width: number; height: number })
      : { filename: '', width: 0, height: 0 }

  const annotations = Array.isArray(o.annotations)
    ? (o.annotations as LabelData['annotations'])
    : []

  const tags =
    Array.isArray(o.tags) && (o.tags as unknown[]).every((t) => typeof t === 'string')
      ? (o.tags as string[])
      : []

  return {
    version: LABEL_SCHEMA_VERSION,
    image_info,
    annotations,
    tags
  }
}

/** 저장 직전 v2 정규화 — version/tags 보장. */
export function normalizeForSave(data: LabelData): LabelData {
  return {
    version: LABEL_SCHEMA_VERSION,
    image_info: data.image_info,
    annotations: data.annotations ?? [],
    tags: data.tags ?? []
  }
}
