import { readdir, stat, mkdir, writeFile, readFile, copyFile } from 'fs/promises';
import { existsSync } from 'fs';
import { join, extname } from 'path';
import { createHash } from 'crypto';
import sharp from 'sharp';

const SUPPORTED_IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.bmp', '.webp'];

// 디렉토리 내 이미지 파일 목록 조회
export async function getImageFiles(dirPath: string): Promise<string[]> {
  if (!existsSync(dirPath)) {
    return [];
  }

  const files = await readdir(dirPath);
  const imageFiles: string[] = [];

  for (const file of files) {
    const filePath = join(dirPath, file);
    const fileStat = await stat(filePath);

    if (fileStat.isFile()) {
      const ext = extname(file).toLowerCase();
      if (SUPPORTED_IMAGE_EXTENSIONS.includes(ext)) {
        imageFiles.push(filePath);
      }
    }
  }

  // 파일명으로 정렬
  return imageFiles.sort();
}

// 디렉토리 존재 확인 및 생성
export async function ensureDir(dirPath: string): Promise<void> {
  if (!existsSync(dirPath)) {
    await mkdir(dirPath, { recursive: true });
  }
}

// JSON 파일 읽기
export async function readJsonFile<T>(filePath: string): Promise<T | null> {
  if (!existsSync(filePath)) {
    return null;
  }

  const content = await readFile(filePath, 'utf-8');
  try {
    return JSON.parse(content) as T;
  } catch {
    return null;
  }
}

// JSON 파일 쓰기
export async function writeJsonFile<T>(filePath: string, data: T): Promise<void> {
  const content = JSON.stringify(data, null, 2);
  await writeFile(filePath, content, 'utf-8');
}

// YAML 파일 읽기 (간단한 파서)
export async function readYamlFile<T>(filePath: string): Promise<T | null> {
  if (!existsSync(filePath)) {
    return null;
  }

  const content = await readFile(filePath, 'utf-8');
  return parseYaml(content) as T;
}

// YAML 파일 쓰기 (간단한 직렬화)
export async function writeYamlFile(filePath: string, data: Record<string, unknown>): Promise<void> {
  const content = stringifyYaml(data);
  await writeFile(filePath, content, 'utf-8');
}

// 간단한 YAML 파서
function parseYaml(content: string): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  const lines = content.split('\n');
  let currentObject: Record<string, unknown> | null = null;

  for (const line of lines) {
    if (line.trim() === '' || line.trim().startsWith('#')) {
      continue;
    }

    const colonIndex = line.indexOf(':');
    if (colonIndex === -1) continue;

    const key = line.substring(0, colonIndex).trim();
    const value = line.substring(colonIndex + 1).trim();

    // 들여쓰기 확인 (names 같은 중첩 객체)
    if (line.startsWith('  ') && currentObject !== null) {
      const nestedKey = key;
      const nestedValue = value.startsWith("'") ? value.slice(1, -1) : parseValue(value);
      currentObject[nestedKey] = nestedValue;
    } else {
      if (value === '') {
        // 중첩 객체 시작
        currentObject = {};
        result[key] = currentObject;
      } else {
        const parsedValue = value.startsWith("'") ? value.slice(1, -1) : parseValue(value);
        result[key] = parsedValue;
        currentObject = null;
      }
    }
  }

  return result;
}

function parseValue(value: string): unknown {
  if (value === 'true') return true;
  if (value === 'false') return false;
  if (value === 'null') return null;
  if (/^\d+$/.test(value)) return parseInt(value, 10);
  if (/^\d+\.\d+$/.test(value)) return parseFloat(value);
  return value;
}

// 간단한 YAML 직렬화
function stringifyYaml(data: Record<string, unknown>, indent = 0): string {
  const lines: string[] = [];
  const indentStr = '  '.repeat(indent);

  for (const [key, value] of Object.entries(data)) {
    if (value === null || value === undefined) {
      continue;
    }

    if (typeof value === 'object' && !Array.isArray(value)) {
      lines.push(`${indentStr}${key}:`);
      lines.push(stringifyYaml(value as Record<string, unknown>, indent + 1));
    } else if (Array.isArray(value)) {
      lines.push(`${indentStr}${key}:`);
      for (const item of value) {
        lines.push(`${indentStr}  - ${item}`);
      }
    } else if (typeof value === 'string') {
      lines.push(`${indentStr}${key}: '${value}'`);
    } else {
      lines.push(`${indentStr}${key}: ${value}`);
    }
  }

  return lines.join('\n');
}

// 이미지 파일 복사 (9자리 숫자로 변경)
export async function copyImageWithRename(
  sourcePath: string,
  destDir: string,
  index: number
): Promise<{ newFilename: string; destPath: string }> {
  const ext = extname(sourcePath);
  const newId = String(index).padStart(9, '0');
  const newFilename = `${newId}${ext}`;
  const destPath = join(destDir, newFilename);

  await copyFile(sourcePath, destPath);

  return { newFilename, destPath };
}

// UUID 생성
export function generateId(): string {
  return createHash('md5')
    .update(Date.now().toString() + Math.random().toString())
    .digest('hex')
    .substring(0, 8);
}

// 현재 날짜 문자열 (YYYY-MM-DD)
export function getCurrentDateString(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// 이미지 크기 조회 (width, height)
export async function getImageDimensions(
  imagePath: string
): Promise<{ width: number; height: number }> {
  try {
    const metadata = await sharp(imagePath).metadata();
    return {
      width: metadata.width || 0,
      height: metadata.height || 0
    };
  } catch {
    return { width: 0, height: 0 };
  }
}
