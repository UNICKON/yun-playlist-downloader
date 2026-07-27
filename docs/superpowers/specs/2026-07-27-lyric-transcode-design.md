# 歌词旁路 + 可选转码（MP3/AAC）

日期：2026-07-27  
状态：待确认后实现

## 目标

1. 下载音频后可选保存同名 `.lrc`（车载友好）  
2. 可选把非目标格式转成 **MP3** 或 **AAC**，**只保留转码结果**（删除原文件），并保证 `.lrc` 与最终音频同名  

## CLI

| 选项 | 默认 | 含义 |
|------|------|------|
| `--lyric` / `--no-lyric` | `false` | 下载后拉取歌词，写旁路 `.lrc` |
| `--transcode <fmt>` | 关闭 | `mp3` \| `aac`；已是目标格式则跳过转码 |
| `--mp3` | — | 等价 `--transcode mp3`（快捷） |
| `--aac` | — | 等价 `--transcode aac`（快捷） |
| `--bitrate` | `320`（mp3）/ `256`（aac） | 转码音频码率 kbps |

约束：`--mp3` 与 `--aac` / `--transcode` 互斥；同时指定报错退出。

示例：

```bash
# 只要歌词
yun --lyric --cookie yun.cookie.txt '<url>'

# 车载：转 MP3 + 歌词（删掉 flac 等原文件）
yun --lyric --mp3 --cookie yun.cookie.txt '<url>'

# 转 AAC + 歌词
yun --lyric --aac --cookie yun.cookie.txt '<url>'
```

`.yunrc` 可写：`lyric`, `transcode`, `bitrate`。

## 行为

### 歌词

1. 用歌曲 `id` 调 `NeteaseCloudMusicApi` 的 `lyric`（`/api/song/lyric`）  
2. 优先 `lrc.lyric`；无则跳过并 warning，不失败整首  
3. 写入与**最终音频**同 basename 的 `.lrc`（UTF-8）  
4. 顺序：先下音频 →（可选）转码并删原文件 →（可选）写 `.lrc`（按最终路径）  
5. `--skip`：若最终音频被 skip，仍可补写缺失的 `.lrc`  

云盘曲：用 `songId` / `simpleSong.id`；无歌词 API 数据则跳过。

### 转码

1. 依赖本机 **ffmpeg**（PATH 可调用）；缺失且启用转码时明确报错  
2. 输出：同目录、同主文件名，扩展名 `.mp3` 或 `.m4a`（AAC 容器用 m4a，车载更常见）  
3. 成功后 **删除原音频**；已是目标类型则不转、不删  
4. 不写 ID3 内嵌歌词（本轮只要旁路 LRC，YAGNI）

ffmpeg 示例意图：

- mp3: `ffmpeg -y -i in -codec:a libmp3lame -b:a 320k out.mp3`  
- aac: `ffmpeg -y -i in -codec:a aac -b:a 256k out.m4a`

## 代码改动（预估）

| 文件 | 内容 |
|------|------|
| `src/api/index.ts` | `songLyric(id)` |
| `src/lyric.ts` | 取 LRC 文本、写文件 |
| `src/transcode.ts` | 检测 ffmpeg、执行转码、删源 |
| `src/index.ts` / download 路径 | 下载后钩子：transcode → lyric |
| `src/cli.ts` | 新选项、互斥校验、帮助 |
| `README.md` | 说明与车载用法 |
| `test/` | lyric 写入、transcode 参数与互斥（mock ffmpeg） |

## 非目标（本轮不做）

- 内嵌歌词到 ID3/Vorbis  
- 翻译歌词 / 逐字歌词单独文件  
- 内置 ffmpeg 二进制  
- 批量事后「只转已有文件」子命令  

## 验收

1. `--lyric`：有歌词曲生成同名 `.lrc`；无歌词不崩  
2. `--mp3`：flac → mp3，源 flac 删除，`.lrc` 对齐 `.mp3`  
3. `--aac`：→ `.m4a`，源删除，`.lrc` 对齐  
4. 未装 ffmpeg 时启用转码 → 清晰错误  
5. 默认不加这些选项时行为与现在一致  
