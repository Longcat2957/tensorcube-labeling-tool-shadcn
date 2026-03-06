/**
 * 클래스 ID별 색상 팔레트
 */
const CLASS_COLORS = [
  '#3b82f6', '#ef4444', '#22c55e', '#f59e0b', '#8b5cf6',
  '#ec4899', '#06b6d4', '#84cc16', '#f97316', '#6366f1'
] as const;

export function getClassColor(classId: number): string {
  return CLASS_COLORS[classId % CLASS_COLORS.length];
}

/** hex 색상 + 알파 → rgba 문자열 */
export function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}
