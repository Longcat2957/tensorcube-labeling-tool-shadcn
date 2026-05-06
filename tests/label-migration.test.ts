import { describe, it, expect } from 'vitest'
import { migrateToV2, normalizeForSave } from '../src/main/services/labelMigration'
import { annotationsMatchType } from '../src/shared/labelingTypeAdapter'
import type { LabelData } from '../src/shared/types'

describe('migrateToV2', () => {
  it('v1 (version 없음)을 v2로 변환', () => {
    const v1 = {
      image_info: { filename: 'a.jpg', width: 100, height: 80 },
      annotations: [{ id: '1', class_id: 0, bbox: [0, 0, 10, 10] }]
    }
    const v2 = migrateToV2(v1)
    expect(v2?.version).toBe(2)
    expect(v2?.image_info.filename).toBe('a.jpg')
    expect(v2?.annotations).toHaveLength(1)
    expect(v2?.tags).toEqual([])
  })

  it('이미 v2면 그대로 보존', () => {
    const v2In = {
      version: 2,
      image_info: { filename: 'b.jpg', width: 50, height: 50 },
      annotations: [],
      tags: ['kitchen', 'lowlight']
    }
    const v2 = migrateToV2(v2In)
    expect(v2?.tags).toEqual(['kitchen', 'lowlight'])
    expect(v2?.version).toBe(2)
  })

  it('null이나 비객체는 null 반환', () => {
    expect(migrateToV2(null)).toBeNull()
    expect(migrateToV2('string')).toBeNull()
    expect(migrateToV2(42)).toBeNull()
  })

  it('annotations가 배열이 아니면 빈 배열로 정규화', () => {
    const r = migrateToV2({
      image_info: { filename: 'c.jpg', width: 10, height: 10 },
      annotations: 'oops'
    })
    expect(r?.annotations).toEqual([])
  })

  it('tags가 잘못된 타입이면 빈 배열', () => {
    const r = migrateToV2({
      image_info: { filename: 'd.jpg', width: 10, height: 10 },
      annotations: [],
      tags: [1, 2, 'mixed']
    })
    expect(r?.tags).toEqual([])
  })
})

describe('normalizeForSave', () => {
  it('항상 version=2와 tags=[]를 채운다', () => {
    const data: LabelData = {
      image_info: { filename: 'x.jpg', width: 10, height: 10 },
      annotations: []
    }
    const out = normalizeForSave(data)
    expect(out.version).toBe(2)
    expect(out.tags).toEqual([])
  })

  it('기존 tags 보존', () => {
    const data: LabelData = {
      image_info: { filename: 'x.jpg', width: 10, height: 10 },
      annotations: [],
      tags: ['a', 'b']
    }
    expect(normalizeForSave(data).tags).toEqual(['a', 'b'])
  })
})

describe('annotationsMatchType', () => {
  it('BB 워크스페이스에 OBB 섞이면 false', () => {
    const data: LabelData = {
      image_info: { filename: 'x.jpg', width: 10, height: 10 },
      annotations: [
        { id: '1', class_id: 0, bbox: [0, 0, 10, 10] },
        { id: '2', class_id: 0, obb: [5, 5, 4, 4, 0] }
      ]
    }
    expect(annotationsMatchType(data, 1)).toBe(false)
    expect(annotationsMatchType(data, 2)).toBe(false)
  })

  it('빈 어노테이션은 모든 타입에 부합', () => {
    const data: LabelData = {
      image_info: { filename: 'x.jpg', width: 10, height: 10 },
      annotations: []
    }
    expect(annotationsMatchType(data, 1)).toBe(true)
    expect(annotationsMatchType(data, 2)).toBe(true)
  })
})
