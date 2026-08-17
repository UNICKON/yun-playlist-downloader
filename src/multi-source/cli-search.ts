import CliTable from 'cli-table3'
import logSymbols from 'log-symbols'
import { isInteractive, promptLine, promptSelect, promptYesNo } from '$auth/prompt'
import { selectDownloadOptions } from '$auth/wizard'
import { downloadResolvedHits } from './download-selected'
import { listProviders, parseSourceList } from './providers'
import { searchAllSources } from './search-all'
import type { TranscodeFormat } from '$transcode'
import type { MusicSourceId, SearchHit } from './types'

export type SearchCommandOptions = {
  keyword?: string
  sources?: string
  limit: number
  concurrency: number
  format: string
  retryTimeout: number
  retryTimes: number
  skip: boolean
  progress: boolean
  cover: boolean
  skipTrial: boolean
  lyric: boolean
  transcode?: TranscodeFormat
  bitrate?: number
  /** 非交互：下载全部可解析结果 */
  all?: boolean
  /** 非交互：按序号下载，如 1,3,5 */
  pick?: string
}

function printHits(hits: SearchHit[]) {
  const table = new CliTable({
    head: ['#', '源', '歌手', '歌名', '备注'],
    colWidths: [4, 8, 18, 28, 12],
    wordWrap: true,
  })
  hits.forEach((h, i) => {
    table.push([
      String(i + 1),
      h.source,
      h.artist || '-',
      h.title || '-',
      h.qualityLabel || (h.needsResolve ? '待解析' : '已有链'),
    ])
  })
  console.log(table.toString())
}

function parsePick(raw: string, max: number): number[] {
  const set = new Set<number>()
  for (const part of raw.split(/[,，\s]+/).filter(Boolean)) {
    if (part.includes('-')) {
      const [a, b] = part.split('-').map((x) => Number.parseInt(x, 10))
      if (!Number.isFinite(a) || !Number.isFinite(b)) continue
      for (let i = Math.min(a!, b!); i <= Math.max(a!, b!); i++) {
        if (i >= 1 && i <= max) set.add(i)
      }
    } else {
      const n = Number.parseInt(part, 10)
      if (n >= 1 && n <= max) set.add(n)
    }
  }
  return [...set].sort((a, b) => a - b)
}

export async function runSearchCommand(options: SearchCommandOptions) {
  let keyword = options.keyword?.trim()
  if (!keyword) {
    if (!isInteractive()) {
      throw new Error('请提供搜索关键词：yun search <关键词>')
    }
    keyword = await promptLine('请输入搜索关键词: ')
  }
  if (!keyword) throw new Error('关键词不能为空')

  let sourceIds = parseSourceList(options.sources)
  if (!sourceIds && isInteractive()) {
    const choice = await promptSelect('音源范围', [
      { label: '全部（QQ / 网易云 / 酷我 / 酷狗 / 汽水）', value: 'all' as const },
      { label: '自定义勾选', value: 'custom' as const },
    ])
    if (choice === 'custom') {
      const picked: MusicSourceId[] = []
      for (const p of listProviders()) {
        if (await promptYesNo(`启用 ${p.label} (${p.id})?`, true)) picked.push(p.id)
      }
      sourceIds = picked.length ? picked : undefined
    }
  }

  console.log(`${logSymbols.info} 正在搜索「${keyword}」...`)
  const hits = await searchAllSources(keyword, {
    limitPerSource: options.limit,
    sources: sourceIds,
  })
  if (!hits.length) {
    console.log(`${logSymbols.warning} 没有搜索结果`)
    return
  }

  printHits(hits)

  let selected: SearchHit[]
  if (options.all) {
    selected = hits
  } else if (options.pick) {
    selected = parsePick(options.pick, hits.length).map((i) => hits[i - 1]!)
  } else if (isInteractive()) {
    const raw = await promptLine(`输入要下载的序号（如 1,3,5 或 1-5，回车=全部）: `)
    selected = raw ? parsePick(raw, hits.length).map((i) => hits[i - 1]!) : hits
  } else {
    throw new Error('非交互模式请使用 --all 或 --pick 1,2,3')
  }

  if (!selected.length) {
    console.log(`${logSymbols.warning} 未选择任何歌曲`)
    return
  }

  let { lyric, cover, skipTrial, transcode, bitrate } = options
  if (isInteractive()) {
    const picked = await selectDownloadOptions({
      lyric,
      cover,
      skipTrial,
      quality: 999,
      transcode,
      bitrate,
    })
    lyric = picked.lyric
    cover = picked.cover
    skipTrial = picked.skipTrial
    transcode = picked.transcode
    bitrate = picked.bitrate
  }

  const sourceTag = sourceIds?.length === 1 ? sourceIds[0] : 'multi'
  await downloadResolvedHits({
    hits: selected,
    format: options.format,
    concurrency: options.concurrency,
    retryTimeoutMin: options.retryTimeout,
    retryTimes: options.retryTimes,
    skipExists: options.skip,
    progress: options.progress,
    lyric,
    cover,
    skipTrial,
    transcode,
    bitrate,
    outDirName: `search-${sourceTag}-${keyword}`,
  })
}
