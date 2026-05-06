import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm, writeFile, mkdir, readFile, readdir } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import sharp from 'sharp'
import { runValidation } from '../src/main/services/validation'
import { computeWorkspaceStats } from '../src/main/services/workspaceStats'
import { exportYoloSegDataset } from '../src/main/services/export/formats/yoloSeg'
import { exportCocoSegDataset } from '../src/main/services/export/formats/cocoSeg'
import { exportCocoKeypointsDataset } from '../src/main/services/export/formats/cocoKeypoints'
import type { ExportableItem } from '../src/main/services/export/types'

let workspaceDir: string

beforeEach(async () => {
  workspaceDir = await mkdtemp(join(tmpdir(), 'pk-'))
  await mkdir(join(workspaceDir, 'label'), { recursive: true })
})

afterEach(async () => {
  await rm(workspaceDir, { recursive: true, force: true })
})

async function writeLabel(name: string, body: unknown): Promise<void> {
  await writeFile(join(workspaceDir, 'label', name), JSON.stringify(body), 'utf-8')
}

async function makeImage(p: string, w = 100, h = 100): Promise<void> {
  const buf = await sharp({
    create: { width: w, height: h, channels: 3, background: { r: 50, g: 50, b: 50 } }
  })
    .jpeg()
    .toBuffer()
  await writeFile(p, buf)
}

describe('runValidation with polygon/keypoint', () => {
  it('Polygon AABB로 minBoxArea 평가', async () => {
    await writeLabel('000000001.json', {
      version: 2,
      image_info: { filename: '1.jpg', width: 100, height: 100 },
      annotations: [
        // 작은 polygon (10x10 AABB → 면적 100)
        {
          id: 'a',
          class_id: 0,
          polygon: [
            [10, 10],
            [20, 10],
            [20, 20],
            [10, 20]
          ]
        },
        // 큰 polygon (50x50)
        {
          id: 'b',
          class_id: 0,
          polygon: [
            [10, 10],
            [60, 10],
            [60, 60],
            [10, 60]
          ]
        }
      ]
    })
    const r = await runValidation(workspaceDir, { minBoxArea: 500 })
    const tooSmall = r.violations.filter((v) => v.kind === 'tooSmall')
    expect(tooSmall).toHaveLength(1)
    expect(tooSmall[0].annotationId).toBe('a')
  })

  it('Keypoint AABB(visible 점) 기반 평가', async () => {
    await writeLabel('000000001.json', {
      version: 2,
      image_info: { filename: '1.jpg', width: 100, height: 100 },
      annotations: [
        {
          id: 'k',
          class_id: 0,
          keypoints: [
            { x: 10, y: 10, v: 2 },
            { x: 50, y: 50, v: 2 },
            { x: 0, y: 0, v: 0 } // 무시되어야 함
          ]
        }
      ]
    })
    const r = await runValidation(workspaceDir, { allowOutOfBounds: false })
    expect(r.violations.filter((v) => v.kind === 'outOfBounds')).toHaveLength(0)
  })
})

describe('computeWorkspaceStats with polygon/keypoint', () => {
  it('Polygon은 AABB 면적으로 size histogram에 들어간다', async () => {
    await writeLabel('000000001.json', {
      version: 2,
      image_info: { filename: '1.jpg', width: 1000, height: 1000 },
      annotations: [
        {
          id: 'a',
          class_id: 0,
          polygon: [
            [0, 0],
            [100, 0],
            [100, 100],
            [0, 100]
          ]
        } // 100*100 = 10000 → '10k-100k'
      ]
    })
    const s = await computeWorkspaceStats(workspaceDir)
    const sizeCounts = Object.fromEntries(s.sizeHistogram.map((b) => [b.label, b.count]))
    expect(sizeCounts['10k-100k']).toBe(1)
    expect(s.totalAnnotations).toBe(1)
  })
})

