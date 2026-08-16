# T-853 构建验证：未知色彩视频渲染与稿面真实预览

## 结论

这次两个用户现场问题均已关闭：

- 缺少色彩元数据的普通 H.264/yuv420p 视频，不再进入要求“输入色彩已知”的 `colorspace` 滤镜；执行器只规范像素格式，并在输出编码时写入 BT.709 标签。已知 HDR 仍走原有 HDR→SDR 色调映射，已知 BT.709 仍优先无损 remux。
- FFmpeg 失败不再只保存前 400 字符的版本横幅；现在先脱敏，再同时保留首部与尾部，真正的滤镜、解码或流错误能出现在任务卡里。
- 成片任务创建后 Production 只保持在 `editing`，真正成功并采纳后才相邻推进 `rendering → ready`；失败不会再制造新的永久“渲染中”。
- 稿面“内容弹药”视频卡复用素材中心 `AssetLivePreview` 与正式 `assets.downloadUrl`。双击或键盘确认后才换签名地址，视频有原生播放控制；图片、音频和文档也共享同一路径，删除区域不会误开预览。

```mermaid
flowchart LR
  A["未知色彩 H.264 视频"] --> B["仅规范 yuv420p"] --> C["编码输出写入 BT.709"] --> D["进入整片合成"]
  E["稿面视频素材卡"] -->|"双击 / Enter"| F["assets.downloadUrl"] --> G["素材中心同款播放器"]
```

## 红绿证据

### RED

- `executor.test.ts` 新增真实失败形状：H.264 High、768×1344、24fps、三项色彩均为 `unknown`。旧实现仍拼入 `colorspace=all=bt709`，断言失败。
- 同文件新增长 stderr 首尾断言；旧实现没有媒体错误格式化函数，且只保留横幅。
- `ammo-card-list.test.tsx` 新增视频卡双击与键盘预览；旧弹层只支持图片/文档，没有播放器，也没有在打开后调用正式下载地址。
- `production-workbench.test.tsx` 新增“成功前不得推进 rendering”；旧实现实际写入 `recording → editing → rendering`，红测复现永久状态残留。

### GREEN

- 后端渲染与执行任务：`32 passed`。
- 前端素材预览、文档弹层与制作工作台：`43 passed`。
- 前后端 TypeScript 检查通过；前端改动文件 ESLint `0 error`；Next.js 生产构建成功（仅保留任务前已有的动态文件追踪警告）。

## 随包 FFmpeg 6.0 真实夹具

只读使用用户现场同类源文件 `asset-693b96ef-9803` 的真实字节，在 `/tmp` 生成 1 秒隔离验证片；未修改素材、项目、任务或数据库，也没有重跑当前失败任务。

随包 FFmpeg 6.0 对新分支命令执行成功，随包 ffprobe 回读：

```text
codec_name=h264
pix_fmt=yuv420p
color_space=bt709
color_transfer=bt709
color_primaries=bt709
```

这条验证与用户失败现场使用同一个 FFmpeg 版本、同一种输入元数据；旧滤镜在同一文件上会稳定返回 `Unsupported input primaries 2 (unknown)`。执行器单测再从该预处理分支完整走到模板、合成调用、交付整理与质量门，证明编排链没有被分支修改截断。

## 真实页面旅程

旅程契约：[T853-FRONTEND-JOURNEY.md](T853-FRONTEND-JOURNEY.md)

浏览器在全新隔离数据库中通过正式接口创建账号、项目，上传 209KB 的真实 MP4 字节并挂到项目用料链，然后进入真实稿面：

1. 页面初始显示视频素材卡与“双击预览”，此时没有调用 `assets.downloadUrl`。
2. 双击卡片后只换取一次正式签名地址，弹层显示“视频预览”与可控 `<video>`；浏览器实际发出 Range GET `206`，`readyState > 0`。
3. 关闭弹层、刷新页面并切到 `900×720`，聚焦同一卡片按 Enter，播放器再次可见且弹层没有越出视口。
4. `1536×1024` 与 `900×720` 两档均通过，真实旅程 `1 passed`。

命令：

```bash
CREATOROS_TEST_PORT=3438 CREATOROS_PLAYWRIGHT_BROWSER_CHANNEL=chrome pnpm --dir frontend exec playwright test tests/e2e/draft-ammo-media-preview.spec.ts --project=e2e
```

## 边界与诚实性

- 没有新增服务契约、数据库字段或数据归属；预览复用现有正式读取链。
- 色彩分支只做媒体协议判断，不参与内容或创作语义；`unknown` 明确排除 HDR 后才走无色彩矩阵转换的安全分支。
- macOS 随包 FFmpeg 6.0 已做真实字节验证；Windows 分层运行时解析测试与同一执行器测试继续通过，代码未引入平台路径分支。
- 当前两条历史失败任务和已处于 `rendering` 的旧 Production 均未被重跑、回退或覆盖；修复针对后续任务生效，旧状态保留真实历史。

## 收尾门禁

- 严格前端回执 `PASS:0ea3774828e5`；任务收口时重新执行真实 Chrome 旅程并通过 4 个后置条件。
- `boundary-scan` 无新增物理边界违规；`semantic-boundary-scan` 通过；`orphan-scan` 为 `0 error`；前后端类型检查、Next.js 生产构建与改动行尾检查通过。
- 全局 `reconcile` 仍返回 103 项既有欠债：看板体积超限、旧 SPEC review receipt 过期、旧 frontend receipt 漂移与旧归档表缺验收列。输出中没有 T-853 错误；这些问题在本任务开始前已存在，也不属于本次渲染与素材预览修复范围。
