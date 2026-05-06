/**
 * Video → Frame 추출 (ffmpeg-static 번들 사용)
 *
 * 옵션:
 *  - mode: 'fps' (초당 N프레임) | 'every' (N프레임마다 1장) | 'all' (모든 프레임)
 *  - startSec / endSec: 시간 범위 제한 (초 단위, 옵션)
 *  - format: 'jpg' | 'png' (기본 jpg)
 *  - quality: jpg 품질 (1=best, 31=worst), 기본 2
 *
 * 출력:
 *  - <targetDir>/00000001.jpg, 00000002.jpg, ... (8자리 패딩)
 *
 * 주의: app.asar 패키징 환경에서는 ffmpeg-static 경로가 'app.asar.unpacked' 아래에
 * 위치하므로 require 결과를 '/app.asar/' → '/app.asar.unpacked/'로 치환해야 한다.
 */

import { join } from 'path'
import { mkdir, readdir, stat } from 'fs/promises'
import { existsSync } from 'fs'
import { spawn } from 'child_process'
import ffmpegPathRaw from 'ffmpeg-static'

function resolveFfmpegPath(): string {
  if (!ffmpegPathRaw) {
    throw new Error('ffmpeg-static 경로를 찾을 수 없습니다.')
  }
  // 패키징 환경 대응
  return ffmpegPathRaw.replace('app.asar', 'app.asar.unpacked')
}

export type ExtractMode = 'fps' | 'every' | 'all'
export type FrameFormat = 'jpg' | 'png'

export interface VideoExtractOptions {
  videoPath: string
  targetDir: string
  mode: ExtractMode
  /** mode='fps' 일 때 초당 프레임 수 (예: 1, 5, 30) */
  fps?: number
  /** mode='every' 일 때 N프레임마다 1장 */
  everyN?: number
  startSec?: number
  endSec?: number
  format?: FrameFormat
  /** jpeg 품질, 1(best)~31(worst). 기본 2 */
  quality?: number
}

export interface VideoExtractProgress {
  /** ffmpeg가 처리한 출력 프레임 수 (또는 -1 미지원) */
  frame: number
  /** 처리 시각 (초) */
  outTimeSec: number
}

export interface VideoExtractResult {
  extracted: number
  targetDir: string
}

export async function extractVideoFrames(
  opts: VideoExtractOptions,
  onProgress?: (p: VideoExtractProgress) => void
): Promise<VideoExtractResult> {
  if (!existsSync(opts.videoPath)) {
    throw new Error('비디오 파일을 찾을 수 없습니다.')
  }
  await mkdir(opts.targetDir, { recursive: true })

  const ffmpeg = resolveFfmpegPath()
  const format = opts.format ?? 'jpg'
  const ext = format === 'jpg' ? 'jpg' : 'png'
  const outputPattern = join(opts.targetDir, `%08d.${ext}`)

  const args: string[] = ['-y']
  if (opts.startSec !== undefined && opts.startSec >= 0) {
    args.push('-ss', String(opts.startSec))
  }
  if (opts.endSec !== undefined && opts.endSec > (opts.startSec ?? 0)) {
    args.push('-to', String(opts.endSec))
  }
  args.push('-i', opts.videoPath)

  if (opts.mode === 'fps') {
    const fps = opts.fps ?? 1
    args.push('-vf', `fps=${fps}`)
  } else if (opts.mode === 'every') {
    const n = Math.max(1, Math.floor(opts.everyN ?? 1))
    args.push('-vf', `select='not(mod(n\\,${n}))'`, '-vsync', 'vfr')
  }
  // mode='all' 은 -vf 추가하지 않음

  if (format === 'jpg') {
    args.push('-q:v', String(opts.quality ?? 2))
  }
  args.push('-progress', 'pipe:1', '-nostats')
  args.push(outputPattern)

  return await new Promise((resolve, reject) => {
    const proc = spawn(ffmpeg, args)
    let stderrBuf = ''

    proc.stdout.on('data', (chunk: Buffer) => {
      const text = chunk.toString('utf-8')
      // ffmpeg -progress 는 "key=value\n" 라인 스트림으로 출력
      const lines = text.split('\n')
      let frame = -1
      let outTimeSec = -1
      for (const line of lines) {
        const idx = line.indexOf('=')
        if (idx === -1) continue
        const key = line.slice(0, idx).trim()
        const value = line.slice(idx + 1).trim()
        if (key === 'frame') frame = Number(value)
        else if (key === 'out_time_ms') outTimeSec = Number(value) / 1_000_000
      }
      if (onProgress && (frame !== -1 || outTimeSec !== -1)) {
        onProgress({ frame, outTimeSec })
      }
    })

    proc.stderr.on('data', (chunk: Buffer) => {
      stderrBuf += chunk.toString('utf-8')
      // 너무 많은 메모리 점유 방지 — 마지막 8KB만 유지
      if (stderrBuf.length > 8192) {
        stderrBuf = stderrBuf.slice(-8192)
      }
    })

    proc.on('error', (err) => {
      reject(err)
    })

    proc.on('close', async (code) => {
      if (code !== 0) {
        reject(new Error(`ffmpeg 종료 코드 ${code}: ${stderrBuf.slice(-2000)}`))
        return
      }
      try {
        const files = await readdir(opts.targetDir)
        const extracted = files.filter((f) => f.endsWith(`.${ext}`)).length
        resolve({ extracted, targetDir: opts.targetDir })
      } catch (err) {
        reject(err)
      }
    })
  })
}

/** ffmpeg가 사용 가능한지(번들 또는 시스템) 확인 */
export async function probeFfmpeg(): Promise<{
  available: boolean
  path?: string
  version?: string
}> {
  try {
    const ffmpeg = resolveFfmpegPath()
    if (!existsSync(ffmpeg)) {
      return { available: false }
    }
    const st = await stat(ffmpeg)
    if (!st.isFile()) return { available: false }
    return await new Promise((resolve) => {
      const proc = spawn(ffmpeg, ['-version'])
      let buf = ''
      proc.stdout.on('data', (c: Buffer) => (buf += c.toString('utf-8')))
      proc.on('error', () => resolve({ available: false }))
      proc.on('close', () => {
        const m = buf.match(/ffmpeg version (\S+)/)
        resolve({ available: true, path: ffmpeg, version: m?.[1] })
      })
    })
  } catch {
    return { available: false }
  }
}
