import { existsSync, mkdirSync, readdirSync, statSync, unlinkSync } from 'node:fs'
import path from 'node:path'
import { readCookie } from '../src/auth/cookie.ts'
import { downloadSongPlain, getAdapter, getFileName } from '../src/index.ts'

const outDir = path.resolve('lyric-transcode-smoke')
if (existsSync(outDir)) {
  for (const f of readdirSync(outDir)) unlinkSync(path.join(outDir, f))
}
mkdirSync(outDir, { recursive: true })

readCookie('yun.cookie.txt')
// 歌单 tt，挑一首有歌词的华语歌
const url = 'https://music.163.com/#/playlist?id=17994439563'
const adapter = getAdapter(url)
const songs = await adapter.getSongs(320000)
const pick =
  songs.find((s) => s.url && s.singer.includes('孙燕姿') && s.songName.includes('雨天')) ||
  songs.find((s) => s.url && !s.isFreeTrial)

if (!pick?.url) {
  console.error('no song')
  process.exit(1)
}

pick.rawIndex = 0
pick.index = '01'
const file = path.join(
  outDir,
  getFileName({
    format: ':singer - :songName.:ext',
    song: pick,
    url,
    name: 'tt',
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
})

const files = readdirSync(outDir)
const mp3 = files.find((f) => f.endsWith('.mp3'))
const lrc = files.find((f) => f.endsWith('.lrc'))
const flacLeft = files.find((f) => f.endsWith('.flac'))
const report = {
  song: `${pick.singer} - ${pick.songName}`,
  files,
  hasMp3: Boolean(mp3),
  hasLrc: Boolean(lrc),
  flacDeleted: !flacLeft,
  mp3Bytes: mp3 ? statSync(path.join(outDir, mp3)).size : 0,
  lrcPreview: lrc ? (await import('node:fs')).readFileSync(path.join(outDir, lrc), 'utf8').slice(0, 120) : null,
  ok: Boolean(mp3 && lrc && !flacLeft),
}
console.log(JSON.stringify(report, null, 2))
process.exit(report.ok ? 0 : 2)
