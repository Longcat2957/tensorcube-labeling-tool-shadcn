#!/usr/bin/env node
/**
 * resources/sam-models-parts/ 의 청크 + manifest.json 을 읽어서
 * resources/sam-models/ 에 원본 .onnx 를 복원한다.
 *
 * postinstall 에서 자동 실행되므로 dev/CI 모두 pnpm install 직후 SAM 모델이 준비됨.
 * - 매니페스트 없음 (얕은 클론, fork 등): skip & exit 0
 * - 이미 합쳐진 파일이 sha256 일치: skip
 * - 청크 누락 / 해시 불일치: 에러 종료
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync, statSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const SRC = join(ROOT, 'resources', 'sam-models-parts')
const DST = join(ROOT, 'resources', 'sam-models')
const MANIFEST = join(SRC, 'manifest.json')

if (!existsSync(MANIFEST)) {
  console.log(`[sam-assemble] manifest 없음 (${MANIFEST}) — skip`)
  process.exit(0)
}

const manifest = JSON.parse(readFileSync(MANIFEST, 'utf-8'))
mkdirSync(DST, { recursive: true })

function sha256(buf) {
  return createHash('sha256').update(buf).digest('hex')
}

let assembled = 0
let skipped = 0

for (const file of manifest.files) {
  const dstPath = join(DST, file.filename)

  if (existsSync(dstPath) && statSync(dstPath).size === file.size) {
    if (sha256(readFileSync(dstPath)) === file.sha256) {
      skipped++
      continue
    }
  }

  const chunks = []
  for (let i = 0; i < file.chunks; i++) {
    const partName = `${file.filename}.part-${String(i).padStart(3, '0')}`
    const partPath = join(SRC, partName)
    if (!existsSync(partPath)) {
      console.error(`[sam-assemble] 청크 누락: ${partPath}`)
      process.exit(1)
    }
    chunks.push(readFileSync(partPath))
  }
  const joined = Buffer.concat(chunks)
  const actualHash = sha256(joined)
  if (actualHash !== file.sha256) {
    console.error(
      `[sam-assemble] ${file.filename} 해시 불일치\n  expected ${file.sha256}\n  actual   ${actualHash}`
    )
    process.exit(1)
  }
  writeFileSync(dstPath, joined)
  console.log(`[sam-assemble] ${file.filename}: ${file.chunks} chunks → ${file.size} bytes ✓`)
  assembled++
}

console.log(`[sam-assemble] done — assembled=${assembled}, skipped=${skipped}`)
