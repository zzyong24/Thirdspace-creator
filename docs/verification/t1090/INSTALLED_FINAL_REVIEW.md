# T1090 安装与最终范围独立复核

- 复核时间：2026-10-09（Asia/Shanghai）
- 复核方式：只读提交、构建、安装、公开 Pi、回放与 reconcile 证据；未修改仓库、测试、产品或任务状态，未重新运行业务、数据库、模型、App、构建或测试
- 源提交：`5915784cc691db140177e3520187d2da3182bb51`
- 结论：**T1090 的 SPEC 验收范围已完成；允许在 completion evidence 明确保留既有全局 reconcile 失败后执行 `taskctl complete T-1090`。不能宣称全局 reconcile、live Codex、全原生 UI、激活/配置同步或产品全功能 PASS。**

## 1. 源码冻结与实现 Gate

`source-freeze.json` SHA-256 `5ea28605c6e551846a3c7f2d3ce243da09f827d302fced23f051c70cbe9758ed` 记录 main HEAD `5915784cc691db140177e3520187d2da3182bb51`、工作树 clean、版本 1.2.0。本轮增量包含已审四个产品文件、一个测试及流程证据，没有新增 schema、迁移、Worker 自报字段、权限或 UI 范围。

前置独立 Gate 报告已绑定未变化的五路径 SHA；实际结果为五文件 139 PASS、完整 Worker 两文件 8 PASS、backend/frontend typecheck、boundary、semantic、orphan 全 exit 0。该结论未因打包阶段改变。

打包入口基础回归再次冻结为 4 files / 45 PASS、0 skip、exit 0：`package-basic-freeze.json` SHA-256 `327670461a37f7b8ffb0380c572e7adc1210ebd54c8ddee80762b3bd6e3f238e`，日志 SHA `9a5d1cea23ccc2293098bc4e557ec40e32b7deda47bf251d5249a0bba5cd36de`。

## 2. 本地构建、DMG 与安装

本地打包实际 exit 0、耗时 405.321 秒：

- `package-local-build.json` SHA-256 `d9d8f895290440a187fd1b5e5e54f0dcac6eb50420ae744ac890b54f229700ad`
- 构建日志 SHA-256 `e4636b58272e66465fbb53730b6b209160eabfac6c12d0d961547b19b8e4a23f`

独立复采 `/Users/zyongzhu/Downloads/CreatorOS-1.2.0.dmg` SHA-256 为 `6ccb5876f7ecad44decded655b66c2e46fcdd55f0abfb37fdd75d8cf9d2f11c9`，与 `new-package-verification.json`（SHA-256 `afda973c19aa6ee229ab6db6b32a4c23753869635ec08e5f82a9b2475e6d04ce`）一致。DMG 大小 840,322,404 字节；`hdiutil verify`、只读挂载、构建 App 与 DMG 内四个核心文件逐项同 SHA，以及两处 `codesign --verify --deep --strict` 均 exit 0。包内还记录了冻结历史运行时代码的编译/sidecar chunk 绑定。签名仍是本地 ad-hoc，未公证。

`package-verification.json` SHA-256 `5cb5c1bdd08b661565f2788d5d007a59c74266baa19c593038005284f161c4c4` 实际 exit 0。

安装实际 exit 0：

- `app-installation.json` SHA-256 `2ff1628d21190e18e53234983fa45c3ba38f986ea402db6eb1741ce3638e543b`
- `new-app-installation.json` SHA-256 `215551c03100a2b77daf23e88665b445ce2d39e6af51c87779b6545b42f309db`

原 App 通过 `osascript` 温和退出，确认退出后未执行 `pkill`；没有备份、数据 reset 或强杀。新 App 安装到 `/Applications/CreatorOS.app` 并启动为 PID `36612`。

## 3. 安装启动与警告边界

`installed-startup-run.json` SHA-256 `c30f6a275d356f22278b48e94f2d7eed1e407b103098a63ba967e31d2ac0c55b` 实际 exit 0。`new-startup-verification.json` SHA-256 `a057b5adc800b3cb09cf6f1787e53e287281c1e45d892d145e58c579ca4c0a61` 记录真实 sidecar `http://127.0.0.1:65321/`，观察到 `SIDECAR_STARTUP_VERIFIED`、主导航请求和 `MAIN_PAGE_LOAD_FINISHED`；公开 CLI `status` 与 `access status` 均 exit 0，安装字节与构建包一致。

