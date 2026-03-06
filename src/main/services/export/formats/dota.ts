/**
 * DOTA 포맷 (OBB 전용) 익스포터
 */

import { writeFile } from 'fs/promises';
import type { BBAnnotation, OBBAnnotation } from '../../../types/workspace.js';
import type { ExportableItem } from '../types.js';
import {
  writeExportImage,
  scaleObb,
  obbToPolygon,
  createDatasetDirectories,
  getLabelPath,
  getImagePath,
} from '../utils.js';

/**
 * DOTA 라벨 라인 생성 (4점 폴리곤 좌표 + class_id)
 * 포맷: x1 y1 x2 y2 x3 y3 x4 y4 class_id
 */
function formatDotaLabel(
  annotation: BBAnnotation | OBBAnnotation,
  originalSize: { width: number; height: number },
  targetSize: { width: number; height: number }
): string | null {
  // DOTA 포맷은 OBB만 지원
  if (!('obb' in annotation)) {
    return null;
  }

  const scaled = scaleObb(annotation.obb, originalSize, targetSize);
  const polygon = obbToPolygon(scaled);

  // DOTA 포맷: x1 y1 x2 y2 x3 y3 x4 y4 class_id
  return `${polygon.join(' ')} ${annotation.class_id}`;
}

/**
 * DOTA 포맷으로 내보내기
 */
export async function exportDotaDataset(
  items: ExportableItem[],
  exportPath: string,
  options: {
    resize?: { enabled: boolean; width: number; height: number };
  }
): Promise<{ exportedCount: number }> {
  // 활성 split 확인
  const activeSplits = new Set(items.map(item => item.split));
  await createDatasetDirectories(exportPath, activeSplits);

  // 아이템 처리
  let exportedCount = 0;

  for (const item of items) {
    const imageOutPath = getImagePath(item.imageFilename, item.split, exportPath);
    const labelOutPath = getLabelPath(item.imageFilename, item.split, exportPath);

    // 이미지 복사/리사이즈
    const resized = await writeExportImage(
      item.imagePath,
      imageOutPath,
      options.resize
    );

    // 라벨 파일 생성
    const lines: string[] = [];
    for (const annotation of item.labelData.annotations) {
      const line = formatDotaLabel(
        annotation,
        item.labelData.image_info,
        resized
      );
      if (line) {
        lines.push(line);
      }
    }

    await writeFile(labelOutPath, lines.join('\n'), 'utf-8');
    exportedCount++;
  }

  return { exportedCount };
}