describe('exportYoloSegDataset', () => {
  it('polygon을 정규화된 좌표로 출력', async () => {
    const exportDir = join(workspaceDir, 'export')
    const imgPath = join(workspaceDir, 'src.jpg')
    await makeImage(imgPath, 100, 100)

    const items: ExportableItem[] = [
      {
        imageId: '000000001',
        imageFilename: '000000001.jpg',
        imagePath: imgPath,
        labelData: {
          image_info: { filename: '000000001.jpg', width: 100, height: 100 },
          annotations: [
            {
              id: 'a',
              class_id: 1,
              polygon: [
                [25, 25],
                [75, 25],
                [50, 75]
              ]
            }
          ]
        },
        split: 'train'
      }
    ]
    const r = await exportYoloSegDataset(items, exportDir, { 1: 'tri' }, {})
    expect(r.exportedCount).toBe(1)

    const labelFiles = await readdir(join(exportDir, 'train', 'labels'))
    expect(labelFiles).toContain('000000001.txt')
    const content = await readFile(join(exportDir, 'train', 'labels', '000000001.txt'), 'utf-8')
    // class_id + 6개 정규화된 좌표
    const tokens = content.trim().split(/\s+/)
    expect(tokens[0]).toBe('1')
    expect(tokens.length).toBe(1 + 3 * 2)
    // 정규화 검증: 25/100 = 0.25
    expect(parseFloat(tokens[1])).toBeCloseTo(0.25, 3)
  })
})

describe('exportCocoSegDataset', () => {
  it('polygon → segmentation + bbox + area', async () => {
    const exportDir = join(workspaceDir, 'export')
    const imgPath = join(workspaceDir, 'src.jpg')
    await makeImage(imgPath, 100, 100)

    const items: ExportableItem[] = [
      {
        imageId: '000000001',
        imageFilename: '000000001.jpg',
        imagePath: imgPath,
        labelData: {
          image_info: { filename: '000000001.jpg', width: 100, height: 100 },
          annotations: [
            {
              id: 'a',
              class_id: 0,
              polygon: [
                [10, 10],
                [60, 10],
                [60, 60],
                [10, 60]
              ]
            }
          ]
        },
        split: 'train'
      }
    ]
    await exportCocoSegDataset(items, exportDir, { 0: 'sq' }, {})
    const json = JSON.parse(
      await readFile(join(exportDir, 'annotations', 'instances_train.json'), 'utf-8')
    )
    expect(json.annotations).toHaveLength(1)
    const a = json.annotations[0]
    expect(a.segmentation[0]).toHaveLength(8) // 4 points * 2
    expect(a.bbox[0]).toBeCloseTo(10, 1)
    expect(a.bbox[2]).toBeCloseTo(50, 1) // width
  })
})

describe('exportCocoKeypointsDataset', () => {
  it('keypoint 어노테이션 export + visible count', async () => {
    const exportDir = join(workspaceDir, 'export')
    const imgPath = join(workspaceDir, 'src.jpg')
    await makeImage(imgPath, 100, 100)

    const items: ExportableItem[] = [
      {
        imageId: '000000001',
        imageFilename: '000000001.jpg',
        imagePath: imgPath,
        labelData: {
          image_info: { filename: '000000001.jpg', width: 100, height: 100 },
          annotations: [
            {
              id: 'k',
              class_id: 0,
              keypoints: [
                { x: 10, y: 10, v: 2 },
                { x: 90, y: 90, v: 2 },
                { x: 0, y: 0, v: 0 }
              ]
            }
          ]
        },
        split: 'train'
      }
    ]
    await exportCocoKeypointsDataset(
      items,
      exportDir,
      { 0: 'person' },
      { names: ['nose', 'left_eye', 'right_eye'] },
      {}
    )
    const json = JSON.parse(
      await readFile(join(exportDir, 'annotations', 'keypoints_train.json'), 'utf-8')
    )
    expect(json.categories[0].keypoints).toEqual(['nose', 'left_eye', 'right_eye'])
    expect(json.annotations[0].num_keypoints).toBe(2)
    expect(json.annotations[0].keypoints).toHaveLength(9) // 3 keypoints * 3 (x,y,v)
  })
})
