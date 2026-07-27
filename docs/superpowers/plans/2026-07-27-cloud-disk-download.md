# Cloud Disk Download Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Support downloading NetEase Cloud Disk via cloud URL, and make cloud tracks inside playlists/albums downloadable with metadata + URL fallbacks.

**Architecture:** Add `CloudAdapter` routed by URL containing `cloud`, backed by paginated `user_cloud` + existing `songUrl`. Extend `BaseAdapter.getSongsFromData` / `filterSongs` so playlist/album cloud tracks (`pc` / `cs`) get metadata from `pc.*` and a second-pass URL / `song_download_url` fallback when the first `song_url` batch returns no link.

**Tech Stack:** TypeScript, Vitest, `NeteaseCloudMusicApi` (`user_cloud`, `song_url`, `song_download_url`), existing adapter + CLI pipeline.

## Global Constraints

- Entry must remain `yun <url>` with cloud URL like `https://music.163.com/#/my/m/music/cloud` (path contains `cloud`).
- Filenames use existing `-f` template only; cloud page `:name` / title = `云盘`.
- Cookie required for cloud; reuse `getApiBaseConfig()` / `COOKIE_CONTENT`.
- Do not add podcast support, upload, or a separate `yun cloud` subcommand in this plan.
- Follow TDD: failing test first for each behavior task.
- Do not commit unless the user explicitly asks (workspace commit rule).

## File Structure

| File | Responsibility |
|------|----------------|
| `src/api/index.ts` | `userCloudPage`, `userCloudAll`, `songDownloadUrl` |
| `src/adapter/cloud.ts` | Cloud page adapter |
| `src/adapter/base.ts` | `pc` metadata + URL retry / download-url fallback |
| `src/index.ts` | Register `cloud` in `adapterList` / `getType` |
| `src/cli.ts` | Help example + optional cookie warning for cloud |
| `README.md` | Feature + usage line |
| `test/cloud-route.test.ts` | URL routing + filename `:name` for cloud |
| `test/adapter-base-cloud.test.ts` | Metadata + filterSongs fallback (mocked API) |

---

### Task 1: API — cloud list + download URL

**Files:**
- Modify: `src/api/index.ts`
- Test: `test/api/user-cloud.test.ts`

**Interfaces:**
- Produces:
  - `userCloudPage(limit?: number, offset?: number): Promise<{ data: CloudSongItem[]; hasMore: boolean; count: number }>`
  - `userCloudAll(): Promise<CloudSongItem[]>`
  - `songDownloadUrl(id: Id, quality?: string | number): Promise<SongPlayUrlInfo | undefined>`
- `CloudSongItem` shape (minimal): `{ songId: number; songName: string; artist: string; album: string; fileName?: string; simpleSong?: { id: number; name: string; ar?: { name: string }[]; al?: { name: string } } }`

- [ ] **Step 1: Write the failing test**

Create `test/api/user-cloud.test.ts`:

```ts
import { describe, expect, it, vi, beforeEach } from 'vitest'

vi.mock('NeteaseCloudMusicApi', () => ({
  default: {
    user_cloud: vi.fn(),
    song_download_url: vi.fn(),
  },
}))

import Api from 'NeteaseCloudMusicApi'
import { userCloudAll, songDownloadUrl } from '../../src/api'

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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/api/user-cloud.test.ts`
Expected: FAIL — `userCloudAll` / `songDownloadUrl` not exported

- [ ] **Step 3: Write minimal implementation**

In `src/api/index.ts`, add (keep existing exports):

```ts
export type CloudSongItem = {
  songId: number
  songName: string
  artist: string
  album: string
  fileName?: string
  fileSize?: number
  bitrate?: number
  simpleSong?: {
    id: number
    name: string
    ar?: { name: string }[]
    al?: { name: string }
  }
}

const CLOUD_PAGE_SIZE = 50

export async function userCloudPage(limit = CLOUD_PAGE_SIZE, offset = 0) {
  const res = await Api.user_cloud({ ...getApiBaseConfig(), limit, offset })
  const body = res.body as {
    data?: CloudSongItem[]
    hasMore?: boolean
    count?: number
  }
  return {
    data: body.data || [],
    hasMore: Boolean(body.hasMore),
    count: body.count ?? 0,
  }
}

export async function userCloudAll() {
  const all: CloudSongItem[] = []
  let offset = 0
  let hasMore = true
  while (hasMore) {
    const page = await userCloudPage(CLOUD_PAGE_SIZE, offset)
    all.push(...page.data)
    hasMore = page.hasMore
    offset += CLOUD_PAGE_SIZE
    if (!page.data.length) break
  }
  return all
}

export async function songDownloadUrl(id: Id, quality?: string | number) {
  const res = await Api.song_download_url({
    ...getApiBaseConfig(),
    id,
    br: quality,
  })
  const data = (res.body as { data?: SongPlayUrlInfo }).data
  return data
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/api/user-cloud.test.ts`
Expected: PASS

