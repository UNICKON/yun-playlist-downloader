import { delay } from 'es-toolkit'
import logSymbols from 'log-symbols'
import Api from 'NeteaseCloudMusicApi'
import QRCode from 'qrcode'

const POLL_INTERVAL_MS = 2000
const MAX_WAIT_MS = 2 * 60 * 1000

type QrCheckBody = {
  code?: number
  message?: string
  cookie?: string
}

/**
 * 网易云扫码登录，成功返回 cookie 字符串（含 MUSIC_U）
 */
export async function qrLogin(): Promise<string> {
  const keyRes = await Api.login_qr_key({})
  const unikey = (keyRes.body as { data?: { unikey?: string } }).data?.unikey
  if (!unikey) {
    throw new Error('获取二维码 key 失败')
  }

  const createRes = await Api.login_qr_create({ key: unikey, qrimg: false })
  const qrurl = (createRes.body as { data?: { qrurl?: string } }).data?.qrurl
  if (!qrurl) {
    throw new Error('生成二维码 URL 失败')
  }

  console.log(`\n${logSymbols.info} 请使用网易云 App 扫码登录`)
  console.log(`${logSymbols.info} 或打开: ${qrurl}\n`)
  const ascii = await QRCode.toString(qrurl, { type: 'terminal', small: true })
  console.log(ascii)

  const started = Date.now()
  while (Date.now() - started < MAX_WAIT_MS) {
    await delay(POLL_INTERVAL_MS)
    const checkRes = await Api.login_qr_check({ key: unikey })
    const body = checkRes.body as QrCheckBody
    const code = body.code

    // 800 过期 / 801 等待扫码 / 802 待确认 / 803 成功
    if (code === 801) {
      process.stdout.write('.')
      continue
    }
    if (code === 802) {
      process.stdout.write('\n' + logSymbols.info + ' 已扫码，请在手机上确认...\n')
      continue
    }
    if (code === 800) {
      throw new Error('二维码已过期，请重试')
    }
    if (code === 803) {
      const cookieFromBody = typeof body.cookie === 'string' ? body.cookie : ''
      const cookieFromRes = Array.isArray(checkRes.cookie) ? checkRes.cookie.join(';') : ''
      const cookie = cookieFromBody || cookieFromRes
      if (!cookie || !/MUSIC_U=/.test(cookie)) {
        throw new Error('扫码成功但未拿到 MUSIC_U，请重试')
      }
      console.log(`\n${logSymbols.success} 扫码登录成功`)
      return cookie
    }

    if (body.message) {
      console.log(`\n${logSymbols.warning} ${body.message}`)
    }
  }

  throw new Error('扫码超时（2 分钟），请重试')
}
