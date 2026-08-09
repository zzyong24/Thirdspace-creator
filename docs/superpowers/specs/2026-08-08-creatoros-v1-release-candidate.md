# CreatorOS V1.0 发布候选收口 SPEC

> 任务：T-728
> 状态：用户已确认候选收口范围；正式发布确认点尚未通过
> 阶段：`5-ship`
> 项目规模：M/L，真实用户、本地数据、桌面双平台、Growth/Activity 外部契约

## 1. 目标

把 2026-08-08 的 CreatorOS 历史 working-tree 快照收口为一个可审计、可真实联调、可合并推送的
V1.0 候选。候选必须包含快照内已经获得用户确认的产品改动和本轮发现的发布阻断修复，但不能把
所有开放需求偷偷并入 V1.0，也不能为了看起来干净而丢弃、覆盖或重写历史改动。

本任务的完成含义是：候选代码、版本、发布配置、验证证据和风险边界已经收敛，候选已安全进入
`main` 并推送。它不等于已经正式发布。

## 2. 已确认事实

- 初始历史基线由原主仓 working tree 创建独立 worktree；不得在原脏 checkout 上做破坏性整理。
- 已提交链必须保留 T-727 的 `ce2c308b` 与 `2cb4a08c`，不得回退到旧的 `489b256e` 发布。
- Growth 生产暗发布 SHA 为 `5ec1f3cf149aac9963bb2b6b732102ca66cc3ab1`，schema 为
  `0056_t142_ai_credit_grant`；发布证据提交为 `32cf6c3e3a461f896e22b31e61bc02c3e3f387d3`。
- Activity 已部署 `d426c6106f4b787c9344613d321cae0b38d73177`。
- CreatorOS 只把 server-only `machineId` 提交到 Activity 的 `config-access-ticket-v3`；不决定套餐、
  金额或首赠规则。
- `channel_plan` 首次受管凭证创建由 Growth 赠 `5 CNY / 250,000 units`；
  `shared_test_machine` 必须在 provider 和数据库动作前失败关闭。
- T-679 使用同一最新 Activity ticket 获取 Growth 签名 bundle 与
  `/managed-credentials/current`；长期 Key 只进入系统密钥库，ASR 使用短时 lease。
- T-715 只向用户显示 Growth 额度入口：首次连接走 `/credits/connect#code`，已绑定走
  `/credits/launch#code`；一次性 code 不得重放。

## 3. 冻结范围

### 3.1 历史改动保全与逻辑提交

1. 对 staged、unstaged、untracked 分别列清单，保存可恢复 diff/归档及 SHA-256。
2. 对所有候选文件做秘密扫描；私钥、票据、激活码、长期 Key、真实一次性 code 不得入库。
3. 按既有任务或明确主题形成逻辑提交。共享文件按真实归属拆分；无法安全拆分的组合提交必须列出
   组成任务和理由。
4. 临时渲染图、探针缓存、`tmp/` 中间文件不进入产品提交；先保全，再从候选范围排除。
5. 不删除原主仓 working tree，不使用 `reset --hard`、强制 checkout 或 force-push。

### 3.2 受管模型、ASR 与额度入口

1. 正式收口 `config-access-ticket-v3`，禁止候选继续请求 v2。
2. `machineId`、ticket、code、Key 不得进入 Web bundle、query、Growth 自报字段、普通缓存或日志。
3. bundle 验签、`managed-credentials/current`、系统密钥库持久化和 ASR lease 按既有契约闭合。
4. 设置与额度不足页面只给 Growth 用户端额度入口，不显示 provider、Base URL、serviceId 或 Key。
5. 聚焦契约、安全、重放与失败关闭测试必须通过。

### 3.3 V1.0 版本与桌面发布链

1. `frontend/package.json`、`frontend/src-tauri/tauri.conf.json`、
   `frontend/src-tauri/Cargo.toml` 统一为 `1.0.0`，并同步 `Cargo.lock`、release notes、manifest 和更新
   口径；不得只改单一字段。
2. macOS 正式 workflow 必须强制 Developer ID 签名、公证、staple、Gatekeeper、DMG 内层 App
   严格验签和安装后真启动；缺凭据或任一门失败时不得上传正式产物。
3. T-705 真启动门必须等待 sidecar health、可信握手与 WebView 主页面完成，不能只看进程存在。
4. Growth 配置验签环境必须来自 server-only release 输入，并保持 fail-closed。
5. Windows 若没有 Authenticode/Azure Trusted Signing 真实证据，只能列为 High 风险发布边界；不得
   宣称双平台正式就绪。

### 3.4 验证与合并

1. 运行任务聚焦测试、typecheck、完整测试、生产构建、boundary、semantic boundary、orphan、
   review、consistency、reconcile 和 prelaunch engineering audit。
2. 真实证据写入 Gate/`RELEASE_REVIEW.md`；未发生的真机、签名、公证或跨仓回执必须写
   `未验证`，不得补拍为 PASS。
3. 合并前 fetch 并比较 `origin/main`；使用正常 merge/rebase/cherry-pick 等非破坏方式整合，不得
   force-push。
4. 候选门通过后合并到 `main` 并推送 GitHub；最终报告必须给出 main SHA、候选 SHA、测试结果、
   未关闭风险、平台边界与 J-142 状态。

## 4. 明确不在本任务内

- 不要求清空 BACKLOG 中所有开放产品需求。未进入快照或不能在本轮闭合的需求继续保留原任务与
  恢复条件，不得假装已纳入 V1.0。
- 不创建 `v1.0.0` tag，不创建 GitHub Release，不上传或分发安装包。
- 不更新生产 Activity `latestVersion`、`downloadUrl`，不发布渠道版本公告，不向真实用户放量。
- 不消费真实渠道码，不创建真实 5 元额度或 OmniHi Key。J-142 经济事实联调必须先向用户再次确认
  并获得专用一次性测试码；共享码永远不得用于产生经济事实。

## 5. 验收条件

- AC-1：快照有仓库外可恢复备份、完整文件清单和 SHA；原始改动无丢失。
- AC-2：候选提交中无秘密，临时产物不混入产品历史；所有提交可按任务/主题解释。
- AC-3：CreatorOS exact 请求 v3 ticket，受管模型/ASR/额度入口聚焦契约与安全测试全绿。
- AC-4：所有版本面与发布说明统一为 `1.0.0`，macOS 正式 workflow 对签名、公证、staple、
  Gatekeeper 和真启动失败关闭。
- AC-5：仓库规定的完整验证与 prelaunch audit 有本轮新鲜输出；红项要么根治，要么按真实范围
  登记为阻断/延期，不能篡改历史 receipt 洗绿。
- AC-6：候选安全整合最新 `origin/main`，最终 `main` 包含全部确认且已保全的候选改动并成功推送。
- AC-7：最终报告明确 Windows High 风险边界、J-142 是否真实完成，以及正式发布确认点所需动作。

## 6. 最终发布确认点

只有用户在阅读候选 SHA、完整验证结果、J-142 状态和平台风险后再次明确确认，后续任务才可创建
`v1.0.0` tag、GitHub Release、上传/分发安装包、更新 Activity/渠道版本公告或正式放量。本 T-728
不会越过该确认点。
