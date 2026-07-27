import { spawn } from 'node:child_process'
import { access, constants, unlink } from 'node:fs/promises'
import path from 'node:path'
import logSymbols from 'log-symbols'

export type TranscodeFormat = 'mp3' | 'aac'

const EXT: Record<TranscodeFormat, string> = {
  mp3: '.mp3',
  aac: '.m4a',
}

const DEFAULT_BITRATE: Record<TranscodeFormat, number> = {
  mp3: 320,
  aac: 256,
}

export function defaultBitrate(fmt: TranscodeFormat) {
  return DEFAULT_BITRATE[fmt]
}

export function isAlreadyTargetFormat(file: string, fmt: TranscodeFormat) {
  const ext = path.extname(file).toLowerCase()
  if (fmt === 'mp3') return ext === '.mp3'
  return ext === '.m4a' || ext === '.aac'
}

export async function assertFfmpegAvailable() {
  await new Promise<void>((resolve, reject) => {
    const child = spawn('ffmpeg', ['-version'], { stdio: 'ignore', windowsHide: true })
    child.on('error', () => {
      reject(new Error('未找到 ffmpeg，请先安装并加入 PATH 后再使用 --mp3 / --aac / --transcode'))
    })
    child.on('exit', (code) => {
      if (code === 0) resolve()
      else reject(new Error(`ffmpeg 不可用 (exit ${code})`))
    })
  })
}

function runFfmpeg(args: string[]) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn('ffmpeg', args, { stdio: ['ignore', 'ignore', 'pipe'], windowsHide: true })
    let stderr = ''
    child.stderr?.on('data', (buf) => {
      stderr += String(buf)
    })
    child.on('error', reject)
    child.on('exit', (code) => {
      if (code === 0) resolve()
      else reject(new Error(`ffmpeg 失败 (exit ${code}): ${stderr.slice(-500)}`))
    })
  })
}

/**
 * 转码为 mp3/aac，成功后删除源文件，返回最终路径。
 * 若已是目标格式则原样返回。
 */
export async function transcodeAudio(
  inputFile: string,
  fmt: TranscodeFormat,
  bitrateKbps?: number,
): Promise<string> {
  if (isAlreadyTargetFormat(inputFile, fmt)) return inputFile

  try {
    await access(inputFile, constants.R_OK)
  } catch {
    throw new Error(`转码失败：文件不存在 ${inputFile}`)
  }

  const br = bitrateKbps ?? defaultBitrate(fmt)
  const outFile = path.join(
    path.dirname(inputFile),
    `${path.basename(inputFile, path.extname(inputFile))}${EXT[fmt]}`,
  )

  const codecArgs =
    fmt === 'mp3'
      ? ['-vn', '-codec:a', 'libmp3lame', '-b:a', `${br}k`]
      : ['-vn', '-codec:a', 'aac', '-b:a', `${br}k`, '-movflags', '+faststart']

  await runFfmpeg(['-y', '-i', inputFile, ...codecArgs, outFile])
  await unlink(inputFile)
  console.log(`${logSymbols.success} [transcode] ${path.basename(inputFile)} -> ${path.basename(outFile)}`)
  return outFile
}
