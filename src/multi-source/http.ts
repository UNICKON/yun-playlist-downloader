import got, { type OptionsOfJSONResponseBody } from 'got'

export const DEFAULT_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36'

export const http = got.extend({
  timeout: { request: 20_000 },
  headers: { 'user-agent': DEFAULT_UA },
  http2: false,
  retry: { limit: 1 },
})

export function getJson<T = unknown>(url: string, options?: OptionsOfJSONResponseBody): Promise<T> {
  return http.get(url, { ...options, responseType: 'json' }).json<T>()
}

export function getText(url: string): Promise<string> {
  return http.get(url).text()
}

export function pickExtFromUrl(url: string, fallback = 'mp3') {
  try {
    const pathname = new URL(url).pathname
    const m = pathname.match(/\.([a-z0-9]{2,5})$/i)
    if (m) return m[1]!.toLowerCase()
  } catch {
    /* ignore */
  }
  if (/\.flac(?:\?|$)/i.test(url)) return 'flac'
  if (/\.m4a(?:\?|$)/i.test(url)) return 'm4a'
  return fallback
}
