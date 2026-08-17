import { getJson, pickExtFromUrl } from '../http'
import type { SourceProvider } from '../types'

type QqSearchItem = {
  song_title?: string
  song_mid?: string
  singer_name?: string
  pay?: string
}

type QqDetail = {
  song_mid?: string
  song_title?: string
  song_name?: string
  singer_name?: string
  album_name?: string
  album_title?: string
  album_pic?: string
  singer_pic?: string
  song_lyric?: string
  lyric?: string
  song_play_url_sq?: string
  song_play_url_pq?: string
  song_play_url_accom?: string
  song_play_url_hq?: string
  song_play_url_standard?: string
  song_play_url_fq?: string
  song_play_url?: string
  vip?: string
}

function pickBestUrl(d: QqDetail) {
  const candidates: Array<{ url?: string; label: string }> = [
    { url: d.song_play_url_sq, label: 'LOSSLESS' },
    { url: d.song_play_url_pq, label: 'LOSSLESS' },
    { url: d.song_play_url_hq, label: 'HQ' },
    { url: d.song_play_url_accom, label: 'HQ' },
    { url: d.song_play_url_standard, label: 'STD' },
    { url: d.song_play_url, label: 'STD' },
    { url: d.song_play_url_fq, label: 'LOW' },
  ]
  return candidates.find((c) => c.url && /^https?:/i.test(c.url)) || { url: undefined, label: '' }
}

/** 对照 musicdl QQ：tang.api.s01s.cn 开放解析 */
export const qqProvider: SourceProvider = {
  id: 'qq',
  label: 'QQ音乐',

  async search(keyword, limit) {
    const url = `https://tang.api.s01s.cn/music_open_api.php?msg=${encodeURIComponent(keyword)}&type=json`
    const json = await getJson<QqSearchItem[] | { data?: QqSearchItem[] }>(url)
    const list = Array.isArray(json) ? json : Array.isArray(json?.data) ? json.data : []
    return list.slice(0, limit).flatMap((it, idx) => {
      const mid = it.song_mid
      if (!mid) return []
      return [
        {
          source: 'qq' as const,
          id: mid,
          title: it.song_title || '',
          artist: it.singer_name || '',
          album: '',
          needsResolve: true,
          qualityLabel: it.pay || undefined,
          raw: { keyword, qqIndex: idx + 1, pay: it.pay },
        },
      ]
    })
  },

  async resolve(hit) {
    const keyword =
      (hit.raw as { keyword?: string } | undefined)?.keyword || `${hit.title} ${hit.artist}`.trim() || hit.title
    const url =
      `https://tang.api.s01s.cn/music_open_api.php` +
      `?msg=${encodeURIComponent(keyword)}&type=json&mid=${encodeURIComponent(hit.id)}`
    const d = await getJson<QqDetail>(url)
    const best = pickBestUrl(d)
    const audioUrl = best.url
    return {
      ...hit,
      title: d.song_title || d.song_name || hit.title,
      artist: d.singer_name || hit.artist,
      album: d.album_name || d.album_title || hit.album,
      coverUrl: d.album_pic || d.singer_pic || hit.coverUrl,
      lyricText: d.song_lyric || d.lyric || hit.lyricText,
      audioUrl,
      ext: audioUrl ? pickExtFromUrl(audioUrl) : hit.ext,
      qualityLabel: best.label || hit.qualityLabel,
      raw: d,
    }
  },
}
