# Roadmap

`tensorcube-labeling-tool-shadcn`의 현재 구현 상태를 분석하고, 단기·중기·장기 개선 및 기능 확장 계획을 정리한 로드맵 문서.

---

## 1. 현재 상태 요약 (As-Is, Phase 4 완료 기준)

### 1.1 구현 완료된 핵심 기능

| 영역                                | 비고                                                                                      |
| ----------------------------------- | ----------------------------------------------------------------------------------------- |
| Electron + Svelte 5 + TS 골격       | `electron-vite` 3-process (main / preload / renderer), `tsconfig.web.json` `strict: true` |
| 커스텀 프로토콜 이미지 로딩         | `workspace://` 프로토콜                                                                   |
| 워크스페이스 생성·열기·업데이트     | 9-digit 리네이밍, 빈 `.json` 일괄 생성, `workspace.yaml` 관리                             |
| 최근 워크스페이스                   | 시작 화면 드롭다운, 존재하지 않는 경로 자동 필터링                                        |
| BB / OBB 라벨링                     | Fabric.js, `lib/canvas/` 모듈 분해, Shift/Alt 드래그 모디파이어                           |
| 상태 관리 (Context API + 룬)        | `keyboardManager`, `workspaceManager`, `toolManager`, `modeManager`                       |
| 단축키 매니저 + 툴팁                | `KEY_BINDINGS` 중앙 집중, `ACTION_SHORTCUTS`로 모든 버튼에 Tooltip + 단축키 힌트          |
| Mode Tabs (Edit / Check / Preview)  | `Tab`/`Shift+Tab` 순환, Preview 모드 진입 시 Dashboard 렌더                               |
| Dashboard                           | 진척도 카드 + 누적 바 + 클래스 일람 + 경로/타임스탬프                                     |
| Label Layer List 양방향 동기화      | `selectedLabelId` $effect로 리스트 ↔ 캔버스 상호 반영                                     |
| 라벨 불투명도 슬라이더 + H 토글     | 캔버스 상단 플로팅 바                                                                     |
| Undo / Redo (워크스페이스 레벨)     | per-image 스택(상한 50), 이미지 왕복 후에도 유지                                          |
| Copy / Paste                        | `Ctrl+C`/`Ctrl+V`, 라벨링 모드 일치 entry만                                               |
| 다중 선택 (Shift-Click) + 배치 삭제 | 다중 선택 스타일, 세트 보존                                                               |
| Autosave + Save 인디케이터          | 500ms 디바운스, `SaveStatus` + `lastSavedAt` Footer 표시, `Ctrl+S`로 즉시 flush           |
| 다크 모드                           | `ModeWatcher` + Navigation Sun/Moon 토글                                                  |
| Minimap 뷰포트 드래그 팬            | 포인터 이벤트 + 가상 viewport, `requestPanToImagePoint`                                   |
| 이미지 리스트 사이드패널            | 수동 가상 스크롤(ROW=28px, overscan 6), 상태 dot + C/W 배지                               |
| BrowserWindow 크기 기억             | 기본 1400×900, 멀티모니터 fallback, isMaximized 복원                                      |
| 내보내기 파이프라인                 | YOLO / YOLO-OBB / COCO / DOTA, resize, split, out-of-bounds 정책                          |
| Export 프리플라이트                 | 2단계(미리 확인 → 요약 → 확정), 어노테이션/범위 초과/split/클래스별 집계                  |
| 클래스 일괄 재지정                  | `classOps.ts`(scanClassUsage / reassignClass), ProjectSettingsDialog 연동                 |
| 타입 단일화                         | `shared/types.ts` 단일 소스, main/preload 전역 사용                                       |
| 스냅샷                              | `$state.snapshot` + `structuredClone`                                                     |
| 테스트 인프라                       | Vitest 39건(`export-utils`, `obb-polygon`, `class-ops`, `draw-modifiers`)                 |
| CI                                  | GitHub Actions: `install → typecheck → lint → test` (pnpm 10 + Node 22)                   |
| ESLint 베이스라인                   | error 0 (prettier 계열 warning은 별도 포맷 PR로 이월)                                     |

