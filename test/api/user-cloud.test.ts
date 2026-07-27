import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('NeteaseCloudMusicApi', () => ({
  default: {
    user_cloud: vi.fn(),
    song_download_url: vi.fn(),
  },
}))

import Api from 'NeteaseCloudMusicApi'
import { songDownloadUrl, userCloudAll } from '../../src/api'

describe('userCloudAll', () => {
  beforeEach(() => {
    vi.mocked(Api.user_cloud).mockReset()
  })

  it('pages until hasMore is false', async () => {
    vi.mocked(Api.user_cloud)
      .mockResolvedValueOnce({
        body: {
          data: [{ songId: 1, songName: 'a', artist: 'x', album: '' }],
          hasMore: true,
          count: 2,
        },
      } as any)
      .mockResolvedValueOnce({
        body: {
          data: [{ songId: 2, songName: 'b', artist: 'y', album: '' }],
          hasMore: false,
          count: 2,
        },
      } as any)

    const all = await userCloudAll()
    expect(all.map((x) => x.songId)).toEqual([1, 2])
    expect(Api.user_cloud).toHaveBeenCalledTimes(2)
  })
})

describe('songDownloadUrl', () => {
  it('returns data from song_download_url', async () => {
    vi.mocked(Api.song_download_url).mockResolvedValue({
      body: { data: { id: 9, url: 'https://example.com/a.flac', freeTrialInfo: null } },
    } as any)
    const info = await songDownloadUrl(9, 999000)
    expect(info?.url).toContain('example.com')
  })
})
