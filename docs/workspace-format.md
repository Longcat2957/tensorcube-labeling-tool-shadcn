# Tensorcube Labeling Workspace Format Specification

> **목적**: 외부 도구 / AI 에이전트 / 스크립트가 이 문서만 보고 본 앱의 워크스페이스를
> **생성·수정·검증·재배치** 할 수 있도록 디스크 포맷을 형식적으로 정의한다.
>
> **버전**: 1.0 (앱 v0.1.0 기준, 라벨 스키마 v2)
> **권위 있는 정의**: `src/shared/types.ts` — 본 문서와 충돌하면 코드가 우선이다.
> **언어 주의**: 앱 UI/로그는 한국어이지만 디스크 상의 키·파일명·suffix는 모두 ASCII.

---

## 1. 개요

워크스페이스(workspace)는 **단일 디렉토리**로 자기-완결적이다. 이동·복사·zip은
디렉토리 통째로 다루며, 외부 데이터베이스에 의존하지 않는다.

```
<workspace_root>/
├── workspace.yaml          # 메타데이터 (필수)
├── src/                    # 원본 이미지 (필수, 9-digit 정규 파일명)
│   ├── 000000001.jpg
│   ├── 000000002.jpg
│   └── ...
├── label/                  # 라벨 JSON (필수, 이미지와 1:1)
│   ├── 000000001.json      #  │ 미작업 상태
│   ├── 000000002_W.json    #  │ 작업 중
│   ├── 000000003_C.json    #  ▼ 검수 완료
│   └── ...
├── .backups/               # (선택) 스냅샷 백업 — 앱이 자동 관리
└── .cache/                 # (선택) 썸네일 등 재생성 가능 캐시
```

**불변 규칙 (Invariants)**:

1. `src/`의 모든 이미지 파일명은 `\d{9}\.<ext>` 형식 (예: `000000001.jpg`).
2. 모든 이미지에 대응하는 라벨 파일이 `label/`에 정확히 **하나** 존재한다 (suffix 분기 포함).
3. 라벨 JSON의 `image_info.filename`은 같은 ID의 이미지 파일명과 정확히 일치한다.
4. 라벨 어노테이션의 좌표는 모두 **절대 픽셀**이다. 정규화·포맷 변환은 export 시점에만 일어난다.
5. `workspace.yaml`은 항상 존재하고 파싱 가능해야 한다.

위 5개 조건이 모두 성립하면 무결성 검사(`runIntegrityCheck`)가 issue를 보고하지 않는다.

---

## 2. 디렉토리 정의

### 2.1 `src/` — 원본 이미지

| 항목          | 값                                                                                                    |
| ------------- | ----------------------------------------------------------------------------------------------------- |
| 허용 확장자   | `.jpg`, `.jpeg`, `.png`, `.bmp`, `.webp` (소문자)                                                     |
| 파일명 정규식 | `^\d{9}\.(jpg\|jpeg\|png\|bmp\|webp)$`                                                                |
| ID 매핑       | `id = filename without extension` (= 9자리 숫자 문자열)                                               |
| 정렬 순서     | 사전순 (`localeCompare`) — 9-digit zero-padding으로 자연 정렬과 일치                                  |
| 회전 / EXIF   | EXIF orientation은 워크스페이스 생성 단계에서 정규화되어 있다고 가정. 픽셀이 표시 방향과 일치해야 함. |

**금지**: 디렉토리 중첩, 9-digit이 아닌 파일명, ID 충돌(서로 다른 확장자로 같은 ID).

### 2.2 `label/` — 라벨 JSON

이미지 ID 하나당 라벨 파일은 **정확히 1개** 존재한다. 작업 상태에 따라 suffix가 붙는다.

| 파일명 패턴   | 의미 (status)                                                        |
| ------------- | -------------------------------------------------------------------- |
| `<id>.json`   | `none` — 미작업. 워크스페이스 생성 시 빈 어노테이션으로 일괄 생성됨. |
| `<id>_W.json` | `working` — 작업 중 (autosave가 처음 발생한 이후).                   |
| `<id>_C.json` | `completed` — 검수 완료. 사용자가 명시적으로 토글한 상태.            |

