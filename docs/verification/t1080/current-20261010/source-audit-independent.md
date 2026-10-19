# T-1080 最新来源独立只读核对
审计日期：2026-10-10。固定发现基线 `4ecded9fab02e9bbccb9428629cc87fc1aa0741f`；最终整合审头 `b5d256c8287807f5a8d2115030b3672b54ba9c2b`；逐路径冻结另见 source-final-readset.json/source-final-review.md。仅 Git/源码/证据读取，未切分支、Git 合并、真人平台、模型、服务或数据库操作；唯一写入为本私有报告。
## 结论与实际缺口

三份当前来源的必要产品增量已精确识别；primary、WeChat 已普通三方合并，C候选21产品及配套16测试、2语义门已独立源码审核。不能声称全部旧分支无遗漏：旧 external-agent-mcp/bridge 的持续窄授权配对功能仍未进入当前产品，需保存源码和原SPEC/history并登记兼容任务。本报告不把来源保留等同于功能启用。

T1080 最新授权、BACKLOG/SPEC、PROJECT/PROJECT_CONTEXT、AGENTS、product-to-code-orchestrator 3.29.0、stage-router/architecture/context-plan 已读；阶段 BUILD compat legacy full。微信/上传研究保持暂停。旧验收原记录保留；本次只读独评不补造TDD红测、旧前置评审、真人/付费/安装版E2E。
## 30 个非补丁等价分支逐头判别

真实本地143分支，79来源头非固定基线祖先；49头所有未达提交为 git cherry `-`，30头有 `+`。`+` 只说明提交补丁不等价，不能证明产品遗漏；以下按实际可达主线对应提交、当前字节、后续SPEC替代和本轮增量判别。

| 分支 | 初次头 / +数 | 结论 | 直接证据 / 当前处理 |
|---|---|---|---|
| `codex/external-agent-bridge` | `7d2087a8` / 13 | 真实功能缺口；现行修复已覆盖 | FR-EA-04 配对 grant 未进入产品；ACP 宿主由 T1044 native app-server 明确替代；d98/05b/11baa 现行修复均在 main，6f488 由本轮 C eab 组合覆盖 |
| `codex/external-agent-mcp` | `71d2cc77` / 2 | 真实功能缺口 | cabeefa0/71d2cc77 的持续窄授权配对27路径需独立兼容任务；完整 CLI 不等价 |
| `codex/t1062-account-group-snapshot` | `45ff5ff5` / 9 | 本轮真实整合 | 45ff5ff5 保完整来源；c6dcbc9d 普通三方合并26产品/测试增量，保 main 发布/版本/视频/归属 |
| `codex/t1062-runtime-merge-candidate` | `a56dba58` / 1 | 已由三权威来源+后续main覆盖/替代 | WIP a56，3来源 c5316506/125bc864/55a526d6 均是4ec祖先；579生产路径377完全相同，0文件缺；54组合冲突差异扣除已在权威source和main的旧代码后8文件唯一旧hunk，均在main有实际等价或更强实现 |
| `codex/t1080-retain-t1070-native-intermediates` | `0ebfc000` / 1 | 已覆盖 | contract/src/resources/production-native-document.ts 与 main 字节相同 |
| `codex/t1101-canvas-binding` | `23c3bedc` / 20 | 已覆盖/明确替代 | 冻结293d来源的56路径由 T1159 逐路径来源闭包覆盖；旧 radar6 明确退役，末尾23c只控制统计 |
| `codex/t1106-chart-cover-labels` | `454e9241` / 7 | 已覆盖/后续替代 | T1159 per-path 闭包；main T1124/T1149 的图表/封面/素材对/栅格/弹窗更后续实现保留 |
| `codex/t1110-wechat-evidence-continuation` | `a3bc947d` / 28 | 本轮真实整合 | 冻结293d后新增7路径来自6d5dacf0/86e73907；679548cd 普通合并，保 main T1169 转组回焦 |
| `codex/t188-completion-integration` | `430cc8cf` / 47 | 本轮真实整合已独评并冻结 | 430cc8cf产品，db769ddc仅保存268 doc/control；21产品+16测试+2guard精确组合；b5d256c8已普通合并；源码冻结75路径，失败修复重跑已真通过 |
| `codex/t735-managed-output` | `6747569b` / 1 | 已覆盖 | 6747569b → main 5e3f6b8d；同原物料输出/命题恢复，后续主线归属与期限保护保留 |
| `codex/t915-chat-remaining-tools` | `4fc4de24` / 2 | 已覆盖 | f83210e6/7280c050 → aca897cd；主题/复盘/蒸馏真实worker port |
| `codex/t915-flywheel-worker` | `0874b90e` / 3 | 已覆盖 | 44dd592b/23dcd8a3 →164a348a，0874b90e→be269e1f；worker主要文件字节相同 |
| `codex/t915-formal-chat-entry` | `b0213b2b` / 4 | 已覆盖/后续宿主替代 | 98a0d7de→9b71445a、d8624cd6→b9ea3fc3；chat结构/模型绑定字节相同；旧 frontend runner 被 T930 退役 |
| `codex/t915-intelligence-generations` | `7ab4fa4f` / 1 | 已覆盖 | 7ab4fa4f→66bb9484；video decisions worker/runner/adapter/chunk/srt等字节相同 |
| `codex/t915-intelligence-retry` | `f683f664` / 1 | 已覆盖 | 4eb5bff6→262729ad；真实拒绝/未知回执恢复语义，main增加期限与scope保护 |
| `codex/t915-intelligence-transcript` | `16c44974` / 2 | 已覆盖 | 16c44974→f1ee84fe；benchmark专用转写 owner，不恢复旧多余步骤 |
| `codex/t915-postprocess-ledger` | `80d66981` / 1 | 已覆盖 | cd07d0b8→ecc1efc8；cover持久调用账本，main当前任务账本保留 |
| `codex/t915-preference-worker` | `fa2371bc` / 3 | 已覆盖 | c79918b1→bf899418，773f48bb→b4314a35，fa2371bc→3978d115；preference worker字节相同 |
| `codex/t915-remaining-task-workers` | `375ba4f0` / 2 | 已覆盖 | 282f496d→51ee068c，375ba4f0→cf70feda；asset处理worker/prompt/adapter/contracts字节相同 |
| `codex/t915-share-recovery` | `032538a0` / 1 | 已覆盖 | 032538a0→2335d164；原分享任务retry/cancel，share-import-runner字节相同 |
| `codex/t915-transcribe-complete` | `c11e7f60` / 1 | 已覆盖 | c11e7f60→1371472c；真实source可恢复 vs ASR付费未知，后续C补更完整回执 |
| `codex/t915-trend-probe-io` | `1dda8dc2` / 1 | 已覆盖/旧宿主明确退役 | b0508f7f/fde581d8→5e73427d，6b45766a→61290db9，1dda8dc2→84551290；probe/embedding IO worker字节相同 |
| `codex/t962-sync` | `5a49995b` / 1 | 先覆盖后被已确认四任务替代 | 13012b83→ed3d5fc0；T983 SPEC明确四独立任务优先于中间统一sync；publication-pages/operations-sync字节相同 |
| `codex/t983-account-concurrency` | `13e8e3ca` / 1 | 已覆盖 | main66264111；source account-collection-queue 字节相同，2槽+优先级+账号隔离 |
| `codex/t983-collection-state` | `fd232ef8` / 1 | 已覆盖并强化scope | main66264111；真实run state/query同时归属当前group，不恢复source仅account范围 |
| `codex/t983-resource-wait` | `e8f7e1bd` / 3 | 已覆盖并强化可信退出 | a20d9564/362f2525/438e6654；shutdown/dispose/shared-session/lifecycle四文件与source相同，原任务defer不重发、不凭TTL偷资源 |
| `codex/t983-separate-jobs` | `014f0891` / 2 | 已覆盖并演进迁移 | main66264111；4个sourcekind任务、100/80/40/20优先级、daily/continuous；0098迁移由main当前部署/组级版本接续 |
| `codex/t983-separate-ui` | `43bb1317` / 3 | 已覆盖 | main66264111；automations/intent.ts 字节相同，采集控制UI实际调用runNow/stop等待真实退出 |
| `codex/t983-stagger` | `96f9336d` / 1 | 已覆盖 | 96f9336d→d651160f；0099迁移字节相同，Asia/Shanghai 00/15/30/45 |
| `codex/v1.0-candidate` | `b81e2627` / 1 | Windows已覆盖；旧ASR账本明确替代 | b81e2627 Windows浏览器实际可执行/CDP/sidecar环境链保留；T768已确认任何云错误原任务一次本地Whisper fallback，旧ASR阻断及重复usage账本不恢复 |

