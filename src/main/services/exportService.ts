import { existsSync } from 'fs';
import { copyFile } from 'fs/promises';
import { readdir, writeFile } from 'fs/promises';
import { basename, extname, join } from 'path';
import sharp from 'sharp';
import type {
  BBAnnotation,
  ExportOptions,
  ExportResult,
  LabelData,
  OBBAnnotation,
  WorkspaceConfig
} from '../types/workspace.js';
import { ensureDir, readJsonFile, readYamlFile } from './fileService.js';

type ExportableItem = {
  imageId: string;
  imageFilename: string;
  imagePath: string;
  labelData: LabelData;
  split: 'train' | 'val' | 'test';
};

const WORKSPACE_FILE = 'workspace.yaml';
const SRC_DIR = 'src';
const LABEL_DIR = 'label';

export async function exportWorkspace(
  workspacePath: string,
  options: ExportOptions
): Promise<ExportResult> {
  try {
    const config = await readYamlFile<WorkspaceConfig>(join(workspacePath, WORKSPACE_FILE));
    if (!config) {
      return { success: false, error: 'workspace.yaml을 읽을 수 없습니다.' };
    }

    const items = await collectExportItems(workspacePath, options.includeCompletedOnly);
    if (items.length === 0) {
      return { success: false, error: '내보낼 라벨 데이터가 없습니다.' };
    }

    shuffleArray(items);
    assignSplits(items, options.split);

    await ensureDir(options.outputPath);
    const exportDirPath = join(options.outputPath, sanitizeExportName(options.exportName));

    if (existsSync(exportDirPath)) {
      return {
        success: false,
        error: '같은 이름의 export 디렉토리가 이미 존재합니다.'
      };
    }

    await ensureDir(exportDirPath);

    if (options.format === 'coco') {
      await exportCocoDataset(items, options, config.names, exportDirPath);
    } else {
      await exportTextDataset(items, options, exportDirPath);
    }

    return {
      success: true,
      outputPath: exportDirPath,
      exportedCount: items.length,
      skippedCount: 0
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : '내보내기에 실패했습니다.'
    };
  }
}

async function collectExportItems(
  workspacePath: string,
  includeCompletedOnly: boolean
): Promise<ExportableItem[]> {
  const labelDir = join(workspacePath, LABEL_DIR);
  const srcDir = join(workspacePath, SRC_DIR);

  if (!existsSync(labelDir) || !existsSync(srcDir)) {
    return [];
  }

  const labelFiles = await readdir(labelDir);
  const items: ExportableItem[] = [];

  for (const file of labelFiles.sort()) {
    if (!file.endsWith('.json')) continue;
    if (includeCompletedOnly && !file.endsWith('_C.json')) continue;

    const imageId = file.replace(/(_C|_W)?\.json$/, '');
    const labelData = await readJsonFile<LabelData>(join(labelDir, file));

    if (!labelData || labelData.annotations.length === 0) {
      continue;
    }

    const imagePath = join(srcDir, labelData.image_info.filename);
    if (!existsSync(imagePath)) {
      continue;
    }

    items.push({
      imageId,
      imageFilename: labelData.image_info.filename,
      imagePath,
      labelData,
      split: 'train'
    });
  }

  return items;
}

