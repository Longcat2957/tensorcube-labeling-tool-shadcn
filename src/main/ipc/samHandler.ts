import { ipcMain } from 'electron'
import {
  encode,
  predict,
  unload,
  getModelInfo,
  checkModelFilesPresent,
  resolveImagePath
} from '../services/sam/index.js'
import type { SamPrompt } from '../../shared/types.js'

/**
 * SAM 어시스턴트 IPC.
 *
 * 채널:
 *   sam:checkReady   - 모델 파일 존재 여부 + 메타 정보
 *   sam:encode       - imageId 임베딩 사전 계산
 *   sam:predict      - 캐시된 임베딩 + 프롬프트 → 마스크
 *   sam:unload       - 캐시에서 임베딩 제거
 */
export function registerSamHandlers(): void {
  ipcMain.handle('sam:checkReady', async () => {
    const [info, filesOk] = await Promise.all([getModelInfo(), checkModelFilesPresent()])
    return { ...info, filesOk }
  })

  ipcMain.handle(
    'sam:encode',
    async (_e, workspacePath: string, imageFilename: string, embeddingKey: string) => {
      const imagePath = resolveImagePath(workspacePath, imageFilename)
      return await encode(embeddingKey, imagePath)
    }
  )

  ipcMain.handle('sam:predict', async (_e, embeddingKey: string, prompt: SamPrompt) => {
    return await predict(embeddingKey, prompt)
  })

  ipcMain.handle('sam:unload', async (_e, embeddingKey: string) => {
    await unload(embeddingKey)
    return { success: true }
  })
}
