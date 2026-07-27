import { access, constants, mkdtemp, rename, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { get } from 'es-toolkit/compat'
import got from 'got'
import logSymbols from 'log-symbols'
import { runFfmpeg } from './ffmpeg'
import type { Song } from '$define'

export type AudioTags = {
  title: string
  artist: string
  album: string
}

export function isTaggableAudio(file: string) {
  const ext = path.extname(file).toLowerCase()
  return ext === '.mp3' || ext === '.m4a' || ext === '.aac'
}

export function getSongCoverUrl(song: Song): string | undefined {
  const raw = song.raw
  if (!raw) return undefined
  // 优先用单曲所属专辑封面，避免误用歌单封面
  const candidates = [
    get(raw, 'al.picUrl'),
    get(raw, 'album.picUrl'),
    get(raw, 'simpleSong.al.picUrl'),
    get(raw, 'pc.cover'),
  ]
  for (const c of candidates) {
    if (typeof c === 'string' && c) return c
  }
  return undefined
}

export function getAudioTags(song: Song): AudioTags {
  return {
    title: song.songName,
    artist: song.singer,
    album: song.albumName,
  }
}

function coverExtFromUrl(url: string) {
  try {
    const ext = path.extname(new URL(url).pathname)
    if (ext && ext.length <= 5) return ext
  } catch {
    /* ignore */
  }
  return '.jpg'
}

async function downloadCoverToTemp(url: string) {
  const dir = await mkdtemp(path.join(tmpdir(), 'yun-cover-'))
  const file = path.join(dir, `cover${coverExtFromUrl(url)}`)
  const buf = await got(url).buffer()
  await writeFile(file, buf)
  return { file, dir }
}

/**
 * 封面：只用单曲专辑图；无单曲封面时才回退歌单/专辑 --cover 文件
 */
export async function resolveCoverPath(song: Song, playlistCoverFile?: string) {
  const url = getSongCoverUrl(song)
  if (url) {
    const { file, dir } = await downloadCoverToTemp(url)
    return { path: file, tempDir: dir }
  }

  if (playlistCoverFile) {
    try {
      await access(playlistCoverFile, constants.R_OK)
      return { path: playlistCoverFile, tempDir: undefined as string | undefined }
    } catch {
      /* ignore */
    }
  }

  return { path: undefined, tempDir: undefined }
}

function metadataArgs(tags: AudioTags, lyricText?: string) {
  const args: string[] = []
  if (tags.title) args.push('-metadata', `title=${tags.title}`)
  if (tags.artist) args.push('-metadata', `artist=${tags.artist}`)
  if (tags.album) args.push('-metadata', `album=${tags.album}`)
  if (lyricText) args.push('-metadata', `lyrics=${lyricText}`)
  return args
}

/**
 * 对最终 mp3/m4a 写入元数据、封面、内嵌歌词（USLT / ©lyr）
 */
export async function embedAudioTags(
  audioFile: string,
  song: Song,
  options: { lyricText?: string; playlistCoverFile?: string } = {},
) {
  if (!isTaggableAudio(audioFile)) return

  const tags = getAudioTags(song)
  const { path: coverPath, tempDir } = await resolveCoverPath(song, options.playlistCoverFile)
  const ext = path.extname(audioFile).toLowerCase()
  const tmpOut = `${audioFile}.tagging.tmp${ext}`

  try {
    const args = ['-y', '-i', audioFile]
    if (coverPath) args.push('-i', coverPath)

    if (coverPath) {
      args.push('-map', '0:a', '-map', '1:v')
    } else {
      args.push('-map', '0:a')
    }

    args.push('-c', 'copy', ...metadataArgs(tags, options.lyricText))

    if (ext === '.mp3') {
      args.push('-id3v2_version', '3')
      if (coverPath) {
        args.push('-metadata:s:v', 'title=Album cover', '-metadata:s:v', 'comment=Cover (front)')
      }
    } else if (coverPath) {
      args.push('-disposition:v:1', 'attached_pic')
    }

    args.push(tmpOut)
    await runFfmpeg(args)
    await rename(tmpOut, audioFile)

    const parts = ['元数据']
    if (coverPath) parts.push('封面')
    if (options.lyricText) parts.push('歌词')
    console.log(`${logSymbols.success} [tags] ${path.basename(audioFile)} (${parts.join(' + ')})`)
  } finally {
    // 临时下载的单曲封面嵌入后删除
    if (tempDir) {
      await rm(tempDir, { recursive: true, force: true }).catch(() => {})
    }
    await rm(tmpOut, { force: true }).catch(() => {})
  }
}