### 1.2 남은 미구현 / 불완전

| 항목                                   | 예정       | 비고                                                                       |
| -------------------------------------- | ---------- | -------------------------------------------------------------------------- |
| 업데이트 UI 토스트 / 수동 체크 버튼    | Phase 7 후 | auto-download는 동작, 사용자 노티는 OS 네이티브 알림만                     |
| Sentry / 로그 파일                     | 옵션 C     | 유저 유입 후 필요성 판단                                                   |
| i18n                                   | 옵션 C     | UI·로그·에러 한국어 하드코딩                                               |
| Polygon / Keypoint 라벨링 타입         | 옵션 A     | `labeling_type: 3/4` 확장 여지                                             |
| 라벨 JSON 스키마 버저닝 / 마이그레이션 | 옵션 A     | 타입 변경 시 기존 라벨 호환 로직 없음                                      |
| AI 보조 오토 라벨링                    | 옵션 B     | ONNX 미도입                                                                |
| Drag-select (박스 범위 선택)           | 후속       | Fabric selection 호환성 문제로 보류                                        |
| 다중 선택 시 숫자키 일괄 클래스 변경   | 후속       | UI 공간 문제로 보류                                                        |
| 코드 서명                              | 운영 투자  | Win EV 인증서 / macOS Developer ID + notarization. 사용자 확보 후 결정     |

### 1.3 남은 기술 부채 / 리스크 (Phase 6+7 설정 완료 후)

1. **Playwright E2E 부재**: 유닛 테스트(41건)는 있으나 Electron 앱 스모크 테스트 없음. Phase 5 수동 QA(`qa-checklist.md`)로 임시 커버.
2. **Preview/Minimap/가상 스크롤 dev 감각 검증 대기**: 타입·빌드 검증 완료, `pnpm dev`에서 QA 체크리스트 돌리는 작업만 남음.
3. **실제 릴리스 검증 대기**: release workflow는 작성 완료, `v0.1.0` 태그 푸시로 실제 3-OS 빌드가 성공하는지 확인 필요.
4. **업데이트 UI 미완성**: auto-updater는 작동하지만 사용자 노티는 OS 네이티브 알림만. renderer toast(svelte-sonner)로 더 명확한 UX 제공은 후속.
5. **i18n 인프라 없음**: 한국어 하드코딩. 국외 사용자 유입 시 결정.

**Phase 5–7 누적 해소 항목**: 이미지 생성 순차 처리, `assignSplits` 최소 1개 보장 버그, Prettier 일괄 포맷(warning 0), build CI 부재(release workflow 신설), 자동 업데이트 미구현(`main/index.ts`에 `autoUpdater` 연결), `appId` template 값, publish 대상 `example.com`.

---

## 2. 로드맵 (Phase별)

각 Phase는 **독립적으로 출시 가능한 단위**로 설계. 상위 Phase일수록 기반 구조 영향도/난이도가 커진다.

### Phase 1 — 스펙 일치화 & 품질 기반 ✅ 완료

_"설계 문서대로 동작한다"를 목표로 한다._