**상태 전이 규칙**:

- 동일 `id`에 대해 위 세 파일은 **상호 배타** — 둘 이상 동시에 존재하면 무결성 위반(`schemaViolation`).
- 저장 시: 우선 기존 파일을 삭제 → 새 suffix로 atomic write (`fileService.atomicWriteFile`).
- 읽기 시: `_C.json` → `_W.json` → `<id>.json` 순으로 우선 검색.

### 2.3 `.backups/` — 스냅샷 (선택)

```
.backups/<YYYYMMDD-HHMMSS>/label/...
```

- 앱이 `MaintenanceDialog`에서 명시적으로 생성/복원/삭제.
- 외부 도구는 이 디렉토리를 **읽기 전용**으로 취급할 것을 권장. 복원 직후 자동으로 새 스냅샷이 만들어지므로 수동 변경은 위험.

### 2.4 `.cache/` — 재생성 가능 캐시 (선택)

- `.cache/thumb/<id>.jpg` — 200px 긴 변, JPEG 70 품질. mtime이 원본보다 오래되면 재생성됨.
- 외부 도구는 통째로 삭제해도 안전 (앱이 다시 만든다).

### 2.5 임시 파일

`fileService.atomicWriteFile`은 `.<basename>.<hex>.tmp` 형식의 임시 파일을 만든 뒤 `rename`으로 교체한다.

- 점(`.`)으로 시작하므로 일반적인 디렉토리 스캔에서 자연 제외된다.
- 모든 reader는 `.json` / 이미지 확장자 화이트리스트로 필터링하므로 무시된다.
- 외부 도구가 디렉토리를 스캔할 때는 `.json`/이미지 확장자만 받아들이고, 점으로 시작하는 파일은 건너뛸 것.

---

## 3. `workspace.yaml`

루트의 메타데이터 파일. 앱이 직접 사용하는 간이 YAML 파서로 다음 형식만 지원한다.

### 3.1 필드 (TypeScript 타입과 일치)

```yaml
workspace: <string> # 워크스페이스 이름 (디렉토리명과 같지 않아도 됨)
labeling_type: <1 | 2 | 3 | 4> # 라벨링 타입
names: # 클래스 ID → 이름 매핑
  0: person
  1: car
  2: bicycle
image_count: <int> # 생성 시점의 이미지 개수 (정보용)
created_at: <YYYY-MM-DD HH:MM:SS> # 로컬 시각 문자열
last_modified_at: <YYYY-MM-DD HH:MM:SS>
keypoint_schema_json: '{"names":["nose",...],"skeleton":[[1,2],...]}' # labeling_type=4일 때만 (3.4 참조)
```

### 3.2 `labeling_type` 값

| 값  | 의미                           | 어노테이션 종류      |
| --- | ------------------------------ | -------------------- |
| `1` | BB (axis-aligned bounding box) | `BBAnnotation`       |
| `2` | OBB (oriented bounding box)    | `OBBAnnotation`      |
| `3` | Polygon (segmentation)         | `PolygonAnnotation`  |
| `4` | Keypoint (COCO Pose 호환)      | `KeypointAnnotation` |

라벨 파일의 어노테이션은 워크스페이스의 `labeling_type`과 일치해야 한다. 불일치 시 무결성 검사가 `schemaViolation`을 보고하고, 자동 수정은 그 어노테이션을 제거한다.

### 3.3 `names`

- 키는 정수 클래스 ID (0-based 권장이나 강제는 아님).
- ID는 export 시 그대로 사용된다. ID 재할당이 필요하면 앱의 "클래스 일괄 재지정"(`reassignClass`)을 사용.
- ID는 정수만 허용. 음수도 파서는 허용하나 export는 비음수를 가정.

### 3.4 `keypoint_schema_json` (labeling_type=4 전용)

간이 YAML 파서가 nested array를 지원하지 않아, keypoint 스키마는 **`keypoint_schema_json` 키에 inline JSON 문자열**로 저장된다. 앱은 read/write wrapper에서 자동으로 `keypoint_schema` 객체와 변환한다.

