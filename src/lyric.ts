import { writeFile } from 'node:fs/promises'
import path from 'node:path'
import logSymbols from 'log-symbols'
import { songLyric } from '$api'
import type { Song } from '$define'

export function getSongId(song: Song): number | undefined {
  const raw = song.raw as { id?: number; songId?: number } | undefined
  const id = raw?.id ?? raw?.songId
  return typeof id === 'number' ? id : undefined
}

export function lyricPathForAudio(audioFile: string) {
  const dir = path.dirname(audioFile)
  const base = path.basename(audioFile, path.extname(audioFile))
  return path.join(dir, `${base}.lrc`)
}

export async function saveLyricBesideAudio(audioFile: string, song: Song) {
  const id = getSongId(song)
  if (id == null) {
    console.log(`${logSymbols.warning} [lyric] 无歌曲 id，跳过 ${audioFile}`)
    return
  }

  let text: string | undefined
  try {
    text = await songLyric(id)
  } catch (e: any) {
    console.log(`${logSymbols.warning} [lyric] 获取失败 ${song.singer} - ${song.songName}`)
    console.error(e?.message || e)
    return
  }

  if (!text) {
    console.log(`${logSymbols.warning} [lyric] 无歌词 ${song.singer} - ${song.songName}`)
    return
  }

  const lrcFile = lyricPathForAudio(audioFile)
  await writeFile(lrcFile, text, 'utf8')
  console.log(`${logSymbols.success} [lyric] ${lrcFile}`)
}
