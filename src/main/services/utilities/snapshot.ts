/**
 * 워크스페이스 라벨 스냅샷 (백업)
 * - <workspace>/.backups/<timestamp>/label/ 아래로 label 디렉토리를 복사한다.
 * - .backups 디렉토리는 workspace:// 프로토콜에서 노출되지 않도록 main/index.ts에서 처리.
 */

import { join } from 'path'
import { readdir, mkdir, copyFile, rm, stat } from 'fs/promises'
import { existsSync } from 'fs'

const LABEL_DIR = 'label'
const BACKUP_DIR = '.backups'

export interface SnapshotInfo {
  id: string // timestamp 기반
  createdAt: number // unix ms
  fileCount: number
  byteSize: number
}

function formatTimestamp(now: Date): string {
  const yyyy = now.getFullYear()
  const mm = String(now.getMonth() + 1).padStart(2, '0')
  const dd = String(now.getDate()).padStart(2, '0')
  const hh = String(now.getHours()).padStart(2, '0')
  const mi = String(now.getMinutes()).padStart(2, '0')
  const ss = String(now.getSeconds()).padStart(2, '0')
  return `${yyyy}${mm}${dd}-${hh}${mi}${ss}`
}

export async function createSnapshot(workspacePath: string): Promise<SnapshotInfo> {
  const labelDir = join(workspacePath, LABEL_DIR)
  if (!existsSync(labelDir)) {
    throw new Error('label 디렉토리가 존재하지 않습니다.')
  }

  const id = formatTimestamp(new Date())
  const backupRoot = join(workspacePath, BACKUP_DIR)
  const targetDir = join(backupRoot, id, LABEL_DIR)
  await mkdir(targetDir, { recursive: true })

  const files = await readdir(labelDir)
  let fileCount = 0
  let byteSize = 0
  for (const f of files) {
    if (!f.endsWith('.json')) continue
    const src = join(labelDir, f)
    const dst = join(targetDir, f)
    await copyFile(src, dst)
    const st = await stat(dst)
    fileCount++
    byteSize += st.size
  }

  return {
    id,
    createdAt: Date.now(),
    fileCount,
    byteSize
  }
}

export async function listSnapshots(workspacePath: string): Promise<SnapshotInfo[]> {
  const backupRoot = join(workspacePath, BACKUP_DIR)
  if (!existsSync(backupRoot)) return []

  const entries = await readdir(backupRoot, { withFileTypes: true })
  const items: SnapshotInfo[] = []
  for (const e of entries) {
    if (!e.isDirectory()) continue
    const labelPath = join(backupRoot, e.name, LABEL_DIR)
    if (!existsSync(labelPath)) continue

    let fileCount = 0
    let byteSize = 0
    try {
      const files = await readdir(labelPath)
      for (const f of files) {
        if (!f.endsWith('.json')) continue
        const st = await stat(join(labelPath, f))
        fileCount++
        byteSize += st.size
      }
    } catch {
      continue
    }

    const created = parseTimestampDir(e.name)
    items.push({
      id: e.name,
      createdAt: created ?? 0,
      fileCount,
      byteSize
    })
  }
  // 최신 순
  return items.sort((a, b) => b.createdAt - a.createdAt)
}

export async function deleteSnapshot(workspacePath: string, id: string): Promise<boolean> {
  if (!isValidSnapshotId(id)) return false
  const target = join(workspacePath, BACKUP_DIR, id)
  if (!existsSync(target)) return false
  await rm(target, { recursive: true, force: true })
  return true
}

export async function restoreSnapshot(workspacePath: string, id: string): Promise<boolean> {
  if (!isValidSnapshotId(id)) return false
  const source = join(workspacePath, BACKUP_DIR, id, LABEL_DIR)
  if (!existsSync(source)) return false

  // 복원 직전 현재 상태도 안전망으로 백업
  await createSnapshot(workspacePath).catch(() => undefined)

  const labelDir = join(workspacePath, LABEL_DIR)
  // 기존 라벨 제거 후 복사 (atomic 하지는 않지만 backup이 선행되어 있음)
  await rm(labelDir, { recursive: true, force: true })
  await mkdir(labelDir, { recursive: true })

  const files = await readdir(source)
  for (const f of files) {
    if (!f.endsWith('.json')) continue
    await copyFile(join(source, f), join(labelDir, f))
  }
  return true
}

// 타임스탬프 디렉토리명 검증 (YYYYMMDD-HHMMSS) — 임의 경로 차단
function isValidSnapshotId(id: string): boolean {
  return /^\d{8}-\d{6}$/.test(id)
}

function parseTimestampDir(name: string): number | null {
  if (!isValidSnapshotId(name)) return null
  const yyyy = Number(name.slice(0, 4))
  const mm = Number(name.slice(4, 6)) - 1
  const dd = Number(name.slice(6, 8))
  const hh = Number(name.slice(9, 11))
  const mi = Number(name.slice(11, 13))
  const ss = Number(name.slice(13, 15))
  const d = new Date(yyyy, mm, dd, hh, mi, ss)
  const t = d.getTime()
  return Number.isNaN(t) ? null : t
}
