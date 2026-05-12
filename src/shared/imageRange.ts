/**
 * 이미지 번호 범위 파서.
 *
 * 사용자가 PDF 인쇄 페이지 범위처럼 입력한 문자열(`"1-15, 19, 20"`)을
 * 9자리 zero-padded 이미지 ID 집합으로 변환한다.
 *
 * 규칙
 * - 콤마(,) 로 토큰 분리, 토큰 내부 공백 무시.
 * - 단일 번호: `5`, 범위: `1-15` (start ≤ end). 음수/0/비정수 불가.
 * - 빈 문자열 또는 공백만이면 "필터 없음" 의미로 ids=null 반환.
 * - 잘못된 토큰이 하나라도 있으면 errors 배열에 메시지 누적, ids=null.
 */

export const IMAGE_ID_PAD_WIDTH = 9

export interface ParsedImageRange {
  /** 허용된 이미지 ID 집합. null = 필터 없음(전체 허용) 또는 파싱 실패. */
  ids: Set<string> | null
  /** 허용된 정수 번호 수 (중복 제거 기준). 0 이면 "필터 없음" 또는 비어있음. */
  count: number
  /** 파싱 오류. 비어있으면 정상. */
  errors: string[]
}

/** 정수를 9자리 zero-padded 문자열로 변환. */
export function toImageId(n: number): string {
  return String(n).padStart(IMAGE_ID_PAD_WIDTH, '0')
}

/**
 * 범위 문자열을 파싱한다.
 *
 * @param input  사용자 입력. `null`/빈값/공백만이면 필터 없음.
 * @returns ParsedImageRange — ids=null + errors=[] 이면 "필터 없음".
 */
export function parseImageRange(input: string | null | undefined): ParsedImageRange {
  if (input == null) return { ids: null, count: 0, errors: [] }
  const trimmed = input.trim()
  if (trimmed === '') return { ids: null, count: 0, errors: [] }

  const errors: string[] = []
  const numbers = new Set<number>()

  const tokens = trimmed.split(',')
  for (const rawToken of tokens) {
    const token = rawToken.trim()
    if (token === '') continue

    const rangeMatch = token.match(/^(\d+)\s*-\s*(\d+)$/)
    if (rangeMatch) {
      const start = Number(rangeMatch[1])
      const end = Number(rangeMatch[2])
      if (start < 1 || end < 1) {
        errors.push(`범위는 1 이상이어야 합니다: "${token}"`)
        continue
      }
      if (start > end) {
        errors.push(`시작 번호가 끝 번호보다 큽니다: "${token}"`)
        continue
      }
      for (let n = start; n <= end; n++) numbers.add(n)
      continue
    }

    if (/^\d+$/.test(token)) {
      const n = Number(token)
      if (n < 1) {
        errors.push(`1 이상의 번호만 허용됩니다: "${token}"`)
        continue
      }
      numbers.add(n)
      continue
    }

    errors.push(`잘못된 형식: "${token}"`)
  }

  if (errors.length > 0) {
    return { ids: null, count: 0, errors }
  }

  const ids = new Set<string>()
  for (const n of numbers) ids.add(toImageId(n))
  return { ids, count: ids.size, errors: [] }
}