JSON 내부 구조 (`KeypointSchema`):

```json
{
  "names": ["nose", "left_eye", "right_eye", ...],
  "skeleton": [[1, 2], [1, 3], ...]
}
```

- `names`: 키포인트 이름 순서. 인덱스가 `KeypointAnnotation.keypoints` 배열의 인덱스가 된다.
- `skeleton` (선택): edges, **1-indexed** name 인덱스 쌍 (COCO 관습).

**외부 도구가 직접 작성할 때**:

- `keypoint_schema_json` 키에 `single-quoted` 또는 `double-quoted` 문자열로 한 줄 JSON을 적는다.
- 따옴표 안의 escape는 표준 JSON 규칙을 따른다.
- labeling_type 1/2/3에서는 이 키를 **반드시 생략**해야 한다.

### 3.5 YAML 파서 호환성

본 앱의 파서는 다음만 처리한다 — 외부에서 작성할 때 이 범위를 벗어나면 안 된다:

- 최상위 `key: value` 페어 (한 줄)
- `names:` 처럼 1-depth 중첩 객체 (들여쓰기 2 space, `<int>: <string>`)
- inline 따옴표 문자열 (single/double 모두 가능)
- 주석은 미지원 (안전을 위해 사용하지 말 것)
- nested array, multi-line scalar, anchor 등 고급 문법 미지원

### 3.6 예시 — BB 워크스페이스

```yaml
workspace: traffic-counting-2026-04
labeling_type: 1
names:
  0: car
  1: truck
  2: bus
  3: motorcycle
image_count: 1842
created_at: 2026-04-15 14:32:11
last_modified_at: 2026-04-28 09:12:03
```

### 3.7 예시 — Keypoint 워크스페이스

```yaml
workspace: pose-coco-subset
labeling_type: 4
names:
  0: person
image_count: 250
created_at: 2026-04-20 10:00:00
last_modified_at: 2026-04-20 10:00:00
keypoint_schema_json: '{"names":["nose","left_eye","right_eye","left_ear","right_ear","left_shoulder","right_shoulder","left_elbow","right_elbow","left_wrist","right_wrist","left_hip","right_hip","left_knee","right_knee","left_ankle","right_ankle"],"skeleton":[[16,14],[14,12],[17,15],[15,13],[12,13],[6,12],[7,13],[6,7],[6,8],[7,9],[8,10],[9,11],[2,3],[1,2],[1,3],[2,4],[3,5],[4,6],[5,7]]}'
```

---

## 4. 라벨 JSON (스키마 v2)

각 라벨 파일은 다음 구조의 JSON 객체이다.

```jsonc
{
  "version": 2,
  "image_info": {
    "filename": "000000001.jpg",
    "width": 1920,
    "height": 1080
  },
  "annotations": [
    /* 0개 이상의 어노테이션 — 종류는 워크스페이스 labeling_type과 일치 */
  ],
  "tags": ["dim", "indoor"] // 선택, 이미지 단위 다중 태그
}
```

### 4.1 공통 필드

| 필드                  | 타입                 | 의무                                                 | 비고                                  |
| --------------------- | -------------------- | ---------------------------------------------------- | ------------------------------------- |
| `version`             | `2` (number literal) | 권장 (없으면 v1으로 간주, 읽기 시 자동 마이그레이션) |
| `image_info.filename` | `string`             | 필수                                                 | 같은 ID의 이미지 파일명과 정확히 일치 |
| `image_info.width`    | `int`                | 필수                                                 | 픽셀 단위, 양수                       |
| `image_info.height`   | `int`                | 필수                                                 | 픽셀 단위, 양수                       |
| `annotations`         | `Array`              | 필수 (빈 배열 허용)                                  | 4.2~4.5 참조                          |
| `tags`                | `string[]`           | 선택                                                 | 누락 시 빈 배열 취급                  |

### 4.2 `BBAnnotation` (labeling_type=1)

```json
{
  "id": "<uuid-like-string>",
  "class_id": 0,
  "bbox": [xmin, ymin, xmax, ymax]
}
```

