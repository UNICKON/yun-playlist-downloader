import { pickExtFromUrl } from './http'
import type { Song } from '$define'
import type { ResolvedTrack } from './types'

export function resolvedTrackToSong(track: ResolvedTrack, index: number, total: number): Song {
  const len = Math.max(2, String(total).length)
  const ext = track.ext || (track.audioUrl ? pickExtFromUrl(track.audioUrl) : 'mp3')
  return {
    singer: track.artist || '未知歌手',
    songName: track.title || '未知歌曲',
    albumName: track.album || '',
    url: track.audioUrl,
    ext,
    index: String(index + 1).padStart(len, '0'),
    rawIndex: index,
    raw: {
      source: track.source,
      id: track.id,
      coverUrl: track.coverUrl,
      picUrl: track.coverUrl,
      lyricText: track.lyricText,
      qualityLabel: track.qualityLabel,
      multiSource: true,
      ...((track.raw && typeof track.raw === 'object' ? track.raw : {}) as object),
    },
  }
}
