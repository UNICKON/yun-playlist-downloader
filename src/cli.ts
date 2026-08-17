#!/usr/bin/env node

import { unlink } from 'node:fs/promises'
import { createRequire } from 'node:module'
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
import { COOKIE_CONTENT, DEFAULT_COOKIE_FILE } from '$auth/cookie'
import { ensureAuth, type CookieMode } from '$auth/ensure-auth'
import { isInteractive } from '$auth/prompt'
import { selectDownloadOptions, selectDownloadUrl } from '$auth/wizard'
import { baseDebug } from '$common'
import { downloadSong, getAdapter, getFileName } from './index'
import { runSearchCommand } from './multi-source'
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

type ExpectedArgv = {
  url?: string
  concurrency: number
  format: string
  quality: number
  retryTimeout: number
  retryTimes: number
  skip: boolean
  progress: boolean
  cover: boolean
  cookie: string
  cookieMode: CookieMode
  skipTrial: boolean
  lyric: boolean
  transcode?: string
  mp3: boolean
  aac: boolean
  bitrate?: number
}

const MULTI_SOURCE_SEARCH_MARK = '__MULTI_SOURCE_SEARCH__'

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

yargs(hideBin(process.argv))
  .scriptName('yun')
  .command(
    'search [keyword]',
    '多源搜索下载（QQ / 网易云 / 酷我 / 酷狗 / 汽水，思路对齐 musicdl）',
    (yargs) => {
      return yargs
        .positional('keyword', { describe: '搜索关键词', type: 'string' })
        .options({
          concurrency: { desc: '同时下载数量', type: 'number', default: 5 },
          format: { desc: '文件格式', type: 'string', default: DEFAULT_FORMAT },
          retryTimeout: { desc: '下载超时(分)', type: 'number', default: 3 },
          retryTimes: { desc: '下载重试次数', type: 'number', default: 3 },
          skip: { desc: '跳过已存在正常文件', type: 'boolean', default: true },
          progress: { desc: '显示进度条', type: 'boolean', default: true },
          cover: { desc: '嵌入封面', type: 'boolean', default: false },
          skipTrial: { desc: '跳过试听', type: 'boolean', default: false },
          lyric: { desc: '下载同名 .lrc', type: 'boolean', default: false },
          transcode: { desc: '转码 mp3|aac', type: 'string', choices: ['mp3', 'aac'] as const },
          mp3: { desc: '等价 --transcode mp3', type: 'boolean', default: false },
          aac: { desc: '等价 --transcode aac', type: 'boolean', default: false },
          bitrate: { desc: '转码码率 kbps', type: 'number' },
          sources: { desc: '音源: qq,netease,kuwo,kugou,soda', type: 'string' },
          limit: { desc: '每源条数', type: 'number', default: 5 },
          all: { desc: '下载全部结果', type: 'boolean', default: false },
          pick: { desc: '下载序号 1,3 或 1-5', type: 'string' },
        })
        .example(`$0 search 林俊杰 --lyric --mp3 --cover --pick 1`, '搜索并下载第 1 首')
        .example(`$0 search 江南 --sources qq,kuwo --all`, '仅 QQ+酷我')
    },
    async (options) => {
      try {
        const argv = options as unknown as ExpectedArgv
        const transcode = resolveTranscode(argv)
        await runSearchCommand({
          keyword: options.keyword as string | undefined,
          sources: options.sources as string | undefined,
          limit: options.limit as number,
          concurrency: options.concurrency as number,
          format: options.format as string,
          retryTimeout: options.retryTimeout as number,
          retryTimes: options.retryTimes as number,
          skip: options.skip as boolean,
          progress: options.progress as boolean,
          cover: options.cover as boolean,
          skipTrial: options.skipTrial as boolean,
          lyric: options.lyric as boolean,
          transcode,
          bitrate: (options.bitrate as number | undefined) ?? (transcode ? defaultBitrate(transcode) : undefined),
          all: options.all as boolean,
          pick: options.pick as string | undefined,
        })
        process.exit(0)
      } catch (e: any) {
        console.error(`${logSymbols.error} ${e?.message || e}`)
        process.exit(1)
      }
    },
  )
  .command(
    '$0 [url]',
    '网易云音乐 歌单/专辑 下载器（交互可选多源搜索）',
    (yargs) => {
      return yargs
        .usage('Usage: $0 [url] [options]')
        .positional('url', {
          describe: '歌单/专辑/电台的链接 or 歌单 ID（可省略，进入交互选择）',
          type: 'string',
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
          concurrency: { desc: '同时下载数量', type: 'number', default: 5 },
          format: { desc: '文件格式', type: 'string', default: DEFAULT_FORMAT },
          quality: {
            desc: '音质, 默认 999k 即最大码率, 可选 128/192/320',
            type: 'number',
            default: 999,
            choices: [128, 192, 320, 999],
          },
          retryTimeout: { desc: '下载超时(分)', type: 'number', default: 3 },
          retryTimes: { desc: '下载重试次数', type: 'number', default: 3 },
          skip: { desc: '对于已存在文件且大小合适则跳过', type: 'boolean', default: true },
          progress: { desc: '是否显示进度条', type: 'boolean', default: true },
          cover: {
            desc: '嵌入封面到音频标签（优先单曲专辑图；临时文件嵌入后删除）',
            type: 'boolean',
            default: false,
          },
          cookie: { desc: 'cookie文件', type: 'string', default: DEFAULT_COOKIE_FILE },
          cookieMode: {
            desc: '登录方式: ask(交互) | file(只读文件) | qr(扫码)',
            type: 'string',
            choices: ['ask', 'file', 'qr'] as const,
            default: 'ask',
          },
          skipTrial: { desc: '跳过试听歌曲', type: 'boolean', default: false },
          lyric: { desc: '下载歌词为同名 .lrc', type: 'boolean', default: false },
          transcode: {
            desc: '转码格式: mp3 | aac（成功后删除原文件）',
            type: 'string',
            choices: ['mp3', 'aac'] as const,
          },
          mp3: { desc: '等价 --transcode mp3', type: 'boolean', default: false },
          aac: { desc: '等价 --transcode aac（输出 .m4a）', type: 'boolean', default: false },
          bitrate: { desc: '转码码率 kbps（mp3 默认 320，aac 默认 256）', type: 'number' },
        })
        .config(config)
        .example(`$0`, '交互：登录 / 多源搜索 / 歌单')
        .example(`$0 search 周杰伦 --lyric --mp3 --cover --pick 1`, '多源搜索下载')
        .example(`$0 'https://music.163.com/#/playlist?id=7392714527'`, '下载歌单')
        .epilog('帮助 & 文档: https://github.com/magicdawn/yun-playlist-downloader')
    },
    (options) => {
      const cookieMode = (['ask', 'file', 'qr'].includes(options.cookieMode) ? options.cookieMode : 'ask') as CookieMode
      return defaultCommandAction({ ...options, cookieMode })
    },
  )
  .version(version!)
  .help()
  .parse()

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
    cookieMode,
    skipTrial,
    lyric,
    bitrate,
  } = options

  let transcode = resolveTranscode(options)
  if (bitrate == null && transcode) bitrate = defaultBitrate(transcode)

  // 下载目标：无 url 时交互选多源搜索 / 歌单 / 云盘
  let url: string
  try {
    url = await selectDownloadUrl(options.url, { cookieFile: cookie, cookieMode })
  } catch (e: any) {
    console.error(`${logSymbols.error} ${e?.message || e}`)
    process.exit(1)
  }

  if (url === MULTI_SOURCE_SEARCH_MARK) {
    try {
      await runSearchCommand({
        concurrency,
        format,
        retryTimeout,
        retryTimes,
        skip: skipExists,
        progress,
        cover,
        skipTrial,
        lyric,
        transcode,
        bitrate,
        limit: 5,
      })
      process.exit(0)
    } catch (e: any) {
      console.error(`${logSymbols.error} ${e?.message || e}`)
      process.exit(1)
    }
  }

  // 登录：网易云歌单/云盘需要
  await ensureAuth(cookie, cookieMode)

  const urlResult = z
    .union([z.url(), z.string().trim().regex(/^\d+$/)], 'url 参数错误: 支持 url 或 歌单ID')
    .safeParse(url)
  if (!urlResult.success) {
    console.error(z.prettifyError(urlResult.error))
    process.exit(1)
  }
  url = urlResult.data
  if (/^\d+$/.test(url)) {
    url = `https://music.163.com/#/playlist?id=${url}`
  }

  // 下载选项：交互终端下再确认一次
  if (isInteractive()) {
    const picked = await selectDownloadOptions({
      lyric,
      cover,
      skipTrial,
      quality,
      transcode,
      bitrate,
    })
    lyric = picked.lyric
    cover = picked.cover
    skipTrial = picked.skipTrial
    quality = picked.quality
    transcode = picked.transcode
    bitrate = picked.bitrate
    if (bitrate == null && transcode) bitrate = defaultBitrate(transcode)
  }

  const table = new CliTable({
    head: [`${logSymbols.info} 当前参数`, '值', '备注'],
  })
  table.push(
    ['url', url, '下载目标'],
    ['concurrency', concurrency, '同时下载数量'],
    ['format', format, '文件名模版'],
    ['quality', quality, '音质(kbps)'],
    ['retry-timeout', retryTimeout, '下载超时(分)'],
    ['retry-times', retryTimes, '下载重试(次)'],
    ['skip', skipExists, '跳过已下载正常文件'],
    ['progress', progress, '显示进度条'],
    ['cover', cover, '嵌入封面(优先单曲专辑图)'],
    ['cookie', cookie, 'cookie文件'],
    ['cookie-mode', cookieMode, '登录方式'],
    ['skip-trial', skipTrial, '跳过试听歌曲'],
    ['lyric', lyric, '下载同名 .lrc'],
    ['transcode', transcode || false, '转码并删除原文件'],
    ['bitrate', bitrate ?? '-', '转码码率(kbps)'],
  )
  console.log(`${table.toString()}\n`)

  // process argv
  quality *= 1000
  retryTimeout = ms(`${retryTimeout}m`)

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
