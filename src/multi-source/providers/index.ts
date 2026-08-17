import { kugouProvider } from './kugou'
import { kuwoProvider } from './kuwo'
import { neteaseProvider } from './netease'
import { qqProvider } from './qq'
import { sodaProvider } from './soda'
import type { MusicSourceId, SourceProvider } from '../types'

const providers: SourceProvider[] = [qqProvider, neteaseProvider, kuwoProvider, kugouProvider, sodaProvider]

export function listProviders(): SourceProvider[] {
  return providers
}

export function getProvider(id: MusicSourceId): SourceProvider {
  const p = providers.find((x) => x.id === id)
  if (!p) throw new Error(`未知音源: ${id}`)
  return p
}

export function parseSourceList(raw?: string): MusicSourceId[] | undefined {
  if (!raw?.trim()) return undefined
  const ids = raw
    .split(/[,+\s]+/)
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean) as MusicSourceId[]
  const valid = new Set(providers.map((p) => p.id))
  const out = ids.filter((id) => valid.has(id))
  return out.length ? out : undefined
}