- ✅ **[UI] Preview 모드 추가**: 신규 `modeManager.svelte.ts`(edit/check/preview 순환) + Navigation Tabs 바인딩 + `Tab`/`Shift+Tab` 단축키 연결.
- ✅ **[UI] Tooltip 전면 도입**: `lib/components/ui/tooltip/` shadcn 래퍼 신설. App 최상위 `TooltipProvider` + LeftSidebar 전 아이콘/Navigation Export 버튼에 단축키 힌트 노출.
- ✅ **[UI] 라벨 불투명도 슬라이더**: `lib/components/ui/slider/` 신설. 캔버스 상단 플로팅 바에 Eye 토글 + 0–100% Slider → Fabric 박스 전체 `opacity` 즉시 반영.
- ✅ **[UI] 라벨 리스트 ↔ 캔버스 양방향 동기화**: `selectedLabelId` 변화 시 `setActiveObject` 호출하는 `$effect` 추가(RightSidebar→Canvas 방향 누락분 보완).
- ✅ **[Shortcut] `Ctrl+S` 저장·`H` 토글**: `KeyboardAction`에 `'save'` 추가, `flushSave`/`toggleLabelsHidden` 메서드 신설 + CanvasArea에서 구독. 툴팁용 `ACTION_SHORTCUTS` 맵 신설.
- ✅ **[Infra] 타입 단일화**: `src/main/types/workspace.ts` 삭제, `CreateWorkspaceOptions`/`IpcResponse` 등을 `shared/types.ts`로 흡수. main 9개 파일 import 경로 갱신.
- ✅ **[Infra] `tsconfig.web.json` `strict: true`**: 전환 완료 (기존 코드가 strict-safe 상태였음).
- ✅ **[Infra] `$state.snapshot` 도입**: `cloneLabelData` 및 IPC 전송부 `JSON.parse(JSON.stringify(...))`를 `structuredClone($state.snapshot(...))`/`$state.snapshot(...)`으로 교체.

**검증**: `pnpm typecheck` → 0 errors / 0 warnings.

### Phase 2 — 작업 체감 개선 & UX 마감 ✅ 완료

_"실제 수천 장 라벨링 시 손이 편하다"를 목표로 한다._

- ✅ **[UX] Dashboard 뷰**: Preview 모드 진입 시 Canvas 대신 `Dashboard.svelte` 렌더. 전체/`_C`/`_W`/미작업 진척도 카드 + 누적 바, 클래스 일람, 경로·타임스탬프 메타 패널. (클래스별 어노테이션 개수 집계는 후속 버전에서.)
- ✅ **[UX] Minimap 뷰포트 드래그 팬**: Minimap에 포인터 이벤트 + 수동 가상 viewport 계산. `requestPanToImagePoint` 요청 메커니즘으로 workspace store → CanvasArea $effect → Fabric 이미지 좌표 갱신.
- ✅ **[UX] 이미지 리스트 사이드패널**: 좌측 Resizable pane에 `ImageListPanel.svelte`. 수동 가상 스크롤(ROW=28px, overscan 6)로 수천 장 대응. 상태 dot + C/W 배지 + 현재 이미지 자동 스크롤.
- ✅ **[UX] Save 인디케이터**: `SaveStatus`(`idle/dirty/saving/saved/error`) + `lastSavedAt` 추가. Footer에서 상대 시각 표시 (방금/N초 전/N분 전/HH:MM).
- ✅ **[UX] 최근 워크스페이스**: `services/recentWorkspaces.ts` + `workspace:getRecent`/`removeRecent` IPC. 시작 화면에 `RecentWorkspaces.svelte` 드롭다운. 존재하지 않는 경로는 자동 필터링.
- ✅ **[UX] BrowserWindow 크기 기억**: `services/windowState.ts`(userData/window-state.json). 기본 1400×900, minWidth/Height 지정, 멀티모니터 해제 시 좌표 fallback, isMaximized 복원.
- ✅ **[UX] 드래그 모디파이어**: `applyDrawModifiers` 유틸 신설. Shift=정사각형, Alt=중심 기준 리사이즈 — 박스 그리기 중 실시간 반영.
- ✅ **[UX] 다크 모드**: `mode-watcher`의 `ModeWatcher`를 App 최상위에 배치, Navigation에 Sun/Moon 토글 버튼.

**검증**: `pnpm typecheck` → 0 errors / 0 warnings.

**남은 관심사 (Phase 2에서 의도적으로 범위 제외)**:

