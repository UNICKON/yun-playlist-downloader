import { copyFileSync, existsSync, mkdirSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'
import { transcodeAudio } from '../src/transcode.ts'

const flac = readdirSync('cloud-download-smoke').find((f) => f.endsWith('.flac'))
if (!flac) {
  console.error('no flac sample')
  process.exit(1)
}

async function run(fmt: 'mp3' | 'aac', dir: string) {
  mkdirSync(dir, { recursive: true })
  const input = path.join(dir, flac!)
  copyFileSync(path.join('cloud-download-smoke', flac!), input)
  const out = await transcodeAudio(input, fmt, 192)
  return {
    fmt,
    out: path.basename(out),
    inputGone: !existsSync(input),
    bytes: statSync(out).size,
    ok: !existsSync(input) && (fmt === 'mp3' ? out.endsWith('.mp3') : out.endsWith('.m4a')),
  }
}

const results = [await run('mp3', 'transcode-mp3-smoke'), await run('aac', 'transcode-only-smoke')]
console.log(JSON.stringify({ results, ok: results.every((r) => r.ok) }, null, 2))
process.exit(results.every((r) => r.ok) ? 0 : 2)
