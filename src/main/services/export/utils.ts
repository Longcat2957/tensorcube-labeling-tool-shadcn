/**
 * Export 공통 유틸리티 함수
 */

import { existsSync } from 'fs';
import { copyFile } from 'fs/promises';
import { readdir } from 'fs/promises';
import { basename, extname, join } from 'path';
import sharp from 'sharp';
import { ensureDir, readJsonFile } from '../fileService.js';
import type { LabelData } from '../../types/workspace.js';
import type { ExportableItem, ScaledSize, ScaledBbox, ScaledObb } from './types.js';

export const WORKSPACE_FILE = 'workspace.yaml';
export const SRC_DIR = 'src';
export const LABEL_DIR = 'label';

/**
 * 배열 셔플 (Fisher-Yates 알고리즘)
 */
export function shuffleArray<T>(array: T[]): void {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
}

/**
 * Export 이름 정규화
 */
export function sanitizeExportName(name: string): string {
  return name.trim().replace(/[\\/:*?"<>|]+/g, '-');
}

/**
 * 데이터셋 분할 할당 (강화된 버전)
 * - 분할 비율 정규화
 * - 최소 샘플 보장
 * - 반올림 오차 처리
 */
export function assignSplits(
  items: ExportableItem[],
  split: { train: number; val: number; test: number }
): void {
  const total = items.length;
  if (total === 0) return;

  // 분할 비율 정규화 (합이 100이 되도록)
  const totalRatio = split.train + split.val + split.test;
  const normalizedTrain = split.train / totalRatio;
  const normalizedVal = split.val / totalRatio;

  // 각 split별 개수 계산
  let trainCount = Math.round(total * normalizedTrain);
  let valCount = Math.round(total * normalizedVal);
  let testCount = total - trainCount - valCount; // 나머지를 test에 할당하여 합이 정확히 total이 되도록

  // 최소 1개 보장 (데이터가 충분할 때만)
  if (total >= 3) {
    if (split.train > 0 && trainCount < 1) trainCount = 1;
    if (split.val > 0 && valCount < 1) valCount = 1;
    if (split.test > 0 && testCount < 1) testCount = 1;
    
    // 재조정 (합이 total을 초과하면 test에서 차감)
    const excess = trainCount + valCount + testCount - total;
    if (excess > 0 && testCount > 1) {
      testCount -= excess;
    }
  }

  // 0% 비율인 split은 0개로 설정
  if (split.train === 0) trainCount = 0;
  if (split.val === 0) valCount = 0;
  if (split.test === 0) testCount = 0;

  items.forEach((item, index) => {
    if (index < trainCount) {
      item.split = 'train';
    } else if (index < trainCount + valCount) {
      item.split = 'val';
    } else {
      item.split = 'test';
    }
  });
}

/**
 * Export 아이템 수집
 * 빈 어노테이션도 포함 (이미지만 있는 경우도 export)
 */
export async function collectExportItems(
  workspacePath: string,
  includeCompletedOnly: boolean
): Promise<ExportableItem[]> {
  console.log('[Export] collectExportItems 시작:', { workspacePath, includeCompletedOnly });
  
  const labelDir = join(workspacePath, LABEL_DIR);
  const srcDir = join(workspacePath, SRC_DIR);

  if (!existsSync(labelDir)) {
    console.error('[Export] 라벨 디렉토리 없음:', labelDir);
    return [];
  }
  if (!existsSync(srcDir)) {
    console.error('[Export] 소스 디렉토리 없음:', srcDir);
    return [];
  }

  const labelFiles = await readdir(labelDir);
  console.log('[Export] 전체 라벨 파일 수:', labelFiles.length);
  
  const items: ExportableItem[] = [];
  let skipped = 0;

  for (const file of labelFiles.sort()) {
    if (!file.endsWith('.json')) continue;
    if (includeCompletedOnly && !file.endsWith('_C.json')) continue;

    const imageId = file.replace(/(_C|_W)?\.json$/, '');
    const labelData = await readJsonFile<LabelData>(join(labelDir, file));

    // labelData가 없는 경우만 건너뜀 (빈 어노테이션은 허용)
    if (!labelData) {
      console.warn('[Export] 라벨 데이터 읽기 실패:', file);
      skipped++;
      continue;
    }

    const imagePath = join(srcDir, labelData.image_info.filename);
    if (!existsSync(imagePath)) {
      console.warn('[Export] 이미지 파일 없음:', imagePath);
      skipped++;
      continue;
    }

    items.push({
      imageId,
      imageFilename: labelData.image_info.filename,
      imagePath,
      labelData: {
        image_info: labelData.image_info,
        // 빈 어노테이션도 포함
        annotations: labelData.annotations || [],
      },
      split: 'train',
    });
  }

  console.log('[Export] 수집 완료:', { collected: items.length, skipped });
  return items;
}

/**
 * 이미지 리사이즈 및 복사
 */
export async function writeExportImage(
  sourcePath: string,
  destinationPath: string,
  resize?: { enabled: boolean; width: number; height: number }
): Promise<ScaledSize> {
  if (resize?.enabled) {
    await sharp(sourcePath)
      .resize(resize.width, resize.height)
      .toFile(destinationPath);

    return { width: resize.width, height: resize.height };
  }

  await copyFile(sourcePath, destinationPath);
  const metadata = await sharp(sourcePath).metadata();
  return {
    width: metadata.width ?? 0,
    height: metadata.height ?? 0,
  };
}

/**
 * BBox 좌표 스케일링
 */
export function scaleBbox(
  bbox: [number, number, number, number],
  originalSize: { width: number; height: number },
  targetSize: ScaledSize
): ScaledBbox {
  const scaleX = originalSize.width > 0 ? targetSize.width / originalSize.width : 1;
  const scaleY = originalSize.height > 0 ? targetSize.height / originalSize.height : 1;

  return {
    x1: bbox[0] * scaleX,
    y1: bbox[1] * scaleY,
    x2: bbox[2] * scaleX,
    y2: bbox[3] * scaleY,
  };
}

/**
 * OBB 좌표 스케일링
 */
export function scaleObb(
  obb: [number, number, number, number, number],
  originalSize: { width: number; height: number },
  targetSize: ScaledSize
): ScaledObb {
  const scaleX = originalSize.width > 0 ? targetSize.width / originalSize.width : 1;
  const scaleY = originalSize.height > 0 ? targetSize.height / originalSize.height : 1;

  return {
    cx: obb[0] * scaleX,
    cy: obb[1] * scaleY,
    width: obb[2] * scaleX,
    height: obb[3] * scaleY,
    angle: obb[4], // 각도는 스케일링 불필요
  };
}

/**
 * OBB를 폴리곤 4점 좌표로 변환 (DOTA 포맷용)
 */
export function obbToPolygon(obb: ScaledObb): [number, number, number, number, number, number, number, number] {
  const { cx, cy, width, height, angle } = obb;
  const rad = (angle * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const halfW = width / 2;
  const halfH = height / 2;

  const corners: Array<[number, number]> = [
    [-halfW, -halfH],
    [halfW, -halfH],
    [halfW, halfH],
    [-halfW, halfH],
  ];

  return corners.flatMap(([x, y]) => [cx + x * cos - y * sin, cy + x * sin + y * cos]) as [
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
  ];
}

/**
 * YOLO 포맷용 BB 좌표 정규화
 */
export function normalizeBboxForYolo(
  bbox: ScaledBbox,
  imageSize: ScaledSize
): { cx: number; cy: number; width: number; height: number } {
  const cx = ((bbox.x1 + bbox.x2) / 2) / imageSize.width;
  const cy = ((bbox.y1 + bbox.y2) / 2) / imageSize.height;
  const width = (bbox.x2 - bbox.x1) / imageSize.width;
  const height = (bbox.y2 - bbox.y1) / imageSize.height;

  return { cx, cy, width, height };
}

/**
 * 디렉토리 구조 생성 (images, labels 서브디렉토리 포함)
 */
export async function createDatasetDirectories(
  basePath: string,
  splits: Set<string>
): Promise<void> {
  for (const split of splits) {
    await ensureDir(join(basePath, split, 'images'));
    await ensureDir(join(basePath, split, 'labels'));
  }
}

/**
 * COCO용 디렉토리 구조 생성 (images 서브디렉토리만)
 */
export async function createCocoDirectories(
  basePath: string,
  splits: Set<string>
): Promise<void> {
  for (const split of splits) {
    await ensureDir(join(basePath, split, 'images'));
  }
}

/**
 * 라벨 파일 경로 생성
 */
export function getLabelPath(imageFilename: string, split: string, basePath: string): string {
  const baseName = basename(imageFilename, extname(imageFilename));
  return join(basePath, split, 'labels', `${baseName}.txt`);
}

/**
 * 이미지 파일 경로 생성
 */
export function getImagePath(imageFilename: string, split: string, basePath: string): string {
  return join(basePath, split, 'images', imageFilename);
}