- 실행 UI 상 Minimap 드래그·모디파이어·이미지 리스트 가상 스크롤은 dev 실행으로 최종 감각 확인 필요 (타입/로직 검증까지 완료).
- 클래스별 어노테이션 개수 집계는 전체 워크스페이스 스캔 IPC가 필요해 Phase 3(배치) 범위로 이월.

### Phase 3 — 히스토리 & 배치 작업 ✅ 완료

_"대량 편집과 실수 복구를 전제로 한다"를 목표로 한다._

- ✅ **[Data] 워크스페이스 레벨 Undo/Redo**: per-image 스택(`Record<imageId, {past,future}>`)으로 전환. 스택당 50개 상한. 이미지 왕복 후에도 undo/redo 그대로. `currentHistory` $derived로 `canUndo`/`canRedo` 자동 반영.
- ✅ **[Data] Copy / Paste 어노테이션**: `Ctrl+C`/`Ctrl+V` 액션 + `KeyboardAction`에 `'copy'`/`'paste'` 추가. 내부 `ClipboardEntry[]` 스토어. 붙여넣기는 새 UUID 부여하고 현재 라벨링 모드(BB/OBB)에 맞는 entry만 처리.
- ✅ **[Data] 다중 선택 (Shift-Click)**: `selectedLabelId`와 `selectedLabelIds` 병행 관리. Shift-click 시 `toggleLabelSelection`. 캔버스: 다중 선택 스타일을 일괄 적용하는 `$effect`, fabric의 `selected`/`deselected` 핸들러가 다중 선택 세트를 보존. `deleteSelectedLabels` 배치 삭제. RightSidebar·LeftSidebar 배치화.
- ✅ **[Data] Export 프리플라이트**: `previewExport()` 신설(`workspace:exportPreflight` IPC). 총 이미지·어노테이션·범위 초과·split 분포·클래스별 개수를 집계해 `ExportPreflight`로 반환. ExportDialog가 "미리 확인 → 요약 화면 → 확인 후 내보내기" 2단계로 변경.
- ✅ **[Data] 클래스 일괄 재지정 / 고아 처리**: `classOps.ts`(`scanClassUsage`, `reassignClass(from, to|null)`) + 관련 IPC. ProjectSettingsDialog에 (a) 클래스별 어노테이션 개수 배지, (b) "클래스 일괄 재지정" 섹션, (c) 사용 중인 클래스를 삭제할 때 "전체 삭제 / 다른 클래스로 재할당" 선택 모달.

**검증**: `pnpm typecheck` → 0 errors / 0 warnings.

**범위 제외 / 이월**:

- Drag-select(박스 끌어서 범위 선택)는 Fabric `selection` 기본 기능과의 호환성 이슈로 이번 단계 제외.
- 다중 선택 상태에서의 일괄 클래스 변경 단축키는 UI 공간 문제로 후속(1–9 숫자 키) 단계에서.

### Phase 4 — 테스트 & CI ✅ 완료

_"회귀를 탐지할 수 있는 상태로 만든다"를 목표로 한다._

