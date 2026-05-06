# Roadmap

`tensorcube-labeling-tool-shadcn`의 현재 구현 상태를 분석하고, 단기·중기·장기 개선 및 기능 확장 계획을 정리한 로드맵 문서.

---

## 1. 현재 상태 요약 (As-Is, Phase 15a + UX 폴리시 기준)

### 1.1 구현 완료된 핵심 기능

**라벨링 코어**

| 영역                             | 비고                                                                |
| -------------------------------- | ------------------------------------------------------------------- |
| BB / OBB / Polygon               | Fabric.js, `lib/canvas/` 모듈 분해. Polygon은 v1(통째 이동만)       |
| Keypoint (데이터/Export만)       | 캔버스 통합은 Phase 15b 대기                                        |
| 라벨 JSON v2 + 자동 마이그레이션 | `version: 2`, v1 자동 변환, image-level `tags` 지원                 |
| 단축키 매니저 + 툴팁             | `KEY_BINDINGS` 중앙 집중, 모든 버튼에 단축키 힌트                   |
| Undo / Redo                      | per-image 스택(상한 50), 이미지 왕복 후에도 유지                    |
| Copy / Paste / Replicate         | Ctrl+C/V (현재), Ctrl+Shift+V (이전 프레임)                         |
| 다중 선택 + 배치 삭제            | Shift-Click, 세트 보존                                              |
| Autosave + Save 인디케이터       | 500ms 디바운스, `SaveStatus` + `lastSavedAt`, `Ctrl+S`로 즉시 flush |
| Atomic save                      | temp 파일 + rename, 충돌·중단 안전                                  |

**워크스페이스 / 운영**

| 영역                    | 비고                                                                  |
| ----------------------- | --------------------------------------------------------------------- |
| 워크스페이스 생성·열기  | 9-digit 리네이밍, 빈 `.json` 일괄 생성, 병렬화(CONCURRENCY=8)         |
| `workspace://` 프로토콜 | 이미지 + 썸네일 캐시 노출                                             |
| 최근 워크스페이스       | 시작 화면 드롭다운, 존재하지 않는 경로 자동 필터링                    |
| 스냅샷                  | `<workspace>/.backups/<ts>/`, 복원 시 직전 상태 자동 백업             |
| 무결성 검사             | 4종 issue(orphan/missing/badId/schema), 항목별 또는 일괄 자동 수정    |
| 클래스 일괄 재지정      | `classOps`, ProjectSettingsDialog에 클래스별 어노테이션 개수 + 재할당 |

**UI / UX**

| 영역                               | 비고                                                               |
| ---------------------------------- | ------------------------------------------------------------------ |
| Mode Tabs (Edit / Check / Preview) | `Tab`/`Shift+Tab` 순환, Preview = Dashboard                        |
| Dashboard                          | 진척도 카드 + 누적 바 + 클래스 일람 + 경로/타임스탬프              |
| Label Layer List 양방향 동기화     | 리스트 ↔ 캔버스 $effect 반영                                       |
| 라벨 불투명도 슬라이더 + H 토글    | 캔버스 상단 플로팅 바                                              |
| 이미지 리스트 사이드패널           | 수동 가상 스크롤, 상태 dot + C/W 배지                              |
| 썸네일 그리드 뷰                   | sharp 썸네일 캐시, 가상 스크롤 + lazy load                         |
| 통계 & 필터                        | 클래스/상태/박스 크기·aspect 히스토그램, 필터 → 이미지 리스트 반영 |
| Review 모드                        | `Space` = `_C` 토글 + 자동 next                                    |
| Validation 검사                    | 5종 규칙(min area/side/oob/duplicate IoU/min per class)            |
| Minimap 뷰포트 드래그 팬           | 포인터 + 가상 viewport                                             |
| 다크 모드                          | `ModeWatcher` + Sun/Moon 토글                                      |
| BrowserWindow 크기 기억            | 기본 1400×900, 멀티모니터 fallback                                 |

**데이터 준비 도구 (워크스페이스 불필요)**

| 영역                                    | 비고                                                             |
| --------------------------------------- | ---------------------------------------------------------------- |
| Video → Frame                           | `ffmpeg-static` 번들, fps/every/all + 시간 범위, 진행률 스트림   |
| 배치 리사이즈 / 포맷 변환 / EXIF orient | sharp + mozjpeg                                                  |
| 샘플링 (시드 결정성)                    | Mulberry32 시드 기반                                             |
| 이미지 중복 제거                        | 8x8 aHash + Hamming 그룹화                                       |
| 이미지 품질 필터                        | sharp.stats() + Laplacian(blur/dark/bright/lowContrast/tooSmall) |

