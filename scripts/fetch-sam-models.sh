#!/usr/bin/env bash
# Phase 18 SAM 어시스턴트용 ONNX 모델을 resources/sam-models/ 로 가져온다.
#
# 동작:
#   1) 이미 두 파일이 있으면 noop.
#   2) ~/sam-export-tmp/output_models/ 에 있으면 그 경로에서 복사 (samexporter 로컬 빌드 결과).
#   3) 그 외엔 samexporter 를 사용해 직접 추출하라는 안내 출력.
#
# Phase 18-E 에서 HuggingFace public 호스팅 도입 후, 여기서 직접 다운로드하도록 교체.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DEST="$REPO_ROOT/resources/sam-models"
ENC="sam2.1_hiera_tiny.encoder.onnx"
DEC="sam2.1_hiera_tiny.decoder.onnx"

mkdir -p "$DEST"

if [[ -f "$DEST/$ENC" && -f "$DEST/$DEC" ]]; then
  echo "[fetch-sam-models] 이미 존재함: $DEST"
  exit 0
fi

LOCAL_BUILD="$HOME/sam-export-tmp/output_models"
if [[ -f "$LOCAL_BUILD/$ENC" && -f "$LOCAL_BUILD/$DEC" ]]; then
  echo "[fetch-sam-models] 로컬 빌드에서 복사: $LOCAL_BUILD → $DEST"
  cp "$LOCAL_BUILD/$ENC" "$DEST/$ENC"
  cp "$LOCAL_BUILD/$DEC" "$DEST/$DEC"
  echo "[fetch-sam-models] 완료."
  exit 0
fi

cat <<EOF
[fetch-sam-models] ONNX 파일을 찾을 수 없음.

다음 중 하나:
  (1) samexporter 로 직접 추출:
      uv init ~/sam-export-tmp
      cd ~/sam-export-tmp
      uv add --index-url https://download.pytorch.org/whl/cpu torch==2.10.0 torchvision==0.25.0
      uv add samexporter "git+https://github.com/facebookresearch/segment-anything-2.git"
      mkdir -p original_models output_models
      curl -L -o original_models/sam2.1_hiera_tiny.pt \\
        https://dl.fbaipublicfiles.com/segment_anything_2/092824/sam2.1_hiera_tiny.pt
      uv run python -m samexporter.export_sam2 \\
        --checkpoint original_models/sam2.1_hiera_tiny.pt \\
        --output_encoder output_models/$ENC \\
        --output_decoder output_models/$DEC \\
        --model_type sam2.1_hiera_tiny
      그 다음 이 스크립트 재실행.

  (2) 또는 Phase 18-E (HF public 호스팅) 도입 후 자동 다운로드.
EOF
exit 1
