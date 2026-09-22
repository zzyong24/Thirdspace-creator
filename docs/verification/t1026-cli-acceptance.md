# T-1026 新增 Agent 功能逐项验收

## 口径

用户要求所有新增功能可经公开 CLI 操作与核验。安装版读写只使用 `creatoros`；自动化夹具、开发环境测试、实际安装任务分别记录。任务 succeeded 不证明生成内容完整，文件需核对字节、版本、预览及来源数字。尚未取得证据的项目保持未验收。

## 新增公开入口

| 能力 | CLI 入口 | 核验内容 |
|---|---|---|
| 执行任务 | `execution.tasks.get/list/command` | 旧执行与持久执行详情、停止/恢复，归属和幂等 |
| 计划及账本 | `workbench.tasks.inspect` | 计划 revision、依赖、真实回执、分页、冻结工具与会话关系 |
| 持久进度 | `workbench.tasks.events` | sequence、attempt、终态，与工具账本对应 |
| 宿主能力 | `workbench.capabilities.list` | 当前平台真实目录、锁定依赖、声明与可用能力分开 |
| 文件/命令/浏览器/Skill执行 | `ai.conversations.messages.create` | 原 Agent loop 调用；通过 inspect/events 验证每项工具，不向公开接口开放 lease |
| 产物历史 | `workbench.artifacts.list` | 当前会话版本、legacy/pending/unknown、只读无隐式迁移 |
| 产物原字节 | `workbench.artifacts.read` | 有界 base64 分页与 metadata/hash |
| 预览及导出 | `workbench.artifacts.render`、`creatoros artifacts export` | raw/preview/png/pdf 共用页面渲染器；来源/输出摘要、降级诊断、防覆盖 |
| 原操作对账 | `workbench.artifacts.reconcile` | apply+幂等键；重复和后续版本后仍读回原结果，只恢复目标任务 |

## 自动化证据（本轮运行）

- 契约：42 文件、244 测试通过。先有新增 operation 缺失的 2 项红测。另核对并补齐旧路由清单、CLI 数量、已迁移封面工具和资产 sourceUrl 夹具，保留正式契约的正反校验。
- CLI：76 测试通过，导出先取得真实红测；本地文件在 base64/size/hash 全部验证后以 wx 写入。
- 工作台前端：41 文件、325 测试通过、5 跳过。包含真实 Chromium SVG 像素、PDF 正文、零网络请求、历史脚本型报告降级观测。
- 持久任务/计划/公开读侧：4 文件、41 测试通过。计划校验使用真实 PGlite/Blob，慢 Blob 期间查询及时返回；CAS、租约和身份变更不推进计划。
- Rust 工作台独立测试目标：44 通过、7 忽略。第一次误用名称过滤，运行到 0 项，未算作通过；随后改为 `cargo test --test workbench` 才取得本项证据。
- 打包四项基本检查：4 文件、42 测试通过。
- 物理边界：无新增违规；既有 5 条基线保留。
- backend 全量类型检查仍有既有测试错误，未描述为全绿；新增公开测试的一处 unknown 类型错误已修正。

## 安装版 AC-AW-01–09

| 验收项 | 安装版状态 | 证据/剩余条件 |
|---|---|---|
| 01 一次目标多步执行 | 待验收 | 计划、数据、网页、文件、核验全部回执 |
| 02 数据图表、修改与版本 | 待验收 | 导出原始/静态预览/PNG/PDF及数字核对 |
| 03 重试、停止、重启 | 待验收 | 原任务恢复和取消；不重放未知外部动作 |
| 04 浏览器并发与隔离 | 待验收 | 两任务、profile协调与跨账号夹具；当前实际仅一账号 |
| 05 原采集兼容 | 待验收 | 当前安装版及独立源回归；千条规模不得伪造 |
| 06 文件边界与命令取消 | 夹具通过，安装待验收 | 越界、冲突、进程树、导出取消；Windows实机未验收 |
| 07 打开/历史/轮询性能 | 待验收 | LED-047与安装版冷/热延迟 |
| 08 模型/RedFox/Skill兼容 | 待验收 | 已配置模型真实循环、方法包和供应商适配 |
| 09 双端安装与升级 | 待验收 | 当前机器仅macOS；Windows实机未取得 |

