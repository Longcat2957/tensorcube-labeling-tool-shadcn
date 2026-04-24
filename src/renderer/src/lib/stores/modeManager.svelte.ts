/**
 * 작업 모드 매니저
 * Edit / Check / Preview 3종 모드를 중앙에서 관리하고,
 * Tab / Shift+Tab 단축키로 순환 전환한다.
 */

export type AppMode = 'edit' | 'check' | 'preview'

export const MODE_ORDER: AppMode[] = ['edit', 'check', 'preview']

export const MODE_LABELS: Record<AppMode, string> = {
  edit: 'Edit',
  check: 'Check',
  preview: 'Preview'
}

export function createModeManager() {
  let current = $state<AppMode>('edit')

  function setMode(mode: AppMode): void {
    current = mode
  }

  function cycle(direction: 1 | -1): void {
    const idx = MODE_ORDER.indexOf(current)
    const len = MODE_ORDER.length
    const next = (idx + direction + len) % len
    current = MODE_ORDER[next]
  }

  return {
    get current() {
      return current
    },
    setMode,
    next: () => cycle(1),
    prev: () => cycle(-1)
  }
}

export const MODE_MANAGER_KEY = Symbol('modeManager')
export type ModeManager = ReturnType<typeof createModeManager>
