import { beforeEach, describe, expect, it, vi } from 'vitest'
import { BaseAdapter } from '../../src/adapter/base'

vi.mock('../../src/api', () => ({
  songUrl: vi.fn(),
  songDownloadUrl: vi.fn(),
}))

import { songDownloadUrl, songUrl } from '../../src/api'

class TestAdapter extends BaseAdapter {
  getTitle = async () => 't'
  getCover = async () => undefined
  getSongs = async () => []
}

describe('BaseAdapter cloud metadata', () => {
  it('falls back to pc fields', () => {
    const a = new TestAdapter('https://music.163.com/#/playlist?id=1')
    const songs = a.getSongsFromData([
      {
        id: 1,
        name: '',
        ar: [],
        al: { name: '' },
        pc: { ar: '陈升', sn: '风筝', alb: '专辑X' },
        playUrlInfo: { url: 'https://m.example/a.flac', freeTrialInfo: null } as any,
      },
    ] as any)
    expect(songs[0].singer).toBe('陈升')
    expect(songs[0].songName).toBe('风筝')
    expect(songs[0].albumName).toBe('专辑X')
  })
})

describe('BaseAdapter url fallback', () => {
  beforeEach(() => {
    vi.mocked(songUrl).mockReset()
    vi.mocked(songDownloadUrl).mockReset()
  })

  it('retries songUrl then songDownloadUrl for missing urls', async () => {
    vi.mocked(songUrl)
      .mockResolvedValueOnce([{ id: 7, url: null as any, freeTrialInfo: null } as any])
      .mockResolvedValueOnce([{ id: 7, url: null as any, freeTrialInfo: null } as any])
    vi.mocked(songDownloadUrl).mockResolvedValue({
      id: 7,
      url: 'https://dl.example/c.flac',
      freeTrialInfo: null,
    } as any)

    const a = new TestAdapter('https://music.163.com/#/playlist?id=1')
    const { songs, removed } = await a.filterSongs([{ id: 7, name: 'x', pc: { sn: 'x' } }] as any, 999000)
    expect(removed).toHaveLength(0)
    expect(songs[0].playUrlInfo?.url).toContain('dl.example')
    expect(songDownloadUrl).toHaveBeenCalledWith(7, 999000)
  })
})
