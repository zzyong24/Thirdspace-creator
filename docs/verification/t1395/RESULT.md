# T-1395 本地重打包、安装与启动验收

2026-10-22已用当前源码完成本地macOS包并安装到`/Applications/CreatorOS.app`。原生窗口显示真实首页及既有内容，主页和数据库身份接口均200；原`CREATIVE_CANVAS_MIGRATION_LINEAGE_UNKNOWN`未复现。现有数据已备份并核对保留，App保持运行。

```mermaid
flowchart LR
 A[备份App与完整应用数据] --> B[冻结源码并重打包]
 B --> C[副本迁移与数据保留验证]
 C --> D[安装匹配的新App]
 D --> E[真实窗口 首页及原数据通过]
```

## 候选与产物

- 冻结分支`main`，HEAD `7252d30d52d8eea2c0b885209b9fcd901d49f599`；构建前及完成后工作树均干净，无产品/构建/测试源码修改。四处版本均1.2.0。
- 相对本地`origin/main`检查已提交内容；gitleaks扫描29个提交有1处`generic-api-key`提示，实际为测试中的`idempotencyKey:'t1382-owned-ensure-once'`，经源码核实不是凭据。保留原退出1及报告，未修改扫描规则、测试或伪称扫描零告警。候选未含新发现的真实秘密。
- 四个打包测试文件全部通过，58/58。固定入口`CREATOROS_LOCAL_SKIP_INSTALL=1 pnpm -C frontend desktop:package-local`，明确本地ad-hoc和BUILD_ONLY；构建退出0。
- 唯一安装包：`/Users/zyongzhu/Downloads/CreatorOS-1.2.0.dmg`。
- DMG SHA256：`2ff72ce17e45dd29502f3eeab8e31f7d2d5677f1ea6ba2f6f61ba358eae687bd`。
- App主二进制SHA256：`773ffea747fcda46a2c44d327c6a87fe75a3060212d5c9b96749e61e09842707`。
- 包内sidecar SHA256：`f1e986ac7f625b5a98d06fb3cce8321b32d6a648dd6a5e316a204126bc0e552f`。
- `hdiutil verify`通过；只读挂载后的App与构建App均通过`codesign --verify --deep --strict`，挂载App主二进制和sidecar与构建产物哈希一致。已正常卸载卷。正式安装目录也通过签名与同一sidecar摘要核验。
- 包内主journal为114项，包含0139与0140及精确SQL身份。目标Apple Silicon、最低macOS13.5；这是本地ad-hoc签名包，未Apple公证，不是双平台发布。未push、打tag、建Release或修改Growth生产配置。

## 数据保全与迁移

私有备份根：`/Users/zyongzhu/.creatoros/backups/t1395-20261022-123449`，根权限0700。`app-data`保全完整应用目录，`CreatorOS-before.app`及`CreatorOS-before.dmg`保全旧安装。原T1394快照仍保留。秘密、原始正文、日志明文和截图均不入Git。

独立代理在`db-migrate-test`冷副本执行真实`createDb`并再次打开，最终PASS：

- 200张public表、386857行，所有表行数及实体ID摘要不变；全部内容摘要精确符合0140允许范围。
- 原117条迁移账本逐条保留，仅新增0140，最终118条。
- 仅2条`execution_tasks.updated_at`格式修复和1条`observability_attempt_clocks`结束时间/类型/结果变化；没有新造业务实体或删除行。
- 再次打开后全部数据和账本完全幂等，没有`.corrupt-*`隔离重建。
- 早期审计工具直接搬运大正文遇到PGlite协议缓冲错误，均发生在迁移前且仅影响私有克隆。原日志保留；改为库内单次SHA256聚合后完成完整内容比较，不放宽断言，不把审计工具失败记成应用迁移失败。

运行后真实库在正常退出App后另取`db-after-first-start`冷副本，原生PGlite只读事务核对：账本与预期0140/118条精确一致；核心13表的行数、ID、完整内容摘要全部相同。

|核心数据|保留数量|
|---|---:|
|用户 / 平台账号 / 账号组|1 / 7 / 6|
|项目 / 作品|73 / 71|
|稿件 / 稿件版本|188 / 431|
|知识条目 / 知识版本|73 / 74|

启动后台产生正常运行记录：总行数386908，9表数量、12表内容有变化；191表数量不变、188表完整内容不变，逐表差异均保留在私有报告。`search_documents`少8条，源码有启动索引重建流程；未进一步核这8条索引成员，但源正文及上述核心表精确保留，不以总行数相等冒充数据验收。

## 安装与真实启动

正式调用前曾观察`/Applications`已有与本轮主二进制同摘要的进程，出现来源未核定，不据此代签安装。正常退出后，第一次立即检查仍见退出中的进程，安装前置检查退出1且未替换；待退出完成，沿现有导出`installAndLaunchLocalMacApp`正式执行，无wrapper或源码修改。12:46:37返回已安装、PID79835，实际路径`/Applications/CreatorOS.app/Contents/MacOS/CreatorOS`，子服务PID80033监听`127.0.0.1:63015`。

- 新日志12:46:44记录服务监听和`SIDECAR_STARTUP_VERIFIED`，无原迁移错误、软看门狗超时或窗口导航失败。
- 12:47:21开始的真实主页检查：HTTP200，`text/html`，70656字节，8.557秒返回，title=CreatorOS，最终URL仍为`/`，不是激活页或not-found。
- `GET /api/v1/auth/me`返回200并识别原本机用户；未打印个人资料或认证秘密。
- CoreGraphics确认PID79835的实际CreatorOS主窗口1440×900；原生窗口截图`installed-window.png`经目视显示首页、原账号组和既有项目/作品。此为原生安装版窗口，不以浏览器替身冒充。
- 新日志仍有`MODEL_BENEFIT_BINDING_STALE`模型权益同步告警；10/20旧日志也有228次同类告警，非本次启动首错。本轮未修改授权或宣称官方模型权益已恢复。

证据位于私有备份根：`freeze.json`、`package-result.json`、`dmg-app-verification.json`、`migration-result.json`、`installed-startup-db-result.json`、`install-result.json`、`startup-http-result.json`和`logs/`。构建日志提示本机缺Chromium1223缓存，现有流程渲染按需下载，工作台CfT已随包包含；未冒离线渲染验收。BUILD_ONLY跳过额外冒烟/TLS/产物扫描，以上实际安装及启动为本轮独立验证。

## 流程收尾

context-plan为4-build、规则包3.30.0；context-compile因缺新任务binding退出2，按AGENTS回退任务行/SPEC，未伪造包。本轮仅本地打包与启动验收，不触发产品改造或全量视觉/业务门。pmem sync已执行成功；quick只读对账退出1，实际22ERROR/17WARN，与既有基线一致，涉及历史审核记录及看板体量，属本任务范围外。未宣称仓库全绿，full未运行；本任务安装与数据验收通过，以taskctl完成事件记录证据。
