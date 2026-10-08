# CreatorOS 任务看板(BACKLOG)

> **单一执行真相。每个会话必读(SessionStart hook 自动注入)。** 规则见 `CLAUDE.md` 的「任务流程铁律」。
> 状态:📋 待办 · 🔨 进行中 · ✅ 完成 · ⏸️ 搁置 · ⛔ SPEC 审核 FAIL(没过审不准开工)。
> 读取顺序:**本看板 → 任务引用的 SPEC → 代码**。
> 铁律:需求即任务(提了就建);开工从看板顶取;做完改状态+提交;**禁止 P0/P1 分级、禁止多阶段执行**,任务清楚即起 Workflow/并行 subagent 一次做完。

## 🔨 进行中 / 📋 待办(按执行顺序,从上往下取)

| ID | 任务 | 状态 | 审核 | 验收 | 文档 | 一句话 |
| --- | --- | --- | --- | --- | --- | --- |
| T-1084 | 修复安装版 AI 普通消息被 Workbench 工具预装配校验阻断 | ✅ | PASS[REV:e209f8301608] | — | [SPEC](docs/features/t1084-chat-workbench-preparation-order.md) | T1062 新 main 安装实测公开消息入口 HTTP400：plan.update 未装配；原已有 plan host，但校验发生在原型注入之前。只修准备顺序，保留最终严格目录/副作用/schema/租约校验；先独立复核、RED/GREEN，再重新出包和原会话公开复验，不重发未知任务、不触碰真实稿件。 |
| T-1085 | 核对实际聊天集成失败与既有计划恢复场景漂移 | ✅ | PASS[REV:beb541a947be] | — | [SPEC](docs/features/t1085-chat-integration-fixture-calibration.md) | T1084 回归实际暴露原 plan 集成2FAIL及完整装配后段失败。两plan旧fixture不经本轮修改函数，与有限错误收口和安全根模型恢复协议漂移；前端后段还需完整诊断。先取得实际账本/lastError/模型请求事实，修复需单独SPEC和独评，不放宽生产门或删断言，不冒称完整Gate通过。 |
| T-1086 | 补齐 AI 助手对项目现有剪辑工程的发现与真实读取 | ✅ | PASS[REV:6e65ef420578] | — | [SPEC](docs/features/t1086-assistant-native-editor-read.md) | 新安装 main3a60 中性只读会话真实完成却误称无可编辑视频；项目104实际已有output119原生编辑器rev7。先核对作品发现/生命周期/只读目录和提示词，独评后打通原正式端口及归属边界，不自动写稿/剪辑/生成，安装版同项目真实复验。 |
| T-1087 | 排查安装版首个读取请求长时间阻塞与密钥fd同步等待 | ✅ | PASS[REV:8ffb9d8c552a] | — | [SPEC](docs/features/t1087-installed-first-read-fd-wait.md) | 新包首读实际231.782秒，运行中sample主线程Atomics.wait；源码唯一对应secret-crypto fd读取在EOF n=0时仍等executionTimeoutMs。先用原fd/纯隔离测试核EOF与EAGAIN，保密钥/激活/真实数据，独评后修确定性同步阻塞，不猜数据库锁或清历史。 |
| T-1088 | 修复同参不可重试工具失败无法提交终态回执 | ✅ | PASS[REV:a686e18173fe] | — | [SPEC](docs/features/t1088-terminal-receipt-signature.md) | T1085真实Worker新增同参例两次commitChatResult被拒、running超过120秒；原inputDigest含model和tool调用ID，不能用于跨调用参数相等判断。先核原已绑定参数和真实账本再独评，不忽略digest或信任Worker自报，保留有限收口/归属/未知阻断。 |
| T-1089 | 核对旧账号入口冻结账号组后读取旧会话与稿件的兼容缺口 | ✅ | PASS[REV:1fe141f61ea3] | — | [SPEC](docs/features/t1089-legacy-source-ownership-repair.md) · [原诊断](docs/features/t1089-legacy-frozen-source-read.md) | 已登记账号只选账号的新会话/两稿件遗漏组盖章，冻结后原owner拒绝；候选0130三表trigger与可证明旧NULL精确回填，保留原task/payload/digest/读权限。新包已交付，当前收敛PG锁顺序与独评；不手改用户库或重发任务。 |
| T-1090 | 修复完成回执回放被同时间消息排序误判来源变化 | 🔨 | PASS[REV:0f4c60fe8b62] | — | [SPEC](docs/features/t1090-frozen-chat-history-replay.md) · [原诊断](docs/features/t1090-chat-completion-replay-diagnosis.md) | 原b75及当前60例同59PASS/1FAIL，已定位首次合法commit后同参replay的同createdAt乱序。仅按原可信task历史ID重建原消息，保留摘要/归属/lease及账本校验，独评后RED/GREEN、main与无备份出包；原失败不抹除。 |
| T-1073 | 修复全面排查确认的8处资源浪费与内存泄漏 | ✅ 待办 | PASS[REV:3b0b0c1dc9ce] | — | [SPEC](docs/features/t1073-resource-memory-fixes.md) [详情](BACKLOG-details.md#t-1073) | 见详情。 |
| T-1072-owned-devices | 配合 Growth 轻量手机号账号与正式双设备，补齐新电脑连接与已激活账号入口 | 🔨 待办 | PASS[REV:eb8de221287b] | 待验 | [SPEC](docs/features/t1072-owned-devices.md) | 原范围和历史证据见[完整记录](BACKLOG-details.md#t1080-retained-row-aed1560bebc24ab1)。 |
| T-1071-resource-audit | 全系统排查资源浪费与内存泄漏并隔离复现 | ✅ 待办 | — | — | [排查范围](docs/verification/t1071-resource-memory-audit.md) [详情](BACKLOG-details.md#t-1071-resource-audit) | 见详情。 |
| T-1071-whisper | 修复本地转录成功后遗留Whisper线程 | ✅ 待办 | — | — | [同轮修复SPEC](docs/features/t1073-resource-memory-fixes.md) | 原范围和历史证据见[完整记录](BACKLOG-details.md#t1080-retained-row-a99ff608d0b49e76)。 |
| T-1071-stream | 补齐聊天响应背压与缓冲容量策略 | ✅ 待办 | — | — | [同轮修复SPEC](docs/features/t1073-resource-memory-fixes.md) | 原范围和历史证据见[完整记录](BACKLOG-details.md#t1080-retained-row-b61a9e0e1e4b28e3)。 |
| T-1071-worker-memory | 收敛宿主IPC历史回执与音频字节保留 | ✅ 待办 | — | — | [同轮修复SPEC](docs/features/t1073-resource-memory-fixes.md) | 原范围和历史证据见[完整记录](BACKLOG-details.md#t1080-retained-row-3e6fddab175311d1)。 |
| T-1071-cache | 为完成聊天会话和预览元数据增加安全淘汰 | ✅ 待办 | — | — | [同轮修复SPEC](docs/features/t1073-resource-memory-fixes.md) | 原范围和历史证据见[完整记录](BACKLOG-details.md#t1080-retained-row-9ee728d6794951d7)。 |
| T-1071-polling | 修复稿面慢读取叠加、雷达空闲扫描与历史卡终态观察 | ✅ 待办 | — | — | [同轮修复SPEC](docs/features/t1073-resource-memory-fixes.md) | 原范围和历史证据见[完整记录](BACKLOG-details.md#t1080-retained-row-2052423e231a8ccf)。 |
| T-1071-scheduler | 修复后台调度重叠并补停止清理与心跳在途防护 | ✅ 待办 | — | — | [同轮修复SPEC](docs/features/t1073-resource-memory-fixes.md) | 原范围和历史证据见[完整记录](BACKLOG-details.md#t1080-retained-row-d62221da75f2c693)。 |
| T-1068-radar-transcription | 隔离复现内容雷达转录 MODEL_RESULT_UNKNOWN 暂停并定位原因 | ✅ 待办 | — | — | [诊断范围](docs/verification/t1068-radar-transcription.md) [详情](BACKLOG-details.md#t-1068-radar-transcription) | 见详情。 |
| T-1069-completion-json | 修复雷达文本模型完整非流式JSON回执被流式解析误判未知 | ✅ 待办 | PASS[REV:020bbb5c97fa] | — | [SPEC](docs/features/t1069-completion-json-compat.md) | 原范围和历史证据见[完整记录](BACKLOG-details.md#t1080-retained-row-32643c4cf546ed76)。 |
| T-1070-transcript-reliability | 修复通用转录整理文本兼容模式缺少schema校验器与保存阻断 | ✅ 待办 | PASS[REV:5b690995d15b] | — | [SPEC](docs/features/t1070-transcript-postprocess-reliability.md) | 原范围和历史证据见[完整记录](BACKLOG-details.md#t1080-retained-row-e05ce3185fe7853c)。 |
| T-1066-timeout-policy | 全系统统一两分钟超时下限、嵌套预算与Skill防复发 | ⏸️ 待办 | PASS[REV:13310516269c] | 待验 | [SPEC](docs/features/t1066-timeout-policy.md) [详情](BACKLOG-details.md#t-1066-timeout-policy) | 见详情。 |
| T-1066-worker | 执行Worker及后端超时修复 | ✅ 待办 | — | — | [已评审父SPEC](docs/features/t1066-timeout-policy.md) | 原范围和历史证据见[完整记录](BACKLOG-details.md#t1080-retained-row-7ac9ae31a324c3ee)。 |
| T-1066-frontend | 前端与桌面原生层超时修复 | ✅ 待办 | — | — | [已评审父SPEC](docs/features/t1066-timeout-policy.md) | 原范围和历史证据见[完整记录](BACKLOG-details.md#t1080-retained-row-00e46835d1567ae8)。 |
| T-1066-tooling | 构建CI及运维工具超时修复 | ✅ 待办 | — | — | [已评审父SPEC](docs/features/t1066-timeout-policy.md) | 原范围和历史证据见[完整记录](BACKLOG-details.md#t1080-retained-row-79f5cc742488451b)。 |
| T-1065 | 全盘审计系统所有超时限制与固定30秒上限 | ✅ 待办 | — | — | [范围](docs/features/t1065-timeout-audit.md) | 原范围和历史证据见[完整记录](BACKLOG-details.md#t1080-retained-row-37095e929dd176d6)。 |
| T-1064 | 只读诊断本机作品升级/提取 AbortError | ✅ 待办 | — | — | [排查记录](docs/verification/t1064-aborterror-diagnosis.md) | 原范围和历史证据见[完整记录](BACKLOG-details.md#t1080-retained-row-e5c1f0d53099b701)。 |
| T-1063-release-pipeline | 取消双端出包人为超时与阻断检查并重跑 Windows 流水线 | ✅ 待办 | PASS[REV:245946205971] | — | [SPEC](docs/features/t1063-release-pipeline.md) | 原范围和历史证据见[完整记录](BACKLOG-details.md#t1080-retained-row-b6ea894360489899)。 |
| T-1067-skill-verification | 清理通用产品流程Skill既有公开分发校验债务 | 📋 待办 | — | 待验 | [根因证据](docs/verification/t1066/SKILL_VERIFICATION.md) [详情](BACKLOG-details.md#t-1067-skill-verification) | 见详情。 |
| T-1018 | 清理本轮测试暴露的全局类型与边界欠债 | 📋 待办 | — | 待验 | [实测证据](docs/verification/t1017-rewrite-first.md) [详情](BACKLOG-details.md#t-1018) | 见详情。 |
| T-1080 | 汇总全部本地worktree代码到main并清理闲置目录后构建 | ⏸️ 待办 | — | — | [SPEC](docs/features/t1080-local-main-worktree-consolidation.md) | 用户2026-10-08明确授权全部代码本地合并至主分支、清理不用的worktree再构建，构建无需备份。先逐树核HEAD/未提交/使用情况并保留Git来源，解决冲突和验证后只删除已保留代码且未占用的目录；保留活跃会话、真实数据与既有备份，不push/tag/发布。 |
| T-1083 | 复核流程升级后的旧任务写集通配符兼容缺口 | 📋 待办 | — | — | [根因证据](docs/verification/t1080/post-package-progress-block-failure.json) | progress原block命令实际exit2：T1026的docs/verification/t1026*被3.29路径校验拒绝，未写进度；taskctl已真实记T1080阻断。先盘点旧glob实际允许写集、独立复核等价迁移，不放宽guard或手改状态，本轮未实施。 |
| T-1082 | 复核合并来源任务的当前评审与UI验收记录归属 | 📋 待办 | — | — | [SPEC](docs/features/t1082-source-receipt-revalidation.md) | 本地main真实出包后对账新增7项：5个source/alias缺当前review链event、2个agent-recovery alias缺completion；原来源链/报告保留不代签当前验收，按真实独立审核和UI旅程闭环，不重哈希旧链、不复制PASS。 |
| T-1081 | 核对整合后原主线的14处短执行预算与超时扫描误报 | 📋 待办 | — | 待验 | [根因证据](docs/verification/t1080/timeout-static-dispositions-corrected.json) | 完整超时门实际exit1：14条既有短执行/有限观察来自原main/client，另13条为冻结编辑器调度/动画、已取消清理、TTL或已归一消费者；先按真实消费者复核，不改vendor洗绿、不延长取消。来源与原失败留存；本轮优先合并和出包，此任务尚未实施。 |
| T-1026 | 补齐新增 Agent 功能的公开 CLI 并逐项验收安装版 | 🔨 | — | — | [SPEC](docs/features/t1026-agent-cli-acceptance.md) | 原范围和历史证据见[完整记录](BACKLOG-details.md#t1080-retained-row-67204c9b2c9efc87)。 |
| T-1027 | 修复评论采集完成统计与失败诊断 | 🔨 | — | — | [SPEC](docs/features/t1027-comment-collection-evidence.md) | T1026真实评论回归failed却提示全量完成；统一完成统计并补公开未完成原因，不把零新增冒充成功。 |
| T-1025 | 重新核验 constitution 变更后的历史评审与前端验收回执 | 📋 | — | — | [SPEC](docs/features/t1025-receipt-drift-revalidation.md) | 原范围和历史证据见[完整记录](BACKLOG-details.md#t1080-retained-row-fbe6a3f4e58bcafa)。 |
| T-1024-runtime-liveness | 根治聊天生成占用数据通道与重启后 unknown_result 卡死 | ✅ | — | — | [SPEC](docs/features/t1024-chat-runtime-liveness.md) | 原范围和历史证据见[完整记录](BACKLOG-details.md#t1080-retained-row-e2b40696b7cb6d4c)。 |
| T-1023-agent-recovery | 根治 AI 助手自动恢复无限卡死并证明后台进展 | ✅ | — | PASS:87c802e61bbe | [SPEC](docs/features/t1023-agent-recovery-liveness.md) | 原范围和历史证据见[完整记录](BACKLOG-details.md#t1080-retained-row-6b5c0536610c48a8)。 |
| T-1022-agent-recovery | 禁止模型超时或不完整输出阻断生成，统一由 Agent loop 恢复 | ✅ | — | PASS:06eb90bb86b5 | [SPEC](docs/features/t1022-nonblocking-agent-recovery.md) | 原范围和历史证据见[完整记录](BACKLOG-details.md#t1080-retained-row-eee9f25319e1abe5)。 |
| T-1077 | 修复采纳与作品素材读取的项目返回值 | 🔨 待办 | PASS[REV:a36209c19783] | 待验 | [SPEC](docs/features/t1077-material-parent-port.md) [详情](BACKLOG-details.md#t-1077) | 见详情。 |
| T-1076 | 清理旧安装包与本轮临时构建垃圾 | ✅ 待办 | — | — | [SPEC](docs/features/t1076-clean-obsolete-local-packages.md) | 原范围和历史证据见[完整记录](BACKLOG-details.md#t1080-retained-row-0808de95d80d8a23)。 |
| T-1072 | 修复全局Git钩子误用失效Lefthook路径 | ✅ 待办 | — | — | [SPEC](docs/features/t1072-global-git-hook.md) | 原范围和历史证据见[完整记录](BACKLOG-details.md#t1080-retained-row-f6abe467486ee90c)。 |
| T-1075 | 修复安装验收发现的素材标签观察与纯组生图证明 | 🔨 待办 | PASS[REV:73a6052db08f] | — | [SPEC](docs/features/t1075-installed-ai-observation-gaps.md) [详情](BACKLOG-details.md#t-1075) | 见详情。 |
| T-1074 | 全面验收与补齐AI助手系统操作、工具开放性和功能提示词 | 🔨 待办 | PASS[REV:b19144c34cab] | 待验 | [SPEC](docs/features/t1074-ai-system-operations.md) [详情](BACKLOG-details.md#t-1074) | 见详情。 |
| T-1071 | 修复账号绑定和页面Tab切换卡顿 | 🔨 待办 | PASS[REV:a53e25bf48df] | 待验 | [SPEC](docs/features/t1071-navigation-latency.md) [详情](BACKLOG-details.md#t-1071) | 见详情。 |
| T-1070 | 打通Codex执行与编导精调，脚本一键生成文章和图文 | 🔨 待办 | PASS[REV:b195ac203ec0] | 待验 | [SPEC](docs/features/t1070-director-script-workflow.md) [详情](BACKLOG-details.md#t-1070) | 见详情。 |
| T-1069 | 修复安装版素材导入慢与跨Tab丢失，重设计素材选择并补多平台绑定入口 | 🔨 待办 | PASS[REV:19bad8ef6f93] | 待验 | [SPEC](docs/features/t1069-installed-media-and-binding.md) | 原范围和历史证据见[完整记录](BACKLOG-details.md#t1080-retained-row-e350e6053e05749b)。 |
| T-1068 | 排查并修复本地客户端启动超时，交付可启动测试包 | ✅ 待办 | PASS[REV:8abc34b1f775] | — | [SPEC](docs/features/t1068-local-client-startup.md) | 原范围和历史证据见[完整记录](BACKLOG-details.md#t1080-retained-row-80e4d3ffb5f9172c)。 |
| T-1067 | 落实本地客户端优先出包并移除人为构建超时 | ✅ 待办 | PASS[REV:ebe1b789bc56] | — | [SPEC](docs/features/t1067-local-package-build-only.md) | 原范围和历史证据见[完整记录](BACKLOG-details.md#t1080-retained-row-25094b544f740169)。 |
| T-1066 | 落实本地客户端优先出包并移除人为构建超时 | ⏸️ 待办 | PASS[REV:0d40d8466937] | — | [SPEC](docs/features/t1066-local-package-build-only.md) | 原范围和历史证据见[完整记录](BACKLOG-details.md#t1080-retained-row-d6ce9166621c4243)。 |
| T-1062 | 汇总各会话改动统一提交并打包本地客户端，逐项验收含Skill粗剪 | 🔨 待办 | PASS[REV:5912ba60da16] | 待验 | [SPEC](docs/features/t1062-consolidated-local-client-acceptance.md) · [测试预算补充](docs/features/t1062-backend-test-harness.md) · [安装渲染修复补充](docs/features/t1062-installed-render-skill-owner.md) [详情](BACKLOG-details.md#t-1062) [详情](BACKLOG-details.md#t-1062) | 见详情。 |
| T-1063 | 修正流程工具误拒合法字面方括号文件路径 | 🔨 待办 | PASS[REV:4d99824da112] | 待验 | [SPEC](docs/features/t1063-orchestrator-literal-path-boundary.md) | 原范围和历史证据见[完整记录](BACKLOG-details.md#t1080-retained-row-ef8386b2a0a060cc)。 |
| T-1024 | 紧急排查充值50元后Growth受管Omni模型仍报余额不足 | 🔨 待办 | — | 待验 | [排查范围](docs/verification/t1024-managed-credit-diagnosis.md) | 原范围和历史证据见[完整记录](BACKLOG-details.md#t1080-retained-row-c9ebcc41ffd59f36)。 |
| T-1022 | 按账号组统一多平台工作区、绑定管理、首页与复盘 | ⏸️ 待办 | PASS[REV:2f179f8d9380] | 待验 | [SPEC](docs/features/t1022-account-group-workspace.md) [详情](BACKLOG-details.md#t-1022) | 见详情。 |
| T-1023 | 修正既有任务绑定glob导致的progress生成阻断 | 📋 待办 | — | — | [证据](docs/features/t1022-account-group-workspace/VERIFICATION.md) | 原范围和历史证据见[完整记录](BACKLOG-details.md#t1080-retained-row-3eba29be37ce0174)。 |
| T-1021 | CreatorOS封面与小红书图文双模板库、行业分类及私人收藏 | 🔨 待办 | PASS[REV:f0f3fa0ff91b] | 待验 | [SPEC](docs/features/t1021-cover-template-library.md) | 原范围和历史证据见[完整记录](BACKLOG-details.md#t1080-retained-row-d0c6d059440fcd70)。 |
| T-1019 | 按观众具体任务与双九宫格持续生成可实测选题 | ⏸️ 待办 | PASS[REV:3a0362412b23] | 待验 | [SPEC](docs/features/audience-task-topics/README.md) | 用户委派；复用定位/雷达/候选/反馈，观众入口与作者实测分流，保留 T-1017 首稿；不发布或 push。 |
| T-1020 | 统一可视化推荐、作品承接与科学运营观测 | 📋 待办 | 待审 | 待验 | [SPEC](docs/features/creator-operations/README.md) | 原范围和历史证据见[完整记录](BACKLOG-details.md#t1080-retained-row-e6765fb61ec296f6)。 |
| T-1017 | 简化内容雷达：按账号定位一键生成可编辑改写稿 | 🔨 待办 | PASS[REV:d2fb4541c82d] | 待验 | [SPEC](docs/features/t1017-content-radar-rewrite-first.md) | 原范围和历史证据见[完整记录](BACKLOG-details.md#t1080-retained-row-00c1555a12c0e894)。 |
| T-1018 | 清理本轮测试暴露的全局类型与边界欠债 | 📋 待办 | — | 待验 | [实测证据](docs/verification/t1017-rewrite-first.md) | 后端旧测试 API/类型漂移、contract旧快照/资产/cover断言、live-chat-session SDK 边界与 video-decisions-runner 语义门仍失败；与 T-1015 历史教训对账联动，不混入 T-1017。 本轮T-1022再次实测原12项后端类型、3项契约及边界/语义旧失败，见docs/features/t1022-account-group-workspace/VERIFICATION.md。 2026-10-06 T1068收尾全局37错误/1告警，原36保留，另LED-027稿件并发检查此次失败；相关产品/测试未变，根因待查，原始与比较记录见本地验收根t1068-post-startup-reconcile，T1068启动独立验收不代签此项。 | 2026-10-07 T1070实测保留原boundary7（含未改live-chat-session旧2）、semantic缺material.match及MAIN缺tools/timeout-policy/verify.mjs；规定命令MODULE_NOT_FOUND，详情docs/verification/t1070/CURRENT_VALIDATION.md，不以其他checkout代签。 2026-10-07 T1070收尾完整对账37错误/1告警，当前原始日志docs/verification/t1070/root-prefreeze-reconcile.log；其它历史receipt与boundary/语义/LED仍失败，未逐项核因，不签全仓通过。 |
| T-1016 | 调研 CreatorOS 连接本地 Codex、WorkBuddy 与外部 Agent | ✅ 待办 | — | — | [SPEC](docs/features/t1016-external-agent-research.md) | 参考 ChatCut 和公开协议，核实双向接入、现有执行边界与可落地方案；本轮仅调研设计。 |
| T-1014 | 核对并清理233项历史对账失败 | ✅ 待办 | — | — | [范围](docs/verification/t1014-reconcile-triage.md) | 按真实证据关闭过期治理项，保留有效缺陷与历史回执；不修改产品运行时。 |
| T-1015 | 核实剩余教训失败并校准过期回归断言 | 📋 待办 | — | — | [实测清单](docs/verification/t1014-reconcile-triage.md) [详情](BACKLOG-details.md#t-1015) | 见详情。 |
| T-1004 | 冻结共享能力协议与 NomiFun 迁移依赖 | 📋 待办 | — | — | [SPEC](docs/features/t1003-agent-workbench.md) | T-1003 评审；固定依赖闭包、宿主端口、协议与架构门卫。 |
| T-1005 | 实现多步计划、连续执行与原任务续跑 | 📋 待办 | — | — | [SPEC](docs/features/t1003-agent-workbench.md) | 依赖 T-1004；模型规划与重规划，保留回执和成本，停止恢复可核验。 |
| T-1006 | 接入统一工具网关与长结果回读 | 📋 待办 | — | — | [SPEC](docs/features/t1003-agent-workbench.md) | 依赖 T-1004；工具发现、进度、取消、错误和费用共用原执行链。 |
| T-1007 | 补齐任务文件空间与受控命令执行 | 📋 待办 | — | — | [SPEC](docs/features/t1003-agent-workbench.md) | 依赖 T-1004；文件读写编辑、版本冲突、跨平台运行和进程树取消。 |
| T-1008 | 迁移 NomiFun 浏览器能力并协调既有采集 | 📋 待办 | — | — | [SPEC](docs/features/t1003-agent-workbench.md) | 依赖 T-1004/1006；唯一profile所有者、多任务并发、跨账号隔离和原采集回归。 |
| T-1009 | 实现产物版本、隔离预览与原生导出 | 📋 待办 | — | — | [SPEC](docs/features/t1003-agent-workbench.md) | 依赖 T-1006/1007；真实文件交付、HTML/图表预览、图片/PDF及选址导出。 |
| T-1010 | 装配研究创作报告 Skill 与兼容扩展 | 📋 待办 | — | — | [SPEC](docs/features/t1003-agent-workbench.md) | 依赖 T-1005/1006/1007/1008/1009；按需方法包、锁定版本，自主选工具完成目标。 |
| T-1011 | 实现对话内计划进度与文件交付交互 | 📋 待办 | — | — | [SPEC](docs/features/t1003-agent-workbench.md) | 依赖 T-1005/1006/1009；同对话查看修改导出，停止/恢复与性能防复发。 |
| T-1012 | 验收完整多步 Agent 与旧功能兼容 | 📋 待办 | — | — | [SPEC](docs/features/t1003-agent-workbench.md) | 依赖 T-1008/1010/1011；真实模型工具文件全链路、故障恢复、采集及性能。 |
| T-1013 | 验证双端安装包多步 Agent 与升级兼容 | 📋 待办 | — | — | [SPEC](docs/features/t1003-agent-workbench.md) | 依赖 T-1012；Mac/Windows安装实测，无NomiFun前置，数据升级保留。 |
| T-998 | 收敛业务代码硬编码模型名 | 📋 待办 | — | — | [T-914 审计](docs/research/2026-09-04-architecture-agent-audit.md) | 原范围和历史证据见[完整记录](BACKLOG-details.md#t1080-retained-row-b9b5a6896b2aaf0b)。 |
| T-997 | 修复 ai→ai-runtime 反向依赖边界违反 | 📋 待办 | — | — | [T-914 审计](docs/research/2026-09-04-architecture-agent-audit.md) | 原范围和历史证据见[完整记录](BACKLOG-details.md#t1080-retained-row-2eb38b106511cdb8)。 |
| T-996 | 消除 review/reviews 双模块命名混淆 | 📋 待办 | — | — | [T-914 审计](docs/research/2026-09-04-architecture-agent-audit.md) | review/(review-gate 审核门)与 reviews/(复盘评论领域)职责不同但命名极易混；重命名对齐并更新跨模块引用。 |
| T-993 | 同步 main 分支到最新(落后 origin/main 573 提交) | 📋 待办 | — | — | — | 原范围和历史证据见[完整记录](BACKLOG-details.md#t1080-retained-row-6f28905ece9e4a7b)。 |
| T-992 | 修复 Windows 升级启动运行环境切换拒绝访问 | 🔨 待办 | — | — | [SPEC](docs/features/t992-windows-runtime-upgrade.md) | 用户启动日志os error5；检查旧运行目录、安装指针与升级迁移，保留数据，补既有安装升级验证。 |
| T-989 | 校正知识图谱错误提示的既有回归断言 | 📋 待办 | — | — | [SPEC](docs/features/t989-knowledge-error-test.md) | T988扩展验证发现原af62ddda及当前均1/9失败；核对错误提示契约后修正，未改该行为。 |
| T-984 | 本地打包并实测拆分采集修复 | ⏸️ 待办 | — | — | [SPEC](docs/verification/t984-local-collection.md) | 用户明确冻结改动范围；以66264111本地打包、安装、真实采集验证，不扩展恢复架构、不公开发布。 |
| T-986 | 修复新绑定账号默认采集任务系统标记透传 | 📋 待办 | — | — | [SPEC](docs/features/t986-bind-collection-flag.md) | 原范围和历史证据见[完整记录](BACKLOG-details.md#t1080-retained-row-5172365e85a2cee2)。 |
| T-980 | 纳入助手修复重新运行 V1.2 双端流水线 | 🔨 待办 | — | — | [SPEC](docs/features/t980-release-rerun.md) | 冻结已提交 T-976至T-978 修复，合并发布分支，预检后运行 Mac/Windows 正式构建并核验产物。 |
| T-979 | 自动化页面慢轮询与切换对象回写防护 | ⬜ 待办 | — | — | [SPEC](docs/features/t979-automation-polling.md) | 原范围和历史证据见[完整记录](BACKLOG-details.md#t1080-retained-row-9f66fc6ba1d2a7e1)。 |
| T-976 | 修复安装版 AI 助手 RedFox 再次失败与脱离对话的任务交互 | 🔨 待办 | — | — | [SPEC](docs/features/t976-chat-inline-redfox.md) | 定位本次原始错误；当前对话持续执行返回结果，不让用户刷新核对；真实链路验收。 |
| T-957 | 排查 AI 失败、全场景验收并优化 Agent 提示词【用户截图】 | 🔨 待办 | — | — | [SPEC](docs/features/t957-ai-real-acceptance.md) | 原范围和历史证据见[完整记录](BACKLOG-details.md#t1080-retained-row-d8c8c522ea52c213)。 |
| T-956 | 修复安装版点击采集一直抓取中【用户实测阻断】 | 🔨 待办 | — | — | [SPEC](docs/features/t956-installed-collection-stuck.md) | 对照真实任务、日志与调度恢复定位阻断，修复后沿实际入口验证终态和结果，保护旧数据。 |
| T-954 | 接入抖音流量来源并以专家方法改进编导交互【用户要求小改动】 | 🔨 待办 | — | — | [SPEC](docs/features/t954-director-content-loop.md) | 原范围和历史证据见[完整记录](BACKLOG-details.md#t1080-retained-row-6ad5b71dceb239e1)。 |
| T-951 | 修复自动化采集缺 jobRunId 与千条作品采集失败【用户实报】 | ⏸️ 待办 | — | — | [SPEC](docs/features/t951-collection-reliability.md) | 查明原调度绑定、分页和超时恢复，验证公共链路与千条规模，不以吞错冒充成功。 |
| T-950 | 排查并恢复当前产品缺失历史数据【用户要求恢复】 | ⏸️ 待办 | — | — | [记录](docs/verification/t950-data-recovery.md) | 先核对账号、数据路径和备份；保留现状后恢复可验证的数据，不覆盖新内容。 |
| T-945 | 排查并修复当前视频渲染再次失败【用户要求看日志】 | ⏸️ 待办 | — | — | [诊断](docs/verification/t945-render-failure.md) | 对齐最新原任务与安装版日志，定位真实失败点并验证修复，不凭历史错误猜测。 |
| T-943 | 拉取并跑通 JY_IPAgent，调研数字人 API 与 CreatorOS 接入【用户指定仓库】 | ⏸️ 待办 | — | — | [SPEC](docs/features/t943-jy-ipagent-research.md) | 原范围和历史证据见[完整记录](BACKLOG-details.md#t1080-retained-row-6da40b9d211687ae)。 |
| T-940 | 补齐应用内签名远程更新闭环【糯米饭对标待落地】 | 📋 待办 | — | — | [缺口与范围](docs/features/t939-positioning-release.md) | 原范围和历史证据见[完整记录](BACKLOG-details.md#t1080-retained-row-0e3dd393b702a707)。 |
| T-935 | 修复整稿子任务长时间排队无执行【用户截图慢回复】 | 🔨 待办 | — | — | [排查记录](docs/verification/t935-script-queue.md) | 查真实任务排队与唤醒，恢复原任务，不用新任务掩盖卡住；并完成 T-934 聊天复验。 |
| T-934 | 统一 CLI 与页面的持久聊天工具入口【T-933 真机验收发现】 | 🔨 待办 | — | — | [实现与验收](docs/verification/t934-cli-chat-unification.md) | 原范围和历史证据见[完整记录](BACKLOG-details.md#t1080-retained-row-9b2048cb81450808)。 |
| T-933 | 安装并验收本轮Agent Runtime桌面版【用户要求自行检查】 | 🔨 待办 | — | — | [T-932交付](docs/verification/t932-runtime-alignment.md) | 原范围和历史证据见[完整记录](BACKLOG-details.md#t1080-retained-row-e3d09dce7e422bbe)。 |
| T-919 | 定位并修复本地包主导航卡顿、助手通知刷屏与搜索停滞【用户运行反馈】 | 🔨 待办 | — | — | 复用 T-912/T-909 导航契约与 [T-915 SPEC](docs/superpowers/specs/2026-09-04-agent-runtime-refactor.md) | 原范围和历史证据见[完整记录](BACKLOG-details.md#t1080-retained-row-125af640cc5d45f9)。 |
| T-915 | 根治 AI 卡慢、失败不重试与搜索/浏览器缺少自主循环，收敛架构与执行能力【T-914 审查承接·用户 2026-09-04】 | 🔨 待办 | PASS[REV:692283b8bace] | — | [SPEC](docs/superpowers/specs/2026-09-04-agent-runtime-refactor.md) | 原范围和历史证据见[完整记录](BACKLOG-details.md#t1080-retained-row-e93a45cb55075893)。 |
| T-916 | 修复工程对账与历史任务证据漂移，恢复可信重构基线【T-914 实测根因·2026-09-04】 | 🔨 待办 | — | — | [审计 A-13](docs/research/2026-09-04-architecture-agent-audit.md) [详情](BACKLOG-details.md#t-916) | 见详情。 |
| T-917 | 记录 T-915 媒体测试事故并防止测试再次访问真实媒体根【用户接受数据清理，解除恢复前置】 | 📋 待办 | — | — | [事故记录](docs/research/evidence/t915/2026-09-06-media-test-incident.md) | 原范围和历史证据见[完整记录](BACKLOG-details.md#t1080-retained-row-20ca3c0dceb6f8f4)。 |
| T-908 | 真实复测 douyin-transcribe Skill，并对照 CreatorOS 当前抖音抓取链路判断是否需要兼容修复【用户截图与压缩包·2026-08-23】 | 📋 待办 | — | — | — | 原范围和历史证据见[完整记录](BACKLOG-details.md#t1080-retained-row-0d6e5afae67dc6b3)。 |
| T-906 | 放大 AI 助手默认窗口并支持拖拽缩放与跨启动尺寸记忆【用户反馈·2026-08-20】 | ⏸️ 待办 | — | 待验 | — | 原范围和历史证据见[完整记录](BACKLOG-details.md#t1080-retained-row-43eab6d6e3e39443)。 |
| T-905 | 调研独立的极简手机口播创作产品，以人设选稿、灵感写稿、实拍与“123321”真人换口型为核心【产品可能性探索·用户 2026-08-20】 | 📋 待办 | — | — | — | 原范围和历史证据见[完整记录](BACKLOG-details.md#t1080-retained-row-916d71382f9f6b24)。 |
| T-884 | 只读诊断用户加密日志中的 ASR 转写失败【用户日志·2026-08-18】 | ⏸️ 待办 | — | — | 复用 T-768 ASR 通用回退、T-639 MiMo ASR 与 T-676 逐字稿队列契约 | 原范围和历史证据见[完整记录](BACKLOG-details.md#t1080-retained-row-15d0c7dabac4150e)。 |
| T-883 | 提交并推送 T-881/T-882 候选，触发 GitHub macOS 与 Windows 官方安装包流水线【用户明确授权·2026-08-18】 | ⏸️ 待办 | — | — | 复用 [T-881 验收](orchestrator/T881-FRONTEND-VALIDATION.md)、[T-882 本地包验收](orchestrator/T882-BUILD-VALIDATION.md) [详情](BACKLOG-details.md#t-883) | 见详情。 |
| T-878 | 让生图模型连接测试正确识别并提示 401/403 鉴权失败【T-877 诊断承接·2026-08-17】 | 📋 待办 | — | — | [T-877 脱敏诊断](docs/research/2026-08-17-dudu-image-auth-failure-diagnosis.md) | 原范围和历史证据见[完整记录](BACKLOG-details.md#t1080-retained-row-ab507299fb3fcd91)。 |
| T-867 | 恢复 AI 对项目素材与分镜场景的自动语义匹配【用户真机截图·2026-08-17】 | 🔨 待办 | — | 待验 | [详情](BACKLOG-details.md#t-867) | 详情见外置记录。 |
| T-860 | 修复竖屏素材底边与左下人物框边界重合【用户截图·2026-08-16】 | 🔨 待办 | — | 待验 | [详情](BACKLOG-details.md#t-860) | 详情见外置记录。 |
| T-859 | 竖屏素材段人物收进左下角，并消除切换白闪【用户预览纠偏·2026-08-16】 | 🔨 待办 | PASS[REV:9895a91a63a8] | 待验 | [详情](BACKLOG-details.md#t-859)  [SPEC](docs/superpowers/specs/2026-08-16-portrait-material-pip-smooth-transition.md) | 详情见外置记录。 |
| T-858 | 把剪辑方法真正落到 CreatorOS，根治竖屏统一舞台、字幕重点词与动态 PPT【用户明确要求·2026-08-16】 | 🔨 待办 | PASS[REV:2521be715a0a] | 待验 | [详情](BACKLOG-details.md#t-858)  [SPEC](docs/superpowers/specs/2026-08-16-video-direction-stage-and-caption-emphasis.md) | 详情见外置记录。 |
| T-857 | 构建当前已提交候选的 CreatorOS 1.1.0 Windows 安装包【用户明确要求·2026-08-16】 | ⏸️ 待办 | — | 待验 | [详情](BACKLOG-details.md#t-857) | 详情见外置记录。 |
| T-856 | 重做竖屏成片的统一舞台、字幕可读性与重点词强调【用户成片截图·2026-08-16】 | ⏸️ 待办 | — | 待验 | [详情](BACKLOG-details.md#t-856) | 详情见外置记录。 |
| T-855 | 构建包含 T-854 与当前已提交修复的 CreatorOS macOS 本地安装包【用户明确授权·2026-08-16】 | ⏸️ 待办 | — | — | [详情](BACKLOG-details.md#t-855) | 详情见外置记录。 |
| T-851 | 支持录制“123”短视频生成本人授权的 AI 数字人口播【数字人制作·用户 2026-08-16】 | 📋 待办 | 待审 | 待验 | [详情](BACKLOG-details.md#t-851) | 详情见外置记录。 |
| T-850 | 支持只上传未粗剪口播录像，由 AI 理解实拍语义并生成可确认粗剪【制作输入简化·用户 2026-08-16】 | 📋 待办 | 待审 | 待验 | [详情](BACKLOG-details.md#t-850) | 详情见外置记录。 |
| T-847 | 补齐 Windows 正式包的 CreatorOS CLI runtime 并重跑 1.1.0 双端流水线【T-846 阻断承接·用户认可 2026-08-16】 | ⏸️ 待办 | — | — | [详情](BACKLOG-details.md#t-847) | 详情见外置记录。 |
| T-846 | 提交当前批准候选并运行 CreatorOS 1.1.0 macOS/Windows 官方双端构建【用户明确授权·2026-08-16】 | ⏸️ 待办 | — | — | [详情](BACKLOG-details.md#t-846) | 详情见外置记录。 |
| T-845 | 根治 Windows 用户机成片在 HyperFrames 启动阶段缺失分层模块解析器【T-844 根因修复·用户 2026-08-16】 | 🔨 待办 | — | 待验 | [详情](BACKLOG-details.md#t-845) | 详情见外置记录。 |
| T-843 | 为 CreatorOS 建立可由 Codex 完整操作的官方 CLI，并复用现有全部业务能力【产品方向·用户 2026-08-15】 | 🔨 待办 | PASS[REV:ea17774db868] | — | [详情](BACKLOG-details.md#t-843)  [SPEC](docs/superpowers/specs/2026-08-15-creatoros-codex-cli.md) | 详情见外置记录。 |
| T-835 | 取消制作分镜逐字保真失败对整稿候选的阻断，并给出可诊断恢复【用户真机反馈·2026-08-14】 | 🔨 待办 | — | 待验 | [详情](BACKLOG-details.md#t-835) | 详情见外置记录。 |
| T-833 | 根治结构化节点 schema 兼容报错与多张局部改稿卡无法连续采纳【用户高频真机反馈·2026-08-14】 | 🔨 待办 | — | 待验 | [详情](BACKLOG-details.md#t-833) | 详情见外置记录。 |
| T-831 | 重排官方渠道模型配置并复核上游图生图能力【官方渠道配置·用户 2026-08-14】 | 🔨 待办 | — | 待验 | [详情](BACKLOG-details.md#t-831) | 详情见外置记录。 |
| T-829 | 建立并执行上游模型全能力真实兼容矩阵，覆盖渠道托管与用户中转站【用户 Windows 生图/文本回归·2026-08-14】 | 🔨 待办 | — | 待验 | [详情](BACKLOG-details.md#t-829) | 详情见外置记录。 |
| T-828 | 诊断行业热点出题不可用、Windows 滚动条异常与 DeepMind/Max 模型报错【用户 Windows 真机截图与加密日志·2026-08-13】 | 🔨 待办 | — | 待验 | [详情](BACKLOG-details.md#t-828) | 详情见外置记录。 |
| T-827 | 根治选题中心来源筛选失效与候选操作按钮无法点击【用户真机截图·2026-08-13】 | 🔨 待办 | — | 待验 | [详情](BACKLOG-details.md#t-827) | 详情见外置记录。 |
| T-826 | 根治 CreatorOS v1.1 Windows 新安装包安装后无法启动【用户真机日志·2026-08-13】 | 🔨 待办 | — | 待验 | [详情](BACKLOG-details.md#t-826) | 详情见外置记录。 |
| T-824 | 根治昨日文稿 Skill 与内容动效卡片迭代在标准版成品中无明显效果【用户真实验收失败·2026-08-13】 | 🔨 待办 | PASS[REV:18361dc8c3c3] | 待验 | [详情](BACKLOG-details.md#t-824)  [SPEC](docs/superpowers/specs/2026-08-13-continuous-voiceover-storyboard-pipeline.md) | 详情见外置记录。 |
| T-823 | 根治架构图等主视觉被信息卡遮挡并修正跨段画面切换滞后【成片真机截图·2026-08-13】 | 🔨 待办 | — | 待验 | [详情](BACKLOG-details.md#t-823) | 详情见外置记录。 |
| T-821 | 网站内容因未登录或权限不足读取失败时引导用户前往登录保管库【用户截图·2026-08-13】 | 🔨 待办 | — | 待验 | [详情](BACKLOG-details.md#t-821) | 详情见外置记录。 |
| T-819 | 让编导在普通对话中按自然语言定位并改写当前稿单段【用户真实用法·2026-08-13】 | 🔨 待办 | PASS[REV:0425ab7b87b8] | 待验 | [详情](BACKLOG-details.md#t-819)  [SPEC](docs/superpowers/specs/2026-08-13-natural-language-current-script-section-editing.md) | 详情见外置记录。 |
| T-820 | 修复选题补卡到项目与文案的数据丢失并保存生成消费血缘【T-811 审计承接·2026-08-13】 | 📋 待办 | — | — | [详情](BACKLOG-details.md#t-820) | 详情见外置记录。 |
| T-816 | 让当前确认稿成为配图与封面生成的第一内容真相【用户确认·2026-08-13】 | 🔨 待办 | PASS[REV:fb03de3a57d7] | 待验 | [详情](BACKLOG-details.md#t-816)  [SPEC](docs/superpowers/specs/2026-08-13-current-script-truth-and-natural-language-section-editing.md) | 详情见外置记录。 |
| T-814 | 统一 CreatorOS 多页面 AI 对话体验并保留场景上下文与自由讨论能力【用户体验方向·2026-08-13】 | 📋 待办 | — | — | [详情](BACKLOG-details.md#t-814) | 详情见外置记录。 |
| T-779 | 根治参考历史作品生成封面时误探本机工具并中断生图【v1.0 回归·用户确认 2026-08-11】 | 🔨 待办 | — | 待验 | [详情](BACKLOG-details.md#t-779) | 详情见外置记录。 |
| T-773 | 更新 CreatorOS 1.0 最新使用教程、匿名化截图并新建成交型测试版教程【教程交付·用户 2026-08-11】 | 🔨 待办 | — | 待验 | [详情](BACKLOG-details.md#t-773) | 详情见外置记录。 |
| T-768 | 任何云端 ASR 故障都必须自动回退本地 Whisper【逐字稿可靠性·用户确认 2026-08-11】 | 🔨 待办 | PASS[REV:3eb18966ea59] | 待验 | [详情](BACKLOG-details.md#t-768)  [SPEC](docs/superpowers/specs/2026-08-11-asr-universal-local-fallback.md) | 详情见外置记录。 |
| T-762 | 根因复盘并设计渠道 ASR 密钥的短时租约闭环【正式版受管能力·用户 2026-08-10】 | 🔨 待办 | — | — | [详情](BACKLOG-details.md#t-762) | 详情见外置记录。 |
| T-759 | 根治已绑定 B-roll 因 inventory 失配显示空白【正式版制作回归·用户 2026-08-10】 | 🔨 待办 | — | 待验 | [详情](BACKLOG-details.md#t-759) | 详情见外置记录。 |
| T-754 | 根治 CreatorOS v1.0 官方包启动无限转圈【正式版启动阻断·用户 2026-08-10】 | 🔨 待办 | — | — | [详情](BACKLOG-details.md#t-754) | 详情见外置记录。 |
| T-748 | 补齐“重新输入激活码”原生命令 ACL 并重打官方包【正式版回归·用户真机 2026-08-09】 | 🔨 待办 | — | — | [详情](BACKLOG-details.md#t-748) | 详情见外置记录。 |
| T-741 | 下移知识库“记一条经验”入口到录入操作行【正式版细节·用户 2026-08-09】 | 🔨 待办 | — | 待验 | [详情](BACKLOG-details.md#t-741) | 详情见外置记录。 |
| T-739 | 根治制作视频跨项目灌入 B-roll、无证据改稿偏好与超长复盘卡【正式版回归·用户 2026-08-09】 | 🔨 待办 | — | 待验 | [详情](BACKLOG-details.md#t-739) | 详情见外置记录。 |
| T-738 | 根治发布物料生成成功后无处查看并恢复卡内查看闭环【正式版回归·用户 2026-08-09】 | 🔨 待办 | — | 待验 | [详情](BACKLOG-details.md#t-738) | 详情见外置记录。 |
| T-735 | 根治渠道受管模型成功产物被误判失败并建立 C 端稳定性闭环【智溯AI真机 2026-08-09】 | 🔨 待办 | — | 待验 | [详情](BACKLOG-details.md#t-735) | 详情见外置记录。 |
| T-734 | 根治 Windows 扫码绑定在启动前误依赖缺失 Playwright CLI【抖音账号绑定·用户真机 2026-08-09】 | 🔨 待办 | — | 待验 | [详情](BACKLOG-details.md#t-734) | 详情见外置记录。 |
| T-733 | 本地模型可用时收起渠道配置误报警并纠正票据不适用状态【模型设置·用户真机 2026-08-09】 | 🔨 待办 | — | 待验 | [详情](BACKLOG-details.md#t-733) | 详情见外置记录。 |
| T-732 | 根治局部改稿锚点失效后阻断全部 Copilot 对话【AI 对话可用性·用户真机 2026-08-09】 | 🔨 待办 | — | 待验 | [详情](BACKLOG-details.md#t-732) | 详情见外置记录。 |
| T-730 | 恢复可选“立论点”UI并增加适用场景引导，不重新变成写稿门槛【创作弹性·用户确认 2026-08-09】 | 🔨 待办 | PASS[REV:aeda30778cf2] | 待验 | [详情](BACKLOG-details.md#t-730)  [SPEC](docs/superpowers/specs/2026-08-09-optional-thesis-guidance.md) | 详情见外置记录。 |
| T-731 | 支持按电商等创作场景生成并自定义创作框架【场景化框架·用户后续 2026-08-09】 | 📋 待办 | — | 待验 | [详情](BACKLOG-details.md#t-731) | 详情见外置记录。 |
| T-729 | 根治渠道专属包仍跳官方入口并拆分官网、下载、人工反馈与反馈 API【白标完整性·智溯AI真机 2026-08-08】 | 📋 待办 | — | 待验 | [详情](BACKLOG-details.md#t-729) | 详情见外置记录。 |
| T-726 | 退役项目“论点骨架”并让写稿直接消费 Brief 与素材【创作链瘦身·用户确认 2026-08-08】 | 🔨 待办 | PASS[REV:2809820bf64a] | 待验 | [详情](BACKLOG-details.md#t-726)  [SPEC](docs/superpowers/specs/2026-08-08-thesis-skeleton-retirement.md) | 详情见外置记录。 |
| T-721 | 根治素材包导出回流造成递归嵌套并恢复大素材库完整可见性【素材数据安全·用户 2026-08-08】 | 🔨 待办 | — | 待验 | [详情](BACKLOG-details.md#t-721) | 详情见外置记录。 |
| T-720 | 根治特定 Windows 设备抖音内置浏览器页面崩溃导致内容雷达主页验证失败【飞书用户日志·2026-08-08】 | 📋 待办 | — | 待验 | [详情](BACKLOG-details.md#t-720) | 详情见外置记录。 |
| T-719 | 根治桌面端启动后二次白屏闪烁与首页排期提醒不可用【启动稳定性·用户录屏 2026-08-07】 | 🔨 待办 | — | 待验 | [详情](BACKLOG-details.md#t-719) | 详情见外置记录。 |
| T-718 | 补齐智溯AI包内品牌并交付完整 Growth 配置后重打本地包【渠道验收失败·用户 2026-08-07】 | 🔨 待办 | — | 待验 | [详情](BACKLOG-details.md#t-718) | 详情见外置记录。 |
| T-716 | 完善 Copilot 局部改稿、脚本版本回退、附件上下文与素材中心稳定排序【创作编辑闭环·用户 2026-08-06】 | 🔨 待办 | — | 待验 | [详情](BACKLOG-details.md#t-716) | 详情见外置记录。 |
| T-715 | 在 CreatorOS 增加 Growth AI 额度账户连接、查看与充值入口【额度闭环·用户 2026-08-06】 | 🔨 待办 | — | 待验 | [详情](BACKLOG-details.md#t-715) | 详情见外置记录。 |
| T-714 | 接入工程教训闭环并迁移旧账本，确保真实踩坑可被后续任务自动复用【工程进化·用户 2026-08-06】 | 📋 待办 | — | 待验 | [详情](BACKLOG-details.md#t-714) | 详情见外置记录。 |
| T-713 | 构建包含通用智能体语义边界与当前制作修复的 macOS 0.3.0 本地测试包【本地验收·用户 2026-08-06】 | 🔨 待办 | — | 待验 | [详情](BACKLOG-details.md#t-713) | 详情见外置记录。 |
| T-712 | 优先采用用户上传素材进入 B-roll 时间线、恢复成片预览并收回渠道同步常驻提示【制作体验·本机实测 2026-08-05】 | 🔨 待办 | — | 待验 | [详情](BACKLOG-details.md#t-712) | 详情见外置记录。 |
| T-709 | 将 macOS Developer ID 签名与 Apple 公证凭据接入 GitHub 正式发布流水线【发布安全·用户 2026-08-05】 | 🔨 待办 | — | 待验 | [详情](BACKLOG-details.md#t-709) | 详情见外置记录。 |
| T-708 | 全局审计并软化 AI 工具中不合理的创作完整度门禁【工具灵活性·用户 2026-08-05】 | 🔨 待办 | — | 待验 | [详情](BACKLOG-details.md#t-708) | 详情见外置记录。 |
| T-707 | 将定位前采收敛为 Copilot 主导的自适应编导访谈并直接闭环定位中心【定位精准度·飞书反馈 2026-08-05】 | 🔨 待办 | PASS[REV:06867c4bf60c] | 待验 | [详情](BACKLOG-details.md#t-707)  [SPEC](docs/superpowers/specs/2026-08-01-positioning-pre-interview-workflow.md) | 详情见外置记录。 |
| T-705 | 根治 macOS 本地包启动后落入 Page Not Found【发布阻断·本机实测 2026-08-05】 | 🔨 待办 | — | 待验 | [详情](BACKLOG-details.md#t-705) | 详情见外置记录。 |
| T-703 | 根治视频制作从分镜到预览、对话调剪、采纳与再制作的多处断裂并重打本地包【制作闭环·用户 2026-08-05】 | 🔨 待办 | PASS[REV:c1a3920aea71] | 待验 | [详情](BACKLOG-details.md#t-703)  [SPEC](docs/superpowers/specs/2026-08-05-video-production-editing-loop.md) | 详情见外置记录。 |
| T-702 | 根治审核“应用改写”后分镜稿格式坍缩为 Markdown 表格源码【稿面编辑·用户 2026-08-05】 | 📋 待办 | — | 待验 | [详情](BACKLOG-details.md#t-702) | 详情见外置记录。 |
| T-695 | 清理应用内硬编码品牌并让白标用户表面保持中性【白标体验·用户 2026-08-04】 | 🔨 待办 | — | 待验 | [详情](BACKLOG-details.md#t-695) | 详情见外置记录。 |
| T-691 | 补齐 Copilot 单项目全生命周期、跨项目历史与审核改稿工具闭环【Context 契约·用户 2026-08-04】 | 🔨 待办 | PASS[REV:9444ca5b32a9] | 待验 | [详情](BACKLOG-details.md#t-691)  [SPEC](docs/superpowers/specs/2026-08-04-copilot-project-lifecycle-tool-closure.md) | 详情见外置记录。 |
| T-694 | 建立多渠道专属包工厂、项目级出包 Skill 与安全增量更新闭环【渠道规模化·用户 2026-08-04】 | 🔨 待办 | PASS[REV:2c7be136aea0] | 待验 | [详情](BACKLOG-details.md#t-694)  [SPEC](docs/superpowers/specs/2026-08-04-channel-package-factory-and-incremental-update.md) | 详情见外置记录。 |
| T-686 | 根治定位前采联网补充直接报错并恢复国内中文公开检索【定位前采·本机实测 2026-08-04】 | 🔨 待办 | — | 待验 | [详情](BACKLOG-details.md#t-686) | 详情见外置记录。 |
| T-687 | 建立口播联想画面 Skill 并打通图序号引用、项目 B-roll 与成片渲染【视觉创作主链·本机日志 2026-08-04】 | 🔨 待办 | — | 待验 | [详情](BACKLOG-details.md#t-687) | 详情见外置记录。 |
| T-685 | 排查并根治全流程写稿长度失控及审核不识别已采纳文案卡【创作主链·本机日志 2026-08-04】 | 🔨 待办 | — | 待验 | [详情](BACKLOG-details.md#t-685) | 详情见外置记录。 |
| T-684 | 根治 Copilot 联网搜素材失败后回退模型记忆并误导配置搜索模型【浏览器检索·用户截图 2026-08-04】 | 🔨 待办 | — | 待验 | [详情](BACKLOG-details.md#t-684) | 详情见外置记录。 |
| T-683 | 修复 Copilot 在 Windows 无法读取盘符绝对路径与目录授权失效【本地文件读取·用户截图 2026-08-04】 | 🔨 待办 | — | 待验 | [详情](BACKLOG-details.md#t-683) | 详情见外置记录。 |
| T-679 | 接入 Growth 按激活权益签发的受管模型凭据、真实模型白名单与用户选择【模型服务最小闭环·用户 2026-08-04】 | 🔨 待办 | — | 待验 | [详情](BACKLOG-details.md#t-679) | 详情见外置记录。 |
| T-678 | 根治内容雷达生成选题继续读取旧定位【定位消费一致性·飞书用户 2026-08-04】 | 📋 待办 | — | 待验 | [详情](BACKLOG-details.md#t-678) | 详情见外置记录。 |
| T-677 | 优化首页与定位中心切换时整页骨架卡顿 1–2 秒【桌面交互性能·飞书用户 2026-08-03】 | 📋 待办 | — | 待验 | [详情](BACKLOG-details.md#t-677) | 详情见外置记录。 |
| T-676 | 根治云端 ASR 测试假阳性并接通 StepFun，同时修复 Windows 本地 Whisper 回退【逐字稿阻断·飞书用户 2026-08-03】 | 📋 待办 | — | 待验 | [详情](BACKLOG-details.md#t-676) | 详情见外置记录。 |
| T-671 | 确定 CreatorOS 代理商业模式与官网价格边界【渠道商业化·用户 2026-08-02/03】 | 🔨 待办 | — | 待验 | [详情](BACKLOG-details.md#t-671) | 详情见外置记录。 |
| T-670 | 恢复 CreatorOS 部署前真实官网并收口公开商业信息【官网回滚纠偏·用户 2026-08-02/03】 | 🔨 待办 | — | 待验 | [详情](BACKLOG-details.md#t-670) | 详情见外置记录。 |
| T-666 | 根治定位前采误清空既有定位并改为非破坏草稿切换【定位数据安全·用户 2026-08-02】 | 🔨 待办 | — | 待验 | [详情](BACKLOG-details.md#t-666) | 详情见外置记录。 |
| T-665 | 支持彻底删除内容雷达信源及其全部归属数据【信源生命周期·用户 2026-08-02】 | 🔨 待办 | — | 待验 | [详情](BACKLOG-details.md#t-665) | 详情见外置记录。 |
| T-662 | 根治成片把内部结构标签当正文并优化卡片文字重合【视频内容质量·用户 2026-08-02】 | 🔨 待办 | — | 待验 | [详情](BACKLOG-details.md#t-662) | 详情见外置记录。 |
| T-661 | 根治项目素材未进入制作、采纳后仍转圈及素材包图片无扩展名【制作闭环·用户 2026-08-02】 | 🔨 待办 | — | 待验 | [详情](BACKLOG-details.md#t-661) | 详情见外置记录。 |
| T-660 | 根治雷达预填逐字稿未解锁下一步及已采纳封面仍被判缺失【项目状态回显·用户 2026-08-02】 | 🔨 待办 | — | 待验 | [详情](BACKLOG-details.md#t-660) | 详情见外置记录。 |
| T-656 | 收紧桌面授权本地信任链，移除生产冒烟旁路并消除 verdict 私钥明文靶点【安全加固·用户 2026-08-02】 | 🔨 待办 | PASS[REV:5f6970ac76f2] | 待验 | [详情](BACKLOG-details.md#t-656)  [SPEC](docs/superpowers/specs/2026-08-02-desktop-verdict-basic-hardening.md) | 详情见外置记录。 |
| T-655 | 接通 Seedance 文生视频适配器并修复 `seeddance` 配置报未知 provider【文生视频阻断·用户 2026-08-02】 | 🔨 待办 | — | — | [详情](BACKLOG-details.md#t-655) | 详情见外置记录。 |
| T-654 | 新增 Qwen 方言 ASR 适配器并接入设置预设【逐字稿质量·用户 2026-08-02】 | 🔨 待办 | — | 待验 | [详情](BACKLOG-details.md#t-654) | 详情见外置记录。 |
| T-653 | 支持本地自配与渠道子 Key 托管双模式模型供给【模型商业化·跨仓·用户 2026-08-02】 | 📋 待办 | 待审 | 待验 | [详情](BACKLOG-details.md#t-653) | 详情见外置记录。 |
| T-652 | 重构定位前采为必经的编导式访谈与证据辅助工作流【定位业务流·用户 2026-08-01】 | 🔨 待办 | 待审 | 待验 | [详情](BACKLOG-details.md#t-652) | 详情见外置记录。 |
| T-650 | 知识倾倒输入框支持拖拽文件直接导入【知识录入体验·用户 2026-08-01】 | 🔨 待办 | — | 待验 | [详情](BACKLOG-details.md#t-650) | 详情见外置记录。 |
| T-651 | 内容雷达默认按作品真实发布时间倒序【排序语义·用户 2026-08-01】 | 🔨 待办 | — | 待验 | [详情](BACKLOG-details.md#t-651) | 详情见外置记录。 |
| T-649 | 调研并设计激活后渠道白标：品牌名、应用内 Logo 与系统级图标边界【商业渠道·跨仓·用户 2026-08-01】 | 📋 待办 | — | 待验 | [详情](BACKLOG-details.md#t-649) | 详情见外置记录。 |
| T-646 | 统一优化结构化 AI 工具为结果优先、分段生成与局部修复【性能与可靠性·用户 2026-08-01】 | 🔨 待办 | — | 待验 | [详情](BACKLOG-details.md#t-646) | 详情见外置记录。 |
| T-645 | 收敛模型配置项并同步精简 Growth 渠道模板【设置体验·跨仓配置·用户 2026-08-01/02】 | 🔨 待办 | PASS[REV:5dfe24b42eb7] | 待验 | [详情](BACKLOG-details.md#t-645)  [SPEC](docs/superpowers/specs/2026-08-02-capability-scoped-channel-model-authority.md) | 详情见外置记录。 |
| T-644 | 根治 CreatorOS macOS 客户端持续闪屏【运行态阻断·用户 2026-08-01】 | 🔨 待办 | — | 待验 | [详情](BACKLOG-details.md#t-644) | 详情见外置记录。 |
| T-643 | 收口 CreatorOS 为输入 Activity 激活码后直接授权，隐藏当前权益领取入口【商业激活主线·用户 2026-08-01】 | 📋 待办 | — | 待验 | [详情](BACKLOG-details.md#t-643) | 详情见外置记录。 |
| T-642 | 打通内容雷达对标文案→改写策略→选题卡→项目写稿的编导证据链【产品链路·用户 2026-08-01/02】 | 🔨 待办 | CONCERNS[REV:7728c9ed44bd] | 待验 | [详情](BACKLOG-details.md#t-642) | 详情见外置记录。 |
| T-641 | 根治发布中心“登录多日仍只有一个采集日、发布趋势不出曲线”【线上数据回流·用户 2026-07-31】 | 🔨 待办 | — | 待验 | [详情](BACKLOG-details.md#t-641) | 详情见外置记录。 |
| T-640 | 配置 Apple Developer ID 签名与公证，并在前序修复全部闭环后统一产出本地安装包【发布·用户 2026-07-31】 | 🔨 待办 | — | 待验 | [详情](BACKLOG-details.md#t-640) | 详情见外置记录。 |
| T-635 | 把 CreatorOS 正式构建绑定到 Growth 商品的统一 `projectKey`，禁止运行时覆盖产品身份或关闭严格验签 | 🔨 本地实现待验 | PASS[REV:b8add273a494] | 待验 | [详情](BACKLOG-details.md#t-635)  [SPEC](docs/superpowers/specs/2026-07-30-growth-product-identity-binding.md) | 详情见外置记录。 |
| T-633 | 恢复创作者中心自动扫码登录【线上阻断·用户 2026-07-30】 | 🔨 待办 | — | 待验 | [详情](BACKLOG-details.md#t-633) | 原范围和历史证据见[完整记录](BACKLOG-details.md#t1080-retained-row-f9f6ea5f8246191a)。 |
| T-632 | 根治“新建定位母版”无效、历史母版无法恢复与逐字稿提取长时间无结果【线上阻断·用户 2026-07-30/31】 | 🔨 待办 | — | 待验 | [详情](BACKLOG-details.md#t-632) | 详情见外置记录。 |
| T-631 | 根治大视频上传被 10MB 截断并误报 ffmpeg 缺失【线上阻断·用户 2026-07-30】 | 🔨 待办 | — | 待验 | [详情](BACKLOG-details.md#t-631) | 详情见外置记录。 |
| T-621 | 补齐渠道模型 authority snapshot 生产链路回归【非阻断测试增强·T-606 复核】 | 📋 待办 | — | — | [详情](BACKLOG-details.md#t-621) | 详情见外置记录。 |
| T-576 | 统一跟进尚未关闭的飞书线上用户反馈【线上支持】 | 🔨 免审 | — | — | [详情](BACKLOG-details.md#t-576) | 详情见外置记录。 |
| T-575 | 接通 CreatorOS 权益领取、渠道配置与问题反馈【跨系统上线闭环】 | 🔨 本地PASS·待生产E2E | — | 待验 | [详情](BACKLOG-details.md#t-575) | 详情见外置记录。 |
| T-562 | 根治 CreatorOS 0.2.0 Windows 安装后持续白屏【发布阻断】 | 🔨 免审 | — | 待验 | [详情](BACKLOG-details.md#t-562) | 详情见外置记录。 |
| T-548 | 根治视频渲染重试后成片脱离项目且制作页实时预览消失【发布阻断·用户 2026-07-26】 | 🔨 待安装版真机 | — | 待验 | [详情](BACKLOG-details.md#t-548) | 详情见外置记录。 |
| T-538 | 接通渠道签名上下文的产品问题反馈【跨仓契约·上线闭环】 | 🔨 本地PASS·待生产E2E | — | 待验 | [详情](BACKLOG-details.md#t-538) | 详情见外置记录。 |
| T-536 | 根治“我的收藏”同步错误分类与浏览器档案锁恢复【bug·多账号采集·用户 2026-07-26】 | 🔨 待真实账号只读验收 | — | 待验 | [详情](BACKLOG-details.md#t-536) | 详情见外置记录。 |
## ⏸️ 暂停池（不自动派发）

> 只保留任务索引；暂停原因与恢复条件见 `orchestrator/events.ndjson` 和详情文档。恢复必须使用 `taskctl start`。

|ID|状态|审核|验收|文档|
|---|---|---|---|---|
| T-626 | ⏸️ | — | 待验 | [详情](BACKLOG-details.md#t-626) |
| T-577 | ⏸️ | — | 待验 | [详情](BACKLOG-details.md#t-577) |
| T-565 | ⏸️ | — | 待验 | [详情](BACKLOG-details.md#t-565) |
| T-524 | ⏸️ | — | 待验 | [详情](BACKLOG-details.md#t-524) |
| T-519 | ⏸️ | — | 待验 | [详情](BACKLOG-details.md#t-519) |
| T-525 | ⏸️ | — | 待验 | [详情](BACKLOG-details.md#t-525) |
| T-517 | ⏸️ | — | 待验 | [详情](BACKLOG-details.md#t-517) |
| T-516 | ⏸️ | — | 待验 | [详情](BACKLOG-details.md#t-516) |
| T-510 | ⏸️ | — | 待验 | [详情](BACKLOG-details.md#t-510) |
| T-506 | ⏸️ | — | 待验 | [详情](BACKLOG-details.md#t-506) |
| T-502 | ⏸️ | — | 待验 | [详情](BACKLOG-details.md#t-502) |
| T-497 | ⏸️ | — | 待验 | [详情](BACKLOG-details.md#t-497) |
| T-451 | ⏸️ | — | 待验 | [详情](BACKLOG-details.md#t-451) |
| T-449 | ⏸️ | — | 待验 | [详情](BACKLOG-details.md#t-449) |
| T-448 | ⏸️ | — | 待验 | [详情](BACKLOG-details.md#t-448) |
| T-433 S2 | ⏸️ | — | 待验 | [详情](BACKLOG-details.md#t-433-s2) |
| T-433 S4 | ⏸️ | — | 待验 | [详情](BACKLOG-details.md#t-433-s4) |
| T-433 S5 | ⏸️ | — | 待验 | [详情](BACKLOG-details.md#t-433-s5) |
| T-426 | ⏸️ | — | 待验 | [详情](BACKLOG-details.md#t-426) |
| T-425W | ⏸️ | — | 待验 | [详情](BACKLOG-details.md#t-425w) |
| T-413 | ⏸️ | — | 待验 | [详情](BACKLOG-details.md#t-413) |
| T-417 | ⏸️ | — | 待验 | [详情](BACKLOG-details.md#t-417) |
| T-418 | ⏸️ | — | 待验 | [详情](BACKLOG-details.md#t-418) |
| T-420 | ⏸️ | — | 待验 | [详情](BACKLOG-details.md#t-420) |
| T-399 | ⏸️ | — | 待验 | [详情](BACKLOG-details.md#t-399) |
| T-399c | ⏸️ | — | 待验 | [详情](BACKLOG-details.md#t-399c) |
| T-409 | ⏸️ | — | 待验 | [详情](BACKLOG-details.md#t-409) |
| T-372 W-spike | ⏸️ | — | 待验 | [详情](BACKLOG-details.md#t-372-w-spike) |
| T-372 W-ci | ⏸️ | — | 待验 | [详情](BACKLOG-details.md#t-372-w-ci) |
| T-391 H-econ | ⏸️ | — | 待验 | [详情](BACKLOG-details.md#t-391-h-econ) |
| T-393 | ⏸️ | — | 待验 | [详情](BACKLOG-details.md#t-393) |
| T-401 | ⏸️ | — | 待验 | [详情](BACKLOG-details.md#t-401) |
| T-406 | ⏸️ | — | 待验 | [详情](BACKLOG-details.md#t-406) |
| T-407 | ⏸️ | — | 待验 | [详情](BACKLOG-details.md#t-407) |
| T-396 | ⏸️ | — | 待验 | [详情](BACKLOG-details.md#t-396) |
| T-398 | ⏸️ | — | 待验 | [详情](BACKLOG-details.md#t-398) |
| T-366c | ⏸️ | — | 待验 | [详情](BACKLOG-details.md#t-366c) |
| T-361 | ⏸️ | — | 待验 | [详情](BACKLOG-details.md#t-361) |
| T-352 | ⏸️ | — | 待验 | [详情](BACKLOG-details.md#t-352) |
| T-320c | ⏸️ | — | 待验 | [详情](BACKLOG-details.md#t-320c) |
| T-350c | ⏸️ | — | 待验 | [详情](BACKLOG-details.md#t-350c) |
| T-351 | ⏸️ | — | 待验 | [详情](BACKLOG-details.md#t-351) |
| T-349d | ⏸️ | — | 待验 | [详情](BACKLOG-details.md#t-349d) |
| T-339 | ⏸️ | — | 待验 | [详情](BACKLOG-details.md#t-339) |
| T-328 | ⏸️ | — | 待验 | [详情](BACKLOG-details.md#t-328) |
| T-332R | ⏸️ | — | 待验 | [详情](BACKLOG-details.md#t-332r) |
| T-336 | ⏸️ | — | 待验 | [详情](BACKLOG-details.md#t-336) |
| T-335 | ⏸️ | — | 待验 | [详情](BACKLOG-details.md#t-335) |
| T-337 | ⏸️ | — | 待验 | [详情](BACKLOG-details.md#t-337) |
| T-337a | ⏸️ | — | 待验 | [详情](BACKLOG-details.md#t-337a) |
| T-337b | ⏸️ | — | 待验 | [详情](BACKLOG-details.md#t-337b) |
| T-337c | ⏸️ | — | 待验 | [详情](BACKLOG-details.md#t-337c) |
| T-337d | ⏸️ | — | 待验 | [详情](BACKLOG-details.md#t-337d) |
| T-337e | ⏸️ | — | 待验 | [详情](BACKLOG-details.md#t-337e) |
| T-337f | ⏸️ | — | 待验 | [详情](BACKLOG-details.md#t-337f) |
| T-337g | ⏸️ | — | 待验 | [详情](BACKLOG-details.md#t-337g) |
| T-334 | ⏸️ | — | 待验 | [详情](BACKLOG-details.md#t-334) |
| T-324 | ⏸️ | — | 待验 | [详情](BACKLOG-details.md#t-324) |
| T-340 | ⏸️ | — | 待验 | [详情](BACKLOG-details.md#t-340) |
| T-315 | ⏸️ | — | 待验 | [详情](BACKLOG-details.md#t-315) |
| T-316 | ⏸️ | — | 待验 | [详情](BACKLOG-details.md#t-316) |
| T-317 | ⏸️ | — | 待验 | [详情](BACKLOG-details.md#t-317) |
| T-318 | ⏸️ | — | 待验 | [详情](BACKLOG-details.md#t-318) |
| T-319 | ⏸️ | — | 待验 | [详情](BACKLOG-details.md#t-319) |
| T-312 | ⏸️ | — | 待验 | [详情](BACKLOG-details.md#t-312) |
| T-307 | ⏸️ | — | 待验 | [详情](BACKLOG-details.md#t-307) |
| T-306 | ⏸️ | — | 待验 | [详情](BACKLOG-details.md#t-306) |
| T-301 | ⏸️ | — | 待验 | [详情](BACKLOG-details.md#t-301) |
| T-302 | ⏸️ | — | 待验 | [详情](BACKLOG-details.md#t-302) |
| T-261 | ⏸️ | — | 待验 | [详情](BACKLOG-details.md#t-261) |
| T-249 | ⏸️ | — | 待验 | [详情](BACKLOG-details.md#t-249) |
| T-250 | ⏸️ | — | 待验 | [详情](BACKLOG-details.md#t-250) |
| T-255b | ⏸️ | — | 待验 | [详情](BACKLOG-details.md#t-255b) |
| T-185R | ⏸️ | — | 待验 | [详情](BACKLOG-details.md#t-185r) |
| T-136R | ⏸️ | — | 待验 | [详情](BACKLOG-details.md#t-136r) |
| T-100 | ⏸️ | — | 待验 | [详情](BACKLOG-details.md#t-100) |
| T-087 | ⏸️ | — | 待验 | [详情](BACKLOG-details.md#t-087) |
| T-045 | ⏸️ | — | 待验 | [详情](BACKLOG-details.md#t-045) |

## ✅ 已完成

> ✅ 已完成任务全文已归档到 [BACKLOG-archive.md](BACKLOG-archive.md)(减小本看板体积;单一执行真相仍是本文件)。
