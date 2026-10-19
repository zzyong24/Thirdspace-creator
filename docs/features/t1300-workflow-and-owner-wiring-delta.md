# T1300 必要前置与owner选项贯穿补充

本文件仅补充已授权T1300的三个精确缺口，不改变产品方向、公共事件/schema、权限、已确认功能矩阵或旧任务状态。Root明确同意这批最小delta后直接推进，不重新拉全量方案；主SPEC原锁定版本与第一次独评证据完整保留，本文由独立评审者核实后绑定主SPEC同一review lineage，不以换文件重置轮次。

## 两条现役配置尾星收窄

两终态module按原SPEC实际迁移成功，原配置完整字节、原定义、完成事件及其他206个module不变的证明已在`docs/verification/t1300/workflow/`保存。随后加T1300合法绑定，原`progress generate`实际exit2，下一层为T1294非法尾星。原失败保留在`workflow-green-progress.log`，文件名不是结果；后续命令只使用attempt编号。按原`isSafeRepoPattern`穷尽检查仅余以下两项，不修改函数或路径规则：

| module原write_set项 | 当前实际匹配的文件；替换为精确逐项路径 | 权限含义 |
| --- | --- | --- |
| `docs/features/t1294-model-settings-and-codex-chat-acceptance*` | `docs/features/t1294-model-settings-and-codex-chat-acceptance.md`；`docs/features/t1294-model-settings-and-codex-chat-acceptance.T-1294.review.md` | 从任意前缀匹配收窄为两个现存文件，不扩大权限、不编辑其内容 |
| `docs/features/t1295-desktop-csp-wasm-video*` | `docs/features/t1295-desktop-csp-wasm-video.md`；`docs/features/t1295-desktop-csp-wasm-video.T-1295.review.md` | 同上，不触旧任务、审核或CSP实现 |

只编辑`orchestrator/process/modules.config.json`的上述两条write_set值，保两任务其他字段及其余204个原现役module不变；新增T1300定义单独明确，不混为历史模块变更。原完整配置快照及两终态归档不覆盖；新增前后快照/精确结构差异与SHA。不得再归档其他任务、将末尾星放进allowlist、用目录`/**`扩大到整个docs/features，或改旧SPEC/回执内容。

验证：原generate新attempt真实执行、全部现役read/write/step路径按原规则通过；受控负例仍拒绝绝对路径、`..`、非末尾glob/尾星、控制面越权及符号链接逃逸；归档ID不能claim/compile；实际本项目context-plan/claim/packet使用真实安装skill。原57例流程命令50PASS/7FAIL完整保留，7为`context-compile.test.mjs`夹具把skill_dir固定成缺rules的仓库orchestrator目录；在临时真实skill布局复制**原字节脚本和原测试**、提供实际安装规则文档，完整重跑同三文件，另记环境化结果，不改vendor/断言或用新绿覆盖旧失败。

## owner声明装配再一处必要贯穿

`backend/src/modules/ai-runtime/chat-turn-preparation.ts`在frozenOptions及外层第二次`prepareChatToolDefinitions`需要贯穿同一已验证editorTarget.owner及冻结协议选项。仅在内层生成owner窄schema、外层仍按旧markdown前缀标识，会造成冻结definition不一致；这属于主SPEC已审owner新版本装配与严格重建的必要接线，不新增合同或放宽resolver。

精确新增B写集：`backend/src/modules/ai-runtime/chat-turn-preparation.ts`；原测试`backend/src/modules/ai-runtime/chat-assembly.test.ts`、`backend/src/modules/ai-runtime/assistant-director-methods.test.ts`；允许新增`backend/src/modules/ai-runtime/chat-turn-preparation.test.ts`（当前不存在，不能称为原测试）。其余源写集按主SPEC与RUNTIME_DESIGN，C更新T1300 runtime step metadata并由B独占修改，不互写前端/控制面。

验证新三owner声明在内层生成、外层冻结及原Host/adapter/source三resolver一致，旧director v1/v2/markdown冻结schema/description/hash不变，跨owner/混版/未知协议拒绝；记录当场RED→GREEN，不只测定义生成器。无额外worker/IPC、数据库迁移或生产模型重试。

## 前端准备凭据的必要消费接线

`frontend/src/features/copilot/ai-copilot-content.tsx`已在主SPEC候选文件中，本次明确允许的片段仅为embed.request可选opaque `PreparedEditorTurn` ticket、`sendPreparedRef`将ticket和当前scope交Provider消费、finally/取消/卸载清理；不改source/engine准入，不扩transport正文。Provider的ticket仅内存存在，不进wire/storage，绑定主SPEC的turn/entry token/owner/范围/generation/version/digest/writingContext/selection，一次消费、失效走原prepare；不因ticket省略后端当前真值/CAS。

workbench当次`port.prepare`可传`requireScript`，在本次真实latest.scriptContext判定，消除按钮额外latest；普通聊天不得新增脚本门，缺脚本时原重组错误与零提交不变。已审历史卡优化仅限原work.editor来源准备，不改work.creation卡默认行为。

A精确原测试补齐：`frontend/src/features/draft-workbench/draft-chat-request.test.tsx`、`article/article-workbench.test.tsx`、`projects/graphic-post-workbench.test.tsx`、`copilot/ai-copilot-content.test.tsx`、`copilot/chat-work-editor-card.test.tsx`（各后四路径均位于frontend/src/features下）；`frontend/src/features/article/article-workbench-save-race.test.tsx`为必要保存竞争回归，可在该原边界补断言。生产文件不超主SPEC原准备写集，不借机修无实证准入/模型来源。覆盖ticket一次消费/跨turn拒绝、同generation上下文变更、注销重注册、并发dirty/切组、finally/取消/卸载和普通聊天无脚本门；公共重组/校正采纳及脚本/另一平台不变仍必验。

## 授权与收尾

Root已就以上现象、最小收窄及A必要消费接线作出明确方向批准，详见DEC-130002。当前只是补充SPEC，未执行两glob编辑或A/B源码修改。独立评审通过后才做该数据纠正、精确module写集更新、真实packet/lease及干净基线提交，再释放B写权。原主SPEC、矩阵和评审版本不删除；同一任务通过受支持reviewctl recheck记账，不创建新initial或伪造审核。