## 当前三来源的精确增量

Primary 来源 `45ff5ff5e6676d32be38c834660bab88c238a2ba`（产品同fe4）已进 `c6dcbc9d`。26产品/测试路径中22完整source字节，4处保主线后续内容后吸收source；禁止整文件替换。source主题删九宫格 a3aa81d1、知识库53c52138、资产可读b79c4ab3、菜单945272b1、E2E解挂a030dab7。

`draft-workbench-data.ts` 保 publicationVisualNote、video contentType兼容、currentRevision精确匹配、updatedAt最新真实物料、owner/CAS；完整采 readPagedRows/readAmmo page100+batch8 和成功素材/部分错误回显。page保canvas入口、已有发布物料及topbar；dump-zone保main部分失败任务；persistence只组合source assertAssetReadable。知识库folder/workspace及active资产所有权真实校验；topic旧九宫格两文件有意删除。

Primary逐路径：

- `ai-worker/src/prompt/templates/topic-generate.ts`
- `backend/src/application/knowledge.ts`
- `backend/src/modules/ai-runtime/topic-business-adapter.test.ts`
- `backend/src/modules/ai-runtime/topic-business-adapter.ts`
- `backend/src/modules/knowledge/knowledge.acceptance.test.ts`
- `backend/src/modules/knowledge/knowledge.contract.test.ts`
- `backend/src/modules/knowledge/knowledge.repository.ts`
- `backend/src/modules/knowledge/knowledge.service.test.ts`
- `backend/src/modules/knowledge/knowledge.service.ts`
- `frontend/src/app/(creator)/knowledge/page.tsx`
- `frontend/src/features/draft-workbench/ammo-card-list.tsx`
- `frontend/src/features/draft-workbench/draft-workbench-data.test.ts`
- `frontend/src/features/draft-workbench/draft-workbench-data.ts`
- `frontend/src/features/draft-workbench/draft-workbench-page.tsx`
- `frontend/src/features/knowledge/knowledge-detail-preview.tsx`
- `frontend/src/features/knowledge/knowledge-dump-zone.tsx`
- `frontend/src/features/knowledge/knowledge-library-data.test.ts`
- `frontend/src/features/knowledge/knowledge-library-data.ts`
- `frontend/src/features/knowledge/knowledge-library.tsx`
- `frontend/src/features/topics/audience-task-workspace.test.tsx`（source有意删除）
- `frontend/src/features/topics/audience-task-workspace.tsx`（source有意删除）
- `frontend/src/features/topics/topics-interactions.test.tsx`
- `frontend/src/features/topics/topics-page.tsx`
- `frontend/src/server/persistence-client.ts`
- `frontend/tests/e2e/audience-task-topics.spec.ts`
- `frontend/tests/e2e/knowledge-library.spec.ts`

WeChat 来源 `a3bc947d4bcb70be5c14f11ff56639a54b184b31`，冻结293d后真正缺失7路径，已进 `679548cd`。worker5字节exact source；UI只86三个扫码块+2测试，main T1169 转组当前workspace/alive/isConnected保护原字节保留。官方可见菜单、Wujie真实可见root/shadow/native contains、有限15步原deadline预算，不猜链接/登录/真人恢复。候选patch SHA `8f3fa45bcb24b7dfb5bfcd82f67789292f2f206806529c188b592e9678abcf65`。

| 路径 | 来源提交 |
|---|---|
| `ai-worker/src/runtime/platform/wechat-browser-source.ts` | `6d5dacf0` |
| `ai-worker/src/runtime/platform/wechat-browser-source.test.ts` | `6d5dacf0` |
| `ai-worker/src/runtime/platform/wechat-dom-witness.ts` | `6d5dacf0` |
| `ai-worker/src/runtime/platform/wechat-dom-witness.test.ts` | `6d5dacf0` |
| `ai-worker/src/runtime/platform/wechat-wujie-regression.test.ts` | `6d5dacf0` |
| `frontend/src/features/platform-account/account-group-manager.tsx` | `86e73907 exact 3 source hunks on current main` |
| `frontend/src/features/platform-account/account-group-manager.test.tsx` | `86e73907 exact source test appended; all current T1169 cases retained` |

研究脚本5f7648fa的 `tools/verification/t1110-research.mjs`、`t1110-scope-check.mjs`、`t1110-scope-observe.sh` 仅需原历史保存，未执行。旧radar6由T1159明确替代，不恢复。

Completion 产品来源 `430cc8cff8b730950623b5d97c725a05a257a904`，最新 `db769ddc2968e373bb92e253f13fad9d0927ee08` 只保存268 doc/control，产品不变。21产品精确候选patch SHA `649f204d5e2c55bf039c4d86bcce6f9ab81655cc1a2f8e647d57e43215f3abfe`；测试16 patch SHA `7bcd9853c180babdba0edc603915a4dc3d6a9456f22d32a67e74676e2766427b`。全部manifest文件SHA已与暂存主线复核相同；后续失败测试修复将重新核。

| 产品路径 | 来源提交 |
|---|---|
| `backend/src/modules/artifacts/script-draft-target.service.ts` | `3a551fb5` |
| `backend/src/modules/execution/execution-transcribe-source.service.ts` | `a9d06c01` |
| `backend/src/modules/execution/execution-transcribe-workflow.service.ts` | `5a472fb0` |
| `backend/src/modules/execution/persistent-task.service.ts` | `d078e214` |
| `backend/src/modules/execution/transcribe-command-receipt.ts` | `d078e214` |
| `backend/src/modules/execution/execution.transport.ts` | `8826031f` |
| `contract/src/cli-policy.ts` | `8826031f` |
| `contract/src/operations/execution.ts` | `8826031f` |
| `contract/src/workspace-operation-scope.ts` | `8826031f` |
| `backend/src/modules/execution/video-render/template.ts` | `c4e13e27` |
| `backend/src/modules/projects/transcript-artifact.service.ts` | `4a371020` |
| `backend/src/modules/publishing/publishing.service.ts` | `f4b0c492` |
| `frontend/src-tauri/src/owned_devices.rs` | `c21c8086`, `ea7a636e` |
| `frontend/src-tauri/src/owned_devices_http_lab.rs` | `c21c8086`, `ea7a636e` |
| `frontend/src/app/activate/owned-device-panel.tsx` | `2a9389e5` |
| `frontend/src/app/api/chat/route.ts` | `eab42768` |
| `frontend/src/features/copilot/ai-copilot-content.tsx` | `191d0a71` |
| `frontend/src/features/copilot/transcribe-task-progress.tsx` | `191d0a71`, `8826031f` |
| `frontend/src/features/draft-workbench/draft-workbench-data.ts` | `191d0a71` |
| `frontend/src/features/draft-workbench/draft-workbench-page.tsx` | `191d0a71` |
| `frontend/src/features/draft-workbench/transcribe-now-button.tsx` | `191d0a71` |

独评发现并修复两项：

1. v1 非转写任务撞既有 generic receipt 时，catch不得 `restore(winner)` 绕过真实域拒绝；改为 `db.transaction(execute)` 再验证。transcribe binding/private replay 先于generic receipt；原generic其它业务guard保main顺序。新增2个实际表写 legacy cancel → v1拒绝/零变 → legacy回放用例。
2. HTTP lab最初候选遗漏中间 afa63af1/5a05526f：真实ACK仅200+acknowledged、capsule原子加密写、过期capsule归档和410/原机保护、原journal仅ACK不重激活、TLS/POLL失败metadata。补齐为source430完整全文，SHA `dafa16fb56893e4d13d59262202dfc5c89ba04e7cd202e2af3f69569fbe40613`。