**Export 파이프라인**

| 포맷                          | 비고                                                |
| ----------------------------- | --------------------------------------------------- |
| YOLO / YOLO-OBB / COCO / DOTA | resize, split, out-of-bounds(clip/skip/none)        |
| YOLO-Seg / COCO segmentation  | Polygon 어노테이션                                  |
| COCO Keypoints                | `keypoints`/`skeleton` 카테고리 + per-instance      |
| Export 프리플라이트           | 2단계(미리 확인 → 요약 → 확정), 클래스/split별 집계 |

**인프라**

| 영역              | 비고                                                            |
| ----------------- | --------------------------------------------------------------- |
| TypeScript strict | `tsconfig.web.json` `strict: true`, 단일 `shared/types.ts`      |
| 테스트            | Vitest 88건 (export, obb, class-ops, validation, dedupe 등)     |
| CI                | typecheck → lint → test (pnpm 10 + Node 22)                     |
| ESLint            | error 0, warning 0                                              |
| 릴리스 파이프라인 | electron-builder 3-OS 매트릭스 + autoUpdater (electron-updater) |

### 1.2 남은 미구현 / 불완전

| 항목                                 | 예정             | 비고                                              |
| ------------------------------------ | ---------------- | ------------------------------------------------- |
| 업데이트 UI 토스트 / 수동 체크 버튼  | Phase 7 후속     | auto-download는 동작, 사용자 노티는 OS 네이티브만 |
| Polygon 정점 단위 편집               | Phase 14c        | 현재 통째 이동만, scale/rotate 잠금               |
| Keypoint 캔버스 통합                 | Phase 15b        | 데이터/Export는 완료, 렌더·그리기만 남음          |
| YOLO-Pose export                     | Phase 15b 선택   | COCO Keypoints만 지원 중                          |
| LabelingTypeAdapter 풀 리팩터        | 모달리티 추가 시 | 어댑터 인터페이스 스텁만, 분기는 여전히 산재      |
| C-4 IoU diff 시각화                  | 별도 Phase       | 별도 라벨 폴더 비교 인프라 필요                   |
| 워크스페이스 병합 / 분할 (M-8)       | 별도 Phase       | ID 재할당 + 클래스 충돌 UI 필요                   |
| 라벨링 시간 추적 (M-10)              | 별도 Phase       | 타이머·이벤트 인프라 필요                         |
| AI 보조 오토 라벨링                  | 옵션 B           | ONNX 미도입                                       |
| Sentry / 로그 파일                   | 옵션 C           | 유저 유입 후 판단                                 |
| i18n                                 | 옵션 C           | UI·로그·에러 한국어 하드코딩                      |
| Drag-select (박스 범위 선택)         | 후속             | Fabric selection 호환성 문제                      |
| 다중 선택 시 숫자키 일괄 클래스 변경 | 후속             | UI 공간 문제                                      |
| 코드 서명                            | 운영 투자        | Win EV / macOS Developer ID + notarization        |
| Playwright E2E                       | 운영 투자        | 현재 수동 QA(`qa-checklist.md`)로 커버            |

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

> **로드맵 확장 (2026-04-27)**: v0.1.0 RC 이후의 차기 개발 목표를 4개 영역(**A** 모달리티 / **C** 워크플로우·QA / **E** 안정성·UX / **M** 데이터 준비 유틸)으로 정리하고, Phase 9~13으로 최상위 배치. 안정화 → 데이터 준비 파이프라인 → 생산성 → 품질 관리 → 모달리티 확장 순으로 진행.

### Phase 9 — 안정화 기반 (E + M-7) ✅ 완료

_"데이터 손실/손상 가능성을 0에 수렴시킨다."_ 다른 기능을 추가하기 전 전제.

