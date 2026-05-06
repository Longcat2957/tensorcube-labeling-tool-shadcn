/**
 * 데이터 준비 유틸 IPC 핸들러
 * - 샘플링 / 배치 리사이즈 / 포맷 변환 / Video→Frame
 *
 * 진행률은 video extract만 별도 채널('utility:videoProgress')로 sender에게 stream.
 */

import { ipcMain, type WebContents } from 'electron'
import { sampleImages, type SamplingOptions } from '../services/utilities/sampling.js'
import { batchResize, type BatchResizeOptions } from '../services/utilities/batchResize.js'
import { batchConvertFormat, type ConvertOptions } from '../services/utilities/formatConvert.js'
import {
  extractVideoFrames,
  probeFfmpeg,
  type VideoExtractOptions
} from '../services/utilities/videoExtract.js'
import { dedupeImages, type DedupeOptions } from '../services/utilities/imageDedupe.js'
import { analyzeQuality, type QualityOptions } from '../services/utilities/imageQuality.js'

export function registerUtilityHandlers(): void {
  ipcMain.handle('utility:sampleImages', async (_event, options: SamplingOptions) => {
    return await sampleImages(options)
  })

  ipcMain.handle('utility:batchResize', async (_event, options: BatchResizeOptions) => {
    return await batchResize(options)
  })

  ipcMain.handle('utility:convertFormat', async (_event, options: ConvertOptions) => {
    return await batchConvertFormat(options)
  })

  ipcMain.handle('utility:probeFfmpeg', async () => {
    return await probeFfmpeg()
  })

  ipcMain.handle(
    'utility:extractVideoFrames',
    async (event, requestId: string, options: VideoExtractOptions) => {
      const sender: WebContents = event.sender
      return await extractVideoFrames(options, (progress) => {
        if (!sender.isDestroyed()) {
          sender.send('utility:videoProgress', { requestId, ...progress })
        }
      })
    }
  )

  ipcMain.handle('utility:dedupeImages', async (_event, options: DedupeOptions) => {
    return await dedupeImages(options)
  })

  ipcMain.handle('utility:analyzeQuality', async (_event, options: QualityOptions) => {
    return await analyzeQuality(options)
  })
}
