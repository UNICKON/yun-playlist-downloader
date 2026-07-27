import { mkdirSync, statSync } from 'node:fs'
import path from 'node:path'
import { readCookie } from '../src/auth/cookie.ts'
import { downloadSongPlain, getAdapter, getFileName } from '../src/index.ts'

readCookie('yun.cookie.txt')
const url = 'https://music.163.com/#/playlist?id=318081869'
const adapter = getAdapter(url)
const songs = await adapter.getSongs(999000)
const cloudish = songs.filter((s) => s.raw?.pc || s.raw?.privilege?.cs)
const pick = cloudish.find((s) => s.url)

console.log(
  JSON.stringify(
    {
      total: songs.length,
      cloudMarked: cloudish.length,
      cloudWithUrl: cloudish.filter((s) => s.url).length,
      pick: pick && {
        name: pick.songName,
        singer: pick.singer,
        trial: pick.isFreeTrial,
        hasUrl: Boolean(pick.url),
      },
    },
    null,
    2,
  ),
)

if (!pick?.url) {
  console.error('No playlist cloud song with url')
  process.exit(1)
}

const outDir = path.resolve('cloud-download-smoke')
mkdirSync(outDir, { recursive: true })
pick.rawIndex = 0
pick.index = '01'
const file = path.join(
  outDir,
  getFileName({
    format: 'playlist-cloud-:singer - :songName.:ext',
    song: pick,
    url,
    name: '23',
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
})

const st = statSync(file)
const ok = st.size > 500_000 && !pick.isFreeTrial
console.log(JSON.stringify({ file, bytes: st.size, ok }, null, 2))
process.exit(ok ? 0 : 2)
