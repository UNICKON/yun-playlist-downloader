import { describe, expect, it } from 'vitest'
import { parseSourceList } from '../src/multi-source/providers'
import { resolvedTrackToSong } from '../src/multi-source/to-song'

describe('multi-source helpers', () => {
  it('parseSourceList', () => {
    expect(parseSourceList('qq,kuwo')).toEqual(['qq', 'kuwo'])
    expect(parseSourceList('soda netease')).toEqual(['soda', 'netease'])
    expect(parseSourceList('nope')).toBeUndefined()
  })

  it('resolvedTrackToSong embeds lyric and cover in raw', () => {
    const song = resolvedTrackToSong(
      {
        source: 'qq',
        id: 'mid',
        title: '江南',
        artist: '林俊杰',
        album: '第二天堂',
        coverUrl: 'https://example.com/a.jpg',
        audioUrl: 'https://example.com/a.mp3',
        lyricText: '[00:01.00]test',
        ext: 'mp3',
      },
      0,
      1,
    )
    expect(song.songName).toBe('江南')
    expect(song.url).toContain('example.com')
    expect((song.raw as any).lyricText).toContain('test')
    expect((song.raw as any).coverUrl).toContain('example.com')
    expect((song.raw as any).multiSource).toBe(true)
  })
})
