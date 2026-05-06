/**
 * 워크스페이스 무결성 검사
 *
 * 검사 항목:
 * - orphanLabel: src/ 에 대응 이미지가 없는데 label/ 에만 있는 라벨 파일
 * - missingLabel: src/ 에 이미지가 있는데 label/ 에 라벨 파일이 없음
 * - badIdPattern: 9-digit ID 패턴을 위반한 src 또는 label 파일
 * - schemaViolation: 라벨 JSON이 필수 필드를 누락하거나 labeling_type과 불일치
 *
 * 자동 수정:
 * - orphanLabel: 라벨 파일 삭제
 * - missingLabel: 빈 라벨 JSON 생성 (이미지 dimensions 포함)
 * - badIdPattern: 사용자 확인 후 무시 (자동 rename은 위험하므로 안내만)
 * - schemaViolation: 손상된 어노테이션 항목만 제거하고 나머지는 유지
 */

import { join, extname, basename } from 'path'
import { readdir, unlink } from 'fs/promises'
import { existsSync } from 'fs'
import { readJsonFile, writeJsonFile, getImageDimensions } from '../fileService.js'
import { readWorkspaceConfig } from '../workspaceService.js'
import type {
  LabelData,
  IntegrityIssue,
  IntegrityReport,
  IntegrityIssueKind,
  IntegrityAutoFixResult
} from '../../../shared/types.js'

// 다른 모듈이 참조할 수 있게 re-export
export type { IntegrityIssue, IntegrityReport, IntegrityIssueKind, IntegrityAutoFixResult }

const SRC_DIR = 'src'
const LABEL_DIR = 'label'
const ID_PATTERN = /^\d{9}$/
const LABEL_FILE_PATTERN = /^(\d{9})(_[CW])?\.json$/

// IntegrityIssue / IntegrityReport는 shared/types.ts에서 정의되어 있음 (위에서 re-export).

export async function runIntegrityCheck(workspacePath: string): Promise<IntegrityReport> {
  const issues: IntegrityIssue[] = []
  const srcDir = join(workspacePath, SRC_DIR)
  const labelDir = join(workspacePath, LABEL_DIR)
  const yamlPath = join(workspacePath, 'workspace.yaml')

  const config = (await readWorkspaceConfig(yamlPath)) ?? null
  const expectedLabelingType = config?.labeling_type ?? null

  const srcFiles = existsSync(srcDir) ? await readdir(srcDir) : []
  const labelFiles = existsSync(labelDir) ? await readdir(labelDir) : []

  const imageIds = new Set<string>()
  for (const f of srcFiles) {
    const ext = extname(f).toLowerCase()
    if (!['.jpg', '.jpeg', '.png', '.bmp', '.webp'].includes(ext)) continue
    const id = basename(f, ext)
    if (!ID_PATTERN.test(id)) {
      issues.push({
        kind: 'badIdPattern',
        message: `이미지 파일명이 9자리 숫자 패턴이 아님: ${f}`,
        target: join(srcDir, f),
        autoFixable: false
      })
      continue
    }
    imageIds.add(id)
  }

  const labelIds = new Set<string>()
  for (const f of labelFiles) {
    if (!f.endsWith('.json')) continue
    const m = f.match(LABEL_FILE_PATTERN)
    if (!m) {
      issues.push({
        kind: 'badIdPattern',
        message: `라벨 파일명이 9자리 숫자 패턴이 아님: ${f}`,
        target: join(labelDir, f),
        autoFixable: false
      })
      continue
    }
    const id = m[1]
    labelIds.add(id)

    // schema 검증
    const labelPath = join(labelDir, f)
    const data = await readJsonFile<LabelData>(labelPath)
    if (data === null) {
      issues.push({
        kind: 'schemaViolation',
        message: `라벨 JSON 파싱 실패: ${f}`,
        target: labelPath,
        autoFixable: false
      })
      continue
    }
    if (!data.image_info || typeof data.image_info !== 'object') {
      issues.push({
        kind: 'schemaViolation',
        message: `image_info 누락: ${f}`,
        target: labelPath,
        autoFixable: true
      })
    }
    if (!Array.isArray(data.annotations)) {
      issues.push({
        kind: 'schemaViolation',
        message: `annotations 배열 누락: ${f}`,
        target: labelPath,
        autoFixable: true
      })
      continue
    }

    // labeling_type 일관성 (1=BB, 2=OBB, 3=Polygon, 4=Keypoint)
    if (expectedLabelingType !== null) {
      for (const ann of data.annotations) {
        const isBB = 'bbox' in ann && !('keypoints' in ann)
        const isOBB = 'obb' in ann
        const isPolygon = 'polygon' in ann
        const isKeypoint = 'keypoints' in ann

        const matches =
          (expectedLabelingType === 1 && isBB) ||
          (expectedLabelingType === 2 && isOBB) ||
          (expectedLabelingType === 3 && isPolygon) ||
          (expectedLabelingType === 4 && isKeypoint)

        if (!matches) {
          const typeName =
            expectedLabelingType === 1
              ? 'BB'
              : expectedLabelingType === 2
                ? 'OBB'
                : expectedLabelingType === 3
                  ? 'Polygon'
                  : 'Keypoint'
          issues.push({
            kind: 'schemaViolation',
            message: `${typeName} 워크스페이스에 다른 형식 어노테이션 포함: ${f}`,
            target: labelPath,
            autoFixable: true
          })
          break
        }
        // class_id 필수
        if (typeof ann.class_id !== 'number') {
          issues.push({
            kind: 'schemaViolation',
            message: `class_id 누락 또는 잘못된 타입: ${f}`,
            target: labelPath,
            autoFixable: true
          })
          break
        }
      }
    }
  }

  // orphanLabel: 라벨이 있는데 이미지가 없음
  for (const id of labelIds) {
    if (!imageIds.has(id)) {
      issues.push({
        kind: 'orphanLabel',
        message: `대응 이미지 없는 라벨: ${id}`,
        target: id,
        autoFixable: true
      })
    }
  }

  // missingLabel: 이미지가 있는데 라벨이 없음
  for (const id of imageIds) {
    if (!labelIds.has(id)) {
      issues.push({
        kind: 'missingLabel',
        message: `대응 라벨 없는 이미지: ${id}`,
        target: id,
        autoFixable: true
      })
    }
  }

  return {
    issues,
    scanned: {
      images: imageIds.size,
      labels: labelIds.size
    }
  }
}

