import { songUrl } from '$api'
import { getSongId } from './lyric'
import type { Song } from '$define'

/**
 * 重新解析单曲直链。
 *
 * 大歌单是一次性批量解析所有直链的，链接里的 `vuutv` 令牌有时效；
 * 长任务跑到后段时旧链接会被 CDN 判 403。失败重试时用这里重新取一次。
 */
export async function refreshSongUrl(song: Song, quality?: number, triedUrl?: string): Promise<string | undefined> {
  const id = getSongId(song)
  if (id == null) return undefined

  try {
    const infos = await songUrl([id], quality)
    const url = (infos.find((x) => String(x.id) === String(id)) || infos[0])?.url
    if (!url || url === triedUrl) return undefined
    return url
  } catch {
    return undefined
  }
}
