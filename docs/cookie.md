# Cookie / 登录说明

有些歌单（如「我喜欢的音乐」）和「云盘」需要登录。

## 推荐：交互登录

在终端直接运行：

```bash
yun
# 或
node dist/cli.js
```

会依次提示：

1. **下载来源**：多源搜索 / 我的歌单 / 云盘 / 手动输入链接
2. **登录**（仅网易云歌单、云盘、链接）：读取 Cookie 文件 / 扫码登录；已有 `MUSIC_U` 则跳过
3. **下载选项**：车载推荐 / 只要原曲 / 自定义

多源搜索不需要网易云 Cookie。扫码成功后会自动写入 `--cookie` 指定文件（默认 `yun.cookie.txt`）。

### 相关参数

| 参数                 | 说明                                   |
| -------------------- | -------------------------------------- |
| `--cookie`           | Cookie 文件路径，默认 `yun.cookie.txt` |
| `--cookie-mode ask`  | 交互选择（默认，TTY）                  |
| `--cookie-mode file` | 只读文件，不弹菜单（适合脚本）         |
| `--cookie-mode qr`   | 直接扫码                               |

有效登录 Cookie 需包含 `MUSIC_U`。

## 手动导出 Cookie（可选）

### 安装 chrome 插件

EditThisCookie https://chrome.google.com/webstore/detail/editthiscookie/fngmhnnpilhplaeedifhccceomclgfbg

### 设置插件导出格式为: "分号分隔键值对"

### 登录

打开 https://music.163.com/# 并登录

### 导出

用 EditThisCookie 导出，粘贴到 `yun.cookie.txt`。

然后可用：

```bash
yun --cookie-mode file
# 或带链接
yun --cookie-mode file '<playlist-url>'
```