- [ ] **Step 5: Commit** — skip unless user asks

---

### Task 2: URL routing — `cloud` type

**Files:**
- Modify: `src/index.ts`
- Create: `src/adapter/cloud.ts` (stub first is OK if Task 3 fills it; prefer full adapter in Task 3 — this task only needs routing + title wiring testable via `getType`)
- Test: `test/cloud-route.test.ts`

**Interfaces:**
- Consumes: `adapterList` pattern in `src/index.ts`
- Produces: `getType(cloudUrl).type === 'cloud'`, `typeText === '云盘'`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest'
import { getType, getFileName } from '../src/index'

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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/cloud-route.test.ts`
Expected: FAIL — unsupported type / no cloud adapter

- [ ] **Step 3: Register cloud in `src/index.ts`**

Add import and list entry (adapter class from Task 3 — if implementing sequentially, create minimal `CloudAdapter` stub extending `BaseAdapter` with `getTitle`/`getCover`/`getSongs` throwing `not implemented` is insufficient for later; implement full adapter in Task 3 immediately after this registration, or combine Task 2+3).

Minimal registration:

```ts
import { CloudAdapter } from './adapter/cloud'

// in adapterList:
{
  type: 'cloud',
  typeText: '云盘',
  adapter: CloudAdapter,
},
```

Update `allowedPageTypes` / `PageType` to include `'cloud'`.

- [ ] **Step 4: Run routing test** — PASS after Task 3 adapter exists; if running Task 2 alone, create stub `CloudAdapter` then complete in Task 3.

- [ ] **Step 5: Commit** — skip unless user asks

---

### Task 3: `CloudAdapter`

**Files:**
- Create: `src/adapter/cloud.ts`
- Modify: `src/adapter/base.ts` only if constructor `invariant(id)` blocks cloud URLs — prefer handling inside `CloudAdapter` constructor without calling `super` with empty id, OR relax `BaseAdapter`:

```ts
// base.ts constructor change:
constructor(url: string) {
  this.url = url
  const id = getId(url)
  this.id = id || ''
}
```

Cloud adapter sets `this.id = 'cloud'` when no query id.

**Interfaces:**
- Consumes: `userCloudAll`, `filterSongs`, `getSongsFromData`
- Produces: `CloudAdapter` with `getTitle(): Promise<'云盘'>`, `getCover(): Promise<undefined>`, `getSongs(quality): Promise<Song[]>`

- [ ] **Step 1: Write failing test for adapter mapping**

Create `test/adapter/cloud.test.ts`:

```ts
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

import { CloudAdapter } from '../../src/adapter/cloud'
import { songUrl } from '../../src/api'

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
```

- [ ] **Step 2: Run — expect FAIL** (module missing)

- [ ] **Step 3: Implement `src/adapter/cloud.ts`**

```ts
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
```

Also ensure `BaseAdapter` constructor allows empty id:

```ts
constructor(url: string) {
  this.url = url
  this.id = getId(url) || ''
}
```

Remove `invariant(id, ...)` or only invariant for non-cloud adapters.

- [ ] **Step 4: Run `npx vitest run test/adapter/cloud.test.ts test/cloud-route.test.ts`** — PASS

- [ ] **Step 5: Commit** — skip unless user asks

---

### Task 4: Playlist/album cloud track fallbacks in `BaseAdapter`

**Files:**
- Modify: `src/adapter/base.ts`
- Modify: `src/api/index.ts` (already has `songDownloadUrl`)
- Test: `test/adapter/base-cloud.test.ts`

**Interfaces:**
- Consumes: `songUrl`, `songDownloadUrl`
- Produces: updated `getSongsFromData` / `filterSongs` behavior

- [ ] **Step 1: Write failing tests**

```ts
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { BaseAdapter } from '../../src/adapter/base'

vi.mock('../../src/api', () => ({
  songUrl: vi.fn(),
  songDownloadUrl: vi.fn(),
}))

