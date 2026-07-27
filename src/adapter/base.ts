import { extname } from 'node:path'
import { get } from 'es-toolkit/compat'
import { songDownloadUrl, songUrl } from '$api'
import { getId } from '$util'
import type { Song, SongPlayUrlInfo } from '$define'

export abstract class BaseAdapter {
  url: string
  id: string
  constructor(url: string) {
    this.url = url
    this.id = getId(url) || ''
  }

  /**
   * get title for a page
   */
  abstract getTitle(): Promise<string | undefined>

  /**
   * get cover
   */
  abstract getCover(): Promise<string | undefined>

  /**
   * get songs
   */
  abstract getSongs(quality: number): Promise<Song[]>

  /**
   * get songs detail
   */
  getSongsFromData<T extends { name: string; playUrlInfo?: SongPlayUrlInfo }>(songDatas: T[]): Song[] {
    // e.g 100 songDatas -> len = 3
    const len = String(songDatas.length).length

    return songDatas.map(function (songData, index) {
      const url = songData.playUrlInfo?.url

      let ext: string | undefined
      if (url) {
        const pathname = new URL(url).pathname
        ext = extname(pathname)
        if (ext.startsWith('.')) ext = ext.slice(1)
      }
      // 云盘 CDN 链接路径常无后缀，回退 type / 原始文件名
      if (!ext || ext === '!' || ext.length > 5) {
        const typeExt = songData.playUrlInfo?.type?.toLowerCase()
        const fn = get(songData, 'pc.fn') as string | undefined
        const fromFn = fn ? extname(fn).replace(/^\./, '') : ''
        ext = typeExt || fromFn || ext
      }

      return {
        // 歌手
        singer:
          (get(songData, 'ar.0.name') as string) ||
          (get(songData, 'artists.0.name') as string) ||
          (get(songData, 'pc.ar') as string) ||
          '',

        // 歌曲名
        songName: songData.name || (get(songData, 'pc.sn') as string) || '',

        // 专辑名
        albumName: (get(songData, 'al.name') as string) || (get(songData, 'pc.alb') as string) || '',

        // url for download
        url,

        // free trial
        isFreeTrial: songData.playUrlInfo ? Boolean(songData.playUrlInfo.freeTrialInfo) : undefined,

        // extension
        ext,

        // index, first as 01
        index: String(index + 1).padStart(len, '0'),

        // rawIndex: 0,1 ...
        rawIndex: index,

        // raw
        raw: songData,
      }
    })
  }

  async filterSongs<T extends { id: number }>(songDatas: T[], quality: number) {
    type WithOptionalPlayUrlInfo = T & { playUrlInfo?: SongPlayUrlInfo }

    // 获取下载链接
    const ids = songDatas.map((s) => s.id)
    const playUrlInfos = await songUrl(ids, quality)
    const ret: {
      songs: WithOptionalPlayUrlInfo[]
      removed: WithOptionalPlayUrlInfo[]
      all: WithOptionalPlayUrlInfo[]
    } = { songs: [], removed: [], all: [] }

    for (const songData of songDatas) {
      const { id } = songData
      const info = playUrlInfos.find((x) => String(x.id) === String(id))

      const songDataFull = songData as WithOptionalPlayUrlInfo
      songDataFull.playUrlInfo = info
      ret.all.push(songDataFull)
    }

    // 二次 songUrl：部分云盘曲在大批量请求中可能丢链
    const missingAfterFirst = ret.all.filter((s) => !s.playUrlInfo?.url)
    if (missingAfterFirst.length) {
      const retryInfos = await songUrl(
        missingAfterFirst.map((s) => s.id),
        quality,
      )
      for (const songDataFull of missingAfterFirst) {
        const info = retryInfos.find((x) => String(x.id) === String(songDataFull.id))
        if (info?.url) songDataFull.playUrlInfo = info
      }
    }

    // 云盘曲 download url 兜底
    for (const songDataFull of ret.all) {
      if (songDataFull.playUrlInfo?.url) continue
      const isCloud = Boolean(get(songDataFull, 'pc') || get(songDataFull, 'privilege.cs'))
      if (!isCloud) continue
      const dl = await songDownloadUrl(songDataFull.id, quality)
      if (dl?.url) songDataFull.playUrlInfo = dl
    }

    ret.songs = ret.all.filter((s) => s.playUrlInfo?.url)
    ret.removed = ret.all.filter((s) => !s.playUrlInfo?.url)

    return ret
  }
}
