/**
 * Export 서비스 진입점 (기존 호환성 유지)
 * 새로운 모듈화된 export 시스템으로 리다이렉트
 */

export { exportWorkspace } from './export/index.js';
export type { ExportOptions, ExportResult } from '../types/workspace.js';