- ✅ **[Test] Vitest 도입**: `vitest.config.ts`, `pnpm test` / `test:watch` 스크립트, `tests/` 디렉토리. Node 환경에서 main 모듈 직접 import.
- ✅ **[Test] export/utils 골든 테스트** (`tests/export-utils.test.ts`, 22건): `sanitizeExportName`, 시드 고정 `shuffleArray`, `assignSplits`(4 케이스), `scaleBbox`/`scaleObb`, `normalizeBboxForYolo`, BB/OBB `isOutOfBounds`·`clamp`·`applyPolicy*`. assignSplits의 "최소 1개 보장" 블록은 현재 구현상 미적용되는 잠재적 버그가 있어 주석으로 명시.
- ✅ **[Test] OBB → DOTA 4-코너 골든** (`tests/obb-polygon.test.ts`, 5건): 0°/90°/180°/45° 및 임의 각도의 `obbToPolygon` 정확도 + 반환값 모양 검증.
- ✅ **[Test] classOps 테스트** (`tests/class-ops.test.ts`, 6건): 임시 디렉토리에 라벨 JSON을 배치하고 `scanClassUsage` / `reassignClass(to/delete)` / 부재 클래스 / 파일 구조 보존까지 검증.
- ✅ **[Test] applyDrawModifiers 테스트** (`tests/draw-modifiers.test.ts`, 6건): Shift / Alt / Shift+Alt 조합 및 음수 delta 방향 케이스.
- ✅ **[CI] GitHub Actions** (`.github/workflows/ci.yml`): pnpm 10 + Node 22, `install → typecheck → lint → test` 순 Linux 러너.
- ✅ **[Lint] ESLint 베이스라인 정리**: `.svelte.ts` 파서 지정, `@typescript-eslint/*` 규칙 조정, `eqeqeq`/`no-var`/`prefer-const`/svelte warn 강등 + 미사용 변수 정리로 **error 0개** 달성. prettier 계열 warning(≈4600건)은 대량 포맷 diff 회피 위해 별도 포맷 patch로 이월.

**검증**: `pnpm typecheck && pnpm lint && pnpm test` → 모두 exit 0. 테스트 39건 전체 통과.

**범위 제외 / 이월**:

- **Playwright E2E 스모크**: Electron 앱의 Playwright 연동(launcher, preload 컨텍스트 주입 등)이 별도 인프라 작업이라 이번 단계에서 제외. 현 유닛 테스트가 export 포맷 및 클래스 조작 로직을 덮고 있어 가장 높은 회귀 리스크는 커버됨.
- **build 단계 CI**: `electron-builder`는 sharp 등 네이티브 의존성을 OS별로 다시 빌드하므로 Linux 러너에서만 돌리기엔 의미가 적음. 릴리스 파이프라인은 Phase 7에서.
- **Prettier 일괄 포맷**: 단독 PR("chore: prettier format everything")로 분리 — 본 범위에서 다루면 diff 노이즈가 과대해짐.
- **assignSplits 최소 보장 버그**: 테스트 주석으로 표시. 별도 fix 이슈로.

---

> **로드맵 피벗 (2026-04-24)**: BB/OBB 기능이 제품으로서 충분히 성숙했다고 판단. 이전 Phase 5(Polygon/Keypoint)와 Phase 6(AI 오토 라벨링)은 **유저 피드백 이후 결정**하는 "선택적 확장"으로 후순위화하고, 즉시 출시·배포 가능한 상태로 만드는 것을 다음 목표로 한다.

### Phase 5 — 릴리스 안정화 ✅ 코드 작업 완료 (수동 QA 대기)

_"현재 기능을 손가락에 올려놓고 써봐도 멀쩡하다"를 검증한다._

- ✅ **[Bug] `assignSplits` 최소 1개 보장 수정**: `src/main/services/export/utils.ts` 전체 재작성. floor 기반 초기 할당 + 소수부 잔여 분배 + 최소 1개 보장(부족 시 최대 split에서 차감) + 최종 합 = total 보장. 테스트 2건 추가 (min-guarantee 검증, 동일 비율 분배).
- ✅ **[Perf] 워크스페이스 생성 병렬화**: `workspaceService.ts`에 `runWithConcurrency` 유틸 신설 (`CONCURRENCY=8`). (a) 이미지 복사 + `sharp` 치수 조회 루프, (b) 빈 라벨 JSON 생성 루프, (c) `getImageList` 스캔 루프 3곳 병렬화.
- ✅ **[Chore] Prettier 일괄 포맷**: `pnpm format` 전체 적용. ESLint warning 0 달성 (기존 ~4600 → 0). 부수 정리: `eslint.config.mjs`에서 Svelte 5 `$props()` destructuring에 대한 `prefer-const` false positive 비활성화, `{#each}` 키 5건 추가, 불필요한 `{#snippet children()}` 래퍼 제거, 비반응 Map/Set에 eslint-disable 주석.
- ✅ **[Docs] README 정리**: 기능 요약, 설치·실행, 단축키 치트시트 (이미지/도구/클래스/편집/드래그 모디파이어), 워크스페이스 디렉토리 레이아웃, 아키텍처 요약 섹션 신설.
- ✅ **[QA] 시나리오 체크리스트 문서화**: `qa-checklist.md` 신설 — 0. 준비물부터 14. 회귀 위험 포인트까지 15개 섹션. 각 항목 Pass/Fail 체크 가능.
- ⏳ **[QA] dev 실행 감각 검증**: `pnpm dev`에서 `qa-checklist.md`를 따라 수동 검증 (사용자 작업).

