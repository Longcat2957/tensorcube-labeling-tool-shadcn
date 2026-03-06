import { ipcMain, dialog, BrowserWindow } from 'electron';

export function registerDialogHandlers(): void {
  // 폴더 선택 다이얼로그
  ipcMain.handle('dialog:selectFolder', async () => {
    const result = await dialog.showOpenDialog(BrowserWindow.getFocusedWindow()!, {
      properties: ['openDirectory'],
      title: '폴더 선택'
    });

    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }

    return result.filePaths[0];
  });

  // 워크스페이스 폴더 선택 다이얼로그 (workspace.yaml이 있는 폴더)
  ipcMain.handle('dialog:selectWorkspaceFolder', async () => {
    const result = await dialog.showOpenDialog(BrowserWindow.getFocusedWindow()!, {
      properties: ['openDirectory'],
      title: '워크스페이스 폴더 선택'
    });

    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }

    return result.filePaths[0];
  });

  // 다중 폴더 선택 다이얼로그
  ipcMain.handle('dialog:selectFolders', async () => {
    const result = await dialog.showOpenDialog(BrowserWindow.getFocusedWindow()!, {
      properties: ['openDirectory', 'multiSelections'],
      title: '원천데이터 폴더 선택'
    });

    if (result.canceled || result.filePaths.length === 0) {
      return [];
    }

    return result.filePaths;
  });

  ipcMain.handle('dialog:selectExportFolder', async () => {
    const result = await dialog.showOpenDialog(BrowserWindow.getFocusedWindow()!, {
      properties: ['openDirectory', 'createDirectory'],
      title: '내보내기 폴더 선택'
    });

    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }

    return result.filePaths[0];
  });
}