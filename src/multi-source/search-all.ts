import logSymbols from 'log-symbols'
import { getProvider, listProviders } from './providers'
import type { MusicSourceId, SearchHit } from './types'

export async function searchAllSources(
  keyword: string,
  options: { limitPerSource?: number; sources?: MusicSourceId[] } = {},
): Promise<SearchHit[]> {
  const limit = options.limitPerSource ?? 5
  const wanted = options.sources?.length
    ? listProviders().filter((p) => options.sources!.includes(p.id))
    : listProviders()

  const settled = await Promise.allSettled(
    wanted.map(async (p) => {
      try {
        return await p.search(keyword, limit)
      } catch (e: any) {
        console.log(`${logSymbols.warning} [${p.label}] 搜索失败: ${e?.message || e}`)
        return [] as SearchHit[]
      }
    }),
  )

  const hits: SearchHit[] = []
  for (const r of settled) {
    if (r.status === 'fulfilled') hits.push(...r.value)
  }
  return hits
}

export function resolveHit(hit: SearchHit) {
  const provider = getProvider(hit.source)
  return provider.resolve(hit)
}
