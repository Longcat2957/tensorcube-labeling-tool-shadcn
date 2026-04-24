/**
 * 클래스 단위 벌크 연산
 * - scanClassUsage: workspace 전체 라벨 파일에서 class_id 별 어노테이션 개수를 집계
 * - reassignClass: class_id A를 B로 일괄 변환하거나, B가 null이면 해당 class의 어노테이션을 삭제
 *
 * 파일 이름(_C/_W/없음)은 변경하지 않는다. 내용만 업데이트한다.
 */

import { join } from 'path'
import { readdir } from 'fs/promises'
import { existsSync } from 'fs'
import { readJsonFile, writeJsonFile } from './fileService.js'
import type { LabelData } from '../../shared/types.js'

const LABEL_DIR = 'label'

export async function scanClassUsage(workspacePath: string): Promise<Record<number, number>> {
  const dir = join(workspacePath, LABEL_DIR)
  if (!existsSync(dir)) return {}

  const counts: Record<number, number> = {}
  const files = await readdir(dir)
  for (const f of files) {
    if (!f.endsWith('.json')) continue
    const data = await readJsonFile<LabelData>(join(dir, f))
    if (!data?.annotations) continue
    for (const ann of data.annotations) {
      counts[ann.class_id] = (counts[ann.class_id] ?? 0) + 1
    }
  }
  return counts
}

export interface ReassignResult {
  updatedFiles: number
  updatedAnnotations: number
  deletedAnnotations: number
}

/**
 * fromClassId의 모든 어노테이션을 toClassId로 재지정한다.
 * toClassId가 null이면 해당 어노테이션을 삭제한다.
 * 파일 이름(_C/_W/없음)은 건드리지 않는다.
 */
export async function reassignClass(
  workspacePath: string,
  fromClassId: number,
  toClassId: number | null
): Promise<ReassignResult> {
  const dir = join(workspacePath, LABEL_DIR)
  const result: ReassignResult = { updatedFiles: 0, updatedAnnotations: 0, deletedAnnotations: 0 }
  if (!existsSync(dir)) return result

  const files = await readdir(dir)
  for (const f of files) {
    if (!f.endsWith('.json')) continue
    const path = join(dir, f)
    const data = await readJsonFile<LabelData>(path)
    if (!data?.annotations) continue

    let changed = false
    let nextAnnotations: LabelData['annotations']

    if (toClassId === null) {
      const before = data.annotations.length
      nextAnnotations = data.annotations.filter((a) => a.class_id !== fromClassId)
      const removed = before - nextAnnotations.length
      if (removed > 0) {
        result.deletedAnnotations += removed
        changed = true
      }
    } else {
      let updated = 0
      nextAnnotations = data.annotations.map((a) => {
        if (a.class_id === fromClassId) {
          updated++
          return { ...a, class_id: toClassId }
        }
        return a
      })
      if (updated > 0) {
        result.updatedAnnotations += updated
        changed = true
      }
    }

    if (changed) {
      await writeJsonFile(path, { ...data, annotations: nextAnnotations })
      result.updatedFiles++
    }
  }

  return result
}
