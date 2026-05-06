import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm, writeFile, mkdir, readdir, readFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import sharp from 'sharp'
import { runIntegrityCheck, autoFixIssues } from '../src/main/services/utilities/integrityCheck'

let workspaceDir: string

async function setupWorkspace(labelingType: 1 | 2 = 1): Promise<void> {
  workspaceDir = await mkdtemp(join(tmpdir(), 'ws-integrity-'))
  await mkdir(join(workspaceDir, 'src'), { recursive: true })
  await mkdir(join(workspaceDir, 'label'), { recursive: true })
  // workspace.yaml — 간단 파서가 읽도록 인용 부호 형식 사용
  const yaml =
    `workspace: 'test'\n` +
    `labeling_type: ${labelingType}\n` +
    `image_count: 0\n` +
    `created_at: '2026-01-01'\n` +
    `last_modified_at: '2026-01-01'\n`
  await writeFile(join(workspaceDir, 'workspace.yaml'), yaml, 'utf-8')
}

async function makeImage(id: string, ext = '.jpg'): Promise<void> {
  // 1x1 단색 이미지 — sharp로 실제 디코드 가능한 파일 생성
  const buf = await sharp({
    create: { width: 8, height: 8, channels: 3, background: { r: 0, g: 0, b: 0 } }
  })
    .jpeg()
    .toBuffer()
  await writeFile(join(workspaceDir, 'src', `${id}${ext}`), buf)
}

async function makeLabel(filename: string, content: unknown): Promise<void> {
  await writeFile(join(workspaceDir, 'label', filename), JSON.stringify(content), 'utf-8')
}

beforeEach(async () => {
  await setupWorkspace(1)
})

afterEach(async () => {
  await rm(workspaceDir, { recursive: true, force: true })
})

describe('runIntegrityCheck', () => {
  it('clean workspace에서는 issue가 없다', async () => {
    await makeImage('000000001')
    await makeLabel('000000001.json', {
      image_info: { filename: '000000001.jpg', width: 8, height: 8 },
      annotations: []
    })

    const report = await runIntegrityCheck(workspaceDir)
    expect(report.scanned.images).toBe(1)
    expect(report.scanned.labels).toBe(1)
    expect(report.issues).toEqual([])
  })

  it('orphanLabel과 missingLabel을 모두 탐지한다', async () => {
    await makeImage('000000001')
    await makeImage('000000002')
    await makeLabel('000000002.json', {
      image_info: { filename: '000000002.jpg', width: 8, height: 8 },
      annotations: []
    })
    await makeLabel('000000999.json', {
      image_info: { filename: '000000999.jpg', width: 8, height: 8 },
      annotations: []
    })

    const report = await runIntegrityCheck(workspaceDir)
    const kinds = report.issues.map((i) => i.kind).sort()
    expect(kinds).toContain('missingLabel')
    expect(kinds).toContain('orphanLabel')
    expect(report.issues.find((i) => i.kind === 'missingLabel')?.target).toBe('000000001')
    expect(report.issues.find((i) => i.kind === 'orphanLabel')?.target).toBe('000000999')
  })

  it('badIdPattern을 탐지한다', async () => {
    await writeFile(join(workspaceDir, 'src', 'bad_name.jpg'), 'fake', 'utf-8')
    const report = await runIntegrityCheck(workspaceDir)
    expect(report.issues.some((i) => i.kind === 'badIdPattern')).toBe(true)
  })

  it('annotations 배열 누락을 schemaViolation으로 탐지한다', async () => {
    await makeImage('000000001')
    await makeLabel('000000001.json', {
      image_info: { filename: '000000001.jpg', width: 8, height: 8 }
      // annotations 누락
    })

    const report = await runIntegrityCheck(workspaceDir)
    expect(report.issues.some((i) => i.kind === 'schemaViolation' && i.autoFixable)).toBe(true)
  })

  it('BB 워크스페이스에서 OBB 어노테이션은 schemaViolation', async () => {
    await makeImage('000000001')
    await makeLabel('000000001.json', {
      image_info: { filename: '000000001.jpg', width: 8, height: 8 },
      annotations: [{ id: 'a', class_id: 0, obb: [1, 1, 1, 1, 0] }]
    })

    const report = await runIntegrityCheck(workspaceDir)
    expect(report.issues.some((i) => i.kind === 'schemaViolation')).toBe(true)
  })
})

describe('autoFixIssues', () => {
  it('orphanLabel을 삭제한다', async () => {
    await makeImage('000000001')
    await makeLabel('000000001.json', {
      image_info: { filename: '000000001.jpg', width: 8, height: 8 },
      annotations: []
    })
    await makeLabel('000000999.json', {
      image_info: { filename: '000000999.jpg', width: 8, height: 8 },
      annotations: []
    })

    const report = await runIntegrityCheck(workspaceDir)
    const orphans = report.issues.filter((i) => i.kind === 'orphanLabel')
    const result = await autoFixIssues(workspaceDir, orphans)
    expect(result.fixed).toBe(1)
    expect(result.failed).toBe(0)

    const after = await readdir(join(workspaceDir, 'label'))
    expect(after).not.toContain('000000999.json')
    expect(after).toContain('000000001.json')
  })

  it('missingLabel에 대해 빈 라벨을 생성한다', async () => {
    await makeImage('000000001')
    const report = await runIntegrityCheck(workspaceDir)
    const missing = report.issues.filter((i) => i.kind === 'missingLabel')
    const result = await autoFixIssues(workspaceDir, missing)
    expect(result.fixed).toBe(1)

    const data = JSON.parse(await readFile(join(workspaceDir, 'label', '000000001.json'), 'utf-8'))
    expect(data.annotations).toEqual([])
    expect(data.image_info.width).toBe(8)
    expect(data.image_info.height).toBe(8)
  })

  it('schemaViolation: BB 워크스페이스에서 OBB 어노테이션이 제거된다', async () => {
    await makeImage('000000001')
    await makeLabel('000000001.json', {
      image_info: { filename: '000000001.jpg', width: 8, height: 8 },
      annotations: [
        { id: 'a', class_id: 0, bbox: [1, 1, 5, 5] },
        { id: 'b', class_id: 1, obb: [3, 3, 2, 2, 0] }
      ]
    })

    const report = await runIntegrityCheck(workspaceDir)
    const violations = report.issues.filter((i) => i.kind === 'schemaViolation')
    expect(violations.length).toBeGreaterThan(0)

    await autoFixIssues(workspaceDir, violations)
    const data = JSON.parse(await readFile(join(workspaceDir, 'label', '000000001.json'), 'utf-8'))
    expect(data.annotations).toHaveLength(1)
    expect(data.annotations[0].id).toBe('a')
  })
})
