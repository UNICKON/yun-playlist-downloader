import Api from 'NeteaseCloudMusicApi'
import { COOKIE_CONTENT } from '$auth/cookie'

export type UserPlaylistItem = {
  id: number
  name: string
  trackCount: number
  creator?: { userId?: number; nickname?: string }
}

function getApiBaseConfig() {
  return { cookie: COOKIE_CONTENT }
}

export async function getLoginUserId(): Promise<{ uid: number; nickname?: string }> {
  const res = await Api.login_status({ ...getApiBaseConfig() })
  const data = (res.body as { data?: any }).data ?? res.body
  const profile = data?.profile || data?.data?.profile
  const account = data?.account || data?.data?.account
  const uid = Number(profile?.userId ?? account?.id)
  if (!Number.isFinite(uid) || uid <= 0) {
    throw new Error('无法获取当前用户信息，请确认已登录')
  }
  return { uid, nickname: profile?.nickname }
}

export async function listUserPlaylists(uid: number): Promise<UserPlaylistItem[]> {
  const all: UserPlaylistItem[] = []
  let offset = 0
  const limit = 50
  while (true) {
    const res = await Api.user_playlist({
      ...getApiBaseConfig(),
      uid,
      limit,
      offset,
    })
    const list = ((res.body as { playlist?: UserPlaylistItem[] }).playlist || []) as UserPlaylistItem[]
    all.push(...list)
    if (list.length < limit) break
    offset += limit
  }
  return all
}
