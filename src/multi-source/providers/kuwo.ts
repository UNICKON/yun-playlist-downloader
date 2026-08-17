import { getJson, pickExtFromUrl } from '../http'
import type { SourceProvider } from '../types'

type KuwoSearchItem = {
  rid?: number | string
  name?: string
  artist?: string
  album?: string
  pic?: string
}

type KuwoDetail = {
  code?: number
  data?: {
    name?: string
    artist?: string
    album?: string
    pic?: string
    url?: string
    lyric?: string
  }
}

/** 对照 musicdl 酷我：公开 kw-api 解析（与 MusicSquare 同源思路） */
export const kuwoProvider: SourceProvider = {
  id: 'kuwo',
  label: '酷我',

  async search(keyword, limit) {
    const url = `https://kw-api.cenguigui.cn/?name=${encodeURIComponent(keyword)}&page=1&limit=${encodeURIComponent(String(limit))}`
    const json = await getJson<{ code?: number; data?: KuwoSearchItem[] }>(url)
    if (json.code !== 200 || !Array.isArray(json.data)) return []
    return json.data.slice(0, limit).flatMap((it) => {
      if (it.rid == null) return []
      return [
        {
          source: 'kuwo' as const,
          id: String(it.rid),
          title: it.name || '',
          artist: it.artist || '',
          album: it.album || '',
          coverUrl: it.pic,
          needsResolve: true,
          raw: it,
        },
      ]
    })
  },

  async resolve(hit) {
    // zp 对部分曲目会空链，按常见可用音质逐级降级
    for (const level of ['exhigh', 'standard', 'lossless', 'hires', 'zp', 'ogg'] as const) {
      try {
        const api = `https://kw-api.cenguigui.cn/?id=${encodeURIComponent(hit.id)}&type=song&level=${level}&format=json`
        const j = await getJson<KuwoDetail>(api)
        const d = j.data
        if (!d?.url || !/^https?:/i.test(d.url)) continue
        return {
          ...hit,
          title: d.name || hit.title,
          artist: d.artist || hit.artist,
          album: d.album || hit.album,
          coverUrl: d.pic || hit.coverUrl,
          audioUrl: d.url,
          lyricText: d.lyric || hit.lyricText,
          ext: pickExtFromUrl(d.url, level === 'lossless' || level === 'hires' || level === 'zp' ? 'flac' : 'mp3'),
          qualityLabel: level,
          raw: d,
        }
      } catch {
        /* try next level */
      }
    }
    return { ...hit, audioUrl: undefined }
  },
}
