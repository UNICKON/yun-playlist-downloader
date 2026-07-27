import logSymbols from 'log-symbols'
import { fetchSongLyric, saveLyricTextBesideAudio } from './lyric'
import { embedAudioTags, isTaggableAudio } from './tags'
import { transcodeAudio, type TranscodeFormat } from './transcode'
import type { Song } from '$define'

export type PostDownloadOptions = {
  lyric?: boolean
  transcode?: TranscodeFormat
  bitrate?: number
  /** --cover 下载的歌单/专辑封面本地路径 */
  playlistCoverFile?: string
}

/**
 * 下载成功后：可选转码（删源）→ 可选写 .lrc + 内嵌标签（mp3/m4a）
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

  let lyricText: string | undefined
  if (options.lyric) {
    lyricText = await fetchSongLyric(song)
    if (lyricText) {
      await saveLyricTextBesideAudio(finalFile, lyricText)
    } else {
      console.log(`[lyric] 无歌词 ${song.singer} - ${song.songName}`)
    }
  }

  if (isTaggableAudio(finalFile)) {
    try {
      await embedAudioTags(finalFile, song, {
        lyricText,
        playlistCoverFile: options.playlistCoverFile,
      })
    } catch (e: any) {
      console.log(`${logSymbols.warning} [tags] 写入失败 ${finalFile}`)
      console.error(e?.message || e)
    }
  }

  return finalFile
}
