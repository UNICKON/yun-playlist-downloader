import { access, constants, unlink } from 'node:fs/promises'
import path from 'node:path'
import logSymbols from 'log-symbols'
import { assertFfmpegAvailable, runFfmpeg } from './ffmpeg'

export { assertFfmpegAvailable }

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