- ✅ **[Data] Atomic save (E-1 보강)**: `fileService.atomicWriteFile` 도입. `writeJsonFile`/`writeYamlFile`을 temp 파일(`.<basename>.<hex>.tmp`) 작성 후 `rename`으로 교체. 실패 시 temp 정리. 모든 reader는 확장자 필터(`.json` / 이미지 확장자)로 temp 파일을 무시.
- ✅ **[Data] 워크스페이스 스냅샷 (E-5)**: `services/utilities/snapshot.ts`(`createSnapshot`/`listSnapshots`/`deleteSnapshot`/`restoreSnapshot`). 백업 위치: `<workspace>/.backups/<YYYYMMDD-HHMMSS>/label/`. 복원 시 직전 상태도 자동으로 새 스냅샷 생성. 디렉토리명 정규식 검증으로 임의 경로 차단. (zip 의존성 없이 디렉토리 복사로 단순화.)
- ✅ **[Data] 무결성 검사 (M-7)**: `services/utilities/integrityCheck.ts`(`runIntegrityCheck`/`autoFixIssues`). 4종 issue: `orphanLabel`/`missingLabel`/`badIdPattern`/`schemaViolation`. labeling_type 불일치 어노테이션, class_id 누락도 schemaViolation으로 탐지. 자동 수정: 고아 삭제, 빈 라벨 생성(이미지 dims 포함), 손상 어노테이션만 필터링.
- ✅ **[UI] MaintenanceDialog**: Navigation "워크스페이스 유지보수" 메뉴 → 스냅샷/무결성 탭 다이얼로그. 항목별 수정 또는 일괄 수정 버튼.
- ✅ **[Test] 12건 신규**: `atomic-write.test.ts`(4건 — 정상 쓰기/덮어쓰기/temp 잔존 검증/동시 쓰기 JSON 유효성), `integrity-check.test.ts`(8건 — clean/orphan+missing/badId/schema 누락/labeling_type 불일치 + autoFix 3종).

**검증**: `pnpm typecheck && pnpm lint && pnpm test` → 0 errors / 0 warnings / 53 tests pass (기존 41 → +12).

**Exit 조건 충족**: atomic save 보장, 무결성 검사가 4종 문제 모두 탐지·자동 수정 가능, 손상된 워크스페이스 복구 가능.

### Phase 10 — 데이터 준비 파이프라인 (Misc Utilities) ✅ 완료

_"라벨링 도구 → 라벨링 + 데이터 준비 통합 도구"로 포지셔닝 변경._ 워크스페이스 진입 전/후 양쪽에서 호출 가능한 독립 유틸들. `src/main/services/utilities/` 하위에 모듈화.

- ✅ **[Tool] M-1 Video → Frame 추출**: `videoExtract.ts`. `ffmpeg-static`(5.3.0) 번들 의존성 추가, `electron-builder.yml`에 `asarUnpack`으로 ffmpeg 바이너리 unpack 처리. 모드: `fps` (초당 N프레임) / `every` (N프레임마다 1장) / `all` (모든 프레임). 시간 범위(`-ss`/`-to`), JPG 품질(1=best~31=worst). `-progress pipe:1`로 frame/out_time 진행률을 IPC로 streaming.
- ✅ **[Tool] M-2 배치 이미지 리사이즈**: `batchResize.ts`. `maxSide` / `fixed` / `scale` 3모드, sharp `.rotate()`로 EXIF 자동 적용, JPEG/WebP 품질 옵션. (워크스페이스 내부 적용은 라벨 좌표 동기화 위험으로 별도 흐름으로 분리, 본 단계 외부 디렉토리 변환에 집중.)
- ✅ **[Tool] M-3 배치 포맷 변환 + EXIF orientation 보정**: `formatConvert.ts`. JPEG/PNG/WebP/BMP/HEIC/HEIF/TIFF → JPG/PNG/WebP. EXIF 회전 정규화 옵션(기본 ON). JPEG는 mozjpeg 인코더 사용.
- ✅ **[Tool] M-9 샘플링**: `sampling.ts`. Mulberry32 시드 기반 랜덤 셔플로 N장 추출. 동일 시드 → 동일 결과 보장.
- ✅ **[UI] ToolsDialog**: Navigation 메뉴 "도구 (Tools)" → 4개 탭(Video / 리사이즈 / 변환 / 샘플링) 통합 다이얼로그. 진행률 표시(Video), 결과 카운터(나머지). ffmpeg 가용성 자동 probe.
- ✅ **[IPC] utilitiesHandler.ts**: `utility:sampleImages|batchResize|convertFormat|probeFfmpeg|extractVideoFrames`. `utility:videoProgress` 별도 채널로 sender에 진행률 stream. `dialog:selectVideoFile` 추가.
- ✅ **[Test] utilities.test.ts (+6건)**: sampling 시드 결정성, resize maxSide/scale, format 변환(JPG→PNG, PNG→WebP). Video 추출은 실제 비디오 fixture 없이 단위 테스트 어려워 probeFfmpeg 정도까지.

**검증**: `pnpm typecheck && pnpm lint && pnpm test` → 0 errors / 0 warnings / 59 tests pass (53 → +6).

