import logSymbols from 'log-symbols'
import { COOKIE_CONTENT, cookieFileExists, hasMusicU, readCookie, writeCookie } from './cookie'
import { isInteractive, promptSelect } from './prompt'
import { qrLogin } from './qr-login'

export type CookieMode = 'ask' | 'file' | 'qr'

/**
 * 确保有可用登录 Cookie：交互选读文件 / 扫码，或按 cookieMode 强制。
 */
export async function ensureAuth(cookieFile: string, cookieMode: CookieMode = 'ask'): Promise<void> {
  const interactive = isInteractive()

  if (cookieMode === 'file' || (!interactive && cookieMode === 'ask')) {
    readCookie(cookieFile)
    if (!hasMusicU(COOKIE_CONTENT)) {
      console.log(
        `${logSymbols.warning} [cookie] 未检测到 MUSIC_U，登录可能无效。可用交互模式扫码，或见 docs/cookie.md`,
      )
    }
    return
  }

  if (cookieMode === 'qr') {
    const cookie = await qrLogin()
    writeCookie(cookieFile, cookie)
    return
  }

  // ask + TTY
  while (true) {
    const exists = cookieFileExists(cookieFile)
    const choice = await promptSelect('登录方式', [
      {
        label: exists ? `读取 Cookie 文件 (${cookieFile})` : `读取 Cookie 文件 (${cookieFile}，当前不存在)`,
        value: 'file' as const,
      },
      { label: '扫码登录（网易云 App）', value: 'qr' as const },
    ])

    if (choice === 'file') {
      readCookie(cookieFile)
      if (hasMusicU(COOKIE_CONTENT)) {
        console.log(`${logSymbols.success} [cookie] 已登录 (含 MUSIC_U)`)
        return
      }
      console.log(`${logSymbols.warning} Cookie 无效或缺少 MUSIC_U，请重新选择`)
      continue
    }

    try {
      const cookie = await qrLogin()
      writeCookie(cookieFile, cookie)
      return
    } catch (e: any) {
      console.log(`${logSymbols.error} ${e?.message || e}`)
      console.log(`${logSymbols.info} 请重新选择登录方式`)
    }
  }
}
