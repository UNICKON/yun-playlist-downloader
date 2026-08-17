# 2026-07-29 多源搜索下载设计（已实现一期）

## 目标

在本仓库 Node fork 中，按 musicdl 思路增加多音源搜索 + 第三方解析直链，并复用现有歌词 / 封面嵌入 / 元数据后处理。

## 音源（一期）

| id      | 说明                           | 实现参考                   |
| ------- | ------------------------------ | -------------------------- |
| qq      | tang.api.s01s.cn               | musicdl qq.py              |
| netease | api.qijieya.cn/meting          | Meting / MusicSquare       |
| kuwo    | kw-api.cenguigui.cn            | MusicSquare / musicdl 思路 |
| kugou   | songsearch + haitang/coco/baka | musicdl kugou.py           |
| soda    | api.qishui.com + qiuyu520      | musicdl soda.py            |

## CLI

- `yun search <关键词> [--sources] [--pick|--all] [--lyric|--cover|--mp3]`
- 交互菜单增加「多源搜索」

## 二期（未做）

- 各平台歌单 / 专辑 URL 解析
- 汽水官方 VIP Cookie 路径
- Provider 配置文件热替换 endpoint