**검증**: `pnpm typecheck && pnpm lint && pnpm test` → 0 errors / 0 warnings / 41 tests pass (신규 +2건).

**Exit 조건**: `qa-checklist.md` 14개 섹션 전부 Pass, dev 실행 감각 버그 0개 (또는 우회 가능한 것만 이월).

### Phase 6 — 빌드 & 배포 파이프라인 ✅ 설정 완료 (실제 릴리스 대기)

_"Linux/Windows/macOS 바이너리를 자동으로 찍어낸다"_

- ✅ **[Build] `electron-builder.yml` 정리**:
  - `appId: com.longcat2957.tensorcube-labeling-tool`, `productName: "Tensorcube Labeling Tool"`
  - Linux `AppImage` + `deb` (snap 제거 — 빌드 환경 복잡도), Windows `nsis`, macOS `dmg` + `zip` (arch x64/arm64)
  - `publish: github` — `Longcat2957/tensorcube-labeling-tool-shadcn`
  - `files`에 tests/roadmap/qa-checklist/CLAUDE.md 제외 추가
- ✅ **[Build] `package.json` 정비**: `name: tensorcube-labeling-tool`, `version: 0.1.0`, author/homepage/repository/license 필드 정리.
- ✅ **[Build] `dev-app-update.yml`**: template `https://example.com/auto-updates` → GitHub provider로 교체.
- ✅ **[CI] Release workflow** (`.github/workflows/release.yml`): `v*` 태그 푸시 또는 `workflow_dispatch`로 발동. ubuntu/windows/macos 매트릭스, pnpm 10 + Node 22. typecheck → test → `pnpm build:linux|win|mac` → GitHub Release 자동 게시 (태그 푸시 시) + artifact 업로드. workflow_dispatch 기본은 dry-run(로컬 아티팩트만).
- ✅ **[Docs] `CHANGELOG.md`**: Keep a Changelog 1.1 형식, semver 준수. `[Unreleased]` + `[0.1.0]` 섹션에 Phase 1–5 전체 성과 정리.
- ⏳ **[Signing] 코드 서명**: 인증서 없이 진행 (Windows SmartScreen / macOS Gatekeeper 경고는 설치 가이드로 안내). 사용자 확보 후 투자.

**검증**: `pnpm typecheck && pnpm lint && pnpm test && pnpm build` → 모두 통과. 실제 `git tag v0.1.0 && git push origin v0.1.0`로 릴리스 테스트는 유저 작업.

**Exit 조건**: `v0.1.0` 태그 푸시 → 3개 OS 바이너리가 GitHub Release에 자동 업로드되어 다운로드 가능.

### Phase 7 — 자동 업데이트 & 운영 (진행 중)

_"사용자가 설치 후에도 최신 상태로 유지된다"_

- ✅ **[Deploy] `electron-updater` 연결**: `main/index.ts`에 `autoUpdater.checkForUpdatesAndNotify()` 초기화. `is.dev`일 때는 건너뜀. `autoDownload: true`, `autoInstallOnAppQuit: true`로 조용한 업데이트.
- ⏳ **[Deploy] 업데이트 UI**: 현재 OS 네이티브 알림만 뜸. renderer 토스트(svelte-sonner)로 "업데이트 준비됨, 재시작 시 적용" / "업데이트 확인" 수동 버튼 추가는 후속.
- ⏳ **[Obs] Sentry (옵트인)**: `@sentry/electron` 미도입. 유저 유입 후 판단.
- ⏳ **[Obs] 로그 파일**: `electron-log` 미도입.

