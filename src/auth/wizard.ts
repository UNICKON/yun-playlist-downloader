import logSymbols from 'log-symbols'
import { ensureAuth, type CookieMode } from './ensure-auth'
import { isInteractive, promptLine, promptSelect, promptYesNo } from './prompt'
import { getLoginUserId, listUserPlaylists } from './user'
import type { TranscodeFormat } from '$transcode'

const CLOUD_URL = 'https://music.163.com/#/my/m/music/cloud'

export type DownloadAuthOptions = {
  cookieFile: string
  cookieMode: CookieMode
}

/**
 * 无 url 参数时：交互选择下载目标（我的歌单 / 云盘 / 手动输入）
 */
export async function selectDownloadUrl(providedUrl?: string, auth?: DownloadAuthOptions): Promise<string> {
  if (providedUrl?.trim()) {
    let url = providedUrl.trim()
    if (/^\d+$/.test(url)) {
      url = `https://music.163.com/#/playlist?id=${url}`
    }
    return url
  }

  if (!isInteractive()) {
    throw new Error('未提供 url，且当前非交互终端。请传入歌单/专辑链接，或在终端中运行以选择歌单。')
  }

  while (true) {
    const source = await promptSelect('下载来源', [
      { label: '我的歌单（登录后选择）', value: 'playlist' as const },
      { label: '我的云盘', value: 'cloud' as const },
      { label: '手动输入链接 / 歌单 ID', value: 'url' as const },
    ])

    if (source === 'cloud') {
      return CLOUD_URL
    }

    if (source === 'url') {
      const input = await promptLine('请输入链接或歌单 ID: ')
      if (!input) {
        console.log(`${logSymbols.warning} 不能为空`)
        continue
      }
      if (/^\d+$/.test(input)) {
        return `https://music.163.com/#/playlist?id=${input}`
      }
      try {
        new URL(input)
        return input
      } catch {
        console.log(`${logSymbols.warning} 链接格式不正确`)
        continue
      }
    }

    // playlist list：必须先登录，否则 login_status 拿不到 uid
    try {
      if (auth) {
        await ensureAuth(auth.cookieFile, auth.cookieMode)
      }
      const { uid, nickname } = await getLoginUserId()
      console.log(`${logSymbols.info} 当前用户: ${nickname || uid}`)
      const playlists = await listUserPlaylists(uid)
      if (!playlists.length) {
        console.log(`${logSymbols.warning} 没有找到歌单`)
        continue
      }

      const picked = await promptSelect(
        '选择要下载的歌单',
        playlists.map((p) => ({
          label: `${p.name}（${p.trackCount} 首）`,
          value: p.id,
        })),
      )
      return `https://music.163.com/#/playlist?id=${picked}`
    } catch (e: any) {
      console.log(`${logSymbols.error} ${e?.message || e}`)
      console.log(`${logSymbols.info} 请先完成登录，或改选其他来源`)
    }
  }
}

export type InteractiveDownloadOptions = {
  lyric: boolean
  cover: boolean
  skipTrial: boolean
  quality: number
  transcode?: TranscodeFormat
  bitrate?: number
}

/**
 * 交互选择下载选项（车载预设 / 自定义 / 保持当前）
 */
export async function selectDownloadOptions(current: InteractiveDownloadOptions): Promise<InteractiveDownloadOptions> {
  if (!isInteractive()) return current

  const preset = await promptSelect('下载选项', [
    {
      label: `保持当前（lyric=${current.lyric} cover=${current.cover} transcode=${current.transcode || '无'} quality=${current.quality}）`,
      value: 'keep' as const,
    },
    { label: '车载推荐：歌词 + MP3 + 封面', value: 'car' as const },
    { label: '只要原曲（不转码、不嵌封面）', value: 'raw' as const },
    { label: '自定义逐项选择', value: 'custom' as const },
  ])

  if (preset === 'keep') return current

  if (preset === 'car') {
    return {
      ...current,
      lyric: true,
      cover: true,
      transcode: 'mp3',
      bitrate: current.bitrate ?? 320,
    }
  }

  if (preset === 'raw') {
    return {
      ...current,
      lyric: false,
      cover: false,
      transcode: undefined,
      bitrate: undefined,
    }
  }

  // custom
  const lyric = await promptYesNo('下载并内嵌歌词 (.lrc)?', current.lyric)
  const cover = await promptYesNo('嵌入封面到音频?', current.cover)
  const skipTrial = await promptYesNo('跳过试听歌曲?', current.skipTrial)
  const quality = await promptSelect('音质', [
    { label: '最高 (999)', value: 999 },
    { label: '320k', value: 320 },
    { label: '192k', value: 192 },
    { label: '128k', value: 128 },
  ])
  const tc = await promptSelect('转码', [
    { label: '不转码', value: 'none' as const },
    { label: 'MP3', value: 'mp3' as const },
    { label: 'AAC (.m4a)', value: 'aac' as const },
  ])

  return {
    lyric,
    cover,
    skipTrial,
    quality,
    transcode: tc === 'none' ? undefined : tc,
    bitrate: current.bitrate,
  }
}
