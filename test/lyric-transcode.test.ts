import { describe, expect, it } from 'vitest'
import { getSongId, lyricPathForAudio } from '../src/lyric'
import { defaultBitrate, isAlreadyTargetFormat } from '../src/transcode'

describe('lyric helpers', () => {
  it('lyricPathForAudio replaces extension with .lrc', () => {
    expect(lyricPathForAudio('a/b/foo.flac').replace(/\\/g, '/')).toBe('a/b/foo.lrc')
  })

  it('getSongId reads raw.id', () => {
    expect(getSongId({ raw: { id: 42 } } as any)).toBe(42)
    expect(getSongId({ raw: { songId: 7 } } as any)).toBe(7)
    expect(getSongId({ raw: {} } as any)).toBeUndefined()
  })
})

describe('transcode helpers', () => {
  it('default bitrate', () => {
    expect(defaultBitrate('mp3')).toBe(320)
    expect(defaultBitrate('aac')).toBe(256)
  })

  it('detects already target format', () => {
    expect(isAlreadyTargetFormat('x.mp3', 'mp3')).toBe(true)
    expect(isAlreadyTargetFormat('x.flac', 'mp3')).toBe(false)
    expect(isAlreadyTargetFormat('x.m4a', 'aac')).toBe(true)
    expect(isAlreadyTargetFormat('x.aac', 'aac')).toBe(true)
  })
})
