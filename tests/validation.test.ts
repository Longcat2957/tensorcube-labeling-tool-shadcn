import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm, writeFile, mkdir } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { runValidation } from '../src/main/services/validation'

let workspaceDir: string

beforeEach(async () => {
  workspaceDir = await mkdtemp(join(tmpdir(), 'ws-validate-'))
  await mkdir(join(workspaceDir, 'label'), { recursive: true })
})

afterEach(async () => {
  await rm(workspaceDir, { recursive: true, force: true })
})

async function writeLabel(name: string, body: unknown): Promise<void> {
  await writeFile(join(workspaceDir, 'label', name), JSON.stringify(body), 'utf-8')
}

describe('runValidation', () => {
  it('규칙이 모두 비활성이면 위반 0', async () => {
    await writeLabel('000000001.json', {
      image_info: { filename: '1.jpg', width: 100, height: 100 },
      annotations: [{ id: 'a', class_id: 0, bbox: [10, 10, 20, 20] }]
    })
    const r = await runValidation(workspaceDir, {})
    expect(r.violations).toEqual([])
    expect(r.scanned.images).toBe(1)
    expect(r.scanned.annotations).toBe(1)
  })

  it('minBoxArea 위반 탐지', async () => {
    await writeLabel('000000001.json', {
      image_info: { filename: '1.jpg', width: 100, height: 100 },
      annotations: [
        { id: 'a', class_id: 0, bbox: [10, 10, 12, 12] }, // 면적 4
        { id: 'b', class_id: 0, bbox: [20, 20, 50, 50] } // 면적 900
      ]
    })
    const r = await runValidation(workspaceDir, { minBoxArea: 100 })
    expect(r.violations.filter((v) => v.kind === 'tooSmall')).toHaveLength(1)
  })

  it('minBoxSide 위반', async () => {
    await writeLabel('000000001.json', {
      image_info: { filename: '1.jpg', width: 100, height: 100 },
      annotations: [{ id: 'a', class_id: 0, bbox: [10, 10, 100, 13] }] // h=3
    })
    const r = await runValidation(workspaceDir, { minBoxSide: 5 })
    expect(r.violations.find((v) => v.kind === 'tooThin')).toBeDefined()
  })

  it('outOfBounds 탐지', async () => {
    await writeLabel('000000001.json', {
      image_info: { filename: '1.jpg', width: 100, height: 100 },
      annotations: [
        { id: 'a', class_id: 0, bbox: [-5, 0, 50, 50] },
        { id: 'b', class_id: 0, bbox: [10, 10, 50, 50] }
      ]
    })
    const r = await runValidation(workspaceDir, { allowOutOfBounds: false })
    expect(r.violations.filter((v) => v.kind === 'outOfBounds')).toHaveLength(1)
  })

  it('중복 박스 IoU 임계 위반', async () => {
    await writeLabel('000000001.json', {
      image_info: { filename: '1.jpg', width: 100, height: 100 },
      annotations: [
        { id: 'a', class_id: 0, bbox: [10, 10, 50, 50] },
        { id: 'b', class_id: 0, bbox: [10, 10, 50, 50] }, // 완전 중복
        { id: 'c', class_id: 1, bbox: [10, 10, 50, 50] } // 다른 클래스
      ]
    })
    const r = await runValidation(workspaceDir, { duplicateIou: 0.9 })
    expect(r.violations.filter((v) => v.kind === 'duplicate')).toHaveLength(1)
  })

  it('minBoxesPerClass 위반', async () => {
    await writeLabel('000000001.json', {
      image_info: { filename: '1.jpg', width: 100, height: 100 },
      annotations: [
        { id: 'a', class_id: 0, bbox: [0, 0, 10, 10] },
        { id: 'b', class_id: 0, bbox: [0, 0, 10, 10] },
        { id: 'c', class_id: 1, bbox: [0, 0, 10, 10] }
      ]
    })
    const r = await runValidation(workspaceDir, { minBoxesPerClass: 5 })
    // class 0 (2개), class 1 (1개) — 둘 다 5 미만
    const under = r.violations.filter((v) => v.kind === 'classUnderMin')
    expect(under).toHaveLength(2)
  })

  it('OBB 어노테이션도 AABB로 평가', async () => {
    await writeLabel('000000001.json', {
      image_info: { filename: '1.jpg', width: 100, height: 100 },
      annotations: [{ id: 'a', class_id: 0, obb: [50, 50, 4, 4, 0] }] // 면적 16
    })
    const r = await runValidation(workspaceDir, { minBoxArea: 100 })
    expect(r.violations.some((v) => v.kind === 'tooSmall')).toBe(true)
  })
})
