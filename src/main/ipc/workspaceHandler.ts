import { ipcMain } from 'electron'
import {
  createWorkspace,
  openWorkspace,
  updateWorkspace,
  getWorkspaceInfo,
  getImageList
} from '../services/workspaceService.js'
import { exportWorkspace } from '../services/exportService.js'
import { previewExport } from '../services/export/index.js'
import { scanClassUsage, reassignClass } from '../services/classOps.js'
import {
  loadRecentWorkspaces,
  pushRecentWorkspace,
  removeRecentWorkspace
} from '../services/recentWorkspaces.js'
import type {
  CreateWorkspaceOptions,
  ExportOptions,
  UpdateWorkspaceOptions
} from '../../shared/types.js'

export function registerWorkspaceHandlers(): void {
  // 워크스페이스 생성
  ipcMain.handle('workspace:create', async (_event, options: CreateWorkspaceOptions) => {
    const result = await createWorkspace(options)
    if (result.success && result.path) {
      await pushRecentWorkspace(result.path, options.name)
    }
    return result
  })

  // 워크스페이스 열기
  ipcMain.handle('workspace:open', async (_event, workspacePath: string) => {
    const result = await openWorkspace(workspacePath)
    if (result.success && result.config) {
      await pushRecentWorkspace(workspacePath, result.config.workspace)
    }
    return result
  })

  // 최근 워크스페이스 목록
  ipcMain.handle('workspace:getRecent', async () => {
    return await loadRecentWorkspaces()
  })

  ipcMain.handle('workspace:removeRecent', async (_event, workspacePath: string) => {
    return await removeRecentWorkspace(workspacePath)
  })

  // 워크스페이스 설정 수정
  ipcMain.handle(
    'workspace:update',
    async (_event, workspacePath: string, options: UpdateWorkspaceOptions) => {
      return await updateWorkspace(workspacePath, options)
    }
  )

  // 워크스페이스 정보 조회
  ipcMain.handle('workspace:getInfo', async (_event, workspacePath: string) => {
    return await getWorkspaceInfo(workspacePath)
  })

  // 이미지 목록 조회
  ipcMain.handle('workspace:getImageList', async (_event, workspacePath: string) => {
    return await getImageList(workspacePath)
  })

  ipcMain.handle(
    'workspace:export',
    async (_event, workspacePath: string, options: ExportOptions) => {
      return await exportWorkspace(workspacePath, options)
    }
  )

  ipcMain.handle(
    'workspace:exportPreflight',
    async (
      _event,
      workspacePath: string,
      options: Pick<ExportOptions, 'includeCompletedOnly' | 'outOfBounds' | 'split'>
    ) => {
      return await previewExport(workspacePath, options)
    }
  )

  ipcMain.handle('workspace:scanClassUsage', async (_event, workspacePath: string) => {
    return await scanClassUsage(workspacePath)
  })

  ipcMain.handle(
    'workspace:reassignClass',
    async (_event, workspacePath: string, fromClassId: number, toClassId: number | null) => {
      return await reassignClass(workspacePath, fromClassId, toClassId)
    }
  )
}
