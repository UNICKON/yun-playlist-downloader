import { saveLyricBesideAudio } from './lyric'
import { transcodeAudio, type TranscodeFormat } from './transcode'
import type { Song } from '$define'

export type PostDownloadOptions = {
  lyric?: boolean
  transcode?: TranscodeFormat
  bitrate?: number
}

/**
 * 下载成功后：可选转码（删源）→ 可选写 .lrc
 * 返回最终音频路径
 */
export async function postProcessDownloadedFile(
  file: string,
  song: Song,
  options: PostDownloadOptions,
): Promise<string> {
  let finalFile = file

  if (options.transcode) {
    finalFile = await transcodeAudio(finalFile, options.transcode, options.bitrate)
  }

  if (options.lyric) {
    await saveLyricBesideAudio(finalFile, song)
  }

  return finalFile
}
