/**
 * YOLO 포맷 (Bounding Box) 익스포터
 */

import { writeFile } from 'fs/promises';
import type { BBAnnotation, OBBAnnotation } from '../../../types/workspace.js';
import type { ExportableItem } from '../types.js';
import {
  writeExportImage,
  scaleBbox,
  normalizeBboxForYolo,
  createDatasetDirectories,
  getLabelPath,
  getImagePath,
} from '../utils.js';
import { writeDataYaml } from '../datasetYaml.js';

/**
 * YOLO 라벨 라인 생성 (정규화된 cx, cy, w, h)
 */
function formatYoloLabel(
  annotation: BBAnnotation | OBBAnnotation,
  originalSize: { width: number; height: number },
  targetSize: { width: number; height: number }
): string | null {
  // YOLO 포맷은 BB만 지원
  if (!('bbox' in annotation)) {
    return null;
  }

  const scaled = scaleBbox(annotation.bbox, originalSize, targetSize);
  const normalized = normalizeBboxForYolo(scaled, targetSize);

  return `${annotation.class_id} ${normalized.cx.toFixed(6)} ${normalized.cy.toFixed(6)} ${normalized.width.toFixed(6)} ${normalized.height.toFixed(6)}`;
}

/**
 * YOLO 포맷으로 내보내기
 */
export async function exportYoloDataset(
  items: ExportableItem[],
  exportPath: string,
  classes: Record<number, string>,
  options: {
    resize?: { enabled: boolean; width: number; height: number };
  }
): Promise<{ exportedCount: number }> {
  console.log('[YOLO] Export 시작:', { 
    itemCount: items.length, 
    exportPath, 
    classes,
    resize: options.resize 
  });
  
  // 활성 split 확인
  const activeSplits = new Set(items.map(item => item.split));
  console.log('[YOLO] 활성 split:', [...activeSplits]);
  
  await createDatasetDirectories(exportPath, activeSplits);

  // 아이템 처리
  let exportedCount = 0;
  let errorCount = 0;

  for (const item of items) {
    try {
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
        const line = formatYoloLabel(
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
      
      if (exportedCount % 100 === 0) {
        console.log(`[YOLO] 진행 중: ${exportedCount}/${items.length}`);
      }
    } catch (error) {
      console.error('[YOLO] 아이템 처리 실패:', item.imageFilename, error);
      errorCount++;
    }
  }

  // data.yaml 생성
  const hasTest = activeSplits.has('test');
  await writeDataYaml(exportPath, classes, { hasTestSplit: hasTest });
  
  console.log('[YOLO] Export 완료:', { exportedCount, errorCount });
  return { exportedCount };
}
