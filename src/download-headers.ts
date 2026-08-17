import type { Song } from '$define'

/** 部分 CDN（汽水 douyinvod 等）无 Referer 会直接断连 */
export function buildDownloadRequestOptions(url: string, song: Song) {
  const source = (song.raw as { source?: string } | undefined)?.source
  const headers: Record<string, string> = {
    'user-agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36',
  }
  if (source === 'soda' || /douyinvod\.com|douyin\.com|qishui/i.test(url)) {
    headers.referer = 'https://www.douyin.com/'
    headers.origin = 'https://www.douyin.com'
  }
  if (source === 'qq' || /qqmusic\.qq\.com|gtimg\.cn/i.test(url)) {
    headers.referer = 'https://y.qq.com/'
  }
  if (source === 'kugou' || /kugou\.com/i.test(url)) {
    headers.referer = 'https://www.kugou.com/'
  }
  if (source === 'kuwo' || /kuwo\.cn/i.test(url)) {
    headers.referer = 'https://www.kuwo.cn/'
  }
  return { headers }
}