## 本轮发现并修复

计划保存的嵌套数据库/Blob等待；产物只读查询隐式迁移；对账完成后的重试404；对账触发全局回收；锁顺序倒置；CLI无法回读持久执行；导出缺CLI入口；报告脚本被清理却无诊断。诊断作为独立回执，原产物元数据与界面解析保持一致。

### 冻结前补充

- LED-047：8 文件、161 测试通过。
- Artifact backend：2 文件、22 测试通过，含无隐式迁移、历史对账、锁顺序。
- 新 host→正式原子结算集成：4 测试通过，验证附加诊断不破坏原元数据、summary、UI和归属。
- Worker：4 文件、26 测试通过；网页恢复旧夹具另扩成6项正反回归，无生产行为变更。
- frontend/contract 类型检查通过。
- 第二独立审查（Kuhn）未发现可复现产品阻断缺陷，任务/事件12项、装配与route15项通过。另一个临时探针受依赖导出方式限制未完成，不当作全链路通过证据；安装版仍待实测。

## 第一轮安装实测（候选 235888df764c77aac3390e405039c19606937807）

本机覆盖安装成功，公开 CLI 发现 265 个 operation，真实工作台目录返回 21 项能力。DMG 为 `/Users/zyongzhu/Downloads/CreatorOS-1.2.0.dmg`，SHA-256 `80882f7beb14d4e18e2706727bd67874d390c377a96bec1e945f0c595343f433`；hdiutil verify 通过。本地 ad-hoc 包，未公开发布。

- 升级后原任务 `execution-task-1899afca-691` 保持 succeeded、attempt=2、24 条账本，原产物 `wa-0a48435928f5cdcd787f7344e180fdf5@1` 保留，原字节 SHA-256 `5ed7d11123e80e30ed7d586a1e43d3c5a1a3f5b6d4439295c71bdc103db742fc`。
- 公开 CLI 的 raw/preview/PNG/PDF 导出均成功，hash/size 校验通过。但实际查看 PNG 确认图表空白、汇总卡缺数字、表格无数据行。诊断正确识别 2 个 script、1 个外链、0 个静态 SVG；**导出成功不算内容验收通过**。旧文件实际包含 37 行、15 条已知播放、22 条缺失；已知总播放 62,297，原文“20 条样本”不符合原始数据。
- 新增验收会话的原执行 `execution-task-2082997a-82`：第一轮非法产物引用收到 invalid_input；随后计划调用成为 unknown，计划仍为空。另发现 events 端点拒绝 runtime 的 unknown_result 状态。修复与原任务恢复复测尚未完成。
- 原会话报告修复任务 `execution-task-2082997a-99`：artifact.read 成功；长回执提示给错 ID 导致续读失败；其后模型回执已结算，但任务因 WORKER_EXECUTION_INTERRUPTED 停止。尚无 v2。末次中断根因待补充诊断，不把前一续读错误直接当作全部根因。
- 实测原始 CLI 回执和导出位于 `/tmp/t1026-cli-evidence/`，包含账号内容，仅留本机；本报告不复制用户完整数据。
- 打包后受管 runtime 独立测试：mac_packaged 两项、private_socket 一项、real_chromium 两项通过。浏览器测试最终使用精确 CfT 版本根路径；早先父目录路径错误的尝试未算 PASS。这些属于实际二进制/浏览器回归，不冒充安装版 CLI 多任务验收。

当前结论：安装与公开观察/导出入口可用，核心目标执行仍发现阻断，继续修复；AC 矩阵暂不批量改为通过。

### 第二轮代码回归

- 计划纠错、原调用崩溃恢复、长回执分页完整链路：4 文件39项通过。before/after/validation 恢复均经过真实 `recoverExpiredLeases`，原调用、费用和预算保留。
- 持久任务与公开投影：2 文件15项通过；契约全量42文件248项通过。
- frontend 类型检查通过，打包四项42测试通过。安装版复测仍待进行。
- 第二独立复核指出异常提案会遮住诊断、分页反复传输历史大参数；已修复并新增正式 transport 回归，公开读侧5/5通过。异常身份保留 null/invalid 标记；当前页参数查询保留跨页来源关联，历史仅扫描轻量身份。复核确认两项已闭合。
- 最新 frontend/contract 类型检查通过；backend 全量类型错误仍为既有测试问题，新增测试中的两项类型错误已当场修复。边界门卫通过，无新增违规。