**범위 제외 / 이월**:

- 워크스페이스 내부 리사이즈 + 라벨 좌표 동기화: 별도 흐름(Phase 12 Validation 또는 후속).
- Video 추출 실제 비디오 통합 테스트: fixture 추가 시 후속.

**Exit 조건 충족**: ffmpeg 번들로 외부 의존성 없이 Video → Frame → 워크스페이스 생성 흐름이 단일 앱 내에서 완결.

### Phase 11 — 생산성 (C + E-2) ✅ 완료

_"수천 장 라벨링 시 손이 더 편하다."_

- ✅ **[Productivity] C-2 박스 복제 / 이전 프레임 복사**: `KeyboardAction`에 `'replicate-prev'` 추가, Ctrl+Shift+V 바인딩(기존 Ctrl+V는 paste 유지). `workspaceManager.replicatePreviousImageLabels()`가 IPC로 직전 이미지 라벨을 읽어 현재 라벨링 모드와 일치하는 어노테이션을 새 UUID로 복제. 시퀀스 자동 보간은 후속.
- ✅ **[QA] C-1 통계 & 필터**: `services/workspaceStats.ts`(`computeWorkspaceStats`)로 클래스별 어노테이션, 상태 분포, 박스 크기·aspect 히스토그램(SIZE_BINS 6단계 / ASPECT_BINS 5단계), `boxCountById`/`classesById` 인덱스 산출. `StatsFilterDialog`(Navigation 메뉴)에서 시각화 + 필터(상태 다중 선택, 박스 0/≥1, 특정 클래스 포함). `imageFilter` 상태 + `filteredImageList` $derived → ImageListPanel/ThumbnailGrid에 즉시 반영. 필터 활성 시 카운터에 `current / filtered/total` 표기.
- ✅ **[UI] E-2 썸네일 그리드 뷰**: `services/thumbnails.ts`(`ensureThumbnailById`) — `sharp`로 200px 긴 변 JPEG 70 품질 썸네일을 `<workspace>/.cache/thumb/<id>.jpg`에 캐시. mtime 비교로 재사용. `ThumbnailGrid.svelte` 컴포넌트는 가상 스크롤(행 단위, OVERSCAN 2) + 동적 컬럼 수(viewport 너비 기반) + lazy thumbnail 로드(visible 항목만). `workspace://` 프로토콜로 노출. LeftSidebar에 토글 버튼.
- ✅ **[Test] +3건**: `workspace-stats.test.ts` — empty workspace, 상태/클래스/빈 이미지 집계, OBB 면적·aspect 히스토그램.

**검증**: `pnpm typecheck && pnpm lint && pnpm test` → 0 errors / 0 warnings / 62 tests pass (59 → +3).

**Exit 조건 충족**: 박스 복제로 동일 씬 N프레임 1키 입력으로 복제 가능, 그리드 뷰는 가상 스크롤로 수천 장 워크스페이스에서도 메모리/렌더 비용 일정.

### Phase 12 — 품질 관리 (C + M) ✅ 부분 완료

_"라벨 품질을 도구가 보장한다."_

- ✅ **[QA] C-3 Validation 규칙 + Export Gate**: `services/validation.ts`(`runValidation`) — 5종 규칙(`minBoxArea`/`minBoxSide`/`allowOutOfBounds`/`duplicateIou`/`minBoxesPerClass`). OBB는 AABB 변환 후 평가. IoU 계산 + 클래스별 박스 카운트 집계. `ValidationDialog`(Navigation 메뉴) — 규칙 toggle/숫자 입력, 결과 그룹별 카운트 + 위반 리스트(상위 200건) 클릭 시 해당 이미지 점프.
- ✅ **[QA] C-4 Review 모드 (라이트)**: `Space` 단축키로 현재 이미지 `_C` 토글, Check 모드일 때 자동으로 다음 이미지 이동. `toggleCurrentCompletion()` workspace 메서드. (두 버전 IoU 기반 diff 시각화는 후속 — 별도 라벨 폴더 비교 인프라 필요.)
- ✅ **[Tool] M-4 이미지 중복 제거**: `services/utilities/imageDedupe.ts` — 8x8 grayscale aHash + Hamming 거리 그룹화. 64bit BigInt hash → hex. 임계값 0(완전 동일) ~ 10+(유사). ToolsDialog 새 탭.
- ✅ **[Tool] M-5 이미지 품질 필터**: `services/utilities/imageQuality.ts` — sharp.stats() grayscale 통계 + Laplacian convolve 분산. 5종 flag(`blur`/`tooDark`/`tooBright`/`lowContrast`/`tooSmall`). ToolsDialog 새 탭.
- ✅ **[Test] +13건**: `validation.test.ts`(7건 — 5종 규칙 + OBB + 빈 규칙), `dedupe-quality.test.ts`(6건 — 동색 이미지 그룹화 + 밝기 mean 검증 + tooDark/tooSmall flag).

