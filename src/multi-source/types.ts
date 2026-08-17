export type MusicSourceId = 'qq' | 'netease' | 'kuwo' | 'kugou' | 'soda'

export type ResolvedTrack = {
  source: MusicSourceId
  id: string
  title: string
  artist: string
  album: string
  coverUrl?: string
  audioUrl?: string
  lyricText?: string
  ext?: string
  qualityLabel?: string
  raw?: unknown
}

export type SearchHit = ResolvedTrack & {
  /** 搜索结果可能尚未 resolve 出直链 */
  needsResolve: boolean
}

export interface SourceProvider {
  id: MusicSourceId
  label: string
  search: (keyword: string, limit: number) => Promise<SearchHit[]>
  resolve: (hit: SearchHit) => Promise<ResolvedTrack>
}

export const ALL_SOURCE_IDS: MusicSourceId[] = ['qq', 'netease', 'kuwo', 'kugou', 'soda']
