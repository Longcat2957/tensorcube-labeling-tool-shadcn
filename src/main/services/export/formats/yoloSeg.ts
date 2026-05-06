/**
 * YOLO-Seg (segmentation) 익스포터
 *
 * 라벨 라인 형식:
 *   <class_id> x1 y1 x2 y2 ... xN yN
 * 모든 좌표는 [0,1]로 정규화 (x = px / W, y = py / H).
 */

import { writeFile } from 'fs/promises'
import type {
  PolygonAnnotation,
  AnyAnnotation,
  OutOfBoundsPolicy
} from '../../../../shared/types.js'
import type { ExportableItem } from '../types.js'
import { writeExportImage, createDatasetDirectories, getLabelPath, getImagePath } from '../utils.js'
import { writeDataYaml } from '../datasetYaml.js'

function formatPolygonLine(
  ann: PolygonAnnotation,
  originalSize: { width: number; height: number },
  targetSize: { width: number; height: number },
  outOfBounds: OutOfBoundsPolicy
): string | null {
  if (!Array.isArray(ann.polygon) || ann.polygon.length < 3) return null

  const sx = targetSize.width / originalSize.width
  const sy = targetSize.height / originalSize.height
  const W = targetSize.width
  const H = targetSize.height

  const scaled: [number, number][] = []
  let anyOutOfBounds = false
  for (const [px, py] of ann.polygon) {
    const x = px * sx
    const y = py * sy
    if (x < 0 || y < 0 || x > W || y > H) anyOutOfBounds = true
    scaled.push([x, y])
  }

  if (anyOutOfBounds) {
    if (outOfBounds === 'skip') return null
    if (outOfBounds === 'clip') {
      for (let i = 0; i < scaled.length; i++) {
        scaled[i][0] = Math.min(W, Math.max(0, scaled[i][0]))
        scaled[i][1] = Math.min(H, Math.max(0, scaled[i][1]))
      }
    }
    // 'none'이면 그대로
  }

  const norm = scaled.map(([x, y]) => `${(x / W).toFixed(6)} ${(y / H).toFixed(6)}`).join(' ')
  return `${ann.class_id} ${norm}`
}

export async function exportYoloSegDataset(
  items: ExportableItem[],
  exportPath: string,
  classes: Record<number, string>,
  options: {
    resize?: { enabled: boolean; width: number; height: number }
    outOfBounds?: OutOfBoundsPolicy
  }
): Promise<{ exportedCount: number }> {
  const outOfBounds = options.outOfBounds ?? 'clip'
  const activeSplits = new Set(items.map((item) => item.split))
  await createDatasetDirectories(exportPath, activeSplits)

  let exportedCount = 0
  for (const item of items) {
    try {
      const imageOutPath = getImagePath(item.imageFilename, item.split, exportPath)
      const labelOutPath = getLabelPath(item.imageFilename, item.split, exportPath)
      const resized = await writeExportImage(item.imagePath, imageOutPath, options.resize)

      const lines: string[] = []
      for (const ann of item.labelData.annotations as AnyAnnotation[]) {
        if (!('polygon' in ann)) continue
        const line = formatPolygonLine(ann, item.labelData.image_info, resized, outOfBounds)
        if (line) lines.push(line)
      }

      await writeFile(labelOutPath, lines.join('\n'), 'utf-8')
      exportedCount++
    } catch (err) {
      console.error('[YOLO-Seg] 아이템 처리 실패:', item.imageFilename, err)
    }
  }

  await writeDataYaml(exportPath, classes, { hasTestSplit: activeSplits.has('test') })
  return { exportedCount }
}
