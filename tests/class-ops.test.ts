import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm, writeFile, readFile, mkdir } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { scanClassUsage, reassignClass } from '../src/main/services/classOps'

let workspaceDir: string

async function writeLabel(
  name: string,
  annotations: Array<{ id: string; class_id: number; bbox: [number, number, number, number] }>
): Promise<void> {
  const data = {
    image_info: { filename: `${name.split('_')[0].split('.')[0]}.jpg`, width: 100, height: 100 },
    annotations
  }
  await writeFile(join(workspaceDir, 'label', name), JSON.stringify(data), 'utf-8')
}

beforeEach(async () => {
  workspaceDir = await mkdtemp(join(tmpdir(), 'ws-'))
  await mkdir(join(workspaceDir, 'label'), { recursive: true })
})

afterEach(async () => {
  await rm(workspaceDir, { recursive: true, force: true })
})

describe('scanClassUsage', () => {
  it('counts annotations per class_id across all label files', async () => {
    await writeLabel('000000001_C.json', [
      { id: 'a', class_id: 0, bbox: [0, 0, 10, 10] },
      { id: 'b', class_id: 1, bbox: [0, 0, 10, 10] }
    ])
    await writeLabel('000000002_W.json', [
      { id: 'c', class_id: 0, bbox: [0, 0, 10, 10] },
      { id: 'd', class_id: 2, bbox: [0, 0, 10, 10] }
    ])
    await writeLabel('000000003.json', [])

    const counts = await scanClassUsage(workspaceDir)
    expect(counts[0]).toBe(2)
    expect(counts[1]).toBe(1)
    expect(counts[2]).toBe(1)
  })

  it('returns empty map for missing label dir', async () => {
    await rm(join(workspaceDir, 'label'), { recursive: true })
    const counts = await scanClassUsage(workspaceDir)
    expect(counts).toEqual({})
  })
})

describe('reassignClass', () => {
  beforeEach(async () => {
    await writeLabel('000000001_C.json', [
      { id: 'a', class_id: 0, bbox: [0, 0, 10, 10] },
      { id: 'b', class_id: 1, bbox: [0, 0, 10, 10] },
      { id: 'c', class_id: 0, bbox: [0, 0, 10, 10] }
    ])
    await writeLabel('000000002_W.json', [
      { id: 'd', class_id: 0, bbox: [0, 0, 10, 10] },
      { id: 'e', class_id: 2, bbox: [0, 0, 10, 10] }
    ])
  })

  it('reassigns all class_id=0 to class_id=5', async () => {
    const result = await reassignClass(workspaceDir, 0, 5)
    expect(result.updatedAnnotations).toBe(3)
    expect(result.deletedAnnotations).toBe(0)
    expect(result.updatedFiles).toBe(2)

    const counts = await scanClassUsage(workspaceDir)
    expect(counts[0]).toBeUndefined()
    expect(counts[5]).toBe(3)
    expect(counts[1]).toBe(1)
    expect(counts[2]).toBe(1)
  })

  it('deletes all annotations of class_id=0 when target is null', async () => {
    const result = await reassignClass(workspaceDir, 0, null)
    expect(result.deletedAnnotations).toBe(3)
    expect(result.updatedAnnotations).toBe(0)

    const counts = await scanClassUsage(workspaceDir)
    expect(counts[0]).toBeUndefined()
    expect(counts[1]).toBe(1)
    expect(counts[2]).toBe(1)
  })

  it('does not touch files without matching class_id', async () => {
    const result = await reassignClass(workspaceDir, 99, 100)
    expect(result.updatedAnnotations).toBe(0)
    expect(result.updatedFiles).toBe(0)
  })

  it('preserves other fields in label file', async () => {
    await reassignClass(workspaceDir, 0, 5)
    const raw = await readFile(join(workspaceDir, 'label', '000000001_C.json'), 'utf-8')
    const parsed = JSON.parse(raw)
    expect(parsed.image_info).toBeDefined()
    expect(parsed.image_info.filename).toBe('000000001.jpg')
    expect(parsed.annotations).toHaveLength(3)
    expect(parsed.annotations.find((a: { id: string }) => a.id === 'b').class_id).toBe(1)
  })
})
