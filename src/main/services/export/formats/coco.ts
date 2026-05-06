/**
 * COCO 포맷 (JSON) 익스포터
 */

import { writeFile } from 'fs/promises'
import type { OutOfBoundsPolicy } from '../../../../shared/types.js'
import type {
  ExportableItem,
  CocoImage,
  CocoAnnotation,
  CocoCategory,
  CocoDataset
} from '../types.js'
import {
  writeExportImage,
  scaleBbox,
  applyOutOfBoundsPolicyToBbox,
  createCocoDirectories,
  getImagePath
} from '../utils.js'

/**
 * COCO JSON 포맷으로 내보내기
 */
export async function exportCocoDataset(
  items: ExportableItem[],
  exportPath: string,
  classes: Record<number, string>,
  options: {
    resize?: { enabled: boolean; width: number; height: number }
    outOfBounds?: OutOfBoundsPolicy
  }
): Promise<{ exportedCount: number }> {
  const outOfBounds = options.outOfBounds ?? 'clip'

  // 활성 split 확인
  const activeSplits = [...new Set(items.map((item) => item.split))] as ('train' | 'val' | 'test')[]
  await createCocoDirectories(exportPath, new Set(activeSplits))

  // 카테고리 생성
  const categories: CocoCategory[] = Object.entries(classes)
    .map(([id, name]) => ({ id: Number(id), name }))
    .sort((a, b) => a.id - b.id)

  let exportedCount = 0

  // 각 split 별로 처리
  for (const split of activeSplits) {
    const splitItems = items.filter((item) => item.split === split)
    const images: CocoImage[] = []
    const annotations: CocoAnnotation[] = []
    let annotationId = 1

    for (const [index, item] of splitItems.entries()) {
      const imageOutPath = getImagePath(item.imageFilename, split, exportPath)

      // 이미지 복사/리사이즈
      const resized = await writeExportImage(item.imagePath, imageOutPath, options.resize)

      const imageId = index + 1

      // 이미지 정보
      images.push({
        id: imageId,
        file_name: item.imageFilename,
        width: resized.width,
        height: resized.height
      })

      // 어노테이션 처리 (COCO 본 포맷은 BB만 — Polygon/Keypoint는 별도 export로)
      for (const annotation of item.labelData.annotations) {
        if (!('bbox' in annotation) || !annotation.bbox) continue
        // Keypoint 어노테이션은 bbox가 옵션이므로 BBAnnotation만 통과
        if ('keypoints' in annotation) continue

        const scaled = scaleBbox(annotation.bbox, item.labelData.image_info, resized)
        const processed = applyOutOfBoundsPolicyToBbox(scaled, resized, outOfBounds)
        if (processed === null) continue

        const width = Math.max(0, processed.x2 - processed.x1)
        const height = Math.max(0, processed.y2 - processed.y1)
        if (width <= 0 || height <= 0) continue

        annotations.push({
          id: annotationId++,
          image_id: imageId,
          category_id: annotation.class_id,
          bbox: [processed.x1, processed.y1, width, height],
          area: width * height,
          iscrowd: 0
        })
      }

      exportedCount++
    }

    // COCO JSON 파일 저장
    const cocoData: CocoDataset = {
      images,
      annotations,
      categories
    }

    await writeFile(
      getImagePath('_annotations.coco.json', split, exportPath).replace('/images/', '/'),
      JSON.stringify(cocoData, null, 2),
      'utf-8'
    )
  }

  return { exportedCount }
}