## 第二轮安装实测（候选 a9e27bcb）

已覆盖并启动 `/Applications/CreatorOS.app`（本次 PID 94166），CLI full/connected。DMG SHA-256 `c12d3306c6b7c860b3d93d36d65cf004a6ba8928e6c1e6e94ad27de198ad2daf`。原任务 `execution-task-2082997a-82` 自动以 attempt=2 恢复，最终72条已结算回执；这是恢复机制通过的证据，**不是目标全部完成的证据**。真实 Node 核对5行、总播放20,349、平均4,069.8、三文件存在；网页导航错误自行纠正后HTTP200，提取/截图/关闭完成。然而计划始终为空、登记失败，最终模型错误声称初始计划已保存，不能采信该文字作为验收。

### 单独边界与导出验收

`execution-task-cf2fc682-71`：44条回执。中文空格路径写入成功；错误版本更新拒绝、父目录写入拒绝；受控 Node 进程输出 `cancel-test`，主动 cancel 后 status=cancelled。空数据报告登记成功 `wa-149a5f68f10f211d88281fd089e54a52@1`，627字节，hash=`6a0f467d67e78f9cff82f0e8e623208ed5134d8e8f641ba25ba749a4aa5e2af0`；raw/preview/PNG/PDF导出通过，实际PNG正确显示样本0、总数0、平均不适用。4页200字节读取拼接后hash一致；同路径再次导出被EEXIST拒绝，原文件字节不变；原登记operation公开对账返回committed。

同时发现：edit 返回版本2后，新 read/stat仍显示版本1与旧内容，需修复跨回合读取缓存，不能标文件更新读回通过。

`execution-task-cf2fc682-92`：同会话复制/更新产物失败。输入真实旧artifactId与baseArtifactRef，copy返回invalid_input、register仍返回artifact_not_committed；仅旧版存在。登记功能不能因初次成功便标整个版本链通过。以上问题均保留原CLI证据并继续修复。

### 追加真实回归与第三轮修复

- 公开采集回归：指标 `run-4336889a-ca94-4f56-bfea-acf26920c341`、流量 `run-ec8d2770-8a52-4a07-9cb1-c49c14f621cd`、明细 `run-8e9cae86-5070-47cd-a27d-c128fafb6baf` 均 succeeded；流量更新8项。评论 `run-d1d19487-3e48-453f-9eb0-f0bb602b1cf8` 返回 failed，却显示“全量完成:已采9/9个作品”，尚不能判为通过，继续核查。
- 浏览器两组独立任务均能打开/导航/observe；合法 scroll 也进入 TOOL_REQUIRES_RECONCILIATION，证明不能只归咎于首组 click 缺参数。四个验收任务经公开命令取消，保留原未知回执，不重放未知动作。实际并发 Act 尚未通过。
- 文件新观察修复：跨操作不再复用旧 read/stat；同调用重放和写操作防重复保留。真实账本回归先6项红测，修复后相关4文件31项通过，安装复测待进行。
- 根目录 list 的 `.` 仅在 list 规范成省略路径；越界和写入路径约束保留。浏览器缺必填 action 参数在派发前给具体格式说明，未知已派发操作仍只能对账。产物登记提供真实身份/版本/provenance纠错说明，只有服务确认没有提交时才能标为 invalid_input。
- host第三轮合并回归：3文件34项通过、5项跳过；包含真实backend登记、同会话跨任务版本与PNG复制链。该证据属于自动化集成，不能代替安装版实际版本交付。