**검증**: `pnpm typecheck && pnpm lint && pnpm test` → 0 errors / 0 warnings / 73 tests pass (62 → +13).

**범위 제외 / 이월 (별도 단계)**:

- **C-4 두 라벨 버전 IoU diff 시각화**: 별도 라벨 디렉토리 비교 + Canvas overlay 인프라 필요. 현 라이트 버전(검수 토글 + 자동 next)으로 단계 마무리.
- **M-6 클래스 일괄 편집 확장**: 기존 `classOps`(rename/reassign)가 단일 워크스페이스 내에서 충분. 다중 워크스페이스 일괄은 사용 사례 발생 시.
- **M-8 워크스페이스 병합 / 분할**: ID 재할당 + 클래스 충돌 해결 UI 설계 필요. 별도 Phase로.
- **M-10 라벨링 시간 추적**: persistent timer/이벤트 추적 인프라 필요. 별도 Phase로.

### Phase 13 — 모달리티 확장 (A)

_"BB/OBB를 넘어 새로운 라벨링 타입 지원."_ 단일 Phase로 완수하기에 범위가 커서 13a (기반) / 14 (Polygon) / 15 (Keypoint)로 분할.

#### Phase 13a — 스키마 v2 + Tags + 어댑터 인터페이스 ✅ 완료

_"향후 모달리티 확장의 토대를 만든다."_

- ✅ **[Schema] 라벨 JSON v2 + 마이그레이션**: `LabelData.version: 2` 도입, `LABEL_SCHEMA_VERSION` 상수. v1(version 누락) 라벨은 read 시점에 `migrateToV2()`로 자동 변환 → 다음 저장 시점에 v2로 정착. `services/labelMigration.ts`에 `migrateToV2`/`normalizeForSave` 분리. `workspaceService.readLabelData`/`saveLabelData` 둘 다 적용. 빈 라벨 생성도 v2.
- ✅ **[Modality] A-3 Image-level Classification 태그**: `LabelData.tags: string[]` 추가. workspace store에 `addCurrentTag`/`removeCurrentTag`/`currentTags`. RightSidebar에 별도 Tags 패널 (Resizable.Pane, 입력+Enter / 삭제 버튼). pushHistorySnapshot으로 undo/redo 통합. autosave 자동 트리거.
- ✅ **[Refactor] LabelingTypeAdapter 인터페이스 스텁**: `shared/labelingTypeAdapter.ts` — `LabelingTypeId`, `LabelingTypeAdapter`(`emptyAnnotation`/`matches`/`toAabb`), `ExportAdapter`, `ADAPTER_REGISTRY`, `annotationsMatchType()` 헬퍼. 실제 BB/OBB 어댑터 구현체와 코드 마이그레이션은 Phase 14에서 (인터페이스 검증 후 조정 가능).
- ✅ **[Test] +9건**: `label-migration.test.ts` — v1→v2 변환 (필드 누락/잘못된 타입/이미 v2 보존), `normalizeForSave`, `annotationsMatchType` BB/OBB 일관성.

**검증**: `pnpm typecheck && pnpm lint && pnpm test` → 0 errors / 0 warnings / 82 tests pass (73 → +9).

**Exit 조건 충족**: 기존 v1 라벨 파일이 자동으로 v2로 마이그레이션되며 데이터 손실 없음. Tags가 저장/로드/UI에서 정상 동작. 어댑터 인터페이스가 Phase 14 구현 시 사용 가능한 시그니처 확보.

#### Phase 14a — Polygon 데이터 + Export ✅ 완료

_"Polygon 데이터 모델·검증·내보내기까지 완성. 캔버스 통합은 14b로 분리."_