**Exit 조건**: v0.1.0 → v0.1.1 태그 푸시 시 실제 설치된 앱이 자동 업데이트를 받고 재시작 후 새 버전이 적용됨.

### Phase 8 — 배포 후 관찰 (지속)

_"유저 피드백을 받기 시작하는 단계."_ 이 시점부터는 아래 "선택적 확장"으로 갈지, 버그 수정/UX 개선에 집중할지 데이터로 결정한다.

- Sentry 이슈 트리아지 (주간).
- GitHub Issues 템플릿 (버그 / 기능 요청 / 질문).
- 대표적 피드백 3건 이상이 공통으로 요청하는 기능이 나오면 로드맵 재조정.

---

## 3. 선택적 확장 (유저 피드백 이후 결정)

아래 항목들은 **Phase 8 관찰 결과에 따라** 착수 여부·우선순위를 다시 정한다. 지금 단계에서는 스펙만 동결.

### 옵션 A — 라벨링 타입 확장 (3–4주)

- **Polygon (`labeling_type: 3`)**: `polygonFactory`, 저장 포맷 `{"polygon": [[x,y], ...]}`.
- **Keypoint (`labeling_type: 4`)**: COCO keypoint 규약, per-class 키포인트 정의 `workspace.yaml` 확장.
- **Strategy 리팩터**: `LabelingTypeAdapter` 인터페이스(`createBox/renderBox/serialize/deserialize/exportAdapters`)로 `isBBMode/isOBBMode` 분기 제거.
- **라벨 JSON 스키마 버저닝**: `{"version": 2, ...}` + migration 체인.

**트리거**: 유저가 Polygon 또는 Keypoint를 명시적으로 요구하거나, 제3의 데이터셋 포맷 지원 요청이 누적될 때.

### 옵션 B — AI 보조 오토 라벨링 (4–6주)

- **ONNX Runtime** (`onnxruntime-node` 또는 Web) 도입, main 프로세스 추론 → IPC 반환.
- **Model Registry**: `workspace.yaml`에 `auto_model: { path, type: "yolov8" | "sam" | "yolov8-obb" }`.
- **인터랙션**: 프레임 예측(드래프트 삽입), Click-to-Segment(SAM 계열), 배치 사전 라벨링(`_W` 저장).
- **UX**: confidence 슬라이더, 자동 제안 색상 구분.

**트리거**: 라벨링 속도가 주된 불만으로 드러나거나, 특정 모델 공급처가 확정될 때.

### 옵션 C — 협업 기능

- **워크스페이스 zip export/import**: 검수자가 라벨만 받아 머지.
- **Git-LFS 친화 모드**: `label/` 변경 최소화(정렬된 key, trailing newline).
- **i18n (한/영)**: `svelte-i18n` 또는 자체 스토어.

**트리거**: 팀 단위 사용 사례 발생, 또는 비한국어권 사용자 유입.

---

## 4. 결정 보류 항목 (Open Questions)

- **코드 서명 투자 시점**: v0.1.x는 서명 없이 배포 + 설치 가이드로 우회할지, 초기부터 서명을 붙일지.
- **배포 채널**: GitHub Releases 단독 vs S3/CloudFront 병행(자체 도메인 업데이트 서버).
- **Sentry 도입 시점**: Phase 7에 포함할지, 유저 늘어난 후에 붙일지 (비용/프라이버시 고민).
- **Undo/Redo 디스크 백업**: 메모리만 유지 중. 사용자 요청 있을 때 `workspace/.cache/undo/`로 이관 검토.
- **옵션 A/B/C 우선순위**: Phase 8 관찰 결과로 결정.
