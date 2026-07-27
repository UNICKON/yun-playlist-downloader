import { describe, expect, it } from 'vitest'
import { getSongId, lyricPathForAudio } from '../src/lyric'
import { getAudioTags, getSongCoverUrl, isTaggableAudio } from '../src/tags'
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

describe('tag helpers', () => {
  it('detects taggable audio', () => {
    expect(isTaggableAudio('a.mp3')).toBe(true)
    expect(isTaggableAudio('a.m4a')).toBe(true)
    expect(isTaggableAudio('a.flac')).toBe(false)
  })

  it('reads cover url preferring song album over playlist fallbacks', () => {
    expect(getSongCoverUrl({ raw: { al: { picUrl: 'http://x/a.jpg' } } } as any)).toBe('http://x/a.jpg')
    expect(getSongCoverUrl({ raw: { album: { picUrl: 'http://x/alb.jpg' } } } as any)).toBe('http://x/alb.jpg')
    expect(getSongCoverUrl({ raw: { pc: { cover: 'http://x/b.jpg' } } } as any)).toBe('http://x/b.jpg')
    // 单曲专辑图优先于其他字段
    expect(
      getSongCoverUrl({
        raw: { al: { picUrl: 'http://song.jpg' }, pc: { cover: 'http://cloud.jpg' } },
      } as any),
    ).toBe('http://song.jpg')
    expect(getSongCoverUrl({ raw: {} } as any)).toBeUndefined()
  })

  it('builds audio tags from song', () => {
    expect(getAudioTags({ songName: '雨天', singer: '孙燕姿', albumName: 'My Story' } as any)).toEqual({
      title: '雨天',
      artist: '孙燕姿',
      album: 'My Story',
    })
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
