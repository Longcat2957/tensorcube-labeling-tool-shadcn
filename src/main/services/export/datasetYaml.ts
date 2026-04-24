/**
 * Ultralytics dataset.yaml 생성기
 * YOLO/YOLO-OBB 포맷에서 사용
 */

import { writeFile } from 'fs/promises'
import { join } from 'path'

export interface DataYamlConfig {
  /** 데이터셋 루트 경로 (상대경로) */
  path: string
  /** 학습 데이터 경로 */
  train: string
  /** 검증 데이터 경로 */
  val: string
  /** 테스트 데이터 경로 (선택) */
  test?: string
  /** 클래스 수 */
  nc: number
  /** 클래스 이름 목록 (ID 순서대로) */
  names: string[]
}

/**
 * Ultralytics data.yaml 포맷으로 변환
 */
export function generateDataYamlContent(config: DataYamlConfig): string {
  const lines: string[] = []

  // 경로 정보
  lines.push(`path: ${config.path}`)
  lines.push(`train: ${config.train}`)
  lines.push(`val: ${config.val}`)
  if (config.test) {
    lines.push(`test: ${config.test}`)
  }
  lines.push('')

  // 클래스 정보
  lines.push(`nc: ${config.nc}`)
  lines.push(`names: [${config.names.map((n) => `'${n}'`).join(', ')}]`)

  return lines.join('\n')
}

/**
 * data.yaml 파일 생성
 */
export async function writeDataYaml(
  exportPath: string,
  classes: Record<number, string>,
  options?: {
    hasTestSplit?: boolean
    relativePath?: string
  }
): Promise<string> {
  const sortedClasses = Object.entries(classes)
    .sort(([a], [b]) => Number(a) - Number(b))
    .map(([, name]) => name)

  const config: DataYamlConfig = {
    path: options?.relativePath ?? '.',
    train: 'train/images',
    val: 'val/images',
    test: options?.hasTestSplit ? 'test/images' : undefined,
    nc: sortedClasses.length,
    names: sortedClasses
  }

  const content = generateDataYamlContent(config)
  const yamlPath = join(exportPath, 'data.yaml')

  await writeFile(yamlPath, content, 'utf-8')
  return yamlPath
}

/**
 * ROBOFLOW/YOLO 포맷의 data.yaml 파싱 (향후 import 기능용)
 */
export function parseDataYaml(content: string): DataYamlConfig | null {
  try {
    const lines = content.split('\n').filter((line) => line.trim())
    const result: Partial<DataYamlConfig> = {}

    for (const line of lines) {
      const colonIndex = line.indexOf(':')
      if (colonIndex === -1) continue

      const key = line.substring(0, colonIndex).trim()
      const value = line.substring(colonIndex + 1).trim()

      switch (key) {
        case 'path':
          result.path = value
          break
        case 'train':
          result.train = value
          break
        case 'val':
          result.val = value
          break
        case 'test':
          result.test = value
          break
        case 'nc':
          result.nc = parseInt(value, 10)
          break
        case 'names':
          // names: ['person', 'car', 'bicycle'] 형식 파싱
          const match = value.match(/\[(.+)\]/)
          if (match) {
            result.names = match[1].split(',').map((n) => n.trim().replace(/['"]/g, ''))
          }
          break
      }
    }

    if (result.path && result.train && result.val && result.nc && result.names) {
      return result as DataYamlConfig
    }

    return null
  } catch {
    return null
  }
}