`startup-warning-comparison.json` SHA-256 `26fcdcd319fe9eb1ea62b2c7cfed59eb6dfaa9ba3ad6a45bf8be68e7c989a40a` 对比 T1089 与本轮两个 immutable 启动前缀，均出现：

- `CHANNEL_RUNTIME_DIGEST_MISMATCH`
- 展示副本同步 HTTP 502
- `config_sync ... status=blocked http_status=502`

该比较只证明警告签名在上一包和本包都存在。本轮真实 HTTP 首页和公开 Pi 任务可运行，但不能据此猜测 502 根因，也不能宣称激活、渠道或配置同步全部成功；没有为验收修改凭据或渠道配置。

## 4. 公开 Pi 只读与同 key 回放

`installed-read-run.json` SHA-256 `684ff38d02f34e6f670b9c3a78b79182444a02f58f2cf146f0e4d50e20208c23` 实际 exit 0、耗时 73.900 秒，日志 SHA `2192b223aaf10923b059207e423ee8509b556e31d73ea3d01760608cfd59d6f3`。

`installed-legacy-verification.json` SHA-256 `cfc60d94c80f24709b728855cdea15e565fe33a4e017c26b584d24b49033c602` 绑定：

- 公开消息真实使用 Pi，不代签 Codex；
- 复用 T1089 中性项目，只新建本次验收 conversation/message/task；
- task `ai-task-af716e53-244`、execution `execution-task-af716e53-245` 最终 `succeeded`；
- 两次模型把 numeric version number 错填到 string `versionId`，均被严格 schema 以 `invalid_input` 拒绝，`retryable=false`、`sideEffect=none`；
- 同一个原任务随后改用公开 `articles.get` / `graphicPosts.get` 读取真实 current version，未创建替代任务；
- 公开调用还实际完成 `projects.outputs.list`，最终如实报告两个空初稿；
- 使用同一 CLI idempotency key 回放返回同 AI task/message，`publicSameKeyReplay=true`；
- 前后业务 DTO 深度相等，未修改文章、图文或项目内容。

`installed-read-tool-crosscheck.json` SHA-256 `c5d2e84e5166a46517ec74e5e52b4606c90903992266a8eb915f404bbdc7e153` 将三个成功 `system.read` 的 parsed DTO 与实际公开 DTO 交叉核对，并完整保留两次 invalid_input。它没有把错误调用改记为成功。

此安装验收证明公开 Pi 主路径和公开 CLI 同 key 幂等回放。后台 completion 私接口的严格回放由真实 service 139 项回归证明；安装验收没有直接伪发 Worker completion，因此不冒称安装版已直接测试私有 completion API。

## 5. Reconcile 与完成裁决

完整 reconcile 已实际结束：

- `reconcile-current.json` SHA-256 `8c3f295331c38c7fedc9e4c7158ce7e63eac3ae2b88f57bd78102b9625766d47`
- exit 1，耗时 1185.104 秒
- 日志 SHA-256 `5a7dc597bbef244902c857fc708f2a8e4fbfe10583fb9d46624d709b7079ea5a`

该日志与 T1089 已保存的 reconcile 日志逐字相同，仍为 42 error / 0 warning，内容是 BACKLOG runaway、旧 review/frontend receipts 和既有 LED 全局欠债。没有新增 T1090 frozen history、五路径测试、类型、Worker、包或安装错误。

按项目收尾规则，reconcile exit 1 不能写成全绿；但当前任务自身 Gate 已全部通过，失败已由前一轮逐字相同证据确认是范围外既有欠债。因此可在 completion evidence 中明确列出 reconcile exit 1、42 errors 与日志 SHA 后执行 `taskctl complete T-1090`。

建议 completion evidence 至少绑定：

1. commit `5915784cc691db140177e3520187d2da3182bb51`；
2. 五文件 139 PASS 与 Worker 8 PASS；
3. DMG SHA `6ccb5876...` 与 package verification；
4. 安装启动 `MAIN_PAGE_LOAD_FINISHED`；
5. 安装公开 Pi task `ai-task-af716e53-244`、同 key 回放和 DTO unchanged；
6. 两次 invalid_input 严格拒绝且同原 task 恢复；
7. reconcile exit 1 / 42 项既有全局欠债和相同日志 SHA。

## 6. 未验范围

本复核不宣称 live Codex、全原生 UI 逐项操作、后台 completion 私接口的安装直调、激活/配置同步、平台登录、401 候选采纳、用户稿件写入、发布、公证或产品全功能通过。T1090 完成只代表冻结聊天历史回放修复、原回归、实际包/安装、公开 Pi 只读与同 key 幂等回放在已确认范围内闭合。
