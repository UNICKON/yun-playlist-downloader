import { getJson, getText, http, pickExtFromUrl } from '../http'
import type { SearchHit, SourceProvider } from '../types'

type MetingItem = {
  name?: string
  artist?: string
  url?: string
  pic?: string
  lrc?: string
}

function pickIdFromUrl(rawUrl?: string) {
  if (!rawUrl) return ''
  try {
    return new URL(rawUrl).searchParams.get('id') || ''
  } catch {
    const m = String(rawUrl).match(/[?&]id=([^&]+)/)
    return m ? decodeURIComponent(m[1]!) : ''
  }
}

/** 对照 musicdl / MusicSquare：Meting 风格网易云解析 */
export const neteaseProvider: SourceProvider = {
  id: 'netease',
  label: '网易云',

  async search(keyword, limit) {
    const url =
      `https://api.qijieya.cn/meting/?type=search&server=netease` +
      `&id=${encodeURIComponent(keyword)}&limit=${encodeURIComponent(String(limit))}`
    const json = await getJson<MetingItem[]>(url)
    if (!Array.isArray(json)) return []
    return json.slice(0, limit).map((it, idx) => {
      const id = pickIdFromUrl(it.url) || `${keyword}-${idx + 1}`
      return {
        source: 'netease' as const,
        id,
        title: it.name || '',
        artist: it.artist || '',
        album: '',
        coverUrl: it.pic,
        audioUrl: it.url,
        needsResolve: !it.url || /type=url/i.test(it.url),
        raw: it,
      } satisfies SearchHit
    })
  },

  async resolve(hit) {
    let audioUrl = hit.audioUrl
    // meting type=url 一般会 302 到 CDN
    const needResolve = !audioUrl || /[?&]type=url(?:&|$)/i.test(audioUrl) || /\/meting\/\?/i.test(audioUrl)
    if (needResolve) {
      const urlApi = `https://api.qijieya.cn/meting/?server=netease&type=url&id=${encodeURIComponent(hit.id)}`
      const res = await http.get(urlApi, { followRedirect: true, throwHttpErrors: false })
      if (res.url && /^https?:/i.test(res.url) && !/\/meting\/\?/i.test(res.url)) {
        audioUrl = res.url
      } else {
        const text = typeof res.body === 'string' ? res.body.trim() : String(res.body || '').trim()
        if (/^https?:/i.test(text)) audioUrl = text
      }
    }

    let lyricText = hit.lyricText
    const lrcRef = (hit.raw as MetingItem | undefined)?.lrc
    if (!lyricText && lrcRef) {
      try {
        if (/^https?:/i.test(lrcRef)) {
          const body = await getText(lrcRef)
          try {
            const j = JSON.parse(body) as { lyric?: string; lrc?: string; data?: string | { lrc?: string } }
            lyricText = j.lyric || j.lrc || (typeof j.data === 'string' ? j.data : j.data?.lrc) || body
          } catch {
            lyricText = body
          }
        } else {
          lyricText = lrcRef
        }
      } catch {
        /* ignore */
      }
    }
    if (!lyricText) {
      try {
        lyricText = await getText(
          `https://api.qijieya.cn/meting/?server=netease&type=lrc&id=${encodeURIComponent(hit.id)}`,
        )
      } catch {
        /* ignore */
      }
    }

    return {
      ...hit,
      audioUrl,
      lyricText,
      coverUrl: hit.coverUrl,
      ext: audioUrl ? pickExtFromUrl(audioUrl) : hit.ext,
    }
  },
}