其他关键组合：workflow保main strict safeParse+完整isDeepStrictEqual，source4b0旧更弱guard不恢复；transcript service5处同事务owner组合；publish仅手工登记/replay searchIndex best-effort，保main视觉/封面CAS/output owner；regenerate只generic源消息一致性补丁，保main workTarget messageId和内容/附件严格核验；progress原task/idempotencyKey/unknown有限原期限恢复，读失败不是任务不存在，不自动重复POST；Rust保main lib原生编辑/提取/网络保护。

已覆盖C生产项：generated-asset workspace/hash/filter及persistence project owned已main具备；lib.rs/setup和settings device card main已有；build.rs/capabilities remote-sidecar/permissions owned-devices/license.rs/activate page/owned-device-connection/lib owned-devices共7文件字节exact main。71历史测试路径不等于71当前缺失生产功能，所选16关键测试另列如下；其余原历史保留，不以旧测试全绿冒称本轮全部源码测试通过。

- `backend/src/modules/execution/execution.transport.test.ts`
- `backend/src/modules/execution/transcribe-command-receipt.integration.test.ts`
- `backend/src/modules/execution/transcribe-postprocess.integration.test.ts`
- `backend/src/modules/execution/video-render/template.test.ts`
- `backend/src/modules/projects/transcript-artifact-ownership.integration.test.ts`
- `backend/src/modules/publishing/publishing.service.test.ts`
- `contract/tests/execution-command-receipt-protocol.test.ts`
- `contract/tests/modules/execution.test.ts`
- `contract/tests/registry.test.ts`
- `frontend/src/app/api/v1/dispatch/transcribe-command-legacy-dispatch.test.ts`
- `frontend/src/features/copilot/ai-copilot-content.test.tsx`
- `frontend/src/features/copilot/transcribe-task-progress.test.tsx`
- `frontend/src/features/draft-workbench/draft-workbench-page.bug8.test.tsx`
- `frontend/src/features/draft-workbench/draft-workbench-transcript-state.test.ts`
- `frontend/src/features/draft-workbench/transcribe-now-button.test.tsx`
- `frontend/src/server/transcribe-source-cooldown.integration.test.ts`

Semantic source `daa8cc7f0b785f83e37ae65be31c79749ce71217`（父af34bef4）真正缺失2路径：`orchestrator/process/semantic-boundary-scan.mjs` 与 `.test.mjs`。只补剥//后精确单一shim export、worker package name与runner export仅default/types精确target。完整保main真实worker实际调用/material.match/adjustment/full/public owner校验与7反例；source21 CLI反例fixture改用main完整真实worker/runner。patch SHA `6e927df4316406b47baea3a2d00872ed5e7cbad758e3b159989487091567f40b`。独评PASS；root真实node --test 28/28、wrapper exit0。
## 旧配对功能真实缺口与兼容边界

授权出处：`7d2087a8:docs/features/t1018-external-agent-bridge.md` 第5行用户2026-09-27授权，FR-EA-04第56–85行；`7d2087a8:orchestrator/DECISION_LOG.md` 第7–15行DEC-AGENT-1018 Confirmed。该SPEC源仍明确真实客户端/跨账号/Windows未验收，T1018未完成；旧源“保持可用”不能迁写成当前产品PASS。T1044第3行拒绝ACP复制凭据/只读假隔离；FR7要求旧Pi/CLI/配对权限可读，并无配对范围已撤销证据。

缺口源 `cabeefa0` / `71d2cc77` 的27路径（4为测试，其余接入或新产品）：

- `backend/drizzle/0101_external_agent_connections.sql`
- `backend/drizzle/meta/_journal.json`
- `backend/src/db.ts`
- `backend/src/index.ts`
- `backend/src/modules/external-agent-connections/external-agent-connections.service.ts`
- `backend/src/modules/external-agent-connections/external-agent-connections.service.test.ts`
- `backend/src/schema/external-agent-connections.ts`
- `frontend/src/app/api/v1/dispatch/route.ts`
- `frontend/src/app/api/v1/dispatch/route.test.ts`
- `frontend/src/app/api/v1/external-agent/connections/[id]/install/route.ts`
- `frontend/src/app/api/v1/external-agent/connections/[id]/route.ts`
- `frontend/src/app/api/v1/external-agent/connections/route.ts`
- `frontend/src/app/api/v1/external-agent/scope/route.ts`
- `frontend/src/features/settings/external-agent-connections-card.tsx`
- `frontend/src/features/settings/settings-interactive-region.tsx`
- `frontend/src/lib/loopback-core.ts`
- `frontend/src/lib/loopback-guard.server.ts`
- `frontend/src/proxy.ts`
- `frontend/src/proxy.test.ts`
- `frontend/src/server/external-agent-codex-config.ts`
- `frontend/src/server/external-agent-pairing-files.ts`
- `frontend/src/server/persistence-client.ts`
- `mcp-server/src/cli.ts`
- `mcp-server/src/dispatch.ts`
- `mcp-server/src/paired-connection.ts`
- `mcp-server/src/server.ts`
- `mcp-server/tests/dispatch.test.ts`

当前main不具service/schema/settingscard/API/config/pairedlauncher运行接入（对应不存在），主线fullCLI不等价；历史SQL已在 `backend/drizzle/lineages/installed-external/0101_external_agent_connections.sql` 保存，不等价功能。source RequestContext仅user/account、grant无accountGroupId；必须对齐当前组级共享owner、workspace-operation-scope。旧0101/idx101与main canonical0101_workbench_artifact_lineage以及多来源lineage冲突；source早登记时间会在装机旧库被跳过，不能盲改canonical journal，必须继续main迁移收敛体系。

保持原安全契约：真实backend owner/固定允许read+候选ops；拒绝采纳/发布/删修/激活，模型apply不等于确认；grant revision+hash+expiry+revoked CAS；配置只写连接ID、不含短secret，固定私有存储原子轮换；撤销先使服务端失效再删配置；失败/过期/错凭据绝不回落fullCLI或本机免登录；旧任务ACP与native协议不能混同。新兼容需SPEC独评/组级双owner/服务端直调拒绝/凭据轮换与撤销并发/配置合并回滚/旧库升级/实际MCP客户端边界证据，不能启用历史未验功能直接出包。

现有行为修复独核已覆盖：d98任务get旧+新union和ownership-only回落、05b真实cachedReadTokens而不臆造input+output=total、11baa缓存无Agent SDK且main有观察者与非终态保护；6f488由C eab准确原消息/附件组合。fd4装机迁移问题已由main migration-convergence/installed lineage兼容，不直接复用旧0101时间。未发现其余当前既有行为修复必须当轮补回。
## 聚合 WIP 与后续修复独核

`a56dba58` 三实际权威 source `c53165064167c109368605d78f8c9a8e9978c5f6`、`125bc864d79f64891694ed0d630b6462fc7d7e26`、`55a526d609633e2b014e2a70f319125dec8c0fea` 分别由 merge-base --is-ancestor 实际确认均为4ec祖先。579 TS/JS/Rust/SQL生产过滤路径377与main相同、0生产文件缺。54非任一source且不同main组合文件经源码唯一行筛选只8文件有实际独有旧代码：db迁移assert、chat冻结、canvas业务、canvas editor、共享预览、账号页、HTTP headers、persistence组合。逐项核实际主线入口均等价/强化：两个迁移出口assertCanvas；chat group/engine/history/recover及terminal policy；canvas immutable input/digest/locked reservation/contract schema/组归属；下载与readHistory实际generationLink/exactfile/当前epoch；AssetMediaPreview公共owner替代旧node局部实现，scope/abort/SHA/exactfile保留；listGroups改并行并保includeArchived；明确空scope headers更强；template同tx真实workAssets/精确SHA且stop新增stopBackground。未发现需要当轮补回的WIP现行业务修复。

