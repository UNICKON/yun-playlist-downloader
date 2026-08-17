import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import Api from 'NeteaseCloudMusicApi'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { setCookieContent } from '../../src/auth/cookie.ts'
import { promptSelect } from '../../src/auth/prompt.ts'
import { selectDownloadUrl } from '../../src/auth/wizard.ts'

vi.mock('NeteaseCloudMusicApi', () => ({
  default: {
    login_status: vi.fn(),
    user_playlist: vi.fn(),
  },
}))

vi.mock('../../src/auth/prompt.ts', () => ({
  isInteractive: () => true,
  promptSelect: vi.fn(),
  promptLine: vi.fn(),
  promptYesNo: vi.fn(),
}))

describe('selectDownloadUrl 我的歌单', () => {
  let dir: string
  let cookieFile: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'yun-auth-'))
    cookieFile = join(dir, 'yun.cookie.txt')
    writeFileSync(cookieFile, 'MUSIC_U=test_token; os=pc\n', 'utf8')
    setCookieContent(undefined)

    vi.mocked(Api.login_status).mockImplementation((opts: any) => {
      if (!opts?.cookie || !String(opts.cookie).includes('MUSIC_U')) {
        return { body: { data: { profile: null } } }
      }
      return { body: { data: { profile: { userId: 99, nickname: 'tester' } } } }
    })
    vi.mocked(Api.user_playlist).mockResolvedValue({
      body: { playlist: [{ id: 7392714527, name: '喜欢的音乐', trackCount: 10 }] },
    } as any)

    let sourceAsked = 0
    vi.mocked(promptSelect).mockImplementation((title: string) => {
      if (title === '下载来源') {
        sourceAsked++
        if (sourceAsked > 1) {
          throw new Error('无法获取当前用户信息，请确认已登录')
        }
        return 'playlist'
      }
      if (title === '选择要下载的歌单') return 7392714527
      throw new Error(`未预期的菜单: ${title}`)
    })
  })

  afterEach(() => {
    setCookieContent(undefined)
    rmSync(dir, { recursive: true, force: true })
  })

  it('选我的歌单前会读取 Cookie，否则会提示未登录', async () => {
    const url = await selectDownloadUrl(undefined, { cookieFile, cookieMode: 'file' })
    expect(url).toBe('https://music.163.com/#/playlist?id=7392714527')
  })
})
