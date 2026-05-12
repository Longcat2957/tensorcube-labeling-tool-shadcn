#!/usr/bin/env node
/**
 * SAM ONNX 모델을 5MB 청크로 잘라서 resources/sam-models-parts/ 에 떨군다.
 * GitHub 단일 파일 100MB 제한 때문에 encoder (~128MB) 가 그대로는 올라가지 않음.
 *
 * 청크는 git 에 커밋, postinstall 시 sam-assemble.mjs 가 다시 합친다.
 * 모델을 재생성/교체했을 때 이 스크립트를 한 번 돌려서 청크를 새로 만들어주면 됨.
 *
 *   pnpm sam:split
 */
import { readFileSync, writeFileSync, mkdirSync, readdirSync, rmSync, existsSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const SRC = join(ROOT, 'resources', 'sam-models')
const DST = join(ROOT, 'resources', 'sam-models-parts')
const CHUNK_SIZE = 5 * 1024 * 1024

const FILES = ['sam2.1_hiera_tiny.encoder.onnx', 'sam2.1_hiera_tiny.decoder.onnx']

function sha256(buf) {
  return createHash('sha256').update(buf).digest('hex')
}

mkdirSync(DST, { recursive: true })

for (const f of readdirSync(DST)) {
  if (FILES.some((file) => f.startsWith(`${file}.part-`))) {
    rmSync(join(DST, f))
  }
}

const manifest = { chunkSize: CHUNK_SIZE, files: [] }

for (const filename of FILES) {
  const srcPath = join(SRC, filename)
  if (!existsSync(srcPath)) {
    console.error(`[sam-split] source missing: ${srcPath}`)
    console.error(`[sam-split] scripts/fetch-sam-models.sh 로 먼저 .onnx 를 준비하세요.`)
    process.exit(1)
  }
  const buf = readFileSync(srcPath)
  const totalSize = buf.length
  const totalHash = sha256(buf)
  const chunkCount = Math.ceil(totalSize / CHUNK_SIZE)

  for (let i = 0; i < chunkCount; i++) {
    const start = i * CHUNK_SIZE
    const end = Math.min(start + CHUNK_SIZE, totalSize)
    const partName = `${filename}.part-${String(i).padStart(3, '0')}`
    writeFileSync(join(DST, partName), buf.subarray(start, end))
  }

  manifest.files.push({
    filename,
    size: totalSize,
    sha256: totalHash,
    chunks: chunkCount
  })
  console.log(
    `[sam-split] ${filename}: ${chunkCount} chunks, ${totalSize} bytes, sha256 ${totalHash.slice(0, 12)}…`
  )
}

writeFileSync(join(DST, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n')
console.log(`[sam-split] manifest 작성 완료: ${join(DST, 'manifest.json')}`)
