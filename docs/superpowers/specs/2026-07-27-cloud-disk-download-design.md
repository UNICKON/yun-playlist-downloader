# 网易云盘下载支持

日期：2026-07-27  
状态：待用户确认后实现

## 背景

`yun-playlist-downloader` 当前支持歌单 / 专辑 / 电台（`djradio`），不支持「我的音乐 - 云盘」。  
用户需要：

1. 通过 URL 下载整个云盘  
2. 歌单 / 专辑中混入的云盘歌曲也能下到完整文件  

已用登录 Cookie 验证：

- `POST /api/v1/cloud/get` 可分页列出云盘（样例约 130 首）  
- 云盘 `songId` 经 `song/enhance/player/url` 可拿到完整 FLAC 链（`freeTrialInfo: null`）  
- 歌单内云盘曲带 `pc` 对象与 privilege `cs: true`；在 Cookie + 分批请求下通常可出链，但元数据可能为空，且偶发无 `url`，需要兜底  

## 目标

| 场景 | 用法 | 结果 |
|------|------|------|
| 整盘云盘 | `yun --cookie yun.cookie.txt 'https://music.163.com/#/my/m/music/cloud'` | 下载云盘全部曲目 |
| 歌单含云盘曲 | 现有 `yun <playlist-url>` | 云盘曲与普通曲一样进入下载队列（有链则下） |

非目标（本轮不做）：播客扩展、云盘上传、按文件名筛选、独立 `yun cloud` 子命令。

## 决策摘要

- 入口：特殊 URL（路径含 `cloud`），保持 `yun <url>`  
- 文件名：完全走现有 `-f` 模板；云盘页 `:name` = `云盘`  
- Cookie：云盘与歌单内云盘曲均依赖已登录 Cookie；未登录则提示并基本无法取链  

## 设计

### 1. URL 路由

在 `src/index.ts` 的 `adapterList` 增加：

```ts
{ type: 'cloud', typeText: '云盘', adapter: CloudAdapter }
```

`getType(url)`：URL 包含 `cloud`（例如 `#/my/m/music/cloud`）时选用 `CloudAdapter`。  
注意：`cloud` 匹配应优先于误伤其他类型；当前仅 `playlist|album|djradio`，新增 `cloud` 即可。

`CloudAdapter` 的 `id`：云盘无资源 id。`BaseAdapter` 现要求从 URL 取 `id`——云盘适配器需放宽：

- 方案：`CloudAdapter` 仍继承 `BaseAdapter`，构造时若无 `id` 则设 `id = 'cloud'`（或 override 不调用 `getId`）。推荐构造函数内 `this.id = getId(url) || 'cloud'`，并避免对云盘调用依赖数字 id 的接口。

### 2. API 层（`src/api/index.ts`）

新增：

```ts
userCloudPage({ limit, offset }) // -> Api.user_cloud
userCloudAll()                  // 分页直到 !hasMore，合并 data
songDownloadUrl(id, quality?)   // 可选兜底：enhance/download/url（上游若有则封装）
```

分页建议 `limit = 50` 或 `100`，带 Cookie（现有 `getApiBaseConfig`）。

云盘条目关键字段（实测）：`songId`, `songName`, `artist`, `album`, `fileName`, `fileSize`, `bitrate`, `simpleSong`。

### 3. `CloudAdapter`（`src/adapter/cloud.ts`）

| 方法 | 行为 |
|------|------|
| `getTitle()` | 返回 `'云盘'` |
| `getCover()` | 返回 `undefined`（CLI 已有无封面分支） |
| `getSongs(quality)` | `userCloudAll()` → 映射为带 `id` 的 songData（优先 `simpleSong`，否则用 songName/artist/album 拼）→ 复用 `filterSongs` + `getSongsFromData` |

映射时保证 `filterSongs` 能读到 `id`（= `songId`）。

### 4. 歌单 / 专辑内云盘曲（`src/adapter/base.ts`）

#### 4.1 元数据兜底（`getSongsFromData`）

```
singer: ar.0.name || artists.0.name || pc.ar || ''
songName: name || pc.sn || ''
albumName: al.name || pc.alb || ''
```

`ext` 仍从播放 URL pathname 解析；若无 URL 则保持空。

#### 4.2 链接兜底（`filterSongs`）

流程：

1. 现有：批量 `songUrl(ids, quality)`  
2. 收集无 `url` 的条目  
3. 对无 url 的 id **再请求一轮** `songUrl`（小批量，避免超大包丢失）  
4. 仍无 url 且带云盘标记（`pc` 存在或 privilege/`cs`，若 songData 上可取）时，尝试 `songDownloadUrl`  
5. 写回 `playUrlInfo`；仍无 url 的进入 `removed`（版权/无权）

日志：CLI 已打印「版权受限」列表；云盘兜底成功的歌曲不应出现在该列表。

### 5. CLI（`src/cli.ts`）

- URL zod：继续允许 `z.url()`；云盘链接本身是合法 URL，无需改校验  
- 帮助 / example 增加一行云盘示例  
- 若 `getType` 为 cloud 且未读到 Cookie，可 warning：`云盘需要登录 Cookie`（不强制 exit，与现有 cookie 缺失行为一致）

### 6. 文档

- `README.md`：特性勾选「云盘」；示例 `yun --cookie yun.cookie.txt 'https://music.163.com/#/my/m/music/cloud'`  
- `docs/cookie.md`：可补一句「下载云盘必须提供 cookie」

## 测试计划

1. **单元 / 轻量**：`getType` 对 cloud URL 返回 cloud；文件名 token `:name` → `云盘`  
2. **集成（需 Cookie）**：  
   - dry 统计：云盘页曲目数与 `user_cloud` count 一致  
   - 歌单 `23` 中已知云盘曲（如陈升《风筝》等，`pc`/`cs`）在 cookie 下应有 url、非试听  
3. **回归**：普通歌单下载流程不变  

## 风险

| 风险 | 缓解 |
|------|------|
| 无 Cookie 云盘为空 | README + CLI warning |
| 超大云盘分页慢 | 合理 limit；复用现有并发下载 |
| `song_url` 对部分云盘曲偶发失败 | 二次请求 + download url 兜底 |
| `BaseAdapter` 构造强依赖 id | CloudAdapter 使用占位 id |

## 实现顺序

1. API：`userCloudAll`（+ download url 兜底）  
2. `CloudAdapter` + 路由注册  
3. `base.ts` 元数据与 URL 兜底  
4. CLI 示例 / README  
5. 用当前 Cookie 对云盘页做一次「只统计不下」的验证脚本或临时运行  