export async function autoFixIssues(
  workspacePath: string,
  issues: IntegrityIssue[]
): Promise<IntegrityAutoFixResult> {
  const result: IntegrityAutoFixResult = { fixed: 0, failed: 0, details: [] }
  const srcDir = join(workspacePath, SRC_DIR)
  const labelDir = join(workspacePath, LABEL_DIR)
  const config = await readWorkspaceConfig(join(workspacePath, 'workspace.yaml'))
  const labelingType = config?.labeling_type ?? null

  for (const issue of issues) {
    if (!issue.autoFixable) {
      result.failed++
      result.details.push({
        kind: issue.kind,
        target: issue.target,
        ok: false,
        reason: '자동 수정 불가'
      })
      continue
    }

    try {
      if (issue.kind === 'orphanLabel') {
        // target은 id. 라벨 파일들을 찾아서 삭제 (suffix 변종 모두)
        const id = issue.target
        const candidates = [`${id}.json`, `${id}_C.json`, `${id}_W.json`]
        let removed = 0
        for (const c of candidates) {
          const p = join(labelDir, c)
          if (existsSync(p)) {
            await unlink(p)
            removed++
          }
        }
        if (removed > 0) {
          result.fixed++
          result.details.push({ kind: issue.kind, target: id, ok: true })
        } else {
          result.failed++
          result.details.push({
            kind: issue.kind,
            target: id,
            ok: false,
            reason: '대상 파일 없음'
          })
        }
      } else if (issue.kind === 'missingLabel') {
        // 이미지 dimensions 조회 후 빈 라벨 생성
        const id = issue.target
        const ext = await findImageExtension(srcDir, id)
        if (!ext) {
          result.failed++
          result.details.push({
            kind: issue.kind,
            target: id,
            ok: false,
            reason: '이미지 파일 확장자 탐색 실패'
          })
          continue
        }
        const imagePath = join(srcDir, `${id}${ext}`)
        const dims = await getImageDimensions(imagePath)
        const labelData: LabelData = {
          image_info: {
            filename: `${id}${ext}`,
            width: dims.width,
            height: dims.height
          },
          annotations: []
        }
        await writeJsonFile(join(labelDir, `${id}.json`), labelData)
        result.fixed++
        result.details.push({ kind: issue.kind, target: id, ok: true })
      } else if (issue.kind === 'schemaViolation') {
        const labelPath = issue.target
        const data = await readJsonFile<Partial<LabelData>>(labelPath)
        if (!data) {
          // 파싱 자체가 실패했으면 빈 라벨로 덮어씀
          const id = basename(labelPath).replace(/(_[CW])?\.json$/, '')
          const ext = await findImageExtension(srcDir, id)
          const dims = ext
            ? await getImageDimensions(join(srcDir, `${id}${ext}`))
            : { width: 0, height: 0 }
          const fresh: LabelData = {
            image_info: { filename: ext ? `${id}${ext}` : '', ...dims },
            annotations: []
          }
          await writeJsonFile(labelPath, fresh)
        } else {
          const fixed: LabelData = {
            image_info:
              data.image_info && typeof data.image_info === 'object'
                ? data.image_info
                : { filename: '', width: 0, height: 0 },
            annotations: Array.isArray(data.annotations)
              ? data.annotations.filter((ann) => {
                  if (!ann || typeof ann !== 'object') return false
                  if (typeof ann.class_id !== 'number') return false
                  if (labelingType === 1) return 'bbox' in ann && !('keypoints' in ann)
                  if (labelingType === 2) return 'obb' in ann
                  if (labelingType === 3) return 'polygon' in ann
                  if (labelingType === 4) return 'keypoints' in ann
                  return true
                })
              : []
          }
          await writeJsonFile(labelPath, fixed)
        }
        result.fixed++
        result.details.push({ kind: issue.kind, target: labelPath, ok: true })
      } else {
        result.failed++
        result.details.push({
          kind: issue.kind,
          target: issue.target,
          ok: false,
          reason: '지원하지 않는 종류'
        })
      }
    } catch (err) {
      result.failed++
      result.details.push({
        kind: issue.kind,
        target: issue.target,
        ok: false,
        reason: err instanceof Error ? err.message : String(err)
      })
    }
  }

  return result
}

async function findImageExtension(srcDir: string, id: string): Promise<string | null> {
  const candidates = ['.jpg', '.jpeg', '.png', '.bmp', '.webp']
  for (const ext of candidates) {
    if (existsSync(join(srcDir, `${id}${ext}`))) return ext
  }
  return null
}
