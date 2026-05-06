# Tensorcube Labeling Tool

학습 데이터 어노테이션을 위한 **크로스플랫폼 데스크톱 앱** (Electron + Svelte 5 + TypeScript).

- **BB (Bounding Box)**: 축 정렬 사각형, `[xmin, ymin, xmax, ymax]`
- **OBB (Oriented Bounding Box)**: 회전 사각형, `[cx, cy, w, h, angle]`
- 좌표는 **이미지 절대 픽셀값**으로 저장되고, 정규화·포맷 변환은 **내보내기 시점**에만 수행됨.

## 주요 기능

- 워크스페이스 기반 프로젝트 관리 (9-digit 리네이밍, `workspace.yaml` 메타)
- BB / OBB 라벨링 (Fabric.js 캔버스, Shift / Alt 드래그 모디파이어)
- 워크스페이스 레벨 Undo / Redo (이미지 왕복 후에도 유지)
- 다중 선택 (Shift-click), Copy / Paste, 배치 삭제
- Autosave (500ms 디바운스) + `Ctrl+S` 즉시 flush + Save 인디케이터
- Export: **YOLO / YOLO-OBB / COCO / DOTA**, train/val/test split, 이미지 리사이즈, 범위 초과 정책(clip / skip / none), 프리플라이트 요약
- 클래스 일괄 재지정 / 고아 정리
- 최근 워크스페이스, 창 크기 기억, 다크 모드
- 키보드 중심 UX — 모든 버튼에 Tooltip + 단축키 힌트
- Preview 모드 Dashboard (진척도 카드, 클래스 일람)

## 다운로드 (최종 사용자)

최신 바이너리는 [GitHub Releases](https://github.com/Longcat2957/tensorcube-labeling-tool-shadcn/releases)에서 받을 수 있습니다.

| OS      | 포맷                                                 |
| ------- | ---------------------------------------------------- |
| Linux   | `.AppImage` (즉시 실행), `.deb` (데비안/우분투 계열) |
| Windows | `.exe` (NSIS 인스톨러)                               |
| macOS   | `.dmg` (x64 / arm64)                                 |

> **서명 안내**: 현재 릴리스는 코드 서명이 적용되지 않습니다. Windows에서는 SmartScreen 경고, macOS에서는 "확인되지 않은 개발자" 안내가 뜰 수 있으며, 각각 "추가 정보 → 실행" / "우클릭 → 열기"로 진행할 수 있습니다.

설치된 앱은 시작 시 자동으로 GitHub Releases를 확인하고 새 버전을 내려받습니다(재시작 시 적용).

## 설치 & 실행 (개발자)

```bash
pnpm install           # 의존성 설치 (electron-builder install-app-deps 자동)
pnpm dev               # HMR 로 개발 실행
pnpm start             # 프로덕션 빌드 미리보기
```

## 개발 명령어

```bash
pnpm typecheck         # typecheck:node + svelte-check (commit 전 필수)
pnpm lint              # eslint
pnpm format            # prettier (prettier-plugin-svelte 포함)
pnpm test              # vitest 단위 테스트
pnpm test:watch        # vitest watch 모드
pnpm build             # typecheck + electron-vite build
pnpm build:linux       # 배포용 바이너리 (build:win / build:mac 도 가능)
```

## 단축키

### 이미지 / 모드

| 키                  | 동작                                      |
| ------------------- | ----------------------------------------- |
| `A` / `D`           | 이전 / 다음 이미지                        |
| `Tab` / `Shift+Tab` | 다음 / 이전 모드 (Edit → Check → Preview) |
| `C`                 | 이미지 중앙 정렬                          |
| `H`                 | 라벨 보기 / 숨기기                        |

### 도구

| 키  | 동작            |
| --- | --------------- |
| `V` | 선택 도구       |
| `B` | 박스 생성 도구  |
| `P` | 패닝(이동) 도구 |

### 클래스

| 키        | 동작                    |
| --------- | ----------------------- |
| `3` / `4` | 이전 / 다음 클래스      |
| `1`–`9`   | 해당 번호의 클래스 선택 |

### 편집

| 키                     | 동작                       |
| ---------------------- | -------------------------- |
| `Ctrl+Z` / `Ctrl+Y`    | 실행 취소 / 다시 실행      |
| `Delete` / `Backspace` | 선택한 라벨 삭제           |
| `Ctrl+C` / `Ctrl+V`    | 라벨 복사 / 붙여넣기       |
| `Ctrl+S`               | 즉시 저장 (autosave flush) |

### 드래그 모디파이어 (박스 그리는 중)

| 키      | 동작                       |
| ------- | -------------------------- |
| `Shift` | 정사각형으로 고정          |
| `Alt`   | 시작점을 중심으로 리사이즈 |

## 워크스페이스 디렉토리 레이아웃

```
workspace_name/
  src/0000000001.jpg         # 소스 이미지, 항상 9-digit 0-padded ID
  label/0000000001_C.json    # _C = 검수 완료
  label/0000000002_W.json    # _W = 작업 중
  label/0000000003.json      # 접미사 없음 = 미작업
  workspace.yaml             # 메타: labeling_type, classes, image_count, 타임스탬프
```

이미지는 워크스페이스 생성 시 9-digit ID로 리네이밍·복사되며, 모든 이미지에 대해 빈 라벨 JSON 파일이 동시에 만들어집니다. 라벨 파일은 이미지와 1:1 대응합니다.

## 아키텍처 요약

Electron 3-프로세스 구조 (electron-vite):

- `src/main/` — Node/Electron 메인 프로세스. `workspace://` 커스텀 프로토콜, 파일 I/O, export 파이프라인.
- `src/preload/` — `window.api.{dialog,workspace,label,utils}` 컨텍스트 브리지.
- `src/renderer/src/` — Svelte 5 UI. 상태는 Context API + 룬(`$state`, `$derived`, `$effect`)만 사용.
- `src/shared/types.ts` — 프로세스 간 공유 타입 단일 소스.

렌더러는 파일시스템에 직접 접근하지 않고 항상 `window.api`를 경유합니다. 이미지는 `window.api.utils.getWorkspaceImageUrl(absolutePath)` 로 `workspace://…` URL을 받아 `<img src>`에 사용합니다.

UI는 **shadcn-svelte** 컴포넌트(`src/renderer/src/lib/components/ui/`) + Tailwind v4 기반이며, 고정 레이아웃(상단 Navigation, 하단 Footer, 가운데 LeftSidebar + CanvasArea + RightSidebar)입니다.

## 기술 스택

Svelte 5 · TypeScript · Electron 39 · Fabric.js 7 · electron-vite · Tailwind 4 · bits-ui · shadcn-svelte · sharp · Vitest

## 라이선스

TBD
