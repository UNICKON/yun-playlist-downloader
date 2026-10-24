import { stat } from 'node:fs/promises'
import { fetchSongLyric, lyricPathForAudio, saveLyricTextBesideAudio } from './lyric'
import { getTranscodedFile, type TranscodeFormat } from './transcode'
import type { Song } from '$define'

async function isNonEmptyFile(file: string): Promise<boolean> {
  try {
    const st = await stat(file)
    return st.isFile() && st.size > 0
  } catch {
    return false
  }
}

async function existsFile(file: string): Promise<boolean> {
  try {
    return (await stat(file)).isFile()
  } catch {
    return false
  }
}

/**
 * `--skip` + `--transcode` 的补充判断。
 *
 * 下载器只按「预转码文件」判断是否跳过，而转码成功后源文件被删除、只剩 .mp3/.m4a，
 * 导致带 `--mp3` 重跑时已下载的歌会被全部重下。这里改为按「成品文件」判断。
 *
 * 命中时返回成品文件路径（表示本次跳过下载），否则返回 undefined。
 */
export async function skipIfTranscodedExists(options: {
  file: string
  song: Song
  transcode?: TranscodeFormat
  lyric?: boolean
}): Promise<string | undefined> {
  const { file, song, transcode, lyric } = options
  if (!transcode) return undefined

  const finalFile = getTranscodedFile(file, transcode)
  if (!(await isNonEmptyFile(finalFile))) return undefined

  // 音频已存在时，缺歌词则补一份（0 字节 .lrc 视为纯音乐，也跳过）
  if (lyric) {
    const lrcFile = lyricPathForAudio(finalFile)
    if (!(await existsFile(lrcFile))) {
      try {
        const text = await fetchSongLyric(song)
        if (text) await saveLyricTextBesideAudio(finalFile, text)
      } catch {
        /* 歌词失败不影响跳过 */
      }
    }
  }

  return finalFile
}
