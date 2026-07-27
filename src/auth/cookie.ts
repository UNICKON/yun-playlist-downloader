import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import logSymbols from 'log-symbols'

export const DEFAULT_COOKIE_FILE = 'yun.cookie.txt'

export let COOKIE_CONTENT: string | undefined = undefined

export function normalizeCookieText(raw: string): string {
  return raw
    .split('\n')
    .filter((line) => {
      if (!line.trim()) return false
      if (line.trimStart().startsWith('//')) return false
      return true
    })
    .join('')
    .trim()
}

export function hasMusicU(cookie: string | undefined): boolean {
  if (!cookie) return false
  return /(?:^|;\s*)MUSIC_U=/.test(cookie)
}

export function setCookieContent(cookie: string | undefined) {
  COOKIE_CONTENT = cookie || undefined
}

export function writeCookie(cookieFile: string, cookie: string) {
  const file = resolve(cookieFile)
  const text = normalizeCookieText(cookie)
  writeFileSync(file, text + '\n', 'utf8')
  COOKIE_CONTENT = text
  console.log(`${logSymbols.success} [cookie] 已写入: %s`, file)
}

export function readCookie(cookieFile: string): string | undefined {
  if (!cookieFile) return

  const file = resolve(cookieFile)
  if (!existsSync(file)) {
    console.log(`${logSymbols.warning} [cookie] cookie 文件不存在: %s`, file)
    return
  }

  console.log(`${logSymbols.info} [cookie] 使用 cookie 文件: %s`, file)
  const text = normalizeCookieText(readFileSync(file, 'utf8'))
  COOKIE_CONTENT = text || undefined
  return COOKIE_CONTENT
}

export function cookieFileExists(cookieFile: string): boolean {
  return Boolean(cookieFile) && existsSync(resolve(cookieFile))
}
