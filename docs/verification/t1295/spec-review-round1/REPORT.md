# T1295 独立 initial SPEC 审核

结论：未发现阻断性 finding，已交 `round-1.json`（`spec-review-round/v2`、`review_kind: initial`、`findings: []`）。本结论只评价必要性、范围和验收约束，不签实现、TDD、视频运行或桌面 App PASS。Root 负责 reviewctl 登记。

本轮按 product-to-code-orchestrator 3.29.0 路由到 PLAN initial review；项目版本一致。只写本目录，未改生产/测试/控制，未启动服务或模型。具体模型继承父代理，未切换，不猜未暴露的型号。源 HEAD `6ff8b6e317330711e08426b1cbc39aeb243f16c1`；共享 dirty 不冒纯 HEAD，逐文件字节以 SOURCE_BINDING.json 为准。

## 真实事实与边界

- 用户实际报错和 DEC-129501 已被 SPEC 收录。本代理未操作用户 App 重现，原报错属于用户提供证据。
- `frontend/scripts/desktop/desktop-csp.mjs:5` 是正式页面 HTTP CSP 的明确 owner。`desktopReleaseHeaders` 第16行只在 `CREATOROS_DESKTOP=1` 且 `CREATOROS_SIDECAR_SIGNING_REQUIRED=1` 返回头；`frontend/next.config.ts:49` 接入该函数。当前 script-src 只有 self、unsafe-inline 与固定 GSAP 文件，没有专用 WASM 许可。
- `release-clean-boundary.node.test.mjs:22`、`release-hardening.node.test.mjs:29` 都以 `includes('unsafe-eval')` 判禁。`wasm-unsafe-eval` 含该子串，这不是 JavaScript unsafe-eval 已开放的证据；必须解析 script-src 后用带引号的完整 token 比较。保留原 GSAP、inline、frame、worker、object、web/debug 无头、签名、clean cache、防诱饵与冒烟断言。
- `native-editor-loader.ts:3` 从同源 `/reference-editors/opencut-classic/native/native.js` 动态 import；`native-editor-surface.tsx:102–104` 加载后实际 mount。原生源和 public 产物内真实 wasm loader 第447行直接 `WebAssembly.instantiate`，第451行可走 `instantiateStreaming`；原生 bundle 内嵌 WASM 字节。嵌入字节解码后编译仍受脚本策略限制，并不需要为此新增 data: script 来源。
- Tauri `tauri.conf.json:14` 另有静态 CSP。`lib.rs:2346` 初始使用本地 splash，`lib.rs:3314` readiness 后导航到 sidecar HTTP 页面。用户报错中的 self/unsafe-inline/固定 GSAP 精确匹配 Next release CSP，而不是 splash 的 self-only script-src。当前事实支持只改 Next owner；仍需最终核真实 HTTP 响应头，不能假定改配置文件即生效。若运行发现第二条生效策略阻断，应按 SPEC 先追加 owner 范围，不偷改 Tauri 或内核。

```mermaid
flowchart LR
  A[用户打开桌面视频工作区] --> B[sidecar 正式 HTTP 页面 CSP]
  B --> C[同源 native.js 解码并编译真实 WASM]
  C --> D[合法媒体预览]
  D --> E[公开制作任务与导出音画]
  B --> F[eval / Function 仍拒绝]
```

标准核验使用官方 primary 原文：

- [MDN script-src 的 Unsafe WebAssembly execution](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Security-Policy/script-src#unsafe_webassembly_execution)：专用 wasm-unsafe-eval 许可 WASM，unsafe-eval 更宽，覆盖 JavaScript 字符串求值；二者不可混为一个 token。
- [W3C CSP3 §4.5.1](https://www.w3.org/TR/CSP3/#can-compile-wasm-bytes)：WASM 字节编译有独立 CSP 集成；JavaScript 字符串编译沿 §4.4.1 独立约束。
- web 工具返回 HTTP429，未伪装成功；随后经 urllib 直接读取上述官方 URL，取得对应条款内容。没有从第三方资料推导安全结论。实现 Gate 仍必须实际浏览器验证。

## 最小测试建议（本代理 NOT-RUN）

Root 可准入明确新文件 `frontend/scripts/desktop/desktop-csp-wasm.browser.test.mjs`；SPEC 已描述新增 WASM 浏览器验证文件，正式 context/write_set 应登记这个最终精确路径。生产最小改动只在 script-src 加 `'wasm-unsafe-eval'`，其它 directive 字节保持。两个既有 node tests 对 script-src 用 `split(/\s+/)` 做精确 `includes("'wasm-unsafe-eval'")` 和 `!includes("'unsafe-eval'")`；另断言其它 directives 完全相同，避免顺手扩域。

静态回归命令：

```bash
node --test frontend/scripts/desktop/release-clean-boundary.node.test.mjs frontend/scripts/desktop/release-hardening.node.test.mjs
```

浏览器验证应使用真正 HTTP `Content-Security-Policy` 响应头（值直接 import 正式 owner），普通页面脚本执行本目录 `probe-page.html`。不要用 `page.evaluate(() => eval(...))` 证明 JS 被拒：自动化的 CDP 求值通道可能绕过 CSP。可以 evaluate **读取**页面 script 已写入的结果。浏览器脚本需自带唯一 owned 临时目录、127.0.0.1 随机端口、120秒最小执行预算、finally 关闭 browser/server，禁止连用户库。先旧策略记录 WASM 拒绝且 eval/Function 拒绝，再新策略记录 `answer()===42` 且 eval/Function 都是 EvalError；不是仅编译8字节空模块。Worker 如纳入测试，应由页面真实创建已有许可的 same-origin/blob Worker，Worker 内做同样断言，不能只验证字符串 policy。

完整视频复验不能由上述小探针替代：在当前 source 的 owned 公共环境导入新生成的短音画媒体，真实项目/产出 ID 由当前创建响应取得；打开 native 工作区并等待其真实 WASM 初始化、媒体首帧/播放时间变化，截图保存。随后沿 `outputs.production.editor.get → outputs.production.editor.preview → outputs.production.editor.render → ai.tasks.get/execution.tasks.get → execution.tasks.confirm → assets.downloadUrl` 保留同一 task/request 身份，下载并 ffprobe/ffmpeg 解码实际音画；不自动重发未知任务。

可以复用 `docs/verification/t1284/public-legacy-caption/run.mjs` 的媒体链及关闭/音画检查模式、`docs/verification/t1281/public-families/run.mjs` 的输入族，但**不可直接运行旧脚本**：其端口3919、旧 group/output/task IDs、原 receipt 与原样例目录均硬绑定旧 owned 环境。先将同域新 fixture 参数化并绑定本轮 owned 新 ID。T1282 的 `native-protocol/build.mjs` 也硬依赖历史 `/tmp/creatoros-t1274-preview-isolated`，只能参考，不应假定目录存在或重建715源覆盖产品。

`ffprobe -v error -show_streams -show_format -of json <本轮导出.mp4>` 与 `ffmpeg -v error -i <本轮导出.mp4> -f null -` 可复用。对实际 fixture 核视频尺寸/帧率/时长及音轨存在、可解码，必要时对已知合成输入做 PCM/帧对照；不能只凭下载200签制作成功。最终 release 包真实头、安装打开与用户验收另记，原生 App 自动化未授权不执行。

本轮 node测试、浏览器探针、真实原生预览、制作、导出、打包、安装均 **NOT-RUN**。