- `bbox`: **절대 픽셀**, `[xmin, ymin, xmax, ymax]`. `xmin <= xmax`, `ymin <= ymax`.
- 좌표가 `[0, width]` × `[0, height]` 범위를 벗어나도 디스크에는 그대로 저장된다 — export 시점의 `outOfBounds` 정책(`clip`/`skip`/`none`)에서 처리.

### 4.3 `OBBAnnotation` (labeling_type=2)

```json
{
  "id": "<uuid-like-string>",
  "class_id": 0,
  "obb": [cx, cy, w, h, angle]
}
```

- `cx, cy`: 중심점 (절대 픽셀).
- `w, h`: 너비/높이 (양수, 절대 픽셀).
- `angle`: **라디안**, 시계 방향 양수 (캔버스 좌표계 관습). 0이면 axis-aligned.
- DOTA / YOLO-OBB export 시 4코너로 변환됨.

### 4.4 `PolygonAnnotation` (labeling_type=3)

```json
{
  "id": "<uuid-like-string>",
  "class_id": 0,
  "polygon": [[x0, y0], [x1, y1], [x2, y2], ...]
}
```

- 정점은 최소 3개. 시계/반시계 방향 무관.
- 마지막 정점 → 첫 정점은 자동 연결 (명시적으로 닫지 말 것).
- 좌표는 절대 픽셀.
- 단일 외곽 폴리곤만 지원 (구멍/멀티 폴리곤 미지원).

### 4.5 `KeypointAnnotation` (labeling_type=4)

```json
{
  "id": "<uuid-like-string>",
  "class_id": 0,
  "keypoints": [
    { "x": 100.5, "y": 200.0, "v": 2 },
    { "x": 0,     "y": 0,     "v": 0 },
    ...
  ],
  "bbox": [xmin, ymin, xmax, ymax]
}
```

- `keypoints` 배열의 길이는 워크스페이스 `keypoint_schema.names`의 길이와 **반드시 일치**.
- 각 항목은 `{x, y, v}` 객체, `v`는 COCO Pose visibility:
  - `0`: 라벨 없음 (`x, y`는 무시됨; 보통 0,0)
  - `1`: 라벨됨/가려짐 (occluded)
  - `2`: 라벨됨/보임 (visible)
- `bbox`는 선택 — 없으면 visible(=v≠0) keypoints의 AABB로 도출 가능.

### 4.6 `id` 필드

- 어노테이션의 `id`는 **워크스페이스 내에서 유일**해야 하며, 안정적인 식별자로 사용된다.
- 앱은 `md5(timestamp + Math.random()).hex` 32자 문자열을 생성하나, 외부에서 작성할 때는 다른 형식도 허용된다 (UUID, KSUID 등).
- 빈 문자열 / 중복 ID는 피할 것 — copy/paste, undo/redo, 다중 선택 동작이 ID에 의존.

### 4.7 v1 → v2 자동 마이그레이션

`version` 필드가 없는 파일은 v1으로 간주되어 read 시점에 다음과 같이 보정된다:

```ts
{
  version: 2,
  image_info: input.image_info ?? { filename: '', width: 0, height: 0 },
  annotations: Array.isArray(input.annotations) ? input.annotations : [],
  tags: (input.tags가 string[]이면 그대로, 아니면) []
}
```

디스크 자체는 변경되지 않고, 다음 저장 시점에 v2로 정착한다.

### 4.8 빈 라벨 파일

워크스페이스 생성 시 모든 이미지에 대해 빈 라벨이 일괄 생성된다:

```json
{
  "version": 2,
  "image_info": { "filename": "000000001.jpg", "width": 1920, "height": 1080 },
  "annotations": [],
  "tags": []
}
```

### 4.9 직렬화 규칙

- 인덴트는 2 space 권장 (앱이 `JSON.stringify(data, null, 2)`로 저장).
- 키 순서는 앱 출력과 정확히 같을 필요는 없음 — JSON 객체는 무순.
- 트레일링 newline 권장 (Git diff 친화).
- UTF-8 인코딩, BOM 없음.

---

## 5. 외부 도구가 워크스페이스를 생성하는 절차

