#!/usr/bin/env node

import { createRequire } from 'node:module'
import { unlink } from 'node:fs/promises'
import path from 'node:path'
import CliTable from 'cli-table3'
import { dl } from 'dl-vampire'
import { delay } from 'es-toolkit'
import filenamify from 'filenamify'
import humanizeDuration from 'humanize-duration'
import logSymbols from 'log-symbols'
import ms from 'ms'
import pmap from 'promise.map'
import rcFactory from 'rc'
import updateNotifier from 'update-notifier'
import yargs from 'yargs'
import { hideBin } from 'yargs/helpers'
import { z } from 'zod'
import { COOKIE_CONTENT, DEFAULT_COOKIE_FILE, readCookie } from '$auth/cookie'
import { baseDebug } from '$common'
import { downloadSong, getAdapter, getFileName } from './index'
import { assertFfmpegAvailable, defaultBitrate, type TranscodeFormat } from './transcode'
import type { PackageJson } from 'type-fest'
import type { SongValid } from '$define'

z.config(z.locales.zhCN())

const debug = baseDebug.extend('cli')

const require = createRequire(__filename)
const rawPackageJson = require('../package.json')
const { version } = rawPackageJson as PackageJson

// check update
updateNotifier({ pkg: rawPackageJson }).notify()

let DEFAULT_FORMAT = ':name/:singer - :songName.:ext'
if (process.argv.some((s) => s.match(/(dj)?radio/))) {
  // e.g
  // https://music.163.com/#/program?id=2064329279
  // 等什么君/2019-11-27 - 第56期 - 琴师(Cover:音频怪物)
  DEFAULT_FORMAT = ':name/:programDate 第:programOrder期 - :songName.:ext'
}

// get config
const config = rcFactory('yun', {
  'concurrency': 5,
  'format': DEFAULT_FORMAT,
  'quality': 999,
  'retry-timeout': 3, // 3 mins
  'retry-times': 3, // 3 times
  'skip': true,
  'progress': true,
  'lyric': false,
  'bitrate': undefined as number | undefined,
})

yargs(hideBin(process.argv))
  .scriptName('yun')
  .command(
    '$0 <url>',
    '网易云音乐 歌单/专辑 下载器',
    // builder
    (yargs) => {
      return yargs
        .usage('Usage: $0 <url> [options]')
        .positional('url', {
          describe: '歌单/专辑/电台的链接 or 歌单 ID',
          type: 'string',
          demandOption: true, // 直接运行 yun 飘红
        })
        .alias({
          h: 'help',
          v: 'version',
          c: 'concurrency',
          f: 'format',
          q: 'quality',
          s: 'skip',
          p: 'progress',
        })
        .options({
          concurrency: {
            desc: '同时下载数量',
            type: 'number',
            default: 5,
          },

          format: {
            desc: '文件格式',
            type: 'string',
            default: DEFAULT_FORMAT,
          },

          quality: {
            desc: '音质, 默认 999k 即最大码率, 可选 128/192/320',
            type: 'number',
            default: 999,
            choices: [128, 192, 320, 999],
          },

          retryTimeout: {
            desc: '下载超时(分)',
            type: 'number',
            default: 3,
          },

          retryTimes: {
            desc: '下载重试次数',
            type: 'number',
            default: 3,
          },

          skip: {
            desc: '对于已存在文件且大小合适则跳过',
            type: 'boolean',
            default: true,
          },

          progress: {
            desc: '是否显示进度条',
            type: 'boolean',
            default: true,
          },

          cover: {
            desc: '嵌入封面到音频标签（优先单曲专辑图；临时文件嵌入后删除）',
            type: 'boolean',
            default: false,
          },

          cookie: {
            desc: 'cookie文件',
            type: 'string',
            default: DEFAULT_COOKIE_FILE,
          },

          skipTrial: {
            desc: '跳过试听歌曲',
            type: 'boolean',
            default: false,
          },

          lyric: {
            desc: '下载歌词为同名 .lrc',
            type: 'boolean',
            default: false,
          },

          transcode: {
            desc: '转码格式: mp3 | aac（成功后删除原文件）',
            type: 'string',
            choices: ['mp3', 'aac'] as const,
          },

          mp3: {
            desc: '等价 --transcode mp3',
            type: 'boolean',
            default: false,
          },

          aac: {
            desc: '等价 --transcode aac（输出 .m4a）',
            type: 'boolean',
            default: false,
          },

          bitrate: {
            desc: '转码码率 kbps（mp3 默认 320，aac 默认 256）',
            type: 'number',
          },
        })
        .config(config)
        .example(`$0 'https://music.163.com/#/playlist?id=7392714527'`, '下载歌单')
        .example('$0 7392714527', '使用 id 下载歌单')
        .example(`$0 --cookie yun.cookie.txt 'https://music.163.com/#/my/m/music/cloud'`, '下载云盘')
        .example(`$0 --lyric --mp3 --cover --cookie yun.cookie.txt <url>`, '车载：MP3 + 歌词 + 封面标签')
        .example(`$0 --lyric --aac <url>`, '下载并转 AAC(.m4a) + 歌词')
        .example('$0 -c 10 <url>', '10首同时下载')
        .example('$0 -f ":singer - :songName.:ext" <url>', '下载文件名为 "歌手 - 歌名"')
        .epilog('帮助 & 文档: https://github.com/magicdawn/yun-playlist-downloader')
    },
    (options) => {
      return defaultCommandAction(options)
    },
  )
  .version(version!)
  .help()
  .parse()

