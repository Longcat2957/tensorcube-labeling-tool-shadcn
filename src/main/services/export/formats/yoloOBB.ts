/**
 * YOLO-OBB 포맷 (Oriented Bounding Box) 익스포터
 */

import { writeFile } from 'fs/promises';
import type { BBAnnotation, OBBAnnotation } from '../../../types/workspace.js';
import type { ExportableItem } from '../types.js';
import {
  writeExportImage,
  scaleObb,
  createDatasetDirectories,
  getLabelPath,
  getImagePath,
} from '../utils.js';
import { writeDataYaml } from '../datasetYaml.js';

/**
 * YOLO-OBB 라벨 라인 생성 (정규화된 cx, cy, w, h, angle)
 */
function formatYoloObbLabel(
  annotation: BBAnnotation | OBBAnnotation,
  originalSize: { width: number; height: number },
  targetSize: { width: number; height: number }
): string | null {
  // YOLO-OBB 포맷은 OBB만 지원
  if (!('obb' in annotation)) {
    return null;
  }

  const scaled = scaleObb(annotation.obb, originalSize, targetSize);

  // 정규화 (cx, cy, w, h만 정규화, angle은 그대로)
  const cxNorm = scaled.cx / targetSize.width;
  const cyNorm = scaled.cy / targetSize.height;
  const wNorm = scaled.width / targetSize.width;
  const hNorm = scaled.height / targetSize.height;

  return `${annotation.class_id} ${cxNorm.toFixed(6)} ${cyNorm.toFixed(6)} ${wNorm.toFixed(6)} ${hNorm.toFixed(6)} ${scaled.angle}`;
}

/**
 * YOLO-OBB 포맷으로 내보내기
 */
export async function exportYoloObbDataset(
  items: ExportableItem[],
  exportPath: string,
  classes: Record<number, string>,
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
      const line = formatYoloObbLabel(
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

  // data.yaml 생성
  const hasTest = activeSplits.has('test');
  await writeDataYaml(exportPath, classes, { hasTestSplit: hasTest });

  return { exportedCount };
}