/**
 * Export 진입점
 * 다양한 포맷으로 데이터셋 내보내기
 */

import { existsSync } from 'fs';
import { join } from 'path';
import { ensureDir, readYamlFile } from '../fileService.js';
import type { ExportOptions, ExportResult, WorkspaceConfig } from '../../types/workspace.js';
import { collectExportItems, shuffleArray, assignSplits, sanitizeExportName } from './utils.js';
import { exportYoloDataset } from './formats/yolo.js';
import { exportYoloObbDataset } from './formats/yoloOBB.js';
import { exportCocoDataset } from './formats/coco.js';
import { exportDotaDataset } from './formats/dota.js';

const WORKSPACE_FILE = 'workspace.yaml';

/**
 * 워크스페이스 내보내기
 */
export async function exportWorkspace(
  workspacePath: string,
  options: ExportOptions
): Promise<ExportResult> {
  console.log('[Export] 시작:', { workspacePath, options });
  
  try {
    // 설정 로드
    const config = await readYamlFile<WorkspaceConfig>(join(workspacePath, WORKSPACE_FILE));
    if (!config) {
      console.error('[Export] workspace.yaml 읽기 실패');
      return { success: false, error: 'workspace.yaml을 읽을 수 없습니다.' };
    }
    console.log('[Export] 설정 로드 완료:', config);

    // 내보낼 아이템 수집
    console.log('[Export] 아이템 수집 중... includeCompletedOnly:', options.includeCompletedOnly);
    const items = await collectExportItems(workspacePath, options.includeCompletedOnly);
    console.log('[Export] 수집된 아이템 수:', items.length);
    
    if (items.length === 0) {
      console.warn('[Export] 내보낼 데이터가 없음');
      return { success: false, error: '내보낼 라벨 데이터가 없습니다.' };
    }

    // 셔플 및 분할
    shuffleArray(items);
    assignSplits(items, options.split);
    const splitCounts = { train: 0, val: 0, test: 0 };
    items.forEach(item => splitCounts[item.split]++);
    console.log('[Export] 분할 완료:', splitCounts);

    // 내보내기 디렉토리 생성
    await ensureDir(options.outputPath);
    const exportDirPath = join(options.outputPath, sanitizeExportName(options.exportName));
    console.log('[Export] 출력 경로:', exportDirPath);

    if (existsSync(exportDirPath)) {
      console.error('[Export] 디렉토리 이미 존재:', exportDirPath);
      return { success: false, error: '같은 이름의 export 디렉토리가 이미 존재합니다.' };
    }

    await ensureDir(exportDirPath);

    // 포맷별 내보내기
    console.log('[Export] 포맷:', options.format, '처리 시작');
    let exportedCount: number;

    try {
      const formatOptions = {
        resize: options.resize,
        outOfBounds: options.outOfBounds ?? 'clip',
      };

      switch (options.format) {
        case 'yolo':
          const yoloResult = await exportYoloDataset(items, exportDirPath, config.names, formatOptions);
          exportedCount = yoloResult.exportedCount;
          break;

        case 'yolo-obb':
          const yoloObbResult = await exportYoloObbDataset(items, exportDirPath, config.names, formatOptions);
          exportedCount = yoloObbResult.exportedCount;
          break;

        case 'coco':
          const cocoResult = await exportCocoDataset(items, exportDirPath, config.names, formatOptions);
          exportedCount = cocoResult.exportedCount;
          break;

        case 'dota':
          const dotaResult = await exportDotaDataset(items, exportDirPath, formatOptions);
          exportedCount = dotaResult.exportedCount;
          break;

        default:
          return { success: false, error: `지원하지 않는 포맷: ${options.format}` };
      }
    } catch (formatError) {
      console.error('[Export] 포맷 처리 중 오류:', formatError);
      throw formatError;
    }

    console.log('[Export] 완료:', { exportedCount, outputPath: exportDirPath });
    return {
      success: true,
      outputPath: exportDirPath,
      exportedCount,
      skippedCount: 0,
    };
  } catch (error) {
    console.error('[Export] 오류 발생:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : '내보내기에 실패했습니다.',
    };
  }
}

// 타입 재-export (기존 호환성)
export type { ExportOptions, ExportResult } from '../../types/workspace.js';
