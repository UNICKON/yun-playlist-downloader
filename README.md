# yun-playlist-downloader

网易云音乐 · 歌单 / 专辑 / 电台 / 云盘下载器

本仓库基于 [magicdawn/yun-playlist-downloader](https://github.com/magicdawn/yun-playlist-downloader) 二次开发，fork：[UNICKON/yun-playlist-downloader](https://github.com/UNICKON/yun-playlist-downloader)。

[![Build Status](https://img.shields.io/github/checks-status/magicdawn/yun-playlist-downloader/main?style=flat-square)](https://github.com/magicdawn/yun-playlist-downloader/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/yun-playlist-downloader.svg?style=flat-square)](https://www.npmjs.com/package/yun-playlist-downloader)
[![node version](https://img.shields.io/node/v/yun-playlist-downloader.svg?style=flat-square)](#)
[![license](https://img.shields.io/npm/l/yun-playlist-downloader.svg?style=flat-square)](#)

## 功能对照

### 原仓库已有

| 能力                   | 说明                                       |
| ---------------------- | ------------------------------------------ |
| 歌单 / 专辑 / 电台下载 | 按页面类型自动适配                         |
| 音质选择               | `-q` / `--quality`：128 / 192 / 320 / 999  |
| 超时与重试             | `--retry-timeout`、`--retry-times`         |
| 跳过已下载             | `-s` / `--skip`（按 `content-length`）     |
| 自定义文件名           | `-f` / `--format`                          |
| 进度条                 | `-p` / `--progress`                        |
| Cookie 登录            | `--cookie`（VIP 曲需开通后使用）           |
| 跳过试听               | `--skip-trial`                             |
| 下载封面文件           | `--cover`（原意：把歌单/专辑封面存到目录） |

### 本 fork 新增 / 增强

| 能力            | 说明                                                                                           |
| --------------- | ---------------------------------------------------------------------------------------------- |
| **交互式 CLI**  | 无参数运行：先选下载来源（多源搜索 / 歌单 / 云盘 / 链接），网易云相关再登录                    |
| **扫码登录**    | 终端二维码（网易云 App）；成功后写入 `yun.cookie.txt`（需含 `MUSIC_U`）                        |
| **歌单选择**    | 选「我的歌单」时登录，列出列表后按序号下载                                                     |
| **云盘下载**    | URL 含 `cloud` 时下载「我的云盘」；歌单内云盘曲元数据与链接兜底                                |
| **多源搜索**    | `yun search <关键词>`：QQ / 网易云 / 酷我 / 酷狗 / 汽水（对齐 musicdl 思路，第三方解析拿直链） |
| **旁路歌词**    | `--lyric` → 同名 `.lrc`（UTF-8）                                                               |
| **内嵌歌词**    | `--lyric` 时同时写入 MP3 USLT / M4A ©lyr                                                       |
| **转码**        | `--mp3` / `--aac` / `--transcode`（需 ffmpeg；成功后删原文件）                                 |
| **码率**        | `--bitrate`（mp3 默认 320，aac 默认 256）                                                      |
| **元数据标签**  | 对最终 `.mp3` / `.m4a` 写入 title / artist / album                                             |
| **封面嵌入**    | `--cover` 增强：优先嵌**单曲专辑图**进音频；临时文件嵌入后删除                                 |
| **ffmpeg 探测** | 自动找 PATH / WinGet / `.ffmpeg-path` / `FFMPEG_BIN`，不必手动配 PATH                          |

推荐用法（交互）：

```sh
node dist/cli.js
# 或全局链接后
yun
```

多源搜索（不依赖网易云 Cookie）：

```sh
yun search 林俊杰 --lyric --mp3 --cover --pick 1
yun search 江南 --sources qq,kuwo,kugou --all
```

非交互 / 脚本车载推荐：

```sh
yun --cookie-mode file --lyric --mp3 --cover --cookie yun.cookie.txt '<url>'
```

> 多源搜索依赖各平台第三方/公开解析接口，稳定性不保证；仅供学习与自用，请尊重版权。

## 注意

本项目不支持越权使用，VIP 歌曲请开通 VIP 后结合 Cookie / 扫码登录使用。  
详见 https://github.com/magicdawn/yun-playlist-downloader/issues/54

登录与 Cookie 说明见 [docs/cookie.md](docs/cookie.md)。

## 安装

```sh
# 使用本 fork（推荐从源码）
git clone https://github.com/UNICKON/yun-playlist-downloader.git
cd yun-playlist-downloader
pnpm install
pnpm build
# 交互：node dist/cli.js
# 或: pnpm link --global  后直接 yun

# 原仓库 npm 包（不含本 fork 新增能力）
pnpm add -g yun-playlist-downloader
```

依赖：Node.js ≥ 20。

转码 / 嵌标签 / 嵌封面需要 [ffmpeg](https://ffmpeg.org/)。Windows 可用：

```sh
winget install Gyan.FFmpeg
```

本 fork 会自动探测常见安装位置；也可设置环境变量 `FFMPEG_BIN`，或在项目根写入 `.ffmpeg-path`（一行绝对路径）。

## 使用

```sh
Usage: yun [url] [options]
       yun search [keyword] [options]

位置：
  url  歌单/专辑/电台/云盘 链接，或歌单 ID（可省略，进入交互选择）

交互流程（TTY，yun 无参数）：
  1. 下载来源：多源搜索 / 我的歌单 / 云盘 / 手动输入链接
  2. 仅网易云歌单、云盘、链接需要登录（读 Cookie 或扫码；已有 MUSIC_U 则跳过）
  3. 下载选项：车载推荐 / 只要原曲 / 自定义 / 保持当前

常用选项（原仓库）：
  -c, --concurrency    同时下载数量
  -f, --format         文件名模版
  -q, --quality        音质 128/192/320/999
  -s, --skip           跳过已存在且大小匹配的文件
  -p, --progress       显示进度条
      --cookie         cookie 文件（默认 yun.cookie.txt）
      --retry-timeout  下载超时(分)
      --retry-times    下载重试次数
      --skip-trial     跳过试听歌曲
      --cover          封面（本 fork：嵌入音频标签）

本 fork 新增选项：
      --cookie-mode    ask | file | qr（默认 ask：需要登录时再选；file 只读文件；qr 强制扫码）
      --lyric          旁路 .lrc + 内嵌歌词
      --mp3            转码为 mp3（删原文件）
      --aac            转码为 aac/.m4a（删原文件）
      --transcode      mp3 | aac（与 --mp3/--aac 互斥）
      --bitrate        转码码率 kbps

yun search 额外选项：
      --sources        qq,netease,kuwo,kugou,soda（默认全部）
      --limit          每源条数（默认 5）
      --pick           下载序号，如 1,3 或 1-5
      --all            下载全部结果
```

### 示例

```sh
# —— 交互（推荐）——
yun
node dist/cli.js
yun --cookie-mode qr          # 选网易云歌单/云盘时强制扫码

# —— 多源搜索（不登录）——
yun search 林俊杰 --lyric --mp3 --cover --pick 1
yun search 江南 --sources qq,kuwo,kugou --all

# —— 原仓库用法 ——
yun -c 10 '<playlist-url>'
yun -f ':singer - :songName.:ext' '<url>'
yun --cookie yun.cookie.txt '<url>'

# —— 本 fork（非交互）——
# 云盘
yun --cookie-mode file --cookie yun.cookie.txt 'https://music.163.com/#/my/m/music/cloud'

# 只要歌词
yun --cookie-mode file --lyric --cookie yun.cookie.txt '<url>'

# 车载：MP3 + 同名 .lrc + 内嵌歌词/封面/元数据
yun --cookie-mode file --lyric --mp3 --cover --cookie yun.cookie.txt '<url>'

# AAC
yun --cookie-mode file --lyric --aac --cookie yun.cookie.txt '<url>'
```

## 本 fork 选项说明

### 交互登录与歌单选择

- 先选下载来源；**多源搜索不登录**，网易云歌单 / 云盘 / 链接才需要
- 默认 `--cookie-mode ask`：需要登录时再选「读 Cookie」或「扫码」；内存里已有 `MUSIC_U` 则跳过（`qr` 除外）
- `--cookie-mode qr`：需要登录时直接扫码，不读已有文件
- `--cookie-mode file`：只读 `--cookie` 文件，适合脚本
- 扫码：终端打印二维码（网易云 App），成功后覆盖写入 `--cookie`（默认 `yun.cookie.txt`），并校验 `MUSIC_U`
- 选「我的歌单」会在列出列表前登录，否则拿不到 uid

详见 [docs/cookie.md](docs/cookie.md)。

### `--lyric` 歌词

- 默认关闭
- 旁路：最终音频旁写入同名 `.lrc`（UTF-8）
- 内嵌：对 `.mp3` / `.m4a` 写入歌词标签（部分车机可显示）
- 无歌词时跳过该首，不影响下载

### `--mp3` / `--aac` / `--transcode` 转码

- 默认关闭；三者互斥，只能选一种
- `--mp3` = `--transcode mp3`；`--aac` = `--transcode aac`（输出 `.m4a`）
- 需要本机 `ffmpeg`（自动探测，见上文）
- 转码成功后**删除原文件**，只保留转码结果
- 转码后自动写入 title / artist / album
- `--bitrate` 可选（mp3 默认 320，aac 默认 256）

### `--cover` 封面（相对原仓库的行为变化）

|          | 原仓库                           | 本 fork                                                 |
| -------- | -------------------------------- | ------------------------------------------------------- |
| 行为     | 下载歌单/专辑 `cover.jpg` 到目录 | 嵌入到最终 `.mp3` / `.m4a`                              |
| 图片来源 | 歌单/专辑封面                    | **优先单曲专辑图**（`al.picUrl`），没有才用歌单封面兜底 |
| 文件残留 | 保留 `cover.jpg`                 | 临时文件**嵌入后删除**                                  |

## 原仓库选项说明

### `--retry-timeout` / `--retry-times`

下载超时（分，默认 3）与重试次数（默认 3）。

### `--cookie`

已登录 Cookie 存放路径，见 [docs/cookie.md](docs/cookie.md)。云盘与多数 VIP 曲需要。也可用交互扫码生成。

### `-c, --concurrency`

同时下载数量。

### `-f, --format` 自定义文件名

| token           | 含义                       | 备注   |
| --------------- | -------------------------- | ------ |
| `:type`         | `album` / `playlist` / …   |        |
| `:typeText`     | `专辑` / `列表` / …        |        |
| `:name`         | 专辑名或列表名             |        |
| `:singer`       | 歌手名                     |        |
| `:songName`     | 歌名                       |        |
| `:albumName`    | 所属专辑                   |        |
| `:ext`          | 后缀，如 `mp3`（不带 `.`） |        |
| `:index`        | `01`, `02` …               |        |
| `:rawIndex`     | `0`, `1` …                 |        |
| `:programDate`  | 电台节目日期               | 仅电台 |
| `:programOrder` | 电台第几期                 | 仅电台 |

- 默认：`:name/:singer - :songName.:ext`
- 电台默认：`:name/:programDate 第:programOrder期 - :songName.:ext`

### `-q, --quality`

| 取值            | 含义               |
| --------------- | ------------------ |
| 128 / 192 / 320 | 对应码率           |
| 999             | 尽可能最高（默认） |

### `-s, --skip`

文件已存在且大小与 `content-length` 一致则跳过；默认开启；`--skip false` 关闭。

### `-p, --progress`

默认显示进度条；`--progress false` 关闭。

## `.yunrc`

使用 `rc` 模块读取配置，规则见 https://github.com/dominictarr/rc#standards

本 fork 额外可读键：`lyric`、`transcode`、`bitrate`。

## 截图

![](https://raw.githubusercontent.com/magicdawn/yun-playlist-downloader/main/yun.png)

## 更新记录

- 上游：[CHANGELOG.md](CHANGELOG.md)
- 本 fork：见 GitHub Releases / commit（多源搜索、云盘、歌词、转码、标签、交互登录与歌单选择等）

## License

MIT — 与上游一致 http://magicdawn.mit-license.org