function assignSplits(
  items: ExportableItem[],
  split: { train: number; val: number; test: number }
): void {
  const total = items.length;
  const trainCount = Math.round((total * split.train) / 100);
  const valCount = Math.round((total * split.val) / 100);

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

async function exportTextDataset(
  items: ExportableItem[],
  options: ExportOptions,
  exportDirPath: string
): Promise<void> {
  // 실제 데이터가 있는 split만 폴더 생성
  const activeSplits = new Set(items.map((item) => item.split));
  for (const split of activeSplits) {
    await ensureDir(join(exportDirPath, split, 'images'));
    await ensureDir(join(exportDirPath, split, 'labels'));
  }

  for (const item of items) {
    const imageOutPath = join(exportDirPath, item.split, 'images', item.imageFilename);
    const labelOutPath = join(
      exportDirPath,
      item.split,
      'labels',
      `${basename(item.imageFilename, extname(item.imageFilename))}.txt`
    );

    const resized = await writeExportImage(item.imagePath, imageOutPath, options);
    const lines = item.labelData.annotations
      .map((annotation) => formatAnnotation(annotation, item.labelData.image_info, resized, options.format))
      .filter((line): line is string => Boolean(line));

    await writeFile(labelOutPath, lines.join('\n'), 'utf-8');
  }
}

async function exportCocoDataset(
  items: ExportableItem[],
  options: ExportOptions,
  names: Record<number, string>,
  exportDirPath: string
): Promise<void> {
  const categories = Object.entries(names).map(([id, name]) => ({ id: Number(id), name }));

  // 실제 데이터가 있는 split만 처리
  const activeSplits = [...new Set(items.map((item) => item.split))] as ('train' | 'val' | 'test')[];
  for (const split of activeSplits) {
    await ensureDir(join(exportDirPath, split, 'images'));
  }

  for (const split of activeSplits) {
    const splitItems = items.filter((item) => item.split === split);
    const images: Array<Record<string, unknown>> = [];
    const annotations: Array<Record<string, unknown>> = [];
    let annotationId = 1;

    for (const [index, item] of splitItems.entries()) {
      const imageOutPath = join(exportDirPath, split, 'images', item.imageFilename);
      const resized = await writeExportImage(item.imagePath, imageOutPath, options);
      const imageId = index + 1;

      images.push({
        id: imageId,
        file_name: item.imageFilename,
        width: resized.width,
        height: resized.height
      });

      for (const annotation of item.labelData.annotations) {
        if (!('bbox' in annotation)) continue;
        const [x1, y1, x2, y2] = scaleBbox(annotation.bbox, item.labelData.image_info, resized);
        annotations.push({
          id: annotationId++,
          image_id: imageId,
          category_id: annotation.class_id,
          bbox: [x1, y1, x2 - x1, y2 - y1],
          area: Math.max(0, x2 - x1) * Math.max(0, y2 - y1),
          iscrowd: 0
        });
      }
    }

    await writeFile(
      join(exportDirPath, split, '_annotations.coco.json'),
      JSON.stringify({ images, annotations, categories }, null, 2),
      'utf-8'
    );
  }
}

function shuffleArray<T>(array: T[]): void {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
}

function sanitizeExportName(name: string): string {
  return name.trim().replace(/[\\/:*?"<>|]+/g, '-');
}

async function writeExportImage(
  sourcePath: string,
  destinationPath: string,
  options: ExportOptions
): Promise<{ width: number; height: number }> {
  if (options.resize?.enabled) {
    await sharp(sourcePath)
      .resize(options.resize.width, options.resize.height)
      .toFile(destinationPath);

    return { width: options.resize.width, height: options.resize.height };
  }

  await copyFile(sourcePath, destinationPath);
  const metadata = await sharp(sourcePath).metadata();
  return {
    width: metadata.width ?? 0,
    height: metadata.height ?? 0
  };
}

function formatAnnotation(
  annotation: BBAnnotation | OBBAnnotation,
  imageInfo: LabelData['image_info'],
  resized: { width: number; height: number },
  format: ExportOptions['format']
): string | null {
  if ('bbox' in annotation) {
    if (format !== 'yolo') return null;
    const [x1, y1, x2, y2] = scaleBbox(annotation.bbox, imageInfo, resized);
    const cx = ((x1 + x2) / 2) / resized.width;
    const cy = ((y1 + y2) / 2) / resized.height;
    const w = (x2 - x1) / resized.width;
    const h = (y2 - y1) / resized.height;
    return `${annotation.class_id} ${cx} ${cy} ${w} ${h}`;
  }

  if (format === 'yolo-obb') {
    const [cx, cy, w, h, angle] = scaleObb(annotation.obb, imageInfo, resized);
    return `${annotation.class_id} ${cx / resized.width} ${cy / resized.height} ${w / resized.width} ${h / resized.height} ${angle}`;
  }

  if (format === 'dota') {
    const points = obbToPolygon(scaleObb(annotation.obb, imageInfo, resized));
    return `${points.join(' ')} ${annotation.class_id}`;
  }

  return null;
}

function scaleBbox(
  bbox: [number, number, number, number],
  imageInfo: LabelData['image_info'],
  resized: { width: number; height: number }
): [number, number, number, number] {
  const scaleX = imageInfo.width > 0 ? resized.width / imageInfo.width : 1;
  const scaleY = imageInfo.height > 0 ? resized.height / imageInfo.height : 1;
  return [bbox[0] * scaleX, bbox[1] * scaleY, bbox[2] * scaleX, bbox[3] * scaleY];
}

function scaleObb(
  obb: [number, number, number, number, number],
  imageInfo: LabelData['image_info'],
  resized: { width: number; height: number }
): [number, number, number, number, number] {
  const scaleX = imageInfo.width > 0 ? resized.width / imageInfo.width : 1;
  const scaleY = imageInfo.height > 0 ? resized.height / imageInfo.height : 1;
  return [obb[0] * scaleX, obb[1] * scaleY, obb[2] * scaleX, obb[3] * scaleY, obb[4]];
}

function obbToPolygon(
  obb: [number, number, number, number, number]
): [number, number, number, number, number, number, number, number] {
  const [cx, cy, w, h, angle] = obb;
  const rad = (angle * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const halfW = w / 2;
  const halfH = h / 2;
  const corners: Array<[number, number]> = [
    [-halfW, -halfH],
    [halfW, -halfH],
    [halfW, halfH],
    [-halfW, halfH]
  ];

  return corners.flatMap(([x, y]) => [cx + x * cos - y * sin, cy + x * sin + y * cos]) as [
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number
  ];
}