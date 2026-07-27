import { spawn } from 'node:child_process'

export async function assertFfmpegAvailable() {
  await new Promise<void>((resolve, reject) => {
    const child = spawn('ffmpeg', ['-version'], { stdio: 'ignore', windowsHide: true })
    child.on('error', () => {
      reject(new Error('未找到 ffmpeg，请先安装并加入 PATH 后再使用 --mp3 / --aac / --transcode / 标签写入'))
    })
    child.on('exit', (code) => {
      if (code === 0) resolve()
      else reject(new Error(`ffmpeg 不可用 (exit ${code})`))
    })
  })
}

export function runFfmpeg(args: string[]) {
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
