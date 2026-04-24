/**
 * 키보드 단축키 중앙 관리 매니저
 * 애플리케이션 전체의 키보드 이벤트를 중앙에서 관리하고,
 * 각 컴포넌트로 액션을 전달합니다.
 */

// 단축키 액션 타입 정의
export type KeyboardAction =
  | 'prev-image' // A - 이전 이미지
  | 'next-image' // D - 다음 이미지
  | 'prev-class' // 3 - 이전 클래스
  | 'next-class' // 4 - 다음 클래스
  | 'select-tool' // V - 선택 도구
  | 'box-tool' // B - 박스 생성 도구
  | 'pan-tool' // P - 패닝 도구
  | 'undo' // Ctrl+Z - 실행 취소
  | 'redo' // Ctrl+Y - 다시 실행
  | 'delete' // Delete - 선택된 라벨 삭제
  | 'toggle-labels' // H - 라벨 숨기기/보기
  | 'center-image' // C - 이미지 중앙 정렬
  | 'next-mode' // Tab - 다음 모드
  | 'prev-mode' // Shift+Tab - 이전 모드
  | 'save' // Ctrl+S - 현재 라벨 저장 (_C 처리 아님, 수동 flush)
  | 'copy' // Ctrl+C - 선택된 라벨 복사
  | 'paste' // Ctrl+V - 현재 이미지에 붙여넣기

// 액션 설명 매핑
export const ACTION_DESCRIPTIONS: Record<KeyboardAction, string> = {
  'prev-image': '이전 이미지',
  'next-image': '다음 이미지',
  'prev-class': '이전 클래스',
  'next-class': '다음 클래스',
  'select-tool': '선택 도구',
  'box-tool': '박스 생성 도구',
  'pan-tool': '이동 도구',
  undo: '실행 취소',
  redo: '다시 실행',
  delete: '선택된 라벨 삭제',
  'toggle-labels': '라벨 보기/숨기기',
  'center-image': '이미지 중앙 정렬',
  'next-mode': '다음 모드',
  'prev-mode': '이전 모드',
  save: '저장',
  copy: '선택 라벨 복사',
  paste: '라벨 붙여넣기'
}

// 툴팁용 단축키 표시 문자열
export const ACTION_SHORTCUTS: Record<KeyboardAction, string> = {
  'prev-image': 'A',
  'next-image': 'D',
  'prev-class': '3',
  'next-class': '4',
  'select-tool': 'V',
  'box-tool': 'B',
  'pan-tool': 'P',
  undo: 'Ctrl+Z',
  redo: 'Ctrl+Y',
  delete: 'Delete',
  'toggle-labels': 'H',
  'center-image': 'C',
  'next-mode': 'Tab',
  'prev-mode': 'Shift+Tab',
  save: 'Ctrl+S',
  copy: 'Ctrl+C',
  paste: 'Ctrl+V'
}

// 키보드 이벤트 상태 인터페이스
export interface KeyboardState {
  lastAction: KeyboardAction | null
  lastKey: string
  lastKeyDisplay: string
  timestamp: number
}

// 단축키 매핑 (키 -> 액션)
const KEY_BINDINGS: Record<string, KeyboardAction> = {
  a: 'prev-image',
  A: 'prev-image',
  d: 'next-image',
  D: 'next-image',
  '3': 'prev-class',
  '4': 'next-class',
  v: 'select-tool',
  V: 'select-tool',
  b: 'box-tool',
  B: 'box-tool',
  p: 'pan-tool',
  P: 'pan-tool',
  c: 'center-image',
  C: 'center-image',
  Delete: 'delete',
  Backspace: 'delete',
  h: 'toggle-labels',
  H: 'toggle-labels',
  Tab: 'next-mode'
}

// 키 표시용 포맷팅
function formatKeyDisplay(event: KeyboardEvent): string {
  const parts: string[] = []

  if (event.ctrlKey || event.metaKey) {
    parts.push('Ctrl')
  }
  if (event.shiftKey) {
    parts.push('Shift')
  }
  if (event.altKey) {
    parts.push('Alt')
  }

  // 특수 키 처리
  let key = event.key
  if (key === ' ') key = 'Space'
  if (key === 'ArrowLeft') key = '←'
  if (key === 'ArrowRight') key = '→'
  if (key === 'ArrowUp') key = '↑'
  if (key === 'ArrowDown') key = '↓'

  parts.push(key.length === 1 ? key.toUpperCase() : key)

  return parts.join('+')
}

/**
 * 키보드 매니저 클래스
 * Svelte 5의 $state rune를 사용하여 반응형 상태 관리
 */
export function createKeyboardManager() {
  // 반응형 상태
  let state = $state<KeyboardState>({
    lastAction: null,
    lastKey: '',
    lastKeyDisplay: '',
    timestamp: 0
  })

  // 액션 핸들러 맵 — reactive 대상 아닌 내부 dispatch 레지스트리.
  // eslint-disable-next-line svelte/prefer-svelte-reactivity
  const actionHandlers = new Map<KeyboardAction, Set<() => void>>()

  /**
   * 키보드 이벤트 처리
   */
  function handleKeyDown(event: KeyboardEvent) {
    // 입력 필드에서는 단축키 무시
    const target = event.target as HTMLElement
    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
      return
    }

    const key = event.key
    let action: KeyboardAction | null = null

    // Ctrl 조합키 처리
    if (event.ctrlKey || event.metaKey) {
      if (key === 'z' || key === 'Z') {
        action = event.shiftKey ? 'redo' : 'undo'
      } else if (key === 'y' || key === 'Y') {
        action = 'redo'
      } else if (key === 's' || key === 'S') {
        action = 'save'
      } else if (key === 'c' || key === 'C') {
        action = 'copy'
      } else if (key === 'v' || key === 'V') {
        action = 'paste'
      }
    }
    // Shift+Tab 처리
    else if (event.shiftKey && key === 'Tab') {
      action = 'prev-mode'
    }
    // 일반 키 처리
    else if (KEY_BINDINGS[key]) {
      action = KEY_BINDINGS[key]
    }

    if (action) {
      event.preventDefault()

      // 상태 업데이트
      state = {
        lastAction: action,
        lastKey: key,
        lastKeyDisplay: formatKeyDisplay(event),
        timestamp: Date.now()
      }

      // 등록된 핸들러 실행
      const handlers = actionHandlers.get(action)
      if (handlers) {
        handlers.forEach((handler) => handler())
      }
    }
  }

  /**
   * 액션 핸들러 등록
   */
  function onAction(action: KeyboardAction, handler: () => void) {
    if (!actionHandlers.has(action)) {
      // eslint-disable-next-line svelte/prefer-svelte-reactivity
      actionHandlers.set(action, new Set())
    }
    actionHandlers.get(action)!.add(handler)

    // 클린업 함수 반환
    return () => {
      actionHandlers.get(action)?.delete(handler)
    }
  }

  /**
   * 현재 상태 가져오기
   */
  function getState(): KeyboardState {
    return state
  }

  /**
   * 액션 설명 가져오기
   */
  function getActionDescription(action: KeyboardAction): string {
    return ACTION_DESCRIPTIONS[action] || action
  }

  return {
    get state() {
      return state
    },
    handleKeyDown,
    onAction,
    getState,
    getActionDescription
  }
}

// Context 키 심볼
export const KEYBOARD_MANAGER_KEY = Symbol('keyboardManager')

// 타입 익스포트
export type KeyboardManager = ReturnType<typeof createKeyboardManager>
