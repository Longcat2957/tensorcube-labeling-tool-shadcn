import { ipcMain } from 'electron';
import {
  createWorkspace,
  openWorkspace,
  updateWorkspace,
  getWorkspaceInfo,
  getImageList
} from '../services/workspaceService.js';
import type { CreateWorkspaceOptions, UpdateWorkspaceOptions } from '../types/workspace.js';

export function registerWorkspaceHandlers(): void {
  // 워크스페이스 생성
  ipcMain.handle('workspace:create', async (_event, options: CreateWorkspaceOptions) => {
    return await createWorkspace(options);
  });

  // 워크스페이스 열기
  ipcMain.handle('workspace:open', async (_event, workspacePath: string) => {
    return await openWorkspace(workspacePath);
  });

  // 워크스페이스 설정 수정
  ipcMain.handle(
    'workspace:update',
    async (_event, workspacePath: string, options: UpdateWorkspaceOptions) => {
      return await updateWorkspace(workspacePath, options);
    }
  );

  // 워크스페이스 정보 조회
  ipcMain.handle('workspace:getInfo', async (_event, workspacePath: string) => {
    return await getWorkspaceInfo(workspacePath);
  });

  // 이미지 목록 조회
  ipcMain.handle('workspace:getImageList', async (_event, workspacePath: string) => {
    return await getImageList(workspacePath);
  });
}