/**
 * Export 진입점
 * 다양한 포맷으로 데이터셋 내보내기
 */

import { existsSync } from 'fs'
import { join } from 'path'
import { ensureDir, readYamlFile } from '../fileService.js'
import type {
  ExportOptions,
  ExportResult,
  ExportPreflight,
  WorkspaceConfig,
  BBAnnotation,
  OBBAnnotation
} from '../../../shared/types.js'
import {
  collectExportItems,
  shuffleArray,
  assignSplits,
  sanitizeExportName,
  isBboxOutOfBounds,
  isObbOutOfBounds
} from './utils.js'
import { exportYoloDataset } from './formats/yolo.js'
import { exportYoloObbDataset } from './formats/yoloOBB.js'
import { exportCocoDataset } from './formats/coco.js'
import { exportDotaDataset } from './formats/dota.js'

const WORKSPACE_FILE = 'workspace.yaml'

/**
 * 워크스페이스 내보내기
 */
export async function exportWorkspace(
  workspacePath: string,
  options: ExportOptions
): Promise<ExportResult> {
  console.log('[Export] 시작:', { workspacePath, options })

  try {
    // 설정 로드
    const config = await readYamlFile<WorkspaceConfig>(join(workspacePath, WORKSPACE_FILE))
    if (!config) {
      console.error('[Export] workspace.yaml 읽기 실패')
      return { success: false, error: 'workspace.yaml을 읽을 수 없습니다.' }
    }
    console.log('[Export] 설정 로드 완료:', config)

    // 내보낼 아이템 수집
    console.log('[Export] 아이템 수집 중... includeCompletedOnly:', options.includeCompletedOnly)
    const items = await collectExportItems(workspacePath, options.includeCompletedOnly)
    console.log('[Export] 수집된 아이템 수:', items.length)

    if (items.length === 0) {
      console.warn('[Export] 내보낼 데이터가 없음')
      return { success: false, error: '내보낼 라벨 데이터가 없습니다.' }
    }

    // 셔플 및 분할
    shuffleArray(items)
    assignSplits(items, options.split)
    const splitCounts = { train: 0, val: 0, test: 0 }
    items.forEach((item) => splitCounts[item.split]++)
    console.log('[Export] 분할 완료:', splitCounts)

    // 내보내기 디렉토리 생성
    await ensureDir(options.outputPath)
    const exportDirPath = join(options.outputPath, sanitizeExportName(options.exportName))
    console.log('[Export] 출력 경로:', exportDirPath)

    if (existsSync(exportDirPath)) {
      console.error('[Export] 디렉토리 이미 존재:', exportDirPath)
      return { success: false, error: '같은 이름의 export 디렉토리가 이미 존재합니다.' }
    }

    await ensureDir(exportDirPath)

    // 포맷별 내보내기
    console.log('[Export] 포맷:', options.format, '처리 시작')
    let exportedCount: number

    try {
      const formatOptions = {
        resize: options.resize,
        outOfBounds: options.outOfBounds ?? 'clip'
      }

      switch (options.format) {
        case 'yolo':
          const yoloResult = await exportYoloDataset(
            items,
            exportDirPath,
            config.names,
            formatOptions
          )
          exportedCount = yoloResult.exportedCount
          break

        case 'yolo-obb':
          const yoloObbResult = await exportYoloObbDataset(
            items,
            exportDirPath,
            config.names,
            formatOptions
          )
          exportedCount = yoloObbResult.exportedCount
          break

        case 'coco':
          const cocoResult = await exportCocoDataset(
            items,
            exportDirPath,
            config.names,
            formatOptions
          )
          exportedCount = cocoResult.exportedCount
          break

        case 'dota':
          const dotaResult = await exportDotaDataset(items, exportDirPath, formatOptions)
          exportedCount = dotaResult.exportedCount
          break

        default:
          return { success: false, error: `지원하지 않는 포맷: ${options.format}` }
      }
    } catch (formatError) {
      console.error('[Export] 포맷 처리 중 오류:', formatError)
      throw formatError
    }

    console.log('[Export] 완료:', { exportedCount, outputPath: exportDirPath })
    return {
      success: true,
      outputPath: exportDirPath,
      exportedCount,
      skippedCount: 0
    }
  } catch (error) {
    console.error('[Export] 오류 발생:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : '내보내기에 실패했습니다.'
    }
  }
}

// 타입 재-export (기존 호환성)
export type { ExportOptions, ExportResult } from '../../../shared/types.js'

/**
 * 내보내기 프리플라이트: 실제 파일 쓰기 없이 현재 옵션으로 예상 집계를 계산한다.
 * 이 숫자는 exportWorkspace 실제 실행 시에도 동일하게 나온다(셔플 순서만 다름).
 */
export async function previewExport(
  workspacePath: string,
  options: Pick<ExportOptions, 'includeCompletedOnly' | 'outOfBounds' | 'split'>
): Promise<ExportPreflight> {
  const warnings: string[] = []

  const config = await readYamlFile<WorkspaceConfig>(join(workspacePath, WORKSPACE_FILE))
  if (!config) {
    warnings.push('workspace.yaml을 읽을 수 없습니다.')
  }

  const items = await collectExportItems(workspacePath, options.includeCompletedOnly)
  const totalItems = items.length

  const splitCountsDummy: ExportableItemsCountedBySplit = { train: 0, val: 0, test: 0 }
  // assignSplits는 item.split을 mutate하므로 shallow-copy 배열에 대해 실행
  if (totalItems > 0) {
    const simulated = items.map((it) => ({ ...it }))
    assignSplits(simulated, options.split)
    for (const it of simulated) splitCountsDummy[it.split]++
  }

  let totalAnnotations = 0
  let outOfBoundsCount = 0
  const perClassCounts: Record<number, number> = {}

  for (const item of items) {
    const imgSize = {
      width: item.labelData.image_info.width,
      height: item.labelData.image_info.height
    }
    for (const ann of item.labelData.annotations) {
      totalAnnotations++
      perClassCounts[ann.class_id] = (perClassCounts[ann.class_id] ?? 0) + 1

      if ('bbox' in ann) {
        const a = ann as BBAnnotation
        if (
          isBboxOutOfBounds({ x1: a.bbox[0], y1: a.bbox[1], x2: a.bbox[2], y2: a.bbox[3] }, imgSize)
        ) {
          outOfBoundsCount++
        }
      } else {
        const a = ann as OBBAnnotation
        if (
          isObbOutOfBounds(
            { cx: a.obb[0], cy: a.obb[1], width: a.obb[2], height: a.obb[3], angle: a.obb[4] },
            imgSize
          )
        ) {
          outOfBoundsCount++
        }
      }
    }
  }

  if (totalItems === 0) warnings.push('내보낼 라벨 데이터가 없습니다.')
  if (outOfBoundsCount > 0 && options.outOfBounds === 'none') {
    warnings.push(`범위 초과 박스 ${outOfBoundsCount}개가 원본 좌표 그대로 기록됩니다.`)
  }
  if (outOfBoundsCount > 0 && options.outOfBounds === 'skip') {
    warnings.push(`범위 초과 박스 ${outOfBoundsCount}개가 건너뜀 처리됩니다.`)
  }

  return {
    totalItems,
    totalAnnotations,
    outOfBoundsCount,
    skippedCount: 0,
    splitCounts: splitCountsDummy,
    perClassCounts,
    warnings
  }
}

type ExportableItemsCountedBySplit = { train: number; val: number; test: number }