- ✅ **[Schema] PolygonAnnotation**: `{ id, class_id, polygon: [[x,y]...] }`. `LabelingType` 타입을 `1|2|3|4`로 확장. `LabelData.annotations` 합성 타입에 포함, `AnyAnnotation` 추가.
- ✅ **[Workspace] 생성 UI**: CreateProjectDialog 라벨링 타입 라디오에 Polygon 옵션 추가. labeling_type 3 워크스페이스 생성 가능.
- ✅ **[Validation] Polygon AABB 평가**: `validation.ts`에서 polygon → AABB 환산 (`polygonAabb`). minBoxArea / minBoxSide / outOfBounds / duplicate 모두 polygon에 적용.
- ✅ **[Stats] Polygon 면적/aspect 히스토그램**: `workspaceStats.ts`에서 polygon AABB로 통계 집계.
- ✅ **[Integrity] labeling_type 일관성**: 1=BB / 2=OBB / 3=Polygon / 4=Keypoint. 자동 수정에 polygon/keypoint 필터 추가.
- ✅ **[Canvas 보호]**: 기존 BB/OBB 캔버스 모듈은 polygon/keypoint annotations을 silently skip (앱 크래시 없음, 단지 표시 안 됨).
- ✅ **[Export] YOLO-Seg**: `formats/yoloSeg.ts` — `<class_id> x1 y1 ... xN yN` 정규화된 polygon 라인. out-of-bounds clip/skip/none 처리.
- ✅ **[Export] COCO segmentation**: `formats/cocoSeg.ts` — `segmentation: [[...]]` + bbox(AABB) + area + iscrowd=0. annotations/instances\_{split}.json.

#### Phase 14b — Polygon 캔버스 통합 ✅ 완료

_"Polygon 워크스페이스에서 실제로 라벨링이 동작한다."_

- ✅ **[Tool] `'polygon'` 도구 추가**: `ToolType` union 확장, 커서 'crosshair', 도구 설명 추가.
- ✅ **[Canvas] `polygonFactory.ts` 신규**: `createPolygonObject` (Fabric Polygon 생성), `extractPolygonFromObject` (이동 후 새 좌표 추출 — `calcTransformMatrix` + `pathOffset` 활용), `updatePolygonPosition` (좌표 동기화). v1은 이동만 허용 (스케일/회전 잠금) — 정점 단위 편집은 v2.
- ✅ **[Canvas] labelManager 확장**: `addPolygonToCanvas` 신규. `renderLabels`/`syncLabelChanges`/`updateAllBoxPositions` 모두 polygon 분기 추가. 셀렉션·삭제·이동 모두 BB/OBB와 동일 흐름.
- ✅ **[Canvas] 그리기 모드**: `mouseHandlers.ts`에 `handlePolygonClick` (정점 추가 + 마커/라인 표시), `handlePolygonMove` (점선 미리보기), `commitPolygonDraft` (Enter / 더블클릭으로 닫기, 최소 3점 필요), `cancelPolygonDraft` (ESC). canvasSetup에 `mouse:dblclick` 이벤트 라우팅 추가.
- ✅ **[Store] `addPolygonAnnotation` / `updatePolygonAnnotation` / `getPolygonAnnotationById` / `isPolygonMode` / `isKeypointMode`**: 기존 BB/OBB 메서드와 동일 패턴. undo/redo·autosave 통합.
- ✅ **[Badge] Polygon AABB 기반 뱃지**: `createLabelBadge`가 `PolygonAnnotation`도 처리. AABB의 left-top에 클래스 이름 뱃지 표시.
- ✅ **[UI] LeftSidebar polygon 도구 버튼**: `isPolygonMode` 일 때 box 도구 대신 polygon 도구 표시. Tooltip에 사용법 ("클릭 정점 추가, 더블클릭/Enter 닫기, ESC 취소").
- ✅ **[KB] CanvasArea ESC/Enter 글로벌 리스너**: polygon 그리는 동안만 활성. INPUT/TEXTAREA 포커스 시 무시.
- ✅ **[Test] +2건**: `polygon-factory.test.ts` — 이미지↔스크린 좌표 round-trip + AABB 산출. (Fabric 의존 동적 동작은 통합 시점 dev에서 확인.)

**검증**:

```
pnpm typecheck → 0 errors / 0 warnings
pnpm lint      → 0 errors / 0 warnings
pnpm test      → 90 tests pass (14 files, 88 → +2)
pnpm build     → 3-process production build 성공
pnpm dev       → main + preload + renderer 부팅 성공
```

**범위 제외 (Phase 14c로 이월)**:

- **정점 단위 편집 (drag/insert/delete vertex)**: Fabric Polygon에 custom controls 부착 작업이 별도 분량. 현재는 polygon을 "통째로 이동"만 가능 (스케일/회전 잠금).
- **LabelingTypeAdapter 풀 리팩터**: `isBBMode`/`isOBBMode`/`isPolygonMode` 분기가 여전히 캔버스/store에 존재. 어댑터 패턴으로 일원화는 모달리티 추가 시 유의미해지므로 후속.