C后续7路径适配补丁独评PASS：`completion-followup.patch` SHA `1f2287c7bbf0dc44985536ad8c30f2b8d3e793c33cdbbd39bf1df71999d8bbe0`（替代a11bbc）。6处小修复（topic fixture / mixed真实generic receipt replay / postprocess合成provider正控制 / generic400+409 / 原peer完整依赖闭包 / Copilot真实notice及零控制请求）均不放松产品边界。原legacy-peer源码4锚与28f原锁仍固定；pnpm9解析全snapshot key保peer后缀，dependencies+optionalDependencies全递归，visited防循环，packages正文逐字相等；实际95节点覆盖SWC/Sharp平台optional/React peer。blob、传递snapshot、optional、integrity篡改负控、无关新增正控齐全，实际加载zod/Next/TypeScript版本与原pin一致。mixed case真实通用receipt表长度1，重放后整个receipt表及观察业务snapshot与受理后完全相同。已读独立candidate私有镜像原handler实际3/3 PASS、27.60s、exit0，log SHA `b02f609d6ce03501d1568f22fd9f8fe7fb4f19185389c39f07a0fd8577bd31de`；该回执不代替main重跑。

## 实际验证回执与限制

只读独评没有执行测试。已读root当次wrapper/log：primary backend56PASS、frontend31PASS（真实session3051转录）；Wechat worker126/frontend86/backend2 suites PASS；semantic28PASS；C contract35PASS，frontend tsc exit0。C首次 backend2FAIL/255PASS、frontend4FAIL/250PASS、backend tsc exit2均必须保留，修复后重跑才可更新本报告。

C失败为：source旧混合非转写测试期待重复cancel Conflict，但main已真实generic幂等，应保原回放并做零变断言；postprocess正控制modelBaseUrl缺fixture导出；Copilot source旧错误slot已由main blocksData/notice安全阻断；generic缺原消息应保main400，内容/附件不等409；旧peer锁文件整体不同不能伪改28f冻结锚，须固定a9源码+原锁并证明实际使用zod/Next/TS完整transitive packages/snapshots闭包相同和篡改负控。

已有独评原来源：primary t1074/t1075 SPEC/implementation/design/visual原回执；Wechat t1110 dom-correction-budget-review、dom-correction-final-source-review、platform-binding-focus-review；C t1072/integration及t1188/t1189原source材料。均是原历史/原snapshot证据，不能签本轮60余路径新HEAD。最终整合HEAD `b5d256c8287807f5a8d2115030b3672b54ba9c2b` 的75路径已独立写入 source-final-readset.json/source-final-review.md。真人/付费平台/Windows安装未验，未借整合恢复暂停研究。
## 全部79非祖先头机械原始记录（初次固定基线）

保留每个完整HEAD、全部+提交、全部-提交与当时union路径数量；已去海量路径文本，避免把三点diff删除/main新文件当遗漏。49个空plus条目为patch-equivalent，无需复写产品。

