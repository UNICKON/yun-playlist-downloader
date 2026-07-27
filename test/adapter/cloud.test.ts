import { describe, expect, it, vi } from 'vitest'

vi.mock('../../src/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/api')>()
  return {
    ...actual,
    userCloudAll: vi.fn(async () => [
      {
        songId: 42,
        songName: 'S',
        artist: 'Art',
        album: 'Alb',
        simpleSong: { id: 42, name: 'S', ar: [{ name: 'Art' }], al: { name: 'Alb' } },
      },
    ]),
    songUrl: vi.fn(async () => [
      { id: 42, url: 'https://m.example/x.flac', freeTrialInfo: null, type: 'flac' },
    ]),
  }
})

import { songUrl } from '../../src/api'
import { CloudAdapter } from '../../src/adapter/cloud'

describe('CloudAdapter', () => {
  it('lists cloud songs with play urls', async () => {
    const adapter = new CloudAdapter('https://music.163.com/#/my/m/music/cloud')
    expect(await adapter.getTitle()).toBe('云盘')
    const songs = await adapter.getSongs(999000)
    expect(songs).toHaveLength(1)
    expect(songs[0].songName).toBe('S')
    expect(songs[0].url).toContain('example')
    expect(songUrl).toHaveBeenCalled()
  })
})
