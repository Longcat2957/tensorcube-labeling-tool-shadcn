import { ipcMain } from 'electron'
import { readLabelData, saveLabelData, getImagePath } from '../services/workspaceService.js'
import type { LabelData } from '../../shared/types.js'

export function registerLabelHandlers(): void {
  // 라벨 데이터 읽기
  ipcMain.handle('label:read', async (_event, workspacePath: string, imageId: string) => {
    return await readLabelData(workspacePath, imageId)
  })

  // 라벨 데이터 저장
  ipcMain.handle(
    'label:save',
    async (
      _event,
      workspacePath: string,
      imageId: string,
      data: LabelData,
      completed: boolean = false
    ) => {
      return await saveLabelData(workspacePath, imageId, data, completed)
    }
  )

  // 이미지 파일 경로 조회
  ipcMain.handle('label:getImagePath', async (_event, workspacePath: string, imageId: string) => {
    return getImagePath(workspacePath, imageId)
  })
}
