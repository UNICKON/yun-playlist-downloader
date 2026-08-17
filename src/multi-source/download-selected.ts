import path from 'node:path'
import filenamify from 'filenamify'
import logSymbols from 'log-symbols'
import ms from 'ms'
import pmap from 'promise.map'
import { downloadSong } from '../index'
import { assertFfmpegAvailable, defaultBitrate, type TranscodeFormat } from '../transcode'
import { resolveHit } from './search-all'
import { resolvedTrackToSong } from './to-song'
import type { SongValid } from '$define'
import type { SearchHit } from './types'

export type MultiDownloadOptions = {
  hits: SearchHit[]
  format: string
  concurrency: number
  retryTimeoutMin: number
  retryTimes: number
  skipExists: boolean
  progress: boolean
  lyric: boolean
  cover: boolean
  skipTrial: boolean
  transcode?: TranscodeFormat
  bitrate?: number
  outDirName?: string
}

function buildMultiSourceFileName(format: string, song: SongValid, name: string) {
  let out = format
  const tokens: Array<[string, string]> = [
    ['name', name],
    ['songName', song.songName],
    ['singer', song.singer],
    ['albumName', song.albumName],
    ['index', song.index],
    ['rawIndex', String(song.rawIndex)],
    ['ext', song.ext || 'mp3'],
    ['type', 'multi'],
    ['typeText', '多源'],
  ]
  for (const [key, val] of tokens) {
    out = out.replaceAll(new RegExp(`:${key}`, 'gi'), filenamify(val))
  }
  if (!path.extname(out)) {
    out = `${out}.${song.ext || 'mp3'}`
  }
  return out
}

export async function downloadResolvedHits(options: MultiDownloadOptions) {
  const {
    hits,
    format,
    concurrency,
    retryTimeoutMin,
    retryTimes,
    skipExists,
    progress,
    lyric,
    cover,
    skipTrial,
    transcode,
    bitrate,
  } = options

  if (lyric || cover || transcode) {
    await assertFfmpegAvailable()
  }

  const name = filenamify(options.outDirName || 'multi-source')
  const retryTimeout = ms(`${retryTimeoutMin}m`) as unknown as number

  console.log(`${logSymbols.info} 解析直链中（${hits.length} 首）...`)
  const resolved = await pmap(
    hits,
    async (hit, i) => {
      try {
        const track = hit.needsResolve || !hit.audioUrl ? await resolveHit(hit) : hit
        if (!track.audioUrl) {
          console.log(`${logSymbols.warning} 无直链 [${hit.source}] ${hit.artist} - ${hit.title}`)
          return null
        }
        return resolvedTrackToSong(track, i, hits.length)
      } catch (e: any) {
        console.log(`${logSymbols.warning} 解析失败 [${hit.source}] ${hit.artist} - ${hit.title}: ${e?.message || e}`)
        return null
      }
    },
    Math.min(concurrency, 5),
  )

  const keeped = resolved.filter((x): x is SongValid => Boolean(x?.url)) as SongValid[]
  console.log(`${logSymbols.info} 可下载 ${keeped.length}/${hits.length}`)

  const len = keeped.length.toString().length
  keeped.forEach((song, index) => {
    song.rawIndex = index
    song.index = String(index + 1).padStart(len, '0')
  })

  await pmap(
    keeped,
    (song) => {
      const file = buildMultiSourceFileName(format.includes(':name') ? format : `:name/${format}`, song, name)
      return downloadSong({
        url: song.url!,
        file,
        song,
        totalLength: keeped.length,
        retryTimeout,
        retryTimes,
        progress,
        skipExists,
        skipTrial,
        lyric,
        transcode,
        bitrate: bitrate ?? (transcode ? defaultBitrate(transcode) : undefined),
        playlistCoverFile: undefined,
      })
    },
    concurrency,
  )
}
