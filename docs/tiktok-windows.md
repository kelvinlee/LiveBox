# TikTok 采集（Windows x64）

LiveBox 新增独立 TikTok 页面。默认仍进入抖音页面；抖音的房间获取、登录、签名、消息解码和推送格式保持原样。

## 使用

1. 打开包含 TikTok 组件的 Windows 版本，点击顶部 **TikTok**。
2. 输入 `@用户名` 或 `https://www.tiktok.com/@用户名/live`。暂不支持短链接。
3. 在“设置”中按需填写代理和 Euler Stream API Key；无需代理时留空。
4. 点击“开始采集”。页面显示弹幕、礼物、点赞、在线人数和直播视频。
5. Windows 默认选择带画面的 FLV 线路；可以切换 HLS。线路过期或失败时点击“刷新视频”。视频默认静音，可在播放器内开启声音。
6. 点击“停止采集”或切换平台时，关闭 TikTok 连接和视频转发，取消未完成的推送。

使用者无需安装 Python。实时消息的签名依赖 Euler Stream；视频地址和消息独立获取，一条链路失败时另一条仍可工作。代理只影响 TikTok HTTP、签名、WebSocket 和视频请求，不影响抖音。

## 消息推送

推送可选，地址为设置中的 `推送地址/房间号`。TikTok 页面不会自动启动 Node.js 后台或游戏，请先启动接收服务。页面的消息筛选仅影响展示，不影响采集和推送。

```json
{
  "type": "chat_batch",
  "platform": "tiktok",
  "items": [{
    "id": "9007199254740993",
    "type": "chat",
    "platform": "tiktok",
    "user": {
      "id": "123456789",
      "uniqueId": "viewer",
      "nickName": "观众",
      "avatarThumb": { "urlListList": [] }
    },
    "content": "你好"
  }]
}
```

- 礼物：外层 `gift_batch`；item 包含 `gift: { id, name, diamondCount, icon: { urlListList } }` 和 `repeatCount`。
- 点赞：外层 `like_batch`；item 包含 `like`（本次增量）、`total`（本场累计）。
- 用户、房间、消息及礼物 ID 使用字符串，避免 JavaScript 大整数精度损失。
- 连击礼物只在连击结束时推送一次总数量，并按消息 ID 去重。连接中断前尚未结束的连击可能无法收到最终事件。
- 礼物钻石数是平台数值，不换算现金。
- 每个采集会话独立保存推送目标；停止后清空队列。请求超时不自动重发，避免礼物重复奖励。失败和积压会在页面提示。

## 开发与打包

开发环境需要 Windows x64、Python 3.10+（验证版本 3.12）、Node.js、Rust MSVC 工具链和 Visual Studio C++ 构建工具。

```powershell
npm ci
npm run tiktok:build
npm run tauri:tiktok:dev
```

使用本地 TikTokLive 源码构建组件：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/build-tiktok.ps1 `
  -Python "你的Python路径/python.exe" `
  -TikTokSource "E:\Live-Douyin&Tiktok\TikTokLive"
```

生成安装包：

```powershell
npm run tauri:tiktok:build -- --bundles nsis
```

安装包位于 `src-tauri/target/release/bundle/nsis/`。必须使用 TikTok 配置打包，才能附带 `tiktok-worker` 目录；原有跨平台配置和发布流程保持不变。组件已生成时，开发和应用构建不再需要 Python。`tiktok-worker` 内文件必须随主程序一同保留。

Python 依赖版本固定在 `tiktok/requirements.lock.txt`，构建脚本运行离线测试、导出依赖许可证，并验证打包后程序的真实启动和停止。API Key 和带认证信息的代理不会写入本地设置。

## 验证

```powershell
.venv-tiktok/Scripts/python.exe -m unittest discover -s tiktok/tests -v
node --test tiktok/tests/forwarder.test.mjs
.venv-tiktok/Scripts/python.exe tiktok/tests/check_worker.py src-tauri/tiktok-worker/livebox-tiktok.exe
.venv-tiktok/Scripts/python.exe tiktok/tests/probe_live.py @用户名 --worker src-tauri/tiktok-worker/livebox-tiktok.exe
```

最后一个命令会访问公开直播间，仅输出状态和事件数量，不输出评论内容、签名地址或密钥。

## 实现边界

Vue 页面负责播放和展示；Rust 启停独立采集进程，通过标准输入输出传输 JSON，并用会话 ID 隔离旧消息。Python 调用 TikTokLive，通过仅绑定 `127.0.0.1`、带随机访问令牌的视频转发器处理 CDN 请求头、跨域和 HLS 分片。退出 LiveBox 时关闭采集进程，父进程异常结束导致输入管道关闭时组件也会退出。

视频能否解码取决于直播实际编码和 WebView2 支持；HLS/CDN 线路可能暂时不可达。TikTokLive 属于非官方接口，平台协议和签名服务变化可能需要更新组件。

TikTokLive 7.0.1 使用带附加条款的 AGPL 许可证，原文及依赖许可证随组件放在 `tiktok-worker/licenses/`。上游：[TikTokLive](https://github.com/isaackogan/TikTokLive)、[签名服务说明](https://ttl.docs.isaackogan.com/configuration/signing/)。

## 本次验证记录（2026-11-05）

- 10 项 Python 离线测试、2 项真实本机 HTTP 推送测试通过。
- Vue 类型检查、前端构建、Rust 编译及 Windows NSIS 安装包构建通过。
- 打包后的独立组件已验证启动、UTF-8 通信和正常退出；应用资源目录的组件与构建输出哈希一致。
- 使用 `@loeya`、无代理实测：一次 25 秒采集收到 7 条弹幕、5 条点赞事件、1 条礼物事件，读取到视频数据，退出码为 0。事件数量随直播活动变化。
- 在最终 Windows 程序内确认 HD FLV 画面实际播放，主播资料和实时消息正常显示；停止及切回抖音后无 TikTok 残留进程。
- 抖音页面和原有设置保留；本次未启动原有抖音直播采集及关联游戏进行联网回归。抖音采集、签名、登录、解码和推送逻辑未修改，仅增加平台切换所需的停止入口及断开连接时的心跳清理。