새 워크스페이스를 만드는 경우 다음 순서로 작업한다.

1. **루트 디렉토리 생성**: `mkdir -p <root>/src <root>/label`.
2. **이미지 복사 + 정규화 파일명 부여**:
   - 원본 파일을 1-based 인덱스 순으로 정렬 (또는 결정적 순서).
   - `n`번째 파일 → `String(n).padStart(9, '0') + extname(원본)` 으로 복사.
   - 같은 워크스페이스 내에 같은 ID가 다른 확장자로 두 번 들어가면 안 됨.
3. **이미지 차원 측정**: 각 이미지의 width/height 픽셀 값을 얻는다 (sharp/ffprobe/ImageMagick 등).
4. **빈 라벨 생성**: 4.8 형식으로 `<root>/label/<id>.json`을 만든다 (suffix 없음).
5. **`workspace.yaml` 작성**: §3 규칙대로. `image_count`는 실제 복사된 이미지 수, `created_at`/`last_modified_at`은 로컬 시각.
6. (Keypoint인 경우) `keypoint_schema_json`을 inline JSON으로 추가.

검증: 작성 후 §1.1의 5개 invariants를 자체 검사하거나, 앱에서 워크스페이스를 열어 `MaintenanceDialog`의 "무결성 검사"를 돌려 issue가 0건인지 확인.

---

## 6. 외부 도구가 라벨을 추가/수정하는 절차

기존 워크스페이스에 라벨을 주입하는 경우 (예: 사전 학습 모델의 추론 결과 삽입).

1. **상태 결정**: 사용자가 검수해야 하면 `_W` (working), 그대로 신뢰할 수 있으면 `_C` (completed). 모델 출력은 일반적으로 `_W`로 저장하는 것을 강력히 권장.
2. **기존 파일 삭제**: 같은 ID에 대해 `<id>.json`, `<id>_W.json`, `<id>_C.json` 중 존재하는 파일을 모두 삭제.
3. **새 파일 작성**: §4 형식, atomic write 권장 (임시 파일 → rename).
4. **`image_info` 보존**: 기존 파일이 있었다면 `filename`/`width`/`height`를 그대로 유지하거나, 이미지 파일에서 다시 측정.
5. **`workspace.yaml`의 `last_modified_at` 갱신** (선택, 앱이 라벨 저장 시 갱신함).

**주의 — atomic write 시 임시 파일명**: `.<basename>.<6-byte-hex>.tmp` 패턴을 사용하면 앱 reader와 충돌하지 않는다. 다른 패턴이라도 점으로 시작하지 않는 `.tmp`/`.json` 외 확장자라면 무시되지만, 안전하게 같은 패턴을 쓸 것.

---

## 7. 외부 도구가 워크스페이스를 재배치(Reshape)하는 절차

기존 워크스페이스를 다른 형태로 변환할 때 (예: 별도의 외부 데이터셋 → 본 포맷).

### 7.1 다른 라벨링 도구의 데이터셋을 본 포맷으로 가져오기

1. **이미지를 9-digit 정규화**: §5.2 절차.
2. **외부 라벨 → 본 포맷 어노테이션으로 변환**:
   - YOLO `<class> <cx_n> <cy_n> <w_n> <h_n>` → BB는 `[cx-w/2, cy-h/2, cx+w/2, cy+h/2]` × (width, height).
   - COCO `[x, y, w, h]` (XYWH) → BB는 `[x, y, x+w, y+h]`.
   - DOTA 4코너 → OBB는 minimum-area-rectangle로 환산해 `(cx, cy, w, h, angle)`.
   - COCO segmentation `[[x1,y1,x2,y2,...]]` → Polygon은 `[[x1,y1],[x2,y2],...]`.
   - COCO keypoints `[x1,y1,v1,...]` → Keypoint는 `{x, y, v}` 객체 배열.
3. **각 어노테이션에 `id` 부여**: UUID/MD5 등 32자 hex 권장.
4. **`class_id` 매핑**: 외부 클래스 → 본 워크스페이스 `names`의 ID로 매핑. 매핑되지 않은 클래스의 어노테이션은 drop 또는 reassign.
5. **labeling_type별 정합성**: 한 워크스페이스에는 한 종류의 어노테이션만 들어간다. 혼합이 필요하면 별도 워크스페이스로 분리.

