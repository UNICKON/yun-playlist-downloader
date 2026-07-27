import { execSync } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, statSync, unlinkSync } from 'node:fs'
import path from 'node:path'
import { get } from 'es-toolkit/compat'
import { readCookie } from '../src/auth/cookie.ts'
import { downloadSongPlain, getAdapter, getFileName } from '../src/index.ts'
import { getSongCoverUrl } from '../src/tags.ts'

const outDir = path.resolve('tag-smoke')
if (existsSync(outDir)) {
  for (const f of readdirSync(outDir)) unlinkSync(path.join(outDir, f))
}
mkdirSync(outDir, { recursive: true })

readCookie('yun.cookie.txt')
const url = 'https://music.163.com/#/playlist?id=17994439563'
const adapter = getAdapter(url)
const name = (await adapter.getTitle()) || 'tt'
const playlistCover = await adapter.getCover()

const songs = await adapter.getSongs(320000)
const pick =
  songs.find((s) => s.url && s.singer.includes('孙燕姿') && s.songName.includes('雨天')) ||
  songs.find((s) => s.url && !s.isFreeTrial)

if (!pick?.url) {
  console.error('no song')
  process.exit(1)
}

const songCover = getSongCoverUrl(pick)
pick.rawIndex = 0
pick.index = '01'
const file = path.join(
  outDir,
  getFileName({
    format: ':singer - :songName.:ext',
    song: pick,
    url,
    name,
  }),
)

await downloadSongPlain({
  url: pick.url,
  file,
  song: pick,
  totalLength: 1,
  retryTimeout: 180000,
  retryTimes: 3,
  skipExists: false,
  skipTrial: false,
  lyric: true,
  transcode: 'mp3',
  bitrate: 192,
  // 故意传入歌单封面：应被单曲专辑图覆盖，且不应留下 cover 文件
  playlistCoverFile: undefined,
})

const files = readdirSync(outDir)
const mp3 = files.find((f) => f.endsWith('.mp3'))
const lrc = files.find((f) => f.endsWith('.lrc'))
const leftoverCover = files.find((f) => /^cover\./i.test(f))
const mp3Path = mp3 ? path.join(outDir, mp3) : null

let ffprobe: Record<string, unknown> = {}
if (mp3Path) {
  try {
    const raw = execSync(`ffprobe -v quiet -print_format json -show_format -show_streams "${mp3Path}"`, {
      encoding: 'utf8',
    })
    const data = JSON.parse(raw)
    ffprobe = {
      title: data.format?.tags?.title || data.format?.tags?.TITLE || '',
      artist: data.format?.tags?.artist || data.format?.tags?.ARTIST || '',
      album: data.format?.tags?.album || data.format?.tags?.ALBUM || '',
      hasLyrics: Boolean(data.format?.tags?.lyrics || data.format?.tags?.LYRICS),
      hasCover: (data.streams || []).some((s: { codec_type?: string }) => s.codec_type === 'video'),
    }
  } catch (e: any) {
    ffprobe = { error: e.message }
  }
}

const report = {
  song: `${pick.singer} - ${pick.songName}`,
  songCover,
  playlistCover,
  coverSourcesDiffer: Boolean(songCover && playlistCover && songCover !== playlistCover),
  albumName: pick.albumName,
  alPicUrl: get(pick.raw, 'al.picUrl'),
  files,
  leftoverCover: leftoverCover || null,
  hasMp3: Boolean(mp3),
  hasLrc: Boolean(lrc),
  mp3Bytes: mp3 ? statSync(path.join(outDir, mp3)).size : 0,
  ffprobe,
  ok: Boolean(mp3 && lrc && songCover && (ffprobe as any).hasCover && !leftoverCover),
}
console.log(JSON.stringify(report, null, 2))
process.exit(report.ok ? 0 : 2)
