/**
 * COCO segmentation 익스포터 (Polygon)
 *
 * 본 익스포터는 polygon 어노테이션을 COCO segmentation 포맷으로 출력한다.
 *  - segmentation: [[x0, y0, x1, y1, ...]] (1-polygon list)
 *  - bbox: polygon AABB [x, y, w, h]
 *  - area: polygon AABB 면적 (간단 근사)
 */

import { writeFile, mkdir } from 'fs/promises'
import { join } from 'path'
import type {
  PolygonAnnotation,
  AnyAnnotation,
  OutOfBoundsPolicy
} from '../../../../shared/types.js'
import type { ExportableItem, CocoImage, CocoCategory, CocoDataset } from '../types.js'
import { writeExportImage, createCocoDirectories, getImagePath } from '../utils.js'

interface CocoSegAnnotation {
  id: number
  image_id: number
  category_id: number
  segmentation: number[][]
  bbox: [number, number, number, number]
  area: number
  iscrowd: 0
}

interface CocoSegDataset extends Omit<CocoDataset, 'annotations'> {
  annotations: CocoSegAnnotation[]
}

function scalePolygon(
  pts: [number, number][],
  originalSize: { width: number; height: number },
  targetSize: { width: number; height: number }
): [number, number][] {
  const sx = targetSize.width / originalSize.width
  const sy = targetSize.height / originalSize.height
  return pts.map(([x, y]) => [x * sx, y * sy])
}

function clipPoly(pts: [number, number][], W: number, H: number): [number, number][] {
  return pts.map(([x, y]) => [Math.min(W, Math.max(0, x)), Math.min(H, Math.max(0, y))])
}

export async function exportCocoSegDataset(
  items: ExportableItem[],
  exportPath: string,
  classes: Record<number, string>,
  options: {
    resize?: { enabled: boolean; width: number; height: number }
    outOfBounds?: OutOfBoundsPolicy
  }
): Promise<{ exportedCount: number }> {
  const outOfBounds = options.outOfBounds ?? 'clip'
  const activeSplits = [...new Set(items.map((item) => item.split))] as ('train' | 'val' | 'test')[]
  await createCocoDirectories(exportPath, new Set(activeSplits))
  await mkdir(join(exportPath, 'annotations'), { recursive: true })

  const categories: CocoCategory[] = Object.entries(classes)
    .map(([id, name]) => ({ id: Number(id), name }))
    .sort((a, b) => a.id - b.id)

  let exportedCount = 0
  for (const split of activeSplits) {
    const splitItems = items.filter((item) => item.split === split)
    const images: CocoImage[] = []
    const annotations: CocoSegAnnotation[] = []
    let annotationId = 1

    for (const [index, item] of splitItems.entries()) {
      const imageOutPath = getImagePath(item.imageFilename, split, exportPath)
      const resized = await writeExportImage(item.imagePath, imageOutPath, options.resize)
      const imageId = index + 1
      images.push({
        id: imageId,
        file_name: item.imageFilename,
        width: resized.width,
        height: resized.height
      })

      for (const ann of item.labelData.annotations as AnyAnnotation[]) {
        if (!('polygon' in ann)) continue
        const poly = ann as PolygonAnnotation
        if (!poly.polygon || poly.polygon.length < 3) continue

        let scaled = scalePolygon(poly.polygon, item.labelData.image_info, resized)
        const xs = scaled.map((p) => p[0])
        const ys = scaled.map((p) => p[1])
        const oob =
          Math.min(...xs) < 0 ||
          Math.min(...ys) < 0 ||
          Math.max(...xs) > resized.width ||
          Math.max(...ys) > resized.height

        if (oob) {
          if (outOfBounds === 'skip') continue
          if (outOfBounds === 'clip') {
            scaled = clipPoly(scaled, resized.width, resized.height)
          }
        }

        const flat: number[] = []
        for (const [x, y] of scaled) {
          flat.push(Number(x.toFixed(2)), Number(y.toFixed(2)))
        }

        const fxs = scaled.map((p) => p[0])
        const fys = scaled.map((p) => p[1])
        const xmin = Math.min(...fxs)
        const ymin = Math.min(...fys)
        const w = Math.max(...fxs) - xmin
        const h = Math.max(...fys) - ymin
        if (w <= 0 || h <= 0) continue

        annotations.push({
          id: annotationId++,
          image_id: imageId,
          category_id: poly.class_id,
          segmentation: [flat],
          bbox: [xmin, ymin, w, h],
          area: w * h,
          iscrowd: 0
        })
      }

      exportedCount++
    }

    const dataset: CocoSegDataset = { images, annotations, categories }
    const jsonPath = join(exportPath, 'annotations', `instances_${split}.json`)
    await writeFile(jsonPath, JSON.stringify(dataset, null, 2), 'utf-8')
  }

  return { exportedCount }
}