**Exit 조건 충족**: Polygon 워크스페이스에서 클릭으로 정점 추가 → 더블클릭/Enter로 polygon 어노테이션 생성, 캔버스 렌더링·선택·삭제·이동·undo/redo·자동 저장이 모두 정상 동작. COCO seg / YOLO-Seg export로 라벨이 손실 없이 출력.

#### Phase 15a — Keypoint 데이터 + Export ✅ 완료

_"Keypoint 데이터 모델·검증·내보내기까지 완성. 캔버스 통합은 15b로 분리."_

- ✅ **[Schema] KeypointAnnotation + KeypointSchema**: `keypoints: { x, y, v }[]` (COCO Pose visibility), 옵션 bbox. `WorkspaceConfig.keypoint_schema?: { names, skeleton? }`. `CreateWorkspaceOptions.keypointSchema` 옵션.
- ✅ **[Workspace] 생성 UI**: CreateProjectDialog에 Keypoint 옵션 + keypoint 이름 입력 필드(쉼표 구분).
- ✅ **[Validation/Stats] Keypoint AABB**: `keypointAabb` — bbox 또는 visible keypoints 기반. validation/stats 모두 적용.
- ✅ **[Integrity] labeling_type 일관성**: 4=Keypoint 분기 추가.
- ✅ **[Export] COCO Keypoints**: `formats/cocoKeypoints.ts` — 카테고리에 `keypoints` 이름 + `skeleton`. 어노테이션에 `keypoints: [x1,y1,v1,...]`, `num_keypoints`, bbox/area. `coco-keypoints` 포맷 추가, workspace.yaml에 `keypoint_schema` 없으면 에러.

#### Phase 15b (예정) — Keypoint 캔버스 통합

- ⏳ **[Canvas] Keypoint 렌더링**: 점 + skeleton edges 표시.
- ⏳ **[Canvas] 그리기 모드**: 순서대로 클릭하며 visibility 토글.
- ⏳ **[Export] YOLO-Pose** (선택).

**누적 검증** (Phase 14a + 15a): `pnpm typecheck && pnpm lint && pnpm test` → 0 errors / 0 warnings / 88 tests pass (82 → +6, polygon/keypoint export + validation + stats 검증).

#### Phase 9–15a 통합 검증 (2026-04-27, code review 라운드) ✅

전체 누적 변경에 대해 정적 체크 + production build + dev 부팅 + 두 reviewer agent 병렬 코드 리뷰를 수행하고, 발견된 실제 버그를 수정함.

**수정한 실제 버그**:

1. **[CRITICAL] `StatsFilterDialog.svelte` 빌드 실패**: `{@const}` 태그가 `<div>` 직속 자식이 아닌 위치에 있어 Svelte 컴파일러 에러 (`const_tag_invalid_placement`). `{#each}` 직속으로 이동해 해결.
2. **[HIGH] `getWorkspaceInfo` 라벨링 타입 표시**: `config.labeling_type === 1 ? 'BB' : 'OBB'` 하드코딩으로 Polygon/Keypoint가 'OBB'로 표시되던 문제. 4종 분기로 교체.
3. **[HIGH] `updateWorkspace`가 `keypointSchema` 무시**: 사용자가 워크스페이스 설정을 수정해도 keypoint_schema가 저장되지 않던 문제. `labelingType === 4`일 때 옵션 schema 적용, 다른 타입 전환 시 schema 제거 로직 추가.
4. **[HIGH] 간이 YAML 파서가 nested array 미지원 → keypoint_schema round-trip 실패**: `keypoint_schema.names`/`skeleton`이 디스크에 저장되어도 다음 read에서 빈 객체로 복원되던 문제. `readWorkspaceConfig` / `writeWorkspaceConfig` wrapper 도입해 `keypoint_schema` ↔ `keypoint_schema_json` (inline JSON 문자열) 자동 변환. 모든 read/write 사이트 (`workspaceService`, `export/index`, `integrityCheck`) 일괄 교체.
5. **[MEDIUM] 필터 활성 시 A/D 네비게이션이 필터 무시**: `nextImage`/`prevImage`가 전체 imageList로만 동작하던 문제. `findNextFilteredIndex(direction)` 헬퍼로 필터된 리스트 안에서 이동하도록 변경. 필터 비활성·필터 결과 외부 위치 등 엣지케이스도 처리.
6. **[MEDIUM] ThumbnailGrid 워크스페이스 전환 시 stale URL 잔존**: `thumbUrls` 캐시가 워크스페이스 변경 시 비워지지 않아 다른 워크스페이스의 이미지가 잠시 보일 수 있던 문제. `workspacePath` 의존성 `$effect`로 캐시 + pending Set 정리.