type ExpectedArgv = {
  url: string
  concurrency: number
  format: string
  quality: number
  retryTimeout: number
  retryTimes: number
  skip: boolean
  progress: boolean
  cover: boolean
  cookie: string
  skipTrial: boolean
  lyric: boolean
  transcode?: string
  mp3: boolean
  aac: boolean
  bitrate?: number
}

function resolveTranscode(options: ExpectedArgv): TranscodeFormat | undefined {
  const flags = [options.mp3 && 'mp3', options.aac && 'aac', options.transcode].filter(Boolean) as string[]
  const uniq = [...new Set(flags)]
  if (uniq.length > 1) {
    console.error(`${logSymbols.error} --mp3 / --aac / --transcode 只能选一种`)
    process.exit(1)
  }
  if (options.mp3) return 'mp3'
  if (options.aac) return 'aac'
  if (options.transcode === 'mp3' || options.transcode === 'aac') return options.transcode
  if (options.transcode) {
    console.error(`${logSymbols.error} --transcode 仅支持 mp3 或 aac`)
    process.exit(1)
  }
  return undefined
}

async function defaultCommandAction(options: ExpectedArgv) {
  let {
    concurrency,
    format,
    quality,
    retryTimeout,
    retryTimes,
    skip: skipExists,
    progress,
    cover,
    cookie,
    skipTrial,
    lyric,
    bitrate,
  } = options

  const transcode = resolveTranscode(options)
  if (bitrate == null && transcode) bitrate = defaultBitrate(transcode)

  const urlResult = z
    .union([z.url(), z.string().trim().regex(/^\d+$/)], 'url 参数错误: 支持 url 或 歌单ID')
    .safeParse(options.url)
  if (!urlResult.success) {
    console.error(z.prettifyError(urlResult.error))
    process.exit(1)
  }
  let url = urlResult.data
  // only id as url provided
  if (url && /^\d+$/.test(url)) {
    url = `https://music.163.com/#/playlist?id=${url}`
  }

  const table = new CliTable({
    head: [`${logSymbols.info} 当前参数`, '值', '备注'],
  })
  table.push(
    ['concurrency', concurrency, '同时下载数量'],
    ['format', format, '文件名模版'],
    ['quality', quality, '音质(kbps)'],
    ['retry-timeout', retryTimeout, '下载超时(分)'],
    ['retry-times', retryTimes, '下载重试(次)'],
    ['skip', skipExists, '跳过已下载正常文件'],
    ['progress', progress, '显示进度条'],
    ['cover', cover, '嵌入封面(优先单曲专辑图)'],
    ['cookie', cookie, 'cookie文件'],
    ['skip-trial', skipTrial, '跳过试听歌曲'],
    ['lyric', lyric, '下载同名 .lrc'],
    ['transcode', transcode || false, '转码并删除原文件'],
    ['bitrate', bitrate ?? '-', '转码码率(kbps)'],
  )
  console.log(`${table.toString()}\n`)

  // process argv
  quality *= 1000
  retryTimeout = ms(`${retryTimeout}m`)
  readCookie(cookie)

  if (/cloud/i.test(url) && !COOKIE_CONTENT) {
    console.log(`${logSymbols.warning} 云盘下载需要登录 Cookie，见 docs/cookie.md`)
  }

  if (transcode || lyric || cover) {
    try {
      await assertFfmpegAvailable()
    } catch (e: any) {
      console.error(`${logSymbols.error} ${e.message || e}`)
      process.exit(1)
    }
  }

  const start = Date.now()
  const adapter = getAdapter(url)

  // 基本信息
  const name = (await adapter.getTitle()) || ''
  console.log(`${logSymbols.info} 正在下载「${name}」,请稍候...`)

  // 封面
  let playlistCoverFile: string | undefined
  if (cover) {
    const coverUrl = await adapter.getCover()
    if (!coverUrl) {
      console.log(`${logSymbols.warning} [cover]: 没有找到封面`)
    } else {
      const coverExt = path.extname(coverUrl) || '.jpg'
      playlistCoverFile = `${filenamify(name)}/cover${coverExt}`
      await dl({ url: coverUrl, file: playlistCoverFile })
      console.log(`${logSymbols.success} [cover]: 封面已下载 ${playlistCoverFile}`)
    }
  }

  const songs = await adapter.getSongs(quality)
  debug('songs : %j', songs)

  const removed = songs.filter((x) => !x.url)
  const keeped = songs.filter((x) => x.url) as SongValid[]
  if (removed.length) {
    console.log(`${logSymbols.warning} [版权受限] 不可下载 ${removed.length}/${songs.length}`)
    for (const i of removed) {
      console.log(`  ${i.singer} - ${i.songName}`)
    }
  }

  // FIXME
  // process.exit()

  // 开始下载
  const freeTrialCount = keeped.filter((x) => x.isFreeTrial).length
  console.log(`${logSymbols.info} 可下载 ${keeped.length}/${songs.length}, 试听 ${freeTrialCount}/${keeped.length}`)

  // fix index
  const len = keeped.length.toString().length
  keeped.forEach((item, index) => {
    item.rawIndex = index // rawIndex: 0,1 ...
    item.index = String(index + 1).padStart(len, '0') // index, first as 01
  })

  await pmap(
    keeped,
    (song) => {
      // 文件名
      const file = getFileName({ format, song, url, name })
      // 下载
      return downloadSong({
        url: song.url,
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
        bitrate,
        playlistCoverFile,
      })
    },
    concurrency,
  )

  // 封面已嵌入音频标签，删除临时下载的歌单/专辑封面文件
  if (playlistCoverFile) {
    try {
      await unlink(playlistCoverFile)
      console.log(`${logSymbols.success} [cover]: 已删除临时封面 ${playlistCoverFile}`)
    } catch {
      /* ignore */
    }
  }

  await delay(100) // time for ink render (moveToComplete)
  const dur = humanizeDuration(Date.now() - start, { language: 'zh_CN' })
  console.log('下载完成, 耗时%s', dur)
  process.exit(0)
}
