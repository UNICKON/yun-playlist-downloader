import path from 'node:path'
import { dl } from 'dl-vampire'
import filenamify from 'filenamify'
import logSymbols from 'log-symbols'
import { AlbumAdapter } from './adapter/album'
import { CloudAdapter } from './adapter/cloud'
import { DjradioAdapter, type ProgramSong } from './adapter/djradio'
import { PlaylistAdapter } from './adapter/playlist'
import { buildDownloadRequestOptions } from './download-headers'
import { downloadSongWithInk } from './download/progress/ink'
import { refreshSongUrl } from './fresh-url'
import { postProcessDownloadedFile, type PostDownloadOptions } from './post-download'
import { skipIfTranscodedExists } from './skip'
import type { Song } from '$define'

/**
 * page type
 */

const allowedPageTypes = ['playlist', 'album', 'djradio', 'cloud'] as const
type PageType = (typeof allowedPageTypes)[number]

interface AdapterItem {
  type: PageType
  typeText: string
  adapter: typeof PlaylistAdapter | typeof AlbumAdapter | typeof DjradioAdapter | typeof CloudAdapter
}

export const adapterList = [
  {
    type: 'playlist',
    typeText: '列表',
    adapter: PlaylistAdapter,
  },
  {
    type: 'album',
    typeText: '专辑',
    adapter: AlbumAdapter,
  },
  {
    type: 'djradio',
    typeText: '电台',
    adapter: DjradioAdapter,
  },
  {
    type: 'cloud',
    typeText: '云盘',
    adapter: CloudAdapter,
  },
] as const

/**
 * 下载一首歌曲
 */

export interface DownloadSongOptions extends PostDownloadOptions {
  url: string
  file: string
  song: Song
  totalLength: number
  retryTimeout: number
  retryTimes: number
  skipExists: boolean
  skipTrial: boolean
  /** 音质(已 ×1000)，用于直链过期后重新解析 */
  quality?: number
}

export function downloadSong(options: DownloadSongOptions & { progress?: boolean }) {
  const { progress } = options
  if (progress) {
    return downloadSongWithInk(options)
  } else {
    return downloadSongPlain(options)
  }
}

export async function downloadSongPlain(options: DownloadSongOptions) {
  const {
    url,
    file,
    song,
    totalLength,
    retryTimeout,
    retryTimes,
    skipExists,
    skipTrial,
    lyric,
    transcode,
    bitrate,
    playlistCoverFile,
  } = options

  if (song.isFreeTrial && skipTrial) {
    console.log(`${logSymbols.warning} ${song.index}/${totalLength} 跳过试听 ${file}`)
    return
  }

  // --skip: 已转码的成品文件存在则跳过（否则带 --mp3 重跑会全部重下）
  if (skipExists) {
    const skippedFile = await skipIfTranscodedExists({ file, song, transcode, lyric })
    if (skippedFile) {
      console.log(`${logSymbols.success} ${song.index}/${totalLength} 下载跳过 ${skippedFile}`)
      return
    }
  }

  const requestOptions = buildDownloadRequestOptions(url, song)

  const dlOnce = (targetUrl: string) =>
    dl({
      url: targetUrl,
      file,
      skipExists,
      requestOptions: targetUrl === url ? requestOptions : buildDownloadRequestOptions(targetUrl, song),
      retry: {
        timeout: retryTimeout,
        times: retryTimes,
        onerror(e, i) {
          console.log(`${logSymbols.warning} ${song.index}/${totalLength}  ${i + 1}次失败 ${file}`)
        },
      },
    })

  let skip: boolean
  try {
    ;({ skip } = await dlOnce(url))
  } catch (e: any) {
    // 大歌单直链会过期(403)：重新解析一次再试
    const freshUrl = await refreshSongUrl(song, options.quality, url)
    if (!freshUrl) {
      console.log(`${logSymbols.error} ${song.index}/${totalLength} 下载失败 ${file}`)
      console.error(e.stack || e)
      return
    }
    try {
      ;({ skip } = await dlOnce(freshUrl))
    } catch (e2: any) {
      console.log(`${logSymbols.error} ${song.index}/${totalLength} 下载失败 ${file}`)
      console.error(e2.stack || e2)
      return
    }
  }

  console.log(`${logSymbols.success} ${song.index}/${totalLength} ${skip ? '下载跳过' : '下载成功'} ${file}`)

  try {
    const finalFile = await postProcessDownloadedFile(file, song, { lyric, transcode, bitrate, playlistCoverFile })
    if (finalFile !== file) {
      console.log(`${logSymbols.info} ${song.index}/${totalLength} 最终文件 ${finalFile}`)
    }
  } catch (e: any) {
    console.log(`${logSymbols.error} ${song.index}/${totalLength} 后处理失败 ${file}`)
    console.error(e?.stack || e)
  }
}

/**
 * check page type
 */
export function getType(url: string): AdapterItem {
  const item = adapterList.find((item) => url.includes(item.type))
  if (item) return item

  // #/radio & #/djradio 是一样的
  if (/#\/radio/.test(url)) {
    return adapterList.find((item) => item.type === 'djradio')!
  }

  const msg = 'unsupported type'
  throw new Error(msg)
}

/**
 * get a adapter via `url`
 */
export function getAdapter(url: string) {
  const { adapter } = getType(url)
  return new adapter(url)
}

/**
 * 获取歌曲文件表示
 */
export function getFileName({
  format,
  song,
  url,
  // 专辑 or playlist 名称
  name,
}: {
  format: string
  song: Song
  url: string
  name: string
}) {
  const adapterItem = getType(url)

  // 从 type 中取值, 先替换 `长的`
  {
    const keys: (keyof AdapterItem)[] = ['typeText', 'type']
    keys.forEach((t) => {
      const val = filenamify(String(adapterItem[t]))
      format = format.replaceAll(new RegExp(`:${t}`, 'gi'), val)
    })
  }

  // 从 `song` 中取值
  type SongKey = keyof Song
  const keys = ['songName', 'singer', 'albumName', 'rawIndex', 'index', 'ext'] satisfies SongKey[]
  keys.forEach((token) => {
    const val = filenamify(String(song[token]))
    format = format.replaceAll(new RegExp(`:${token}`, 'gi'), val)
  })

  // name
  format = format.replaceAll(/:name/gi, filenamify(name))

  // djradio only
  if (adapterItem.type === 'djradio') {
    const { programDate, programOrder } = song as ProgramSong
    if (programDate) {
      format = format.replace(/:programDate/, filenamify(programDate))
    }
    if (programOrder) {
      format = format.replace(/:programOrder/, filenamify(programOrder.toString()))
    }
  }

  if (song.isFreeTrial) {
    const dir = path.dirname(format)
    const ext = path.extname(format)
    const base = path.basename(format, ext)
    format = path.join(dir, `${base} [试听]${ext}`)
  }

  return format
}
