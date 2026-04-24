/**
 * 윈도우 크기/위치 저장·복원
 *
 * userData 디렉토리에 window-state.json으로 직전 세션의 창 기하 정보를 저장한다.
 * 복원 시 저장된 크기가 현재 디스플레이에 들어갈 수 없는 경우(멀티모니터 해제 등) 기본값으로 fallback.
 */

import { app, screen, type BrowserWindow, type Rectangle } from 'electron'
import { join } from 'path'
import { existsSync, mkdirSync } from 'fs'
import { readFile, writeFile } from 'fs/promises'

export interface WindowState {
  width: number
  height: number
  x?: number
  y?: number
  isMaximized?: boolean
}

const DEFAULT_STATE: WindowState = {
  width: 1400,
  height: 900
}

const FILE_NAME = 'window-state.json'

function statePath(): string {
  return join(app.getPath('userData'), FILE_NAME)
}

function isVisibleOnAnyDisplay(bounds: Rectangle): boolean {
  return screen.getAllDisplays().some((display) => {
    const b = display.bounds
    return (
      bounds.x >= b.x &&
      bounds.y >= b.y &&
      bounds.x + bounds.width <= b.x + b.width &&
      bounds.y + bounds.height <= b.y + b.height
    )
  })
}

export async function loadWindowState(): Promise<WindowState> {
  try {
    const raw = await readFile(statePath(), 'utf-8')
    const parsed = JSON.parse(raw) as WindowState
    if (typeof parsed.width !== 'number' || typeof parsed.height !== 'number') {
      return DEFAULT_STATE
    }
    // 저장된 위치가 현재 디스플레이에 들어가는지 확인
    if (
      typeof parsed.x === 'number' &&
      typeof parsed.y === 'number' &&
      !isVisibleOnAnyDisplay({
        x: parsed.x,
        y: parsed.y,
        width: parsed.width,
        height: parsed.height
      })
    ) {
      return { width: parsed.width, height: parsed.height }
    }
    return parsed
  } catch {
    return DEFAULT_STATE
  }
}

async function saveState(state: WindowState): Promise<void> {
  const dir = app.getPath('userData')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  await writeFile(statePath(), JSON.stringify(state, null, 2), 'utf-8')
}

/**
 * 윈도우에 상태 저장 리스너 등록. resize/move/close 시 최신 bounds를 저장한다.
 */
export function attachWindowStateTracker(win: BrowserWindow): void {
  let pending: NodeJS.Timeout | null = null

  const capture = (): WindowState => {
    const bounds = win.getBounds()
    return {
      width: bounds.width,
      height: bounds.height,
      x: bounds.x,
      y: bounds.y,
      isMaximized: win.isMaximized()
    }
  }

  const schedule = (): void => {
    if (pending) clearTimeout(pending)
    pending = setTimeout(() => {
      pending = null
      // 최대화 상태에서는 bounds 저장을 건너뛰고 isMaximized 플래그만 갱신
      void saveState(capture())
    }, 300)
  }

  win.on('resize', schedule)
  win.on('move', schedule)
  win.on('close', () => {
    if (pending) {
      clearTimeout(pending)
      pending = null
    }
    void saveState(capture())
  })
}
