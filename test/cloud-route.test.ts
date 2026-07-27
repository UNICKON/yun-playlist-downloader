import { describe, expect, it } from 'vitest'
import { getFileName, getType } from '../src/index'

describe('cloud route', () => {
  it('detects cloud url', () => {
    const item = getType('https://music.163.com/#/my/m/music/cloud')
    expect(item.type).toBe('cloud')
    expect(item.typeText).toBe('云盘')
  })

  it('filename :name becomes 云盘', () => {
    const file = getFileName({
      format: ':name/:singer - :songName.:ext',
      url: 'https://music.163.com/#/my/m/music/cloud',
      name: '云盘',
      song: {
        singer: 'A',
        songName: 'B',
        albumName: '',
        ext: 'flac',
        index: '01',
        rawIndex: 0,
      },
    })
    expect(file.replace(/\\/g, '/')).toBe('云盘/A - B.flac')
  })
})