import { songUrl, songDownloadUrl } from '../../src/api'

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
    const { songs, removed } = await a.filterSongs(
      [{ id: 7, name: 'x', pc: { sn: 'x' } }] as any,
      999000,
    )
    expect(removed).toHaveLength(0)
    expect(songs[0].playUrlInfo?.url).toContain('dl.example')
    expect(songDownloadUrl).toHaveBeenCalledWith(7, 999000)
  })
})
```

- [ ] **Step 2: Run — FAIL** on pc fallback / download fallback

- [ ] **Step 3: Implement in `base.ts`**

`getSongsFromData` singer/songName/albumName:

```ts
singer:
  get(songData, 'ar.0.name') ||
  get(songData, 'artists.0.name') ||
  get(songData, 'pc.ar') ||
  '',
songName: songData.name || get(songData, 'pc.sn') || '',
albumName: get(songData, 'al.name') || get(songData, 'pc.alb') || '',
```

`filterSongs` after first pass:

```ts
const missing = ret.all.filter((s) => !s.playUrlInfo?.url)
if (missing.length) {
  const retryInfos = await songUrl(
    missing.map((s) => s.id),
    quality,
  )
  for (const songDataFull of missing) {
    const info = retryInfos.find((x) => String(x.id) === String(songDataFull.id))
    if (info?.url) songDataFull.playUrlInfo = info
  }
}

for (const songDataFull of ret.all) {
  if (songDataFull.playUrlInfo?.url) continue
  const isCloud = Boolean(get(songDataFull, 'pc') || get(songDataFull, 'privilege.cs'))
  if (!isCloud) continue
  const dl = await songDownloadUrl(songDataFull.id, quality)
  if (dl?.url) songDataFull.playUrlInfo = dl
}

// rebuild songs/removed from ret.all
ret.songs = ret.all.filter((s) => s.playUrlInfo?.url)
ret.removed = ret.all.filter((s) => !s.playUrlInfo?.url)
```

Import `songDownloadUrl` from `$api`.

- [ ] **Step 4: Run `npx vitest run test/adapter/base-cloud.test.ts`** — PASS

- [ ] **Step 5: Commit** — skip unless user asks

---

### Task 5: CLI help + README

**Files:**
- Modify: `src/cli.ts` — `.example` for cloud URL; after `readCookie`, if url includes `cloud` and `!COOKIE_CONTENT`, `console.log` warning
- Modify: `README.md` — feature checkbox + example
- Modify: `docs/cookie.md` — one line that cloud requires cookie

- [ ] **Step 1: Add example in yargs**

```ts
.example(`$0 --cookie yun.cookie.txt 'https://music.163.com/#/my/m/music/cloud'`, '下载云盘')
```

After `readCookie(cookie)`:

```ts
import { COOKIE_CONTENT } from '$auth/cookie'
// ...
if (/cloud/i.test(url) && !COOKIE_CONTENT) {
  console.log(`${logSymbols.warning} 云盘下载需要登录 Cookie，见 docs/cookie.md`)
}
```

- [ ] **Step 2: README**

Under 特性:

```md
- [x] 支持云盘
```

Under 示例:

```md
yun --cookie yun.cookie.txt 'https://music.163.com/#/my/m/music/cloud'
```

- [ ] **Step 3: Run full unit tests**

Run: `npx vitest run`
Expected: all PASS

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: exit 0

- [ ] **Step 5: Manual dry check (optional, Cookie present)**

In project dir, use a small script or temporary log in adapter — or run:

```bash
npx tsx -e "..." 
```

Prefer: after `pnpm build`, do not download all files; instead call adapter in a one-off:

```bash
node --import tsx -e "
import { readCookie } from './src/auth/cookie.ts'
import { getAdapter } from './src/index.ts'
readCookie('yun.cookie.txt')
const a = getAdapter('https://music.163.com/#/my/m/music/cloud')
const title = await a.getTitle()
const songs = await a.getSongs(999000)
const trial = songs.filter(s => s.isFreeTrial).length
const ok = songs.filter(s => s.url).length
console.log({ title, total: songs.length, ok, trial, noUrl: songs.length - ok })
"
```

Expected: `title: '云盘'`, `ok` close to cloud count, `trial: 0`

- [ ] **Step 6: Commit** — skip unless user asks

---

## Spec coverage check

| Spec item | Task |
|-----------|------|
| Cloud URL entry | 2, 5 |
| CloudAdapter + pagination | 1, 3 |
| `:name` = 云盘 / `-f` template | 2, 3 |
| Playlist/album `pc` metadata | 4 |
| URL retry + download url fallback | 1, 4 |
| Cookie warning / README | 5 |
| No podcast / no `yun cloud` subcommand | Global constraints |

## Placeholder scan

No TBD / “implement later” left in tasks.