### 7.2 본 포맷에서 다른 포맷으로 내보내기

앱의 export 파이프라인(`src/main/services/export/`)을 사용하는 것이 권장. 외부에서 직접 변환하려면:

- 좌표는 모두 **절대 픽셀** 상태이므로 export 포맷에 맞춰 정규화한다.
- `image_info.width/height`를 정규화 분모로 사용.
- `outOfBounds` 정책을 결정 — `clip` (좌표를 [0, w]×[0, h]로 clamp), `skip` (해당 박스 제외), `none` (원본 유지).

### 7.3 워크스페이스 병합 (수동 절차)

앱은 아직 자동 병합 기능을 제공하지 않으므로 수동 절차:

1. 두 워크스페이스의 `labeling_type`이 **같아야** 한다.
2. 두 워크스페이스의 `names` 매핑이 일치하지 않으면 한쪽을 reassign으로 정렬한 뒤 진행.
3. 새 워크스페이스를 만들고 두 `src/`의 이미지를 통합 인덱스로 다시 9-digit 부여 (충돌 회피).
4. 각 라벨의 `image_info.filename`을 새 ID에 맞춰 갱신.
5. `workspace.yaml`은 새로 작성.

---

## 8. 무결성 검사 항목 (참고)

앱의 `runIntegrityCheck`가 보고하는 issue 종류와 대응:

| `kind`            | 의미                                                   | autoFixable | 자동 수정 동작                  |
| ----------------- | ------------------------------------------------------ | ----------- | ------------------------------- |
| `orphanLabel`     | 라벨 파일은 있는데 대응 이미지가 없음                  | ✅          | 라벨 파일 삭제                  |
| `missingLabel`    | 이미지는 있는데 라벨 파일이 없음                       | ✅          | 빈 라벨 생성 (이미지 dims 포함) |
| `badIdPattern`    | `\d{9}\.<ext>` 패턴 위반                               | ❌          | (수동 — 파일명 변경)            |
| `schemaViolation` | labeling_type 불일치, class_id 누락, 필수 필드 누락 등 | ✅          | 손상 어노테이션만 제거          |

외부 도구가 워크스페이스를 작성한 뒤 이 4종 issue가 모두 0건이면 앱에서 정상 사용 가능하다.

---

## 9. 좌표계 / 단위 요약

| 항목                 | 단위 / 좌표계                                        |
| -------------------- | ---------------------------------------------------- |
| 모든 어노테이션 좌표 | 절대 픽셀                                            |
| 원점                 | 이미지 좌상단 (0, 0)                                 |
| Y축                  | 아래로 증가                                          |
| 각도 (OBB)           | 라디안, 시계방향 양수                                |
| 색상 / 클래스        | `class_id`만 의미 있음. UI 색상은 앱이 자체 매핑.    |
| 시각 표기            | `YYYY-MM-DD HH:MM:SS` 로컬 시간 (timezone 정보 없음) |

---

## 10. 변경 이력

| 날짜       | 변경                                                                           |
| ---------- | ------------------------------------------------------------------------------ |
| 2026-04-28 | 1.0 초판. 라벨 스키마 v2 / labeling_type 1–4 / keypoint_schema_json 표기 정의. |

---

## 부록 A — TypeScript 타입 참조

코드 상의 권위 있는 정의 위치:

- `src/shared/types.ts` — `LabelingType`, `WorkspaceConfig`, `LabelData`, `BBAnnotation`,
  `OBBAnnotation`, `PolygonAnnotation`, `KeypointAnnotation`, `KeypointSchema`.
- `src/main/services/labelMigration.ts` — v1 → v2 마이그레이션.
- `src/main/services/workspaceService.ts` — 디스크 I/O 진입점.
- `src/main/services/utilities/integrityCheck.ts` — 무결성 검사 규칙.

본 문서와 코드가 충돌하면 코드가 우선이다. 차이를 발견하면 본 문서를 갱신할 것.
