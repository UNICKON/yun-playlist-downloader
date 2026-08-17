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

export async function fetchSongLyric(song: Song): Promise<string | undefined> {
  const raw = song.raw as { lyricText?: string; multiSource?: boolean } | undefined
  if (typeof raw?.lyricText === 'string' && raw.lyricText.trim()) {
    return raw.lyricText
  }

  const id = getSongId(song)
  if (id == null) {
    if (!raw?.multiSource) {
      console.log(`${logSymbols.warning} [lyric] 无歌曲 id，跳过 ${song.singer} - ${song.songName}`)
    }
    return undefined
  }

  try {
    return await songLyric(id)
  } catch (e: any) {
    console.log(`${logSymbols.warning} [lyric] 获取失败 ${song.singer} - ${song.songName}`)
    console.error(e?.message || e)
    return undefined
  }
}

export async function saveLyricBesideAudio(audioFile: string, song: Song) {
  const text = await fetchSongLyric(song)
  if (!text) {
    console.log(`${logSymbols.warning} [lyric] 无歌词 ${song.singer} - ${song.songName}`)
    return undefined
  }

  const lrcFile = lyricPathForAudio(audioFile)
  await writeFile(lrcFile, text, 'utf8')
  console.log(`${logSymbols.success} [lyric] ${lrcFile}`)
  return text
}

export async function saveLyricTextBesideAudio(audioFile: string, text: string) {
  const lrcFile = lyricPathForAudio(audioFile)
  await writeFile(lrcFile, text, 'utf8')
  console.log(`${logSymbols.success} [lyric] ${lrcFile}`)
}
