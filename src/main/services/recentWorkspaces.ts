/**
 * 최근 연/생성한 워크스페이스 경로 저장
 * userData/recent.json에 최대 MAX_RECENT 개의 경로를 lastOpened 내림차순으로 보관한다.
 */

import { app } from 'electron'
import { join } from 'path'
import { existsSync, mkdirSync } from 'fs'
import { readFile, writeFile } from 'fs/promises'

const FILE_NAME = 'recent.json'
const MAX_RECENT = 10

export interface RecentWorkspace {
  path: string
  name: string
  lastOpened: number
}

function filePath(): string {
  return join(app.getPath('userData'), FILE_NAME)
}

export async function loadRecentWorkspaces(): Promise<RecentWorkspace[]> {
  try {
    const raw = await readFile(filePath(), 'utf-8')
    const parsed = JSON.parse(raw) as RecentWorkspace[]
    if (!Array.isArray(parsed)) return []
    // 존재하지 않는 경로는 필터링 (이동/삭제된 워크스페이스)
    return parsed.filter((item) => existsSync(item.path))
  } catch {
    return []
  }
}

async function writeRecent(items: RecentWorkspace[]): Promise<void> {
  const dir = app.getPath('userData')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  await writeFile(filePath(), JSON.stringify(items, null, 2), 'utf-8')
}

export async function pushRecentWorkspace(path: string, name: string): Promise<RecentWorkspace[]> {
  const current = await loadRecentWorkspaces()
  const filtered = current.filter((item) => item.path !== path)
  const next: RecentWorkspace[] = [{ path, name, lastOpened: Date.now() }, ...filtered].slice(
    0,
    MAX_RECENT
  )
  await writeRecent(next)
  return next
}

export async function removeRecentWorkspace(path: string): Promise<RecentWorkspace[]> {
  const current = await loadRecentWorkspaces()
  const next = current.filter((item) => item.path !== path)
  await writeRecent(next)
  return next
}
