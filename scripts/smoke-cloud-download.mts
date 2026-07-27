import { mkdirSync, statSync } from 'node:fs'
import path from 'node:path'
import { readCookie } from '../src/auth/cookie.ts'
import { downloadSongPlain, getAdapter, getFileName } from '../src/index.ts'

const outDir = path.resolve('cloud-download-smoke')
mkdirSync(outDir, { recursive: true })

readCookie('yun.cookie.txt')
const url = 'https://music.163.com/#/my/m/music/cloud'
const adapter = getAdapter(url)
const title = await adapter.getTitle()
const songs = await adapter.getSongs(999000)
const withUrl = songs.filter((s) => s.url)
const trial = withUrl.filter((s) => s.isFreeTrial)

console.log(
  JSON.stringify(
    {
      title,
      total: songs.length,
      withUrl: withUrl.length,
      trial: trial.length,
      noUrl: songs.length - withUrl.length,
    },
    null,
    2,
  ),
)

const sample = withUrl.slice(0, 2)
if (!sample.length) {
  console.error('No downloadable cloud songs')
  process.exit(1)
}

for (const [i, song] of sample.entries()) {
  song.rawIndex = i
  song.index = String(i + 1).padStart(2, '0')
}

const results = []
for (const song of sample) {
  const file = path.join(
    outDir,
    getFileName({
      format: ':singer - :songName.:ext',
      song,
      url,
      name: title || '云盘',
    }),
  )
  await downloadSongPlain({
    url: song.url!,
    file,
    song,
    totalLength: sample.length,
    retryTimeout: 3 * 60 * 1000,
    retryTimes: 3,
    skipExists: false,
    skipTrial: false,
  })
  const st = statSync(file)
  results.push({
    file,
    bytes: st.size,
    songName: song.songName,
    singer: song.singer,
    isFreeTrial: song.isFreeTrial,
    ext: song.ext,
  })
}

const ok = results.every((r) => r.bytes > 500_000 && !r.isFreeTrial)
console.log(JSON.stringify({ results, ok }, null, 2))
process.exit(ok ? 0 : 2)
