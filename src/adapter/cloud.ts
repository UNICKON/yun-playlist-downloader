import { userCloudAll } from '$api'
import type { Song } from '$define'
import { BaseAdapter } from './base'

export class CloudAdapter extends BaseAdapter {
  constructor(url: string) {
    super(url)
    if (!this.id) this.id = 'cloud'
  }

  override async getTitle() {
    return '云盘'
  }

  override async getCover() {
    return undefined
  }

  override async getSongs(quality: number): Promise<Song[]> {
    const items = await userCloudAll()
    const songDatas = items.map((item) => {
      if (item.simpleSong?.id) return item.simpleSong
      return {
        id: item.songId,
        name: item.songName,
        ar: item.artist ? [{ name: item.artist }] : [],
        al: { name: item.album || '' },
      }
    })
    const { all } = await this.filterSongs(songDatas, quality)
    return this.getSongsFromData(all)
  }
}
