import { join } from 'path'
import { existsSync } from 'fs'
import { readdir } from 'fs/promises'
import {
  ensureDir,
  getImageFiles,
  readYamlFile,
  writeYamlFile,
  writeJsonFile,
  readJsonFile,
  copyImageWithRename,
  getCurrentDateString,
  getImageDimensions
} from './fileService.js'
import type {
  WorkspaceConfig,
  WorkspaceInfo,
  CreateWorkspaceOptions,
  UpdateWorkspaceOptions,
  ImageInfo,
  LabelData
} from '../../shared/types.js'

const SRC_DIR = 'src'
const LABEL_DIR = 'label'
const WORKSPACE_FILE = 'workspace.yaml'
const WORKSPACE_CREATE_CONCURRENCY = 8

/**
 * 인덱스 기반 병렬 실행 유틸
 * concurrency 만큼 동시에 worker를 띄워 items를 소비.
 * 결과 배열 순서는 입력 순서와 동일.
 */
async function runWithConcurrency<T, R>(
  items: readonly T[],
  concurrency: number,
  task: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(items.length)
  let cursor = 0
  const workers = new Array(Math.min(concurrency, items.length)).fill(0).map(async () => {
    while (true) {
      const idx = cursor++
      if (idx >= items.length) break
      results[idx] = await task(items[idx], idx)
    }
  })
  await Promise.all(workers)
  return results
}

// 워크스페이스 폴더 구조 생성
export async function createWorkspace(
  options: CreateWorkspaceOptions
): Promise<{ success: boolean; path?: string; error?: string }> {
  try {
    const { name, sourceFolders, savePath, labelingType, classes } = options

    // 워크스페이스 루트 경로
    const workspacePath = join(savePath, name)

    // 이미 존재하는지 확인
    if (existsSync(workspacePath)) {
      return { success: false, error: '이미 존재하는 워크스페이스입니다.' }
    }

    // 디렉토리 생성
    await ensureDir(workspacePath)
    await ensureDir(join(workspacePath, SRC_DIR))
    await ensureDir(join(workspacePath, LABEL_DIR))

    // 모든 소스 폴더에서 이미지 수집
    let allImages: string[] = []
    for (const folder of sourceFolders) {
      const images = await getImageFiles(folder)
      allImages = allImages.concat(images)
    }

    // 이미지 파일 복사 및 이름 변경 (실제 파일명과 크기 저장) — 병렬
    const destDir = join(workspacePath, SRC_DIR)
    const imageData = await runWithConcurrency(
      allImages,
      WORKSPACE_CREATE_CONCURRENCY,
      async (srcPath, i) => {
        const { newFilename, destPath } = await copyImageWithRename(srcPath, destDir, i + 1)
        const dimensions = await getImageDimensions(destPath)
        const id = String(i + 1).padStart(9, '0')
        return {
          id,
          filename: newFilename,
          width: dimensions.width,
          height: dimensions.height
        }
      }
    )
    const imageCount = imageData.length

    // 클래스 이름 매핑 생성
    const names: Record<number, string> = {}
    for (const cls of classes) {
      names[cls.id] = cls.name
    }

    // workspace.yaml 생성
    const config: WorkspaceConfig = {
      workspace: name,
      labeling_type: labelingType,
      names,
      image_count: imageCount,
      created_at: getCurrentDateString(),
      last_modified_at: getCurrentDateString()
    }

    await writeYamlFile(
      join(workspacePath, WORKSPACE_FILE),
      config as unknown as Record<string, unknown>
    )

    // 빈 라벨 파일들 생성 (실제 이미지 크기 포함) — 병렬
    await runWithConcurrency(imageData, WORKSPACE_CREATE_CONCURRENCY, async (img) => {
      const labelPath = join(workspacePath, LABEL_DIR, `${img.id}.json`)
      const emptyLabelData: LabelData = {
        image_info: {
          filename: img.filename,
          width: img.width,
          height: img.height
        },
        annotations: []
      }
      await writeJsonFile(labelPath, emptyLabelData)
    })

    return { success: true, path: workspacePath }
  } catch (error) {
    return { success: false, error: (error as Error).message }
  }
}

// 워크스페이스 열기
export async function openWorkspace(
  workspacePath: string
): Promise<{ success: boolean; config?: WorkspaceConfig; error?: string }> {
  try {
    const yamlPath = join(workspacePath, WORKSPACE_FILE)

    if (!existsSync(yamlPath)) {
      return { success: false, error: 'workspace.yaml 파일이 없습니다.' }
    }

    const config = await readYamlFile<WorkspaceConfig>(yamlPath)

    if (!config) {
      return { success: false, error: 'workspace.yaml 파싱에 실패했습니다.' }
    }

    return { success: true, config }
  } catch (error) {
    return { success: false, error: (error as Error).message }
  }
}

// 워크스페이스 설정 수정
export async function updateWorkspace(
  workspacePath: string,
  options: UpdateWorkspaceOptions
): Promise<{ success: boolean; config?: WorkspaceConfig; error?: string }> {
  try {
    const yamlPath = join(workspacePath, WORKSPACE_FILE)

    if (!existsSync(yamlPath)) {
      return { success: false, error: 'workspace.yaml 파일이 없습니다.' }
    }

    const currentConfig = await readYamlFile<WorkspaceConfig>(yamlPath)

    if (!currentConfig) {
      return { success: false, error: 'workspace.yaml 파싱에 실패했습니다.' }
    }

    const names: Record<number, string> = {}
    for (const cls of options.classes) {
      names[cls.id] = cls.name
    }

    const updatedConfig: WorkspaceConfig = {
      ...currentConfig,
      workspace: options.workspace,
      labeling_type: options.labelingType,
      names,
      last_modified_at: getCurrentDateString()
    }

    await writeYamlFile(yamlPath, updatedConfig as unknown as Record<string, unknown>)

    return { success: true, config: updatedConfig }
  } catch (error) {
    return { success: false, error: (error as Error).message }
  }
}