- 方法工具安装实测：`execution-task-cf2fc682-347` succeeded，4条已结算回执。实际 skill.read 读到 method.report（workbench-report-2026-09-21-diagnostics，949字符）和 method.research（1463字符），两项hasMore=false且overlayRevision=null；无需把纯方法读取伪称为完整报告生成。
- 模型截断恢复隔离集成：重现原5 calls/checkpoint4失败形态后，原task retry、新租约续跑succeeded；前五条账本不变。length工具提案只结算无副作用错误；旧长结果提示仅在完整请求digest匹配时回放，新请求保留provider ID。backend相关51项与Worker32项通过，安装原报告续跑尚待第三候选。
- 原生浏览器实际CfT：scroll/click/hover、旧引用拒绝、双任务隔离2项通过；host20项、匿名策略3项、adapter32项通过。此为隔离原生测试，安装CLI Act仍待复测。额外Hub安全复核要求Act+evaluate拒绝，不能以工作台入口暂不可达省略边界。
- 浏览器TS参数回归：补支持的timeout_ms与七类合法action完整租约/宿主透传后15项通过、4项显式实机跳过；额外字段及错误direction类型预检拒绝。

## 按能力逐项核验（第三候选安装前）

| 功能 | 安装版已取得证据 | 当前结论 |
|---|---|---|
| plan.update/计划进度 | 原任务72回执却plan=null | 未通过，已补真实版本与引用纠错，待复验 |
| skill.read | 347任务两种方法及版本正文 | 读取通过；长正文分页另由夹具验证 |
| files.list/write/read/stat | 空目录、中文空格路径、写读与stat真实发生 | 首次写读通过，编辑后观察未通过 |
| files.edit | 错版本拒绝；正确更新得到新版本 | 更新回执通过，新read/stat旧缓存已修待安装 |
| execution.run/status/cancel | Node精确计算；长进程输出后cancel/status cancelled | 本机通过，完整进程树回归另列Rust证据 |
| browser.open/navigate/observe/extract/screenshot/status/close | 82及并发任务真实工具回执 | 基础工具已实测；全套并发Act闭环待复验 |
| browser.act | 合法scroll变unknown | 未通过，原生限制已修待安装 |
| artifact.register/read/versions | 空报告v1登记、读回、版本列表 | 初次通过；跨回合修改未通过 |
| artifact.copy | HTML不是其支持输入族；PNG真实安装链待验 | 不能以HTML失败替代PNG验收 |
| 产物公开列表/分页/原操作对账 | 空报告分页hash相同、对账committed | 通过 |
| raw/preview/png/pdf导出 | 空报告四格式，PNG实际显示0/不适用；覆盖拒绝 | 空数据通过，原真实报告图表未通过 |
| 原任务恢复/停止 | 82原ID attempt2续跑；四个unknown浏览器任务CLI取消 | 部分通过；99原报告恢复、暂停/继续待复验 |
| 原采集兼容 | 指标/流量/明细succeeded，评论failed | 评论问题沿T1027继续修复 |
| 页面打开/历史性能 | LED047自动化161项 | 真机UI时延未测，不用CLI接口时延冒充 |
| 双端升级 | 两次本机覆盖安装且原任务/产物保留 | macOS已实测；Windows真机尚无环境证据 |

### 第三候选冻结前收敛

长历史兼容的独立复核曾复现19/18回合窗口差异导致合法旧请求无法回放；现改为重建完整legacy窗口并经同一SDK规范化，保留完整digest/callId/settled核验。真实Worker新增临界红测转绿，前41条账本与费用不变，新供应商请求仍使用provider ID；独立复核确认捕获SDK只返回本地流、不调用内层供应商/账本。相关backend52项、Worker35项通过。

本轮最终契约43文件249项通过；host合并5文件44项通过、5项跳过。Skill冻结测试先复现1项旧版本断言失败，核对真实安装回执与官方模板后更新为实际新方法版本，13项通过。匿名Hub强化后策略4/4通过，拒绝Act伪装evaluate且保留七类交互；日志 `/tmp/t1026-anonymous-policy-final.XXXXXX.log`。以上仍不替代第三候选安装实测。

T1027最终独立复核确认评论归属、明确未结束分页、同页瞬时失败恢复及混合归属页均已闭合；前端150项、后端28项通过，最终类型检查通过。安装前保留原真实评论失败，不宣称采集已恢复。第三候选将同时纳入T1026与T1027已冻结修复。
