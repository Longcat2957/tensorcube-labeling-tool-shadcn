import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm, readdir, readFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { writeJsonFile } from '../src/main/services/fileService'

let dir: string

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'ws-atomic-'))
})

afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

describe('writeJsonFile (atomic)', () => {
  it('정상 쓰기 후 파일 내용이 일치한다', async () => {
    const target = join(dir, 'a.json')
    await writeJsonFile(target, { foo: 1, bar: [1, 2, 3] })
    const content = JSON.parse(await readFile(target, 'utf-8'))
    expect(content).toEqual({ foo: 1, bar: [1, 2, 3] })
  })

  it('기존 파일을 덮어쓴다', async () => {
    const target = join(dir, 'b.json')
    await writeJsonFile(target, { v: 1 })
    await writeJsonFile(target, { v: 2 })
    const content = JSON.parse(await readFile(target, 'utf-8'))
    expect(content).toEqual({ v: 2 })
  })

  it('쓰기 후 임시 파일이 남지 않는다', async () => {
    const target = join(dir, 'c.json')
    await writeJsonFile(target, { v: 1 })
    await writeJsonFile(target, { v: 2 })
    await writeJsonFile(target, { v: 3 })
    const files = await readdir(dir)
    // .tmp 확장자가 남아있지 않아야 함
    expect(files.every((f) => !f.endsWith('.tmp'))).toBe(true)
    expect(files).toContain('c.json')
  })

  it('동시 쓰기 시에도 파일 내용은 항상 유효한 JSON', async () => {
    const target = join(dir, 'd.json')
    // 같은 파일을 동시에 여러 번 쓰는 경우 — 마지막 쓰기가 이김
    await Promise.all([
      writeJsonFile(target, { v: 1 }),
      writeJsonFile(target, { v: 2 }),
      writeJsonFile(target, { v: 3 })
    ])
    const text = await readFile(target, 'utf-8')
    // 토막난 JSON이 아니라 유효한 JSON 이어야 함
    const parsed = JSON.parse(text) as { v: number }
    expect([1, 2, 3]).toContain(parsed.v)
  })
})
