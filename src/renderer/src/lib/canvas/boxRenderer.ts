/**
 * 박스 렌더링 모듈 진입점
 * 분리된 모듈들을 재-export
 */

// 좌표 변환
export {
  imageToScreen,
  screenToImage,
  normalizeBbox,
  bboxToObb,
  obbToBbox,
  screenToObb
} from './coordinates.js'

// 스타일
export {
  getClassColor,
  hexToRgba,
  setBoxSelectedStyle,
  DEFAULT_BOX_STYLE,
  type BoxStyleOptions,
  type LabelBoxData,
  type LabelBoxRect
} from './styles/boxStyles.js'

// 박스 생성
export {
  createLabelBox,
  createOBBLabelBox,
  createLabelBadge,
  createDrawingBox,
  type LabelBadgeObjects
} from './boxFactory.js'

// 유틸리티
export {
  updateBoxPosition,
  updateLabelBadgePosition,
  normalizeObbRectAfterModify
} from './boxUtils.js'