// 워크스페이스 정보 조회 (UI용)
export async function getWorkspaceInfo(workspacePath: string): Promise<WorkspaceInfo | null> {
  try {
    const yamlPath = join(workspacePath, WORKSPACE_FILE)

    if (!existsSync(yamlPath)) {
      return null
    }

    const config = await readYamlFile<WorkspaceConfig>(yamlPath)

    if (!config) {
      return null
    }

    return {
      name: config.workspace,
      labelingType: config.labeling_type === 1 ? 'BB' : 'OBB',
      imageCount: config.image_count,
      lastModified: config.last_modified_at,
      path: workspacePath
    }
  } catch {
    return null
  }
}

// 이미지 목록 조회
export async function getImageList(workspacePath: string): Promise<ImageInfo[]> {
  const srcPath = join(workspacePath, SRC_DIR)
  const labelPath = join(workspacePath, LABEL_DIR)

  if (!existsSync(srcPath)) {
    return []
  }

  const files = await readdir(srcPath)
  const imageFiles = files.filter((f) => {
    const ext = f.split('.').pop()?.toLowerCase() || ''
    return ['jpg', 'jpeg', 'png', 'bmp', 'webp'].includes(ext)
  })

  const imageList = await runWithConcurrency(
    imageFiles,
    WORKSPACE_CREATE_CONCURRENCY,
    async (file) => {
      const id = file.replace(/\.[^.]+$/, '')
      const labelFiles = await getLabelFiles(labelPath, id)

      let status: 'none' | 'working' | 'completed' = 'none'
      if (labelFiles.completed) {
        status = 'completed'
      } else if (labelFiles.working) {
        status = 'working'
      }

      const labelData = await readLabelData(workspacePath, id)
      const width = labelData?.image_info?.width || 0
      const height = labelData?.image_info?.height || 0

      return {
        id,
        filename: file,
        width,
        height,
        status
      } satisfies ImageInfo
    }
  )

  return imageList.sort((a, b) => a.id.localeCompare(b.id))
}

// 라벨 파일 상태 확인
async function getLabelFiles(
  labelPath: string,
  imageId: string
): Promise<{ none: boolean; working: boolean; completed: boolean }> {
  const result = { none: false, working: false, completed: false }

  const nonePath = join(labelPath, `${imageId}.json`)
  const workingPath = join(labelPath, `${imageId}_W.json`)
  const completedPath = join(labelPath, `${imageId}_C.json`)

  if (existsSync(completedPath)) {
    result.completed = true
  } else if (existsSync(workingPath)) {
    result.working = true
  } else if (existsSync(nonePath)) {
    result.none = true
  }

  return result
}

// 라벨 데이터 읽기
export async function readLabelData(
  workspacePath: string,
  imageId: string
): Promise<LabelData | null> {
  const labelPath = join(workspacePath, LABEL_DIR)

  // _C, _W, 없음 순서로 확인
  const paths = [
    join(labelPath, `${imageId}_C.json`),
    join(labelPath, `${imageId}_W.json`),
    join(labelPath, `${imageId}.json`)
  ]

  for (const path of paths) {
    if (existsSync(path)) {
      const data = await readJsonFile<LabelData>(path)
      return data
    }
  }

  return null
}

// 라벨 데이터 저장
export async function saveLabelData(
  workspacePath: string,
  imageId: string,
  data: LabelData,
  completed: boolean = false
): Promise<boolean> {
  try {
    const labelPath = join(workspacePath, LABEL_DIR)

    // 기존 파일들 삭제
    const oldFiles = [
      join(labelPath, `${imageId}.json`),
      join(labelPath, `${imageId}_W.json`),
      join(labelPath, `${imageId}_C.json`)
    ]

    for (const oldFile of oldFiles) {
      if (existsSync(oldFile)) {
        const { unlink } = await import('fs/promises')
        await unlink(oldFile)
      }
    }

    // 새 파일 저장
    const suffix = completed ? '_C' : '_W'
    const newPath = join(labelPath, `${imageId}${suffix}.json`)
    await writeJsonFile(newPath, data)

    // workspace.yaml 수정일 업데이트
    const yamlPath = join(workspacePath, WORKSPACE_FILE)
    const config = await readYamlFile<WorkspaceConfig>(yamlPath)
    if (config) {
      config.last_modified_at = getCurrentDateString()
      await writeYamlFile(yamlPath, config as unknown as Record<string, unknown>)
    }

    return true
  } catch {
    return false
  }
}

// 이미지 파일 경로 조회
export function getImagePath(workspacePath: string, imageId: string): string | null {
  const srcPath = join(workspacePath, SRC_DIR)
  const extensions = ['.jpg', '.jpeg', '.png', '.bmp', '.webp']

  for (const ext of extensions) {
    const path = join(srcPath, `${imageId}${ext}`)
    if (existsSync(path)) {
      return path
    }
  }

  return null
}
