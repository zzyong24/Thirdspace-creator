# GATE T-632 — BUILD

## 结论

源码修复通过，真机安装包验收待下一次本地打包后执行。

- “新建定位母版”使用产品内确认框；确认后调用既有
  `positioning.master.reset`，清空当前画像、定位规则与当前定位，停留在定位中心显示
  空白母版，不再跳转 Copilot。
- 内容雷达逐字稿继续读取 `transcribe.audio`。本机数据库只读证据确认本次实际使用
  `siliconflow / FunAudioLLM/SenseVoiceSmall`，不是本地 Whisper。
- 修复 iesdouyin 错误分类顺序：`item_list 为空` 的完整文案同时包含
  `_ROUTER_DATA`，旧逻辑先命中后者，错误触发共享通道 2 分钟指数冷却，阻塞随后到来的
  用户手动逐字稿任务。现在先识别内容错误，不再污染通道冷却。
- 逐字稿新增 `resolve-source / extract-audio / resolve-model / asr` 四段结构化耗时日志，
  后续可直接定位慢在取流、抽音、模型解析还是 ASR。

## 真实证据

- 2026-07-30 本机任务：
  - 入队：`2026-07-30T16:05:00.064Z`
  - 完成：`2026-07-30T16:08:15.169Z`
  - 总耗时：195 秒
  - 终态：`succeeded`
  - provider/model：`siliconflow / FunAudioLLM/SenseVoiceSmall`
- 同期加密日志显示后台封面回填连续遇到 `item_list 为空`，并与手动转写共享
  iesdouyin 请求网关，和错误冷却链吻合。

## TDD 与静态校验

- 红测：
  - 定位重置仍跳 Copilot，测试失败。
  - `item_list 为空` 被上报为 `throttled`，测试失败。
- 绿测：
  - 定位交互 + 抖音限流集成：2 files / 27 tests PASS。
  - Frontend TypeScript：PASS。
  - 相关 ESLint：0 errors；4 条既有未使用参数 warning。
  - `git diff --check`：PASS。
  - `reconcile`：0 error / 0 warning。

## 尚未冒充的证据

当前运行的 CreatorOS 仍是改动前安装包，源码不会热更新。没有补拍“新包真实桌面点击”
证据，因此 T-632 保持进行中；下次本地打包后需要在真实桌面完成两条验收：

1. 定位中心点击“新建定位母版”可见确认框，确认后页面为空白母版且不打开 Copilot。
2. 内容雷达手动提取逐字稿时，日志出现四段耗时；不可用作品不再让后续任务额外等待
   2 分钟冷却。

## 2026-07-30 本地新包验证

- 基于功能提交 `9f13f001` 完成 `pnpm desktop:package`，版本
  `0.2.1-beta.3`；本地包使用 ad-hoc 签名，不冒充 Developer ID 签名或苹果公证。
- `.app` 与 `.dmg` 均通过 `codesign --verify --strict`，DMG 通过
  `hdiutil verify`；DMG SHA-256：
  `eceb9a24e1f819f0b28efe75b12a90eece4e0ecb945cb1f8565d1c2b58b7709b`。
- 新包已安装到 `/Applications/CreatorOS.app` 并真实启动。加密日志显示
  `SIDECAR_STARTUP_VERIFIED`，Next 服务监听随机端口 `57424`；定位中心真实页面返回
  200，主窗口尺寸为 1296×811，页面正常渲染。
- 相关定向回归：frontend 6 files / 146 tests PASS；backend 2 files /
  18 tests PASS；`reconcile` 为 0 error / 0 warning。
- 本机工作区此前已按用户要求清空，当前没有绑定抖音号，故定位中心停在账号绑定引导页。
  这不足以补拍“确认重置母版”与“真实作品逐字稿四段耗时”的交互证据，T-632 继续保持
  进行中，等待用户在新包内完成账号绑定后的真机验收。
