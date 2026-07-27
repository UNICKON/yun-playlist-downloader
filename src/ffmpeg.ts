import { spawn } from 'node:child_process'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { createRequire } from 'node:module'
import { homedir } from 'node:os'
import { join } from 'node:path'

const require = createRequire(import.meta.url)

let cachedBin: string | undefined

function getStaticFfmpegPath(): string | undefined {
  try {
    const staticPath = require('ffmpeg-static') as string | null
    if (!staticPath || !existsSync(staticPath)) return undefined
    // 未下完/损坏的包往往很小，跳过以免 spawn EBUSY
    if (statSync(staticPath).size < 20 * 1024 * 1024) return undefined
    return staticPath
  } catch {
    return undefined
  }
}

function readLocalFfmpegPathFile(): string | undefined {
  for (const file of [join(process.cwd(), '.ffmpeg-path'), join(homedir(), '.ffmpeg-path')]) {
    try {
      if (!existsSync(file)) continue
      const p = readFileSync(file, 'utf8').trim()
      if (p && existsSync(p)) return p
    } catch {
      /* ignore */
    }
  }
  return undefined
}

/** Windows：扫描 WinGet / 常见目录里的 ffmpeg.exe */
function findWindowsFfmpeg(): string | undefined {
  if (process.platform !== 'win32') return undefined

  const localAppData = process.env.LOCALAPPDATA || join(homedir(), 'AppData', 'Local')
  const programFiles = process.env.ProgramFiles || 'C:\\Program Files'
  const guesses = [
    join(localAppData, 'Programs', 'xiezuo', 'resources', 'ffmpeg', 'ffmpeg.exe'),
    join(programFiles, 'ffmpeg', 'bin', 'ffmpeg.exe'),
    'C:\\ffmpeg\\bin\\ffmpeg.exe',
  ]

  for (const g of guesses) {
    if (existsSync(g)) return g
  }

  const wingetRoot = join(localAppData, 'Microsoft', 'WinGet', 'Packages')
  if (!existsSync(wingetRoot)) return undefined

  try {
    for (const pkg of readdirSync(wingetRoot)) {
      if (!/ffmpeg/i.test(pkg)) continue
      const pkgDir = join(wingetRoot, pkg)
      const hit = walkFindFfmpeg(pkgDir, 4)
      if (hit) return hit
    }
  } catch {
    /* ignore */
  }
  return undefined
}

function walkFindFfmpeg(dir: string, depth: number): string | undefined {
  if (depth < 0) return undefined
  let entries
  try {
    entries = readdirSync(dir, { withFileTypes: true })
  } catch {
    return undefined
  }
  for (const ent of entries) {
    const full = join(dir, ent.name)
    if (ent.isFile() && ent.name.toLowerCase() === 'ffmpeg.exe') return full
  }
  for (const ent of entries) {
    if (!ent.isDirectory()) continue
    const hit = walkFindFfmpeg(join(dir, ent.name), depth - 1)
    if (hit) return hit
  }
  return undefined
}

function candidateBins(): string[] {
  const list: string[] = []
  if (process.env.FFMPEG_BIN) list.push(process.env.FFMPEG_BIN)
  const fromFile = readLocalFfmpegPathFile()
  if (fromFile) list.push(fromFile)
  const win = findWindowsFfmpeg()
  if (win) list.push(win)
  list.push('ffmpeg')
  const staticPath = getStaticFfmpegPath()
  if (staticPath) list.push(staticPath)
  return [...new Set(list)]
}

function probeFfmpeg(bin: string): Promise<boolean> {
  return new Promise((resolve) => {
    const child = spawn(bin, ['-version'], { stdio: 'ignore', windowsHide: true })
    child.on('error', () => resolve(false))
    child.on('exit', (code) => resolve(code === 0))
  })
}

async function resolveFfmpegBin(): Promise<string> {
  if (cachedBin) return cachedBin
  for (const bin of candidateBins()) {
    if (await probeFfmpeg(bin)) {
      cachedBin = bin
      return bin
    }
  }
  throw new Error(
    '未找到可用的 ffmpeg。请安装并加入 PATH（winget install Gyan.FFmpeg），或设置环境变量 FFMPEG_BIN，或在项目根目录写入 .ffmpeg-path',
  )
}

export async function assertFfmpegAvailable() {
  await resolveFfmpegBin()
}

export async function runFfmpeg(args: string[]) {
  const bin = await resolveFfmpegBin()
  return new Promise<void>((resolve, reject) => {
    const child = spawn(bin, args, { stdio: ['ignore', 'ignore', 'pipe'], windowsHide: true })
    let stderr = ''
    child.stderr?.on('data', (buf) => {
      stderr += String(buf)
    })
    child.on('error', (err) => {
      reject(new Error(`启动 ffmpeg 失败: ${(err as Error).message}`))
    })
    child.on('exit', (code) => {
      if (code === 0) resolve()
      else reject(new Error(`ffmpeg 失败 (exit ${code}): ${stderr.slice(-500)}`))
    })
  })
}
