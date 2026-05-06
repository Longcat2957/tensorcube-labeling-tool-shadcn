import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm, writeFile, mkdir } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { computeWorkspaceStats } from '../src/main/services/workspaceStats'

let workspaceDir: string

beforeEach(async () => {
  workspaceDir = await mkdtemp(join(tmpdir(), 'ws-stats-'))
  await mkdir(join(workspaceDir, 'label'), { recursive: true })
})

afterEach(async () => {
  await rm(workspaceDir, { recursive: true, force: true })
})

async function writeLabel(name: string, body: unknown): Promise<void> {
  await writeFile(join(workspaceDir, 'label', name), JSON.stringify(body), 'utf-8')
}

describe('computeWorkspaceStats', () => {
  it('빈 워크스페이스에서 totalImages=0', async () => {
    const s = await computeWorkspaceStats(workspaceDir)
    expect(s.totalImages).toBe(0)
    expect(s.totalAnnotations).toBe(0)
  })

  it('상태별 카운트와 클래스별 어노테이션 집계', async () => {
    await writeLabel('000000001.json', {
      image_info: { filename: '000000001.jpg', width: 100, height: 100 },
      annotations: [
        { id: 'a', class_id: 0, bbox: [0, 0, 10, 10] },
        { id: 'b', class_id: 1, bbox: [10, 10, 20, 20] }
      ]
    })
    await writeLabel('000000002_W.json', {
      image_info: { filename: '000000002.jpg', width: 100, height: 100 },
      annotations: [{ id: 'c', class_id: 0, bbox: [0, 0, 100, 50] }]
    })
    await writeLabel('000000003_C.json', {
      image_info: { filename: '000000003.jpg', width: 100, height: 100 },
      annotations: []
    })

    const s = await computeWorkspaceStats(workspaceDir)
    expect(s.totalImages).toBe(3)
    expect(s.status).toEqual({ none: 1, working: 1, completed: 1 })
    expect(s.totalAnnotations).toBe(3)
    expect(s.perClassCounts[0]).toBe(2)
    expect(s.perClassCounts[1]).toBe(1)
    expect(s.emptyImages).toBe(1)
    expect(s.boxCountById['000000001']).toBe(2)
    expect(s.boxCountById['000000003']).toBe(0)
    expect(s.classesById['000000001']).toEqual(expect.arrayContaining([0, 1]))
  })

  it('OBB 박스 면적/aspect 히스토그램', async () => {
    await writeLabel('000000001.json', {
      image_info: { filename: '000000001.jpg', width: 1000, height: 1000 },
      annotations: [
        // [cx, cy, w, h, angle] — 면적 50*50=2500 (1k-10k bin), aspect 1 (1-2)
        { id: 'a', class_id: 0, obb: [100, 100, 50, 50, 0] },
        // 면적 200*100=20000 (10k-100k), aspect 2 (2-4)
        { id: 'b', class_id: 0, obb: [500, 500, 200, 100, 0] }
      ]
    })

    const s = await computeWorkspaceStats(workspaceDir)
    const sizeCounts = Object.fromEntries(s.sizeHistogram.map((b) => [b.label, b.count]))
    expect(sizeCounts['1k-10k']).toBe(1)
    expect(sizeCounts['10k-100k']).toBe(1)

    const aspectCounts = Object.fromEntries(s.aspectHistogram.map((b) => [b.label, b.count]))
    expect(aspectCounts['1-2']).toBe(1)
    expect(aspectCounts['2-4']).toBe(1)
  })
})