**Reviewer agent가 보고한 false positive (실제 버그 아님)**:

- "`.tmp` 파일이 readdir 스캐너에 노출": 임시 파일은 `.<basename>.<hex>.tmp` 패턴으로 `.tmp` 확장자로 끝나므로 모든 스캐너의 `.endsWith('.json')` 필터에 자동 제외됨. 정상.
- "스키마 v2 마이그레이션이 bulk reader에서 누락": `version`/`tags` 필드가 모두 optional이어서 v1 라벨도 `LabelData` 타입에 부합. bulk reader (stats/validation/export)는 `.annotations`/`.image_info`만 접근하므로 마이그레이션 없이도 정상 동작.

**최종 검증 결과**:

```
pnpm typecheck → 0 errors / 0 warnings (223 files)
pnpm lint      → 0 errors / 0 warnings
pnpm test      → 88 tests pass (13 files)
pnpm build     → 3-process production build 성공
pnpm dev       → main + preload + renderer 부팅 성공, electron 앱 기동
```

### Phase 16 — UX 폴리시 (2026-04-28) ✅ 완료

_"미세 결함 잡기. 워크스페이스 없이도 데이터 준비 도구 사용 가능하도록 진입점 정리."_

- ✅ **[UX] 데이터 준비 도구 무-워크스페이스 진입점**: 기존 구조에서 워크스페이스 미열림 시 `App.svelte`가 Navigation을 렌더하지 않아 ToolsDialog 진입 불가. empty-state 화면(워크스페이스 선택 안내)에 "데이터 준비 도구" 버튼 + 안내 문구 추가. 워크스페이스 의존 다이얼로그(Maintenance/Stats/Validation/Project Settings)는 워크스페이스 열림 시에만 메뉴 노출 (`{#if isWorkspaceOpen}`).
- ✅ **[UI] ToolsDialog → shadcn-svelte Select 마이그레이션**: 기존 native `<select>` 4곳(video mode/format, resize mode, convert format)을 `bits-ui` 기반 shadcn Select로 교체. `pnpm dlx shadcn-svelte add select`로 컴포넌트 추가, 트리거에 `!w-full !h-9`로 native와 동일한 너비/높이 유지, 라벨 맵으로 한국어 표시 텍스트 노출. (StatsFilterDialog/ProjectSettingsDialog의 native select는 후속 일괄 정리.)
- ✅ **[UI] ToolsDialog 크기 확장**: `max-w-3xl` → `!max-w-5xl w-[90vw]`, ScrollArea `h-[420px]` → `h-[70vh] max-h-[700px]`. 좁은 모달에서 폼 요소가 답답하던 문제 해결.

**검증**: `pnpm typecheck` → 0 errors / 0 warnings.

**남은 폴리시 (별도 후속)**:

- StatsFilterDialog / ProjectSettingsDialog의 native `<select>` 일관성 정리.
- `bits-ui` Dialog.Trigger `disabled={true}`가 트리거 자체를 안 보이게 만드는 동작 — `{#if}` 가드로 우회했으나, 시각적 disabled 표시(opacity-50)가 필요한 케이스가 생기면 별도 패턴 도입 필요.

---

## 3. 선택적 확장 (유저 피드백 이후 결정)

아래 항목들은 **Phase 8 관찰 결과에 따라** 착수 여부·우선순위를 다시 정한다. 지금 단계에서는 스펙만 동결.

### 옵션 A — 모달리티 마무리 (Phase 13–15a 후속)

대부분 Phase 13a/14a/14b/15a로 처리됨. 아래는 남은 마감 항목.

- **Phase 14c**: Polygon 정점 단위 편집 (drag/insert/delete vertex). Fabric custom controls 부착.
- **Phase 15b**: Keypoint 캔버스 통합 (렌더 + 그리기 + visibility 토글), 선택적으로 YOLO-Pose export.
- **LabelingTypeAdapter 풀 리팩터**: 어댑터 인터페이스 스텁만 있는 상태. `isBBMode`/`isOBBMode`/`isPolygonMode` 분기를 어댑터로 일원화 — 5번째 모달리티 추가 시점에 의미가 커짐.

**트리거**: Polygon 정점 편집 요구가 들어오거나, Keypoint 워크스페이스 실사용자가 생길 때.

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