```json
[
  {
    "ref": "codex/external-agent-bridge",
    "sha": "7d2087a8a81ebf522f15a2119f55fc3118f56b22",
    "plus": [
      "cdc5c14b6e9c545f6d1009ab1083e0a517e612ef",
      "46efbd3ff2a8844564f160dc3c51d9567ac04ee7",
      "cabeefa0a74a59c54df1f5fd7b55a357c65e6dbe",
      "6cc9b2e3c714b7c88baf2829a06b26a0f9702d60",
      "18eb17119974211727f40c4dd03e81a9b8632d1c",
      "52154ff0848bd81ecc9f589d9c16e7c8261be533",
      "11baa3dc591da4d557cb0ae6cb2d2d536e59f239",
      "fd4f3eb796bb384f2f6a679339426a85f3e58d9f",
      "05b13a55ad3c858dc360e761c0f8269d2b8bc62d",
      "d98a70b53b7ae49b21ae235961db265df2a79807",
      "3388235ee4a330383967ed0ef7ec6ce1a29e6b1d",
      "6f488677d83cddb6ebd03b2ac2c548d8afb2cc8e",
      "7d2087a8a81ebf522f15a2119f55fc3118f56b22"
    ],
    "minus": [],
    "sourcePlusPathsCount": 59
  },
  {
    "ref": "codex/external-agent-mcp",
    "sha": "71d2cc77b4b96af01fde8228c4cdaa29be500003",
    "plus": [
      "cdc5c14b6e9c545f6d1009ab1083e0a517e612ef",
      "71d2cc77b4b96af01fde8228c4cdaa29be500003"
    ],
    "minus": [],
    "sourcePlusPathsCount": 22
  },
  {
    "ref": "codex/t1015-lesson-verification",
    "sha": "504d0761b47559607d7d032cf5a5820dd4208fc1",
    "plus": [],
    "minus": [
      "504d0761b47559607d7d032cf5a5820dd4208fc1"
    ],
    "sourcePlusPathsCount": 0
  },
  {
    "ref": "codex/t1017-durable-chat-regression",
    "sha": "9e1a814709c496f2a61fffdc47b6685485a88434",
    "plus": [],
    "minus": [
      "9e1a814709c496f2a61fffdc47b6685485a88434"
    ],
    "sourcePlusPathsCount": 0
  },
  {
    "ref": "codex/t1021-template-backend",
    "sha": "cfc2d86823c946ccb758e3e4c96b7f6fce220ff8",
    "plus": [],
    "minus": [
      "cfc2d86823c946ccb758e3e4c96b7f6fce220ff8"
    ],
    "sourcePlusPathsCount": 0
  },
  {
    "ref": "codex/t1062-account-group-snapshot",
    "sha": "45ff5ff5e6676d32be38c834660bab88c238a2ba",
    "plus": [
      "09f2a772c29f8cae08ffb169b10718011369d5e1",
      "f032522d6127f49bd0bffabb6f3d728b4afeaa11",
      "a3aa81d140c93401c0c89f517f92f9ac327a8b90",
      "53c521388bda3f6e2d45a355b5c4895549b8da8a",
      "b79c4ab38673c866135f97ace994c9d8cff0c57b",
      "945272b1fdbab4b57837f5f58ab591b5434f7a35",
      "a030dab73ba94e688bce0928afa3e5c9d47406d1",
      "fe4f73d2e89388cf174c384be0eef18450c6b893",
      "45ff5ff5e6676d32be38c834660bab88c238a2ba"
    ],
    "minus": [],
    "sourcePlusPathsCount": 26
  },
  {
    "ref": "codex/t1062-runtime-merge-candidate",
    "sha": "a56dba58bc4d624c834f5ecda101787a545e769c",
    "plus": [
      "a56dba58bc4d624c834f5ecda101787a545e769c"
    ],
    "minus": [],
    "sourcePlusPathsCount": 1620
  },
  {
    "ref": "codex/t1066-frontend",
    "sha": "fd649738d8838140b93ee4f77e66f1914f0fd782",
    "plus": [],
    "minus": [
      "fd649738d8838140b93ee4f77e66f1914f0fd782"
    ],
    "sourcePlusPathsCount": 0
  },
  {
    "ref": "codex/t1066-tooling",
    "sha": "3c6db27f3077e38fadda133bee4bd4a410e9d7af",
    "plus": [],
    "minus": [
      "3c6db27f3077e38fadda133bee4bd4a410e9d7af"
    ],
    "sourcePlusPathsCount": 0
  },
  {
    "ref": "codex/t1066-worker",
    "sha": "b1533b76baebbeef3fe01b078f5e8687744120e8",
    "plus": [],
    "minus": [
      "b1533b76baebbeef3fe01b078f5e8687744120e8"
    ],
    "sourcePlusPathsCount": 0
  },
  {
    "ref": "codex/t1073-backend",
    "sha": "54a2e8c9074f3afd6a7752f7d67ecada0eac1746",
    "plus": [],
    "minus": [
      "54a2e8c9074f3afd6a7752f7d67ecada0eac1746"
    ],
    "sourcePlusPathsCount": 0
  },
  {
    "ref": "codex/t1073-frontend",
    "sha": "ce5d89d88f4c3433b9579dea800c4c6f2a8e5db2",
    "plus": [],
    "minus": [
      "ce5d89d88f4c3433b9579dea800c4c6f2a8e5db2"
    ],
    "sourcePlusPathsCount": 0
  },
  {
    "ref": "codex/t1073-worker",
    "sha": "7081ba6b8911ecaece9f9212a8b115082d08c7ee",
    "plus": [],
    "minus": [
      "7081ba6b8911ecaece9f9212a8b115082d08c7ee"
    ],
    "sourcePlusPathsCount": 0
  },
  {
    "ref": "codex/t1080-retain-t1070-native-intermediates",
    "sha": "0ebfc0009ef7c18f08ecfd0b9f7735c86cb6031f",
    "plus": [
      "0ebfc0009ef7c18f08ecfd0b9f7735c86cb6031f"
    ],
    "minus": [],
    "sourcePlusPathsCount": 1
  },
  {
    "ref": "codex/t1101-canvas-binding",
    "sha": "23c3bedc0e8216e20b67f39c653e34a3dfdd508e",
    "plus": [
      "4269240b6abd76860a309847995b7f73330e12f8",
      "7f2168d5a7fa9fd8b4123857a33efe8445d764f7",
      "e19fd2d26f5a60c1ad0dccf5dfd4630e9f856fad",
      "85db626d2b2343921095601a878fe80a6a3bb6f7",
      "1e10a99dd07676392c3dcdea2b8b5c39683ec5a1",
      "65af5fe32012bdfa80b90e1a6001340aec5de436",
      "99c2259570921950821779e09e9fe37d4c0269e1",
      "b245489227cd749fc10eb7f0304aaa123683a040",
      "dc61f1d6e492643756da0b63e627d58d51aced75",
      "b1f0cc5462285e59531a329a42340abe84c8d0ac",
      "72ffed51ebb246f7efd8b883322fba867c090d02",
      "5b1e26b513758021894cb416d90ca671789318fe",
      "88b663a6d445a242c9c34aa14db68c4fac1ef6b3",
      "72e207b2a8c1d5e4e549738c7d8784eb917c0da8",
      "ee79dfc45e417157275bb2c51359de54d476ae26",
      "05db7f36016015f33a670aa9402020c00e2a8d77",
      "9b0b1d14ff2b5e47dd9f499685a734ce50e1da7a",
      "69ac739d8e355037eb7e3a8a9e3eb1249dfd0361",
      "293d4e98d2cedbd04eebce16a62f921711ee8079",
      "23c3bedc0e8216e20b67f39c653e34a3dfdd508e"
    ],
    "minus": [],
    "sourcePlusPathsCount": 61
  },
  {
    "ref": "codex/t1106-chart-cover-labels",
    "sha": "454e9241a2adb107f3beb224914bc3273c063bee",
    "plus": [
      "e2f44d8aa293fe7f16109524fcd247725eacfdd9",
      "12ab953aab73d35f394eef9a45e41adfa8148662",
      "cf865e7a5cd5ec427e3eaff630af7d034cac1dc0",
      "ed0fd2b9850b988e7f01c9cf2cc67d13b7ab206c",
      "6b885200fd08ee45cb8cebd9f1c42d788df7241b",
      "9536352874e73ed5fbfbe4a66ced590f2928a5ed",
      "454e9241a2adb107f3beb224914bc3273c063bee"
    ],
    "minus": [],
    "sourcePlusPathsCount": 18
  },
  {
    "ref": "codex/t1110-wechat-evidence-continuation",
    "sha": "a3bc947d4bcb70be5c14f11ff56639a54b184b31",
    "plus": [
      "4269240b6abd76860a309847995b7f73330e12f8",
      "7f2168d5a7fa9fd8b4123857a33efe8445d764f7",
      "e19fd2d26f5a60c1ad0dccf5dfd4630e9f856fad",
      "85db626d2b2343921095601a878fe80a6a3bb6f7",
      "1e10a99dd07676392c3dcdea2b8b5c39683ec5a1",
      "65af5fe32012bdfa80b90e1a6001340aec5de436",
      "99c2259570921950821779e09e9fe37d4c0269e1",
      "b245489227cd749fc10eb7f0304aaa123683a040",
      "dc61f1d6e492643756da0b63e627d58d51aced75",
      "b1f0cc5462285e59531a329a42340abe84c8d0ac",
      "72ffed51ebb246f7efd8b883322fba867c090d02",
      "5b1e26b513758021894cb416d90ca671789318fe",
      "88b663a6d445a242c9c34aa14db68c4fac1ef6b3",
      "72e207b2a8c1d5e4e549738c7d8784eb917c0da8",
      "ee79dfc45e417157275bb2c51359de54d476ae26",
      "05db7f36016015f33a670aa9402020c00e2a8d77",
      "9b0b1d14ff2b5e47dd9f499685a734ce50e1da7a",
      "69ac739d8e355037eb7e3a8a9e3eb1249dfd0361",
      "293d4e98d2cedbd04eebce16a62f921711ee8079",
      "23c3bedc0e8216e20b67f39c653e34a3dfdd508e",
      "6e6f2fa36bd0fc7a0b06bbe33f0cd597a6255c86",
      "b7a345592ee0abc6b6fa749b409967ad42ee83d1",
      "5f7648fa309fd4e5ab6df0ede5c32cda6e26ee79",
      "6d5dacf03fe6ee581ed2ff2228faa13bc4010bcc",
      "39dcfae6499c60222b31908411c391ee7a7d79f9",
      "86e73907dc0bfe3384b944fdab2545452da09731",
      "b6792a8c9ff27eb9f6e1ee56c2707783d8ee042b",
      "a3bc947d4bcb70be5c14f11ff56639a54b184b31"
    ],
    "minus": [],
    "sourcePlusPathsCount": 65
  },
  {
    "ref": "codex/t188-completion-integration",
    "sha": "430cc8cff8b730950623b5d97c725a05a257a904",
    "plus": [
      "d4ebc03411ec73e892a062bf8fb08452ce110e6a",
      "59acab77f7b44fe35cebf3aae0eb2070e7366ba1",
      "2a9389e5254d5e059d67a211fad5c915c942986c",
      "c21c80860a1215079f3a5a9df7c5094b9e166f4e",
      "afa63af1ede403070bc51611c0f16b2d7f992a08",
      "ea7a636ebb5cecad0df7b9f6da85f5fc15918842",
      "5a05526ff329c84d29227f1d4e928e9523df5d57",
      "96dc12c4c039a42ec521bf6a4e0d74a985775a70",
      "278f93795f84a6d735f27a5b970910d81f162507",
      "18092fc9afb54a18b0fb90e27e4305ddd5022fda",
      "fb915c373a2a1a330b1afb592b632f7738caf79e",
      "8ffa67567417e2b11f498b8dc72796c869524162",
      "d33a6fd187ef3cd6f908a97ae348ea12c11cf9bd",
      "f17c90a0b1358096086fae62839fae507d032235",
      "69fc9fad14b1cf1c2046721a8048a0c37b7d9ebb",
      "eab42768237a82b2fea2976a7031a18b0852a713",
      "3e190e18bd34b9587c727adea78268e2fabe850a",
      "2a3de3c777ec6413df9bf74e0a7156d3fa8925da",
      "ac8008d7c1ec5fb40e3e037fd879922a2d185cec",
      "bc1b13bc31eaf2e3d306c75fad1154fff7688150",
      "f4b0c492467525fd143fd486902ae070ff5620e5",
      "31309163ed73d58c44a23394a1e9367f5cd7843c",
      "4491de4359cfca193ed5c3223c1a573dcd365950",
      "3a551fb58c369f310dd13fde97cc246efbb90a8e",
      "6dd9db7acbcc80a85075f07a40964dd014d24454",
      "8b8d6d1eaa3a965da67d61a0513dfcba2f3e0c29",
      "109b2d95fe6159f8365450ca3bf1a9135024d135",
      "46f7f5c8af6b36007c1c6897379e60527db0f94d",
      "4b0b69b55553f809446a8ea83e32cc7314e0ebf4",
      "ed97f5473d0f7c5ae7f8acbe993a27e73686b28d",
      "e70bd7519a1462d9cdf98e1de023029b6d4b4775",
      "24b432b1e0f1a5067a555f766b0d1b66aa1f3c1e",
      "6597ae18980a02c4dea6ade4e79eb30735058c1b",
      "c4e13e27d5ecfaec67d9da0a80d3de667e5c3aaa",
      "eae717e97cf308f9b01db8839cf819e574df1314",
      "00a5be6ea720648e1e981c9d42c486a2c2a1d325",
      "af34bef454d4bab319e75806c068b9f3a7f8bf3f",
      "109048202afbc40e5ea4cec7f6ce0ae830ebaf94",
      "daa8cc7f0b785f83e37ae65be31c79749ce71217",
      "5a472fb018609517f8feb17c8adb0c358e1f3bab",
      "913bb075f538761f233117f780cc4e75a06b5eee",
      "4a371020ad7cc45ce01988a0320d67ad87ec1fd1",
      "a9d06c01a8f3bff6f4323c438b6d569753675f2c",
      "191d0a7137673f33a6abc33e0efe7352a7ac512b",
      "d078e2143b5aefe4c84753cd65259a1cb6334f66",
      "8826031fa0f2d6f8623ac5be400b6bea8011ae7f",
      "430cc8cff8b730950623b5d97c725a05a257a904"
    ],
    "minus": [],
    "sourcePlusPathsCount": 102
  },
  {
    "ref": "codex/t705-startup-http-ready",
    "sha": "b0a7f88b8634545deb4034f7a90065695d908eae",
    "plus": [],
    "minus": [
      "b0a7f88b8634545deb4034f7a90065695d908eae"
    ],
    "sourcePlusPathsCount": 0
  },
  {
    "ref": "codex/t735-managed-output",
    "sha": "6747569bf5a2f00b9cbef7bc7e59dc185216e537",
    "plus": [
      "6747569bf5a2f00b9cbef7bc7e59dc185216e537"
    ],
    "minus": [],
    "sourcePlusPathsCount": 20
  },
  {
    "ref": "codex/t915-asr-fallback",
    "sha": "c90eef6a2bf767845c9932d813dc3830c9150a94",
    "plus": [],
    "minus": [
      "c90eef6a2bf767845c9932d813dc3830c9150a94"
    ],
    "sourcePlusPathsCount": 0
  },
  {
    "ref": "codex/t915-asset-legacy-resume",
    "sha": "e83b92a133389d8dddac31649576aeb201ca9d00",
    "plus": [],
    "minus": [
      "25c34d109bc6354b1dd2374949f16cb52692276f",
      "42bbcbfbab7c9a06b0ce8f28a86b9602987fc85a",
      "e83b92a133389d8dddac31649576aeb201ca9d00"
    ],
    "sourcePlusPathsCount": 0
  },
  {
    "ref": "codex/t915-chat-composition",
    "sha": "498bd848bf624ac7b42dd88d97d91018c13ceaf3",
    "plus": [],
    "minus": [
      "4dac2bf9606cdc870fe33a5bef122754335fd9b5",
      "498bd848bf624ac7b42dd88d97d91018c13ceaf3"
    ],
    "sourcePlusPathsCount": 0
  },
  {
    "ref": "codex/t915-chat-remaining-tools",
    "sha": "4fc4de24233881b2392e8cb70d362b80fb583a2c",
    "plus": [
      "f83210e61c917d922aba80dd909d25e3a963a035",
      "b0508f7f0b0d7d99f0fda0c675ea3a83d930ba43"
    ],
    "minus": [
      "4fc4de24233881b2392e8cb70d362b80fb583a2c"
    ],
    "sourcePlusPathsCount": 15
  },
  {
    "ref": "codex/t915-chat-retire",
    "sha": "ba720d5a9ee6e889439561fe6a3fb03acc965cb5",
    "plus": [],
    "minus": [
      "ba720d5a9ee6e889439561fe6a3fb03acc965cb5"
    ],
    "sourcePlusPathsCount": 0
  },
  {
    "ref": "codex/t915-collector-abort",
    "sha": "f1204a35ea5bbe442c7045156d0ef8e2d6d72ee1",
    "plus": [],
    "minus": [
      "f1204a35ea5bbe442c7045156d0ef8e2d6d72ee1"
    ],
    "sourcePlusPathsCount": 0
  },
  {
    "ref": "codex/t915-flywheel-worker",
    "sha": "0874b90eb54c31401b5dcd1e17c9ca87a4767f33",
    "plus": [
      "6b45766a70801bdcc63adff7cfc6822c97e66937",
      "44dd592b09e6720cefa43d1f4df5d743332c93c3",
      "0874b90eb54c31401b5dcd1e17c9ca87a4767f33"
    ],
    "minus": [],
    "sourcePlusPathsCount": 19
  },
  {
    "ref": "codex/t915-formal-chat-entry",
    "sha": "b0213b2b97a2bc13df1df80d39ecac7daad5cc10",
    "plus": [
      "98a0d7de42785965f1324998d083b3a2517399a7",
      "7280c05033472b792c68d74b98d894c2d3a24149",
      "d8624cd6c7deeb3082b9da84bed5086cd6c875f6",
      "fde581d890607837c02030b6e3b9a9961bb845a2"
    ],
    "minus": [
      "62511d10b0a8e3b27dd59329fe7506391e2992a7",
      "47b4766a3a793a829320906fa9240aa7e27f34f9",
      "b0213b2b97a2bc13df1df80d39ecac7daad5cc10"
    ],
    "sourcePlusPathsCount": 21
  },
  {
    "ref": "codex/t915-intelligence-generations",
    "sha": "7ab4fa4f4d073c95954344ee6baa66aee72d9eb2",
    "plus": [
      "7ab4fa4f4d073c95954344ee6baa66aee72d9eb2"
    ],
    "minus": [
      "f9ce44eef236e33f1340bb9e08611fa6ab73251d"
    ],
    "sourcePlusPathsCount": 18
  },
  {
    "ref": "codex/t915-intelligence-retry",
    "sha": "f683f664f8e2f2d47a94f4f31c4a12e5fb6dc8c6",
    "plus": [
      "4eb5bff603c6f9e3b066e13c273e2ae77e83542d"
    ],
    "minus": [
      "f683f664f8e2f2d47a94f4f31c4a12e5fb6dc8c6"
    ],
    "sourcePlusPathsCount": 4
  },
  {
    "ref": "codex/t915-intelligence-task-actions",
    "sha": "762cdb5ab6a5b197dc089e1821a79b583522a4ed",
    "plus": [],
    "minus": [
      "762cdb5ab6a5b197dc089e1821a79b583522a4ed"
    ],
    "sourcePlusPathsCount": 0
  },
  {
    "ref": "codex/t915-intelligence-transcript",
    "sha": "16c44974ddb4c98c3955b301e6288d705a43768e",
    "plus": [
      "23dcd8a3893a2fb29884658419ffa23729dabc12",
      "16c44974ddb4c98c3955b301e6288d705a43768e"
    ],
    "minus": [
      "2aacd1b47a77e836768fff1707d295139d3d4d28",
      "7d6bb0229ec98a5731c618cfab9a013c2608f912",
      "bf83e3a3c801cf049a8574d6289ebaf18c39c20b",
      "bf50550f3fc0cb08b072a4c9250b4e15febb8217"
    ],
    "sourcePlusPathsCount": 15
  },
  {
    "ref": "codex/t915-intelligence-workbench",
    "sha": "b1ee8cee42afa0d2e5792d33b389f6604c26c8e4",
    "plus": [],
    "minus": [
      "b1ee8cee42afa0d2e5792d33b389f6604c26c8e4"
    ],
    "sourcePlusPathsCount": 0
  },
  {
    "ref": "codex/t915-postprocess-ledger",
    "sha": "80d66981ecc3b7dc84e083233d85a0157cf563c3",
    "plus": [
      "cd07d0b81cb47b8bf259cb3eea485588a5255549"
    ],
    "minus": [
      "dbd840e6efc5e86762c90f9401133f05b4c9577b",
      "a22b1fa1517c137a2d5322c116fbca00692d9333",
      "1befa8d97347e921970a27bc72972601298b5ea6",
      "1304ba8148992052b9a3dbdedbd881666ab26bf0",
      "7443d2895c4fd6937579c2a517d409c62619570e",
      "88b6a18082a004cbb95d548a241c4a854291bb85",
      "80d66981ecc3b7dc84e083233d85a0157cf563c3"
    ],
    "sourcePlusPathsCount": 19
  },
  {
    "ref": "codex/t915-preference-worker",
    "sha": "fa2371bcfbf177cdf8d17b8f57ab4ca300d758da",
    "plus": [
      "c79918b174d796280e7f6ce850e6661f6aae16fa",
      "773f48bb61f1cadabfa1468d6ae67cf9e75ed103",
      "fa2371bcfbf177cdf8d17b8f57ab4ca300d758da"
    ],
    "minus": [],
    "sourcePlusPathsCount": 22
  },
  {
    "ref": "codex/t915-production-a08",
    "sha": "a27e5eb4e4f0fd58ce8da2ef3781aa3cf10b7e5e",
    "plus": [],
    "minus": [
      "a27e5eb4e4f0fd58ce8da2ef3781aa3cf10b7e5e"
    ],
    "sourcePlusPathsCount": 0
  },
  {
    "ref": "codex/t915-recovery-wake",
    "sha": "d78084cba13756e0a836e7050ddd8915fb11e2ef",
    "plus": [],
    "minus": [
      "d78084cba13756e0a836e7050ddd8915fb11e2ef"
    ],
    "sourcePlusPathsCount": 0
  },
  {
    "ref": "codex/t915-remaining-task-workers",
    "sha": "375ba4f0e06eec57224f29269d9f46de62581177",
    "plus": [
      "282f496d1415cfd12b4ca7ef693fe8b9d0ee5cf5",
      "375ba4f0e06eec57224f29269d9f46de62581177"
    ],
    "minus": [],
    "sourcePlusPathsCount": 34
  },
  {
    "ref": "codex/t915-retire-structured-runners",
    "sha": "48d8c58288c6b52113519a6b4145c36637d8d468",
    "plus": [],
    "minus": [
      "48d8c58288c6b52113519a6b4145c36637d8d468"
    ],
    "sourcePlusPathsCount": 0
  },
  {
    "ref": "codex/t915-search-background-index",
    "sha": "46d2460a056499e8e9c5d5ea114fc4137bfe26be",
    "plus": [],
    "minus": [
      "46d2460a056499e8e9c5d5ea114fc4137bfe26be"
    ],
    "sourcePlusPathsCount": 0
  },
  {
    "ref": "codex/t915-settings-model-region",
    "sha": "d9db7d889d817e10401e5877f915454126a63d74",
    "plus": [],
    "minus": [
      "d9db7d889d817e10401e5877f915454126a63d74"
    ],
    "sourcePlusPathsCount": 0
  },
  {
    "ref": "codex/t915-share-dialog",
    "sha": "1581df7f9e4d8d69b9c1b94953f80708ef98e150",
    "plus": [],
    "minus": [
      "1581df7f9e4d8d69b9c1b94953f80708ef98e150"
    ],
    "sourcePlusPathsCount": 0
  },
  {
    "ref": "codex/t915-share-recovery",
    "sha": "032538a015421f63dc6d8a0e8d91e1ecb0e4f8d7",
    "plus": [
      "032538a015421f63dc6d8a0e8d91e1ecb0e4f8d7"
    ],
    "minus": [],
    "sourcePlusPathsCount": 8
  },
  {
    "ref": "codex/t915-shell-stop-proof",
    "sha": "3eb06ea4e0ccd562643e66b7d6b7c0aa12e8a4d2",
    "plus": [],
    "minus": [
      "3eb06ea4e0ccd562643e66b7d6b7c0aa12e8a4d2"
    ],
    "sourcePlusPathsCount": 0
  },
  {
    "ref": "codex/t915-task-status",
    "sha": "f92d23cab5ff3e9851898a19de4b12fd63f2f76c",
    "plus": [],
    "minus": [
      "f92d23cab5ff3e9851898a19de4b12fd63f2f76c"
    ],
    "sourcePlusPathsCount": 0
  },
  {
    "ref": "codex/t915-transcribe-complete",
    "sha": "c11e7f604378fc45b4f5472cf20aa0e512335e80",
    "plus": [
      "c11e7f604378fc45b4f5472cf20aa0e512335e80"
    ],
    "minus": [
      "7aef6da626cc23559461e867b0f7d12549da7300"
    ],
    "sourcePlusPathsCount": 4
  },
  {
    "ref": "codex/t915-transcribe-profile",
    "sha": "7b62ab31dccc506c5554c4bc2c2863e76b563dfa",
    "plus": [],
    "minus": [
      "7b62ab31dccc506c5554c4bc2c2863e76b563dfa"
    ],
    "sourcePlusPathsCount": 0
  },
  {
    "ref": "codex/t915-transcribe-source",
    "sha": "3a034d860118815fc910a79b7a229eec61a92a26",
    "plus": [],
    "minus": [
      "3a034d860118815fc910a79b7a229eec61a92a26"
    ],
    "sourcePlusPathsCount": 0
  },
  {
    "ref": "codex/t915-trend-probe-io",
    "sha": "1dda8dc251bc0ba3a748f730af652c767d8f5a0d",
    "plus": [
      "1dda8dc251bc0ba3a748f730af652c767d8f5a0d"
    ],
    "minus": [],
    "sourcePlusPathsCount": 19
  },
  {
    "ref": "codex/t915-whisper-cancel",
    "sha": "a41dcd787a7160bb8bf5a04345101486a9c130de",
    "plus": [],
    "minus": [
      "b52f9a8ac5a6f05cfc35ddacd955445ed613e039",
      "f011d311553baf56f7607d8e00648fd2a831fc03",
      "cb0c5c8dab210c0468830308cabab0190fd359ae",
      "a41dcd787a7160bb8bf5a04345101486a9c130de"
    ],
    "sourcePlusPathsCount": 0
  },
  {
    "ref": "codex/t915-worker-package-closure",
    "sha": "8ae269f1149a9e2eb80bd733bb63b6020f19ed19",
    "plus": [],
    "minus": [
      "8ae269f1149a9e2eb80bd733bb63b6020f19ed19"
    ],
    "sourcePlusPathsCount": 0
  },
  {
    "ref": "codex/t923-chat-pi",
    "sha": "ac1a9cc1d9d155546c8afd591de616961805033c",
    "plus": [],
    "minus": [
      "1b2c5087e95918d572d39bcb6477f648e87e7df6",
      "ac1a9cc1d9d155546c8afd591de616961805033c"
    ],
    "sourcePlusPathsCount": 0
  },
  {
    "ref": "codex/t923-continuous",
    "sha": "3f1e15f9fbe0ec0a84ac8b14f56f9439dc906d1d",
    "plus": [],
    "minus": [
      "3f1e15f9fbe0ec0a84ac8b14f56f9439dc906d1d"
    ],
    "sourcePlusPathsCount": 0
  },
  {
    "ref": "codex/t932-methods",
    "sha": "784d57df9807121d5aacf88eeb649bff91453bfe",
    "plus": [],
    "minus": [
      "784d57df9807121d5aacf88eeb649bff91453bfe"
    ],
    "sourcePlusPathsCount": 0
  },
  {
    "ref": "codex/t957-legacy-patch",
    "sha": "ebaa17bbd449455f600cce7b23f0ecd516d6453d",
    "plus": [],
    "minus": [
      "ebaa17bbd449455f600cce7b23f0ecd516d6453d"
    ],
    "sourcePlusPathsCount": 0
  },
  {
    "ref": "codex/t957-review-evidence",
    "sha": "9b37586bf9505aed1311242c64ebf2899c58487f",
    "plus": [],
    "minus": [
      "9b37586bf9505aed1311242c64ebf2899c58487f"
    ],
    "sourcePlusPathsCount": 0
  },
  {
    "ref": "codex/t959-diagnosis",
    "sha": "565247591683eb7488bd10a814e48e939465ee01",
    "plus": [],
    "minus": [
      "565247591683eb7488bd10a814e48e939465ee01"
    ],
    "sourcePlusPathsCount": 0
  },
  {
    "ref": "codex/t959-review",
    "sha": "a02909113b8f340da889d0ca43701db620e61301",
    "plus": [],
    "minus": [
      "bf56fa7cc314e57d2a072536f095e5f0b8ffe4da",
      "a02909113b8f340da889d0ca43701db620e61301"
    ],
    "sourcePlusPathsCount": 0
  },
  {
    "ref": "codex/t962-redfox",
    "sha": "3621dbeecebcabaa8d4334e73d660d494a300e48",
    "plus": [],
    "minus": [
      "3621dbeecebcabaa8d4334e73d660d494a300e48"
    ],
    "sourcePlusPathsCount": 0
  },
  {
    "ref": "codex/t962-sync",
    "sha": "5a49995b717d49d9c5dedbf218f1094fec653900",
    "plus": [
      "13012b83658d7bfaa8de4b929e5bb46ee8bfe7b1"
    ],
    "minus": [
      "5a49995b717d49d9c5dedbf218f1094fec653900"
    ],
    "sourcePlusPathsCount": 34
  },
  {
    "ref": "codex/t964-onboarding",
    "sha": "954b8a8cfdc1d68800114e08cae3d15e6f8d682b",
    "plus": [],
    "minus": [
      "954b8a8cfdc1d68800114e08cae3d15e6f8d682b"
    ],
    "sourcePlusPathsCount": 0
  },
  {
    "ref": "codex/t964-report",
    "sha": "176e08be8945fcb72ecbecc7d9d89d68ef82208a",
    "plus": [],
    "minus": [
      "176e08be8945fcb72ecbecc7d9d89d68ef82208a"
    ],
    "sourcePlusPathsCount": 0
  },
  {
    "ref": "codex/t965-read-model",
    "sha": "3e5f20cd1cbc90ed582e3e689e7a7fb3b1f62c06",
    "plus": [],
    "minus": [
      "afe9985d9e1d493a4b17ea2b6bc978b7f181432b",
      "75d6c2a47ba4e798bd7fb2ab2990e34eb13c8309",
      "3e5f20cd1cbc90ed582e3e689e7a7fb3b1f62c06"
    ],
    "sourcePlusPathsCount": 0
  },
  {
    "ref": "codex/t965-report-ui",
    "sha": "35d5f7791d374c5be2474223bf6f43cfa81acbea",
    "plus": [],
    "minus": [
      "b3e3160ac7dc018a4149d586cc80d4fde4723fdc",
      "cffc06c331ee7ce00ea3157e32c25430e8b47ffa",
      "35d5f7791d374c5be2474223bf6f43cfa81acbea"
    ],
    "sourcePlusPathsCount": 0
  },
  {
    "ref": "codex/t966-period-ui",
    "sha": "db526d2409b77313a26a49249ef20391805e0325",
    "plus": [],
    "minus": [
      "db526d2409b77313a26a49249ef20391805e0325"
    ],
    "sourcePlusPathsCount": 0
  },
  {
    "ref": "codex/t967-share",
    "sha": "92be27a57092c19f9d9ce2c80a692b613176c6e5",
    "plus": [],
    "minus": [
      "8475ec1e9f2cf519fe4e6c818b2822394ffd1066",
      "92be27a57092c19f9d9ce2c80a692b613176c6e5"
    ],
    "sourcePlusPathsCount": 0
  },
  {
    "ref": "codex/t983-account-concurrency",
    "sha": "13e8e3ca75dcf144480e3fac483d93a4850df1ee",
    "plus": [
      "13e8e3ca75dcf144480e3fac483d93a4850df1ee"
    ],
    "minus": [],
    "sourcePlusPathsCount": 10
  },
  {
    "ref": "codex/t983-collection-state",
    "sha": "fd232ef8d5883be86af02d270a5d41ccfc8b1b87",
    "plus": [
      "fd232ef8d5883be86af02d270a5d41ccfc8b1b87"
    ],
    "minus": [],
    "sourcePlusPathsCount": 3
  },
  {
    "ref": "codex/t983-resource-wait",
    "sha": "e8f7e1bd65c1e6a36d05fa3d510b4bf48d9c24c9",
    "plus": [
      "7dfecedf85b46b252845aff83d8af2eff417b5ac",
      "a8d4954248601672a0d76870987e0f8b02329df0",
      "e8f7e1bd65c1e6a36d05fa3d510b4bf48d9c24c9"
    ],
    "minus": [],
    "sourcePlusPathsCount": 20
  },
  {
    "ref": "codex/t983-run-controls",
    "sha": "61b00e219580337e8f8a19ba377d6311e6f1e5df",
    "plus": [],
    "minus": [
      "8570fcbec188fce3dd3f3ab2dbbf9cd3de256320",
      "61b00e219580337e8f8a19ba377d6311e6f1e5df"
    ],
    "sourcePlusPathsCount": 0
  },
  {
    "ref": "codex/t983-run-now",
    "sha": "f0ea4d33acc2e923d640646995f1e526d2a1893a",
    "plus": [],
    "minus": [
      "45012cb7a27a3f20d7c3911cbfe97ea7ffd80d04",
      "f0ea4d33acc2e923d640646995f1e526d2a1893a"
    ],
    "sourcePlusPathsCount": 0
  },
  {
    "ref": "codex/t983-separate-jobs",
    "sha": "014f089194c49e6b647c4df0f6900c981d2fc7ef",
    "plus": [
      "fd232ef8d5883be86af02d270a5d41ccfc8b1b87",
      "014f089194c49e6b647c4df0f6900c981d2fc7ef"
    ],
    "minus": [],
    "sourcePlusPathsCount": 10
  },
  {
    "ref": "codex/t983-separate-ui",
    "sha": "43bb13176b446f4c0dd61065bdf9f1194fbbd5bb",
    "plus": [
      "fd232ef8d5883be86af02d270a5d41ccfc8b1b87",
      "014f089194c49e6b647c4df0f6900c981d2fc7ef",
      "43bb13176b446f4c0dd61065bdf9f1194fbbd5bb"
    ],
    "minus": [],
    "sourcePlusPathsCount": 17
  },
  {
    "ref": "codex/t983-stagger",
    "sha": "96f9336d1ffb2f1228964511a3cf31a8e610a019",
    "plus": [
      "96f9336d1ffb2f1228964511a3cf31a8e610a019"
    ],
    "minus": [],
    "sourcePlusPathsCount": 7
  },
  {
    "ref": "codex/t985-browser",
    "sha": "6ce982aa4fc3836be20b325d68501ca28925a0b3",
    "plus": [],
    "minus": [
      "fd0000712b1b5657fd514aa86a549dfb8f438694",
      "6ce982aa4fc3836be20b325d68501ca28925a0b3"
    ],
    "sourcePlusPathsCount": 0
  },
  {
    "ref": "codex/t985-cooldown",
    "sha": "2d3f808bd7be82b18bc89c58028f592a4052072d",
    "plus": [],
    "minus": [
      "2d3f808bd7be82b18bc89c58028f592a4052072d"
    ],
    "sourcePlusPathsCount": 0
  },
  {
    "ref": "codex/t985-cover-cache",
    "sha": "f4d557bf3cd4171b6b114f112118c71be3f1fc05",
    "plus": [],
    "minus": [
      "f4d557bf3cd4171b6b114f112118c71be3f1fc05"
    ],
    "sourcePlusPathsCount": 0
  },
  {
    "ref": "codex/t985-progress",
    "sha": "107acf8c5379697e2d83da80df47e4fa10093cb9",
    "plus": [],
    "minus": [
      "107acf8c5379697e2d83da80df47e4fa10093cb9"
    ],
    "sourcePlusPathsCount": 0
  },
  {
    "ref": "codex/v1.0-candidate",
    "sha": "b81e2627389cfbeb4d0d92818d1207475f2b16c5",
    "plus": [
      "b81e2627389cfbeb4d0d92818d1207475f2b16c5"
    ],
    "minus": [],
    "sourcePlusPathsCount": 20
  }
]
```

## 最终冻结更新

审头 `b5d256c8287807f5a8d2115030b3672b54ba9c2b`。Readset SHA256 `6b2e44ae17a3bdd813fc1e1faaea94a7264702fa6a7b6258c2e195798dd504c9`；完整审头/工作树75路径精确绑定，2删除null，48候选路径exact。修复后root回执实读：backend100通过/2跳过、front95、runner23、contract35、backend/front类型0、LED047174、packaging45、native隔离17；原失败回执不覆盖。完整最终复核见 source-final-review.md。本轮源码findings为空，旧配对T1197仍未进入当前产品；全库reconcile与后续打包不由本源码签名代验。
