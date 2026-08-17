import { randomUUID } from 'node:crypto'
import { getJson, http, pickExtFromUrl } from '../http'
import type { SourceProvider } from '../types'

type SodaSearchRow = {
  entity?: {
    track?: {
      id?: string
      name?: string
      artists?: Array<{ name?: string }>
      album?: {
        name?: string
        url_cover?: { urls?: string[]; uri?: string }
      }
    }
  }
}

/**
 * 对照 musicdl SodaMusicClient：
 * 搜索 api.qishui.com；解析优先第三方 qiuyu520，再尝试分享页
 */
export const sodaProvider: SourceProvider = {
  id: 'soda',
  label: '汽水',

  async search(keyword, limit) {
    const deviceId = randomUUID().replaceAll('-', '').slice(0, 16)
    const params = new URLSearchParams({
      aid: '386088',
      app_name: 'luna_pc',
      region: 'cn',
      geo_region: 'cn',
      os_region: 'cn',
      device_id: deviceId,
      iid: '3753066532713946',
      version_name: '3.5.1',
      version_code: '30050100',
      channel: 'official',
      ac: 'wifi',
      tz_name: 'Asia/Shanghai',
      device_platform: 'windows',
      device_type: 'Windows',
      os_version: 'Windows 10 Education',
      fp: deviceId,
      q: keyword,
      cursor: '0',
      search_id: randomUUID(),
      search_method: 'input',
      search_scene: '',
    })
    const url = `https://api.qishui.com/luna/pc/search/track?${params}`
    const json = await getJson<{
      result_groups?: Array<{ data?: SodaSearchRow[] }>
    }>(url, {
      headers: {
        'user-agent': 'LunaPC/3.5.1(408871041)',
        'content-type': 'application/json; charset=utf-8',
      },
    })
    const rows = json.result_groups?.[0]?.data || []
    return rows.slice(0, limit).flatMap((row) => {
      const t = row.entity?.track
      if (!t?.id) return []
      const coverBase = (t.album?.url_cover?.urls?.[0] || '') + (t.album?.url_cover?.uri || '')
      const coverUrl = coverBase ? `${coverBase}~c5_500x500.jpg` : undefined
      return [
        {
          source: 'soda' as const,
          id: String(t.id),
          title: t.name || '',
          artist: (t.artists || [])
            .map((a) => a.name)
            .filter(Boolean)
            .join(', '),
          album: t.album?.name || '',
          coverUrl,
          needsResolve: true,
          raw: row,
        },
      ]
    })
  },

  async resolve(hit) {
    // 第三方解析（musicdl _parsewithqiuyu520api）
    try {
      const j = await http
        .post('http://qiuyu520.fun/qishuiParse/api/track/v2', {
          json: { track_id: hit.id },
          headers: {
            accept: 'application/json, text/plain, */*',
            origin: 'http://qiuyu520.fun',
            referer: 'http://qiuyu520.fun/qishui/',
          },
          responseType: 'json',
          throwHttpErrors: false,
        })
        .json<{
          data?: {
            title?: string
            artist?: string
            album?: string
            url?: string
            play_url?: string
            lyric?: string
            cover?: string
          }
          url?: string
          name?: string
          artist?: string
          album?: string
          lyric?: string
          cover?: string
        }>()

      const data = j.data || j
      const audioUrl = (data as { url?: string; play_url?: string }).url || (data as { play_url?: string }).play_url
      if (audioUrl && /^https?:/i.test(audioUrl)) {
        return {
          ...hit,
          title: (data as { title?: string; name?: string }).title || (data as { name?: string }).name || hit.title,
          artist: (data as { artist?: string }).artist || hit.artist,
          album: (data as { album?: string }).album || hit.album,
          coverUrl: (data as { cover?: string }).cover || hit.coverUrl,
          lyricText: (data as { lyric?: string }).lyric || hit.lyricText,
          audioUrl,
          ext: pickExtFromUrl(audioUrl),
          qualityLabel: 'qiuyu520',
          raw: j,
        }
      }
    } catch {
      /* try share page */
    }

    // 分享页里抠媒体地址（尽力而为）
    try {
      const html = await http
        .get(`https://music.douyin.com/qishui/share/track?track_id=${encodeURIComponent(hit.id)}`, {
          headers: { 'user-agent': 'Mozilla/5.0' },
        })
        .text()
      const m = html.match(/https?:\/\/[^"'\\\s]+\.(?:mp3|m4a|flac)[^"'\\\s]*/i)
      if (m?.[0]) {
        const audioUrl = m[0].replaceAll('\\u002F', '/')
        return {
          ...hit,
          audioUrl,
          ext: pickExtFromUrl(audioUrl, 'm4a'),
          qualityLabel: 'share',
        }
      }
      // 分享页里常见 mp4/audio_mp4 直链
      const m2 = html.match(/https?:\\\/\\\/[^"'\\\s]+douyinvod\.com[^"'\\\s]*/i)
      if (m2?.[0]) {
        const audioUrl = m2[0].replaceAll('\\/', '/').replaceAll('\\u002F', '/')
        return {
          ...hit,
          audioUrl,
          ext: 'm4a',
          qualityLabel: 'share-vod',
        }
      }
    } catch {
      /* ignore */
    }

    return { ...hit, audioUrl: undefined }
  },
}
