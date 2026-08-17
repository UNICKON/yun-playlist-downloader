import { getJson, http, pickExtFromUrl } from '../http'
import type { SourceProvider } from '../types'

type KugouSong = {
  FileHash?: string
  Hash?: string
  SongName?: string
  SingerName?: string
  AlbumName?: string
  Image?: string
  trans_param?: { union_cover?: string }
}

const KUGOU_CKEYS = [
  'charlespikachuUE9WTUhLSklYOEE3SUdIMkZNMVA=',
  'charlespikachuWE1VS0lBSjNQOExQWDNQOTcxS1U=',
  'charlespikachuN0tUSTUyVDdWTE9EUjZTVDM3UFQ=',
].map((t) => Buffer.from(t.slice('charlespikachu'.length), 'base64').toString('utf8'))

/**
 * 对照 musicdl KugouMusicClient：
 * 搜索 songsearch.kugou.com，直链走 haitang / coco / baka / 317ak 等第三方解析链
 */
export const kugouProvider: SourceProvider = {
  id: 'kugou',
  label: '酷狗',

  async search(keyword, limit) {
    const params = new URLSearchParams({
      format: 'json',
      keyword,
      platform: 'WebFilter',
      page: '1',
      pagesize: String(limit),
    })
    const url = `https://songsearch.kugou.com/song_search_v2?${params}`
    const json = await getJson<{
      data?: { lists?: KugouSong[]; info?: KugouSong[] }
    }>(url)
    const list = json.data?.lists || json.data?.info || []
    return list.slice(0, limit).flatMap((it) => {
      const hash = it.FileHash || it.Hash
      if (!hash) return []
      let cover = it.trans_param?.union_cover || it.Image
      if (cover && cover.includes('{size}')) cover = cover.replace('{size}', '300')
      return [
        {
          source: 'kugou' as const,
          id: hash,
          title: it.SongName || '',
          artist: it.SingerName || '',
          album: it.AlbumName || '',
          coverUrl: cover,
          needsResolve: true,
          raw: it,
        },
      ]
    })
  },

  async resolve(hit) {
    const fileHash = hit.id
    const headers = { 'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/148.0.0.0 Safari/537.36' }

    for (const level of ['exhigh', 'lossless', 'hires'] as const) {
      for (const host of ['https://musicapi.haitangw.net', 'https://music.haitangw.cc'] as const) {
        try {
          const j = await getJson<{ data?: { url?: string }; url?: string }>(
            `${host}/kgqq/kg.php?type=json&id=${encodeURIComponent(fileHash)}&level=${level}`,
            { headers },
          )
          const audioUrl = j.data?.url || j.url
          if (audioUrl && /^https?:/i.test(audioUrl)) {
            return { ...hit, audioUrl, ext: pickExtFromUrl(audioUrl), qualityLabel: level, raw: j }
          }
        } catch {
          /* next */
        }
      }
    }

    try {
      const j = await getJson<{ url?: string }>(
        `https://cocodownloader.markqq.com/api/url?id=${encodeURIComponent(fileHash)}&provider=kugou`,
        { headers },
      )
      if (j.url && /^https?:/i.test(j.url)) {
        return { ...hit, audioUrl: j.url, ext: pickExtFromUrl(j.url), qualityLabel: 'coco', raw: j }
      }
    } catch {
      /* next */
    }

    for (const base of [
      `https://api.baka.plus/meting/?server=kugou&type=url&id=${encodeURIComponent(fileHash)}&br=2000`,
      `https://api.qijieya.cn/meting/?server=kugou&type=url&id=${encodeURIComponent(fileHash)}`,
    ]) {
      try {
        const res = await http.get(base, { headers, followRedirect: true, throwHttpErrors: false })
        const audioUrl = res.url && !/meting/i.test(res.url) ? res.url : undefined
        if (audioUrl) {
          return { ...hit, audioUrl, ext: pickExtFromUrl(audioUrl), qualityLabel: 'meting' }
        }
      } catch {
        /* next */
      }
    }

    for (const br of ['1', '2', '3', '4'] as const) {
      for (const ckey of KUGOU_CKEYS) {
        try {
          const j = await getJson<{
            code?: number
            url?: string
            data?: { url?: string }
            lrc?: string
            name?: string
            artist?: string
          }>(
            `https://api.317ak.cn/api/yinyue/kugou?ckey=${encodeURIComponent(ckey)}&i=${encodeURIComponent(fileHash)}&br=${br}&type=json&lrc=1`,
            { headers },
          )
          const audioUrl = j.url || j.data?.url
          if (audioUrl && /^https?:/i.test(audioUrl)) {
            return {
              ...hit,
              title: j.name || hit.title,
              artist: j.artist || hit.artist,
              audioUrl,
              lyricText: j.lrc || hit.lyricText,
              ext: pickExtFromUrl(audioUrl),
              qualityLabel: `317ak-${br}`,
              raw: j,
            }
          }
        } catch {
          /* next */
        }
      }
    }

    return { ...hit, audioUrl: undefined }
  },
}
