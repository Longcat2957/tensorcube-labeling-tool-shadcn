/**
 * COCO Keypoints 익스포터
 *
 * 카테고리에 keypoints 이름과 skeleton edges 포함.
 * 어노테이션:
 *  - keypoints: [x1, y1, v1, x2, y2, v2, ...]
 *  - num_keypoints: visibility > 0 인 점 수
 *  - bbox: 어노테이션의 bbox 또는 keypoint AABB
 */

import { writeFile, mkdir } from 'fs/promises'
import { join } from 'path'
import type {
  KeypointAnnotation,
  AnyAnnotation,
  KeypointSchema,
  OutOfBoundsPolicy
} from '../../../../shared/types.js'
import type { ExportableItem, CocoImage } from '../types.js'
import { writeExportImage, createCocoDirectories, getImagePath } from '../utils.js'

interface CocoKeypointCategory {
  id: number
  name: string
  keypoints: string[]
  skeleton: [number, number][]
}

interface CocoKeypointAnnotation {
  id: number
  image_id: number
  category_id: number
  keypoints: number[]
  num_keypoints: number
  bbox: [number, number, number, number]
  area: number
  iscrowd: 0
}

interface CocoKeypointDataset {
  images: CocoImage[]
  annotations: CocoKeypointAnnotation[]
  categories: CocoKeypointCategory[]
}

export async function exportCocoKeypointsDataset(
  items: ExportableItem[],
  exportPath: string,
  classes: Record<number, string>,
  schema: KeypointSchema,
  options: {
    resize?: { enabled: boolean; width: number; height: number }
    outOfBounds?: OutOfBoundsPolicy
  }
): Promise<{ exportedCount: number }> {
  const outOfBounds = options.outOfBounds ?? 'clip'
  const activeSplits = [...new Set(items.map((item) => item.split))] as ('train' | 'val' | 'test')[]
  await createCocoDirectories(exportPath, new Set(activeSplits))
  await mkdir(join(exportPath, 'annotations'), { recursive: true })

  const categories: CocoKeypointCategory[] = Object.entries(classes)
    .map(([id, name]) => ({
      id: Number(id),
      name,
      keypoints: schema.names,
      skeleton: schema.skeleton ?? []
    }))
    .sort((a, b) => a.id - b.id)

  let exportedCount = 0
  for (const split of activeSplits) {
    const splitItems = items.filter((item) => item.split === split)
    const images: CocoImage[] = []
    const annotations: CocoKeypointAnnotation[] = []
    let annotationId = 1

    for (const [index, item] of splitItems.entries()) {
      const imageOutPath = getImagePath(item.imageFilename, split, exportPath)
      const resized = await writeExportImage(item.imagePath, imageOutPath, options.resize)
      const imageId = index + 1
      const sx = resized.width / item.labelData.image_info.width
      const sy = resized.height / item.labelData.image_info.height

      images.push({
        id: imageId,
        file_name: item.imageFilename,
        width: resized.width,
        height: resized.height
      })

      for (const ann of item.labelData.annotations as AnyAnnotation[]) {
        if (!('keypoints' in ann)) continue
        const k = ann as KeypointAnnotation
        if (!Array.isArray(k.keypoints)) continue

        const flat: number[] = []
        let numVisible = 0
        const visibleXs: number[] = []
        const visibleYs: number[] = []
        for (const kp of k.keypoints) {
          let x = kp.x * sx
          let y = kp.y * sy
          let v = kp.v
          const oob = x < 0 || y < 0 || x > resized.width || y > resized.height
          if (oob) {
            if (outOfBounds === 'skip') {
              v = 0
              x = 0
              y = 0
            } else if (outOfBounds === 'clip') {
              x = Math.min(resized.width, Math.max(0, x))
              y = Math.min(resized.height, Math.max(0, y))
            }
          }
          flat.push(Number(x.toFixed(2)), Number(y.toFixed(2)), v)
          if (v > 0) {
            numVisible++
            visibleXs.push(x)
            visibleYs.push(y)
          }
        }

        let bbox: [number, number, number, number]
        if (k.bbox) {
          bbox = [
            k.bbox[0] * sx,
            k.bbox[1] * sy,
            (k.bbox[2] - k.bbox[0]) * sx,
            (k.bbox[3] - k.bbox[1]) * sy
          ]
        } else if (visibleXs.length > 0) {
          const x = Math.min(...visibleXs)
          const y = Math.min(...visibleYs)
          bbox = [x, y, Math.max(...visibleXs) - x, Math.max(...visibleYs) - y]
        } else {
          bbox = [0, 0, 0, 0]
        }

        annotations.push({
          id: annotationId++,
          image_id: imageId,
          category_id: k.class_id,
          keypoints: flat,
          num_keypoints: numVisible,
          bbox,
          area: bbox[2] * bbox[3],
          iscrowd: 0
        })
      }

      exportedCount++
    }

    const dataset: CocoKeypointDataset = { images, annotations, categories }
    const jsonPath = join(exportPath, 'annotations', `keypoints_${split}.json`)
    await writeFile(jsonPath, JSON.stringify(dataset, null, 2), 'utf-8')
  }

  return { exportedCount }
}
