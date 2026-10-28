# T-1410 批次 B 独立规格审核

日期：2026-10-25。审核者：独立子代理 `/root/t1427_pi_diagnosis`，继承宿主模型；未核实具体模型型号。本代理此前完成 T-1428，与本批七项 SPEC 的编写/修订不同范围。本轮只读取源码仓库中的规格、宪法和审核证据，只写本目录审核输出，没有修改 SPEC、snapshot、控制面或产品代码，没有执行真实业务。

## 审核方法与结论

读取 `canonical-repair-plan.json` 中本批七项完整条目、各自当前 SPEC 全文、原 canonical event 的完整 packet/findings、由 `restore_commit` 读取的原 review snapshot，以及现有 `reviewctl context` 输出的 changed_line_refs。T-824/819/816/768/726 按当前 SYSTEM_ARCHITECTURE 完整重审；T-707 保持产品宪法绑定与原 cycle recheck；T-703 另读原及当前 PROJECT 的规范正文、当前产品宪法全文与架构。

| 任务 | 录入类型 | 规格结论 | 原问题与本轮处理 |
| --- | --- | --- | --- |
| T-824 | 新 cycle initial | PASS，无当前 finding | 原 REV-001 断点/阶段/计数与恢复约束仍完整；核对新单写者、fence、当前素材、降级和真实链路 AC |
| T-819 | 新 cycle initial | PASS，无当前 finding | 原 REV-001 正文不变与技术 ID 自愈边界仍清楚；新增 snapshotRef 在候选创建前也拒绝换版 |
| T-816 | 新 cycle initial | PASS，无当前 finding | 原 REV-001 frontend/RPC 与 REV-002 稳定 sectionRef 保持解决；新图像候选/采纳约束符合单写者 |
| T-768 | 新 cycle initial | PASS，无当前 finding | 原 REV-001 空文本、REV-002 真实模式、REV-003 错误正文三项保持解决；unknown 在线账不被本地成功洗成失败 |
| T-726 | 新 cycle initial | PASS，无当前 finding | 原 REV-001 reconstruct、REV-002 三 runner、REV-003 两消费者素材边界均有明确 AC；新增旧任务迟到与当下真值守卫 |
| T-707 | 原 cycle recheck | PASS，原两项 resolved | 原 finding 全部冻结字段逐字段保留；只更新 resolution_evidence，无新 finding |
| T-703 | 新 cycle initial | PASS，保留 1 个 open minor | 原 REV-001..004 的实质修复仍在；新 REV-005 记录表格旧 PUT 与唯一窄写口不一致 |

这里 PASS 是依现有 reviewctl 规则得出的规格审核结论：open minor 不升级为 CONCERNS。本轮没有产品/安装/UI/真实付费调用验收证据，不改任何原任务验收状态。

## 绑定与来源

当前 SPEC SHA-256（审核时重新计算）：

| 任务 | SHA-256 |
| --- | --- |
| T-824 | `192b82d1165b95deb86983129be8d5683db1c60f6032ec1990798768e4e753d9` |
| T-819 | `b3f5b662689736181ccda4753f68d020c13954008318dc189c9ef309aebf09f8` |
| T-816 | `76f70923f3e92a895a3f43beb741c767139bc5afcd4010b00339dd3aa10b47b3` |
| T-768 | `7b662918812be8cad4a05bee49ce23682164b26283f3e2721da6d337fcb2339b` |
| T-726 | `4e03ba1b4410acafaf062a92574100f3b8f8ee92675d263998fc231d2d299aa7` |
| T-707 | `95911e86fb467094feff7b2bd997d1b9ce2bd2e1cbe9dedc4862517ae5f7bdea` |
| T-703 | `1624f50bb9f70d475bec8c633a7cc6f46d0d94f8fe4e01ecf6abfced36420460` |

当前 `orchestrator/SYSTEM_ARCHITECTURE.md` SHA-256：`eb1826d4c09054df622d9718c38ca372bd19833e72bd1a752757631a5747c1df`。
当前 `docs/产品定位.md` SHA-256：`86bc2c8add6a01ebf5b2ecf9de05d448770ca14a4e0bdbbf376fffc6387e3800`。
当前 `PROJECT.md` SHA-256：`e9085d32d6f91bbe1a251b502aeede8c338e95c87c9f809155c159b8b1b0ab13`。

各原 snapshot 的 receipt/latest_event_hash 均与 manifest 对应 canonical event 一致：

| 任务 | 原 receipt | snapshot 来源 commit | snapshot SHA-256 |
| --- | --- | --- | --- |
| T-824 | `18361dc8c3c3` | `5c3be5d18b1af36916466aaa0c13fbe79cd14c50` | `5abd502198d7139e994123cb47b0218878c76567eb3ed20336943b4fec96237e` |
| T-819 | `0425ab7b87b8` | `b79e65908db0c2a531e6ec12f686e741fa606537` | `ecf9c06b41fd924d0728ee0d475ee0334011c37db5790e6e86519a7db624ea0d` |
| T-816 | `fb03de3a57d7` | `b79e65908db0c2a531e6ec12f686e741fa606537` | `736f2b7f6bcb37106f0779598c7ffeca2b4dd219eb7fe0c75c4156c6feb804c2` |
| T-768 | `3eb18966ea59` | `63d5d04560d70ec404efc3168dd278c3715ca1c1` | `e6c699d4d7edb84d4ce1442c5c88276ae7cfe6ada80b67bc3e64e6b3c4b6c025` |
| T-726 | `2809820bf64a` | `cea33354718dc86c021b19eca8b5131149c87df8` | `7a778217f1342dfcd9fde9d49d179a9e1b20e1989c7cb78e1464359c216bf528` |
| T-707 | `06867c4bf60c` | `cea33354718dc86c021b19eca8b5131149c87df8` | `d7bffd9bc1ef312d8dcb4b89992ac09654b9866eb586a1be7d639042859ff28a` |
| T-703 | `c1a3920aea71` | `cea33354718dc86c021b19eca8b5131149c87df8` | `92e737014a163cb8ae80acdc9ab339e9104824085912355b2c97e6d0d5ef263a` |

注意：restore_commit 绑定的是 snapshot 恢复来源，不保证该提交里的 SPEC 恰好等于原审核 hash。T-819/T-816/T-703 的该提交 SPEC hash 不等于 canonical event，限定检查该路径最近 120 次历史也未找到字节相同版本，因此没有把对应 git diff 冒充 canonical 全文 diff。原通过条件来自完整 canonical event/findings；增量来自 reviewctl 冻结行指纹算出的 changed_line_refs；本轮另对当前 SPEC 做完整初审。T-707 的源 SPEC 与 canonical hash 一致，原 cycle recheck 有精确来源及 15 条实际变更行。

## 逐项实质核查

### T-824

§3.2–5 保留第一阶段口播、hash、inputFingerprint、Skill 版本、stage 和 storyboardAttemptCount 的原子断点，残缺或指纹不匹配失败关闭；不能靠进程重启清零重做预算。现 §3.0 将模型执行放在 Pi Worker、数据库与结果投影留在 Backend，§3.4 追加 operationId/attempt/fence，§3.6/8 区分可选素材移除降级与不安全根实体冲突。与当前架构新增的 execution_tasks 唯一执行权、可信执行上下文、Worker 不直连库一致。AC-5/7 覆盖并发重领和迟到，AC-8 明确真实任务/候选/采纳/下游预览和用户质量确认；本轮不代签这些运行证据。

### T-819

§3 和 AC-6 允许历史 ID 自愈但严格保持其他段落字段，消解原字节级冲突。§2、4、5 新增的 snapshotRef 从可信上下文注入，绑定读到的版本/hash/原文指纹，阻止旧 replacementText 被重新绑到同名的新段落；采纳时仍二次并发校验。语义定位归模型，代码仅守真实 ID、归属、结构、版本和 no-op，符合架构 §2.1/2.2。按钮模式、歧义澄清和非项目限制未扩大范围。

### T-816

§4 的 canonicalizeScriptSectionRecords、稳定 script-saved-N 与同版本一致数组解决旧 REV-002；§7 与 AC-8 明确 frontend→contract/RPC，解决 REV-001。新增图像候选封套绑定 user/account/project/task/sourceArtifact/version/hash，采用时重读当前稿，未采用不写正式素材绑定或当前封面。当前稿优先、历史恢复不以最大版本冒充 currentVersionId、任务真值覆盖旧 queued 文案、精确信息卡不交给自由生图均有明确验收。

### T-768

§3.3/4/6 与 AC-01/03/04 对原三项 finding 都提供稳定可执行要求。新 unknown 云端事实保留独立计费状态，本地成功只完成逐字稿；该 fallback 是原用户明确要求的本地能力，不是再次在线申请。Backend/Worker/frontend 所有权、单飞准备、取消与退出清理、独立 operationKey、当前音频与账号复核符合现架构。AC-04A 的崩溃演练、AC-05 双平台非 fixture 真转写仍需实际执行，现状缺证据不反推规格有缺陷。

### T-726

AC-02 对无树/有树 reconstruct 分别约束 artifact/version/hash，AC-03 同时覆盖 script.draft/planning.contract/planning.outline，AC-04 在统一 Backend 装配下覆盖两个消费端及三类素材，原三项完整销账。FR-02 新增非终态旧任务与迟到 Worker 拒写，FR-03 与 §4 消除前端业务装配并要求执行/采纳时重读。保留历史读兼容，不把隐藏 UI 当完整退役。AC-07 公共链路、候选、采纳和下游预览是运行验收边界。

### T-707

旧 REV-001 仍由 §4.3 的最高优先级生成短路和零证据 DRAFT_NOW 消解；旧 REV-002 仍由 §4.5、§8、AC-20 的适用范围与合法空缺消解。15 条变更行集中在无 session 生成的幂等闭环和产品人群 snapshot：user/account/idempotencyKey 加 manifest 指纹保持候选唯一，confirm 共用事务和当前 statement 前置条件，产品型 snapshot 随 statement 不可变与恢复，纯人设不造产品字段。JSON 完整复制原 finding，再仅更新 resolution_evidence，并逐字段断言其余内容相同；未重写通过条件或提高严重度。

### T-703 与 PROJECT 重绑定

已读原 PROJECT 中编导式产品定位、脚本/复盘主线、pnpm 房间和架构指向；原及当前 PROJECT 的规范定位正文相同，变化主要为生成态进度/任务地图。现产品宪法 §8.2 明确制作是可选工作面，§18 明确取代旧两阶段表述；不是借重绑定删除制作能力或扩大为专业 NLE。重新检查 P-01 人工确认、P-02 账号归属、P-04 本地隐私、P-05 恢复、P-06 受控成片，R-PRODUCTION/R-COPILOT、BR-01 单写者/BR-02 事务幂等/BR-03 历史保留，以及真实包发布门。全部原适用约束继续保留，可绑定稳定产品宪法。

原 REV-001 的窄写/确认顺序、REV-002 的真实 props 差异候选、REV-003 的受权 manifest/realpath/Range/no-store、REV-004 的确定性结构恢复均仍有正文和 AC。新增来源稿件/文件版本复核、确认渲染 operationKey、采纳幂等和本地包公开旅程补齐当前架构要求。结构恢复算法已有明确 SEMANTIC_BOUNDARY_ALLOW 和歧义失败边界，不能被用于语义选材。

新 REV-005 保留 §3:54 表格 `outputs.production.put` 与 :60 唯一 `productions.editing-plan.confirm` 的引用不一致。正文和 AC-703-3 已排除错误写法，因此定为 minor；不以对账授权擅改规格，不把它扩成第二次数据完整性阻断。主线程若要修订，应在 T-703 的精确规格范围内处理。

## 输出与录入边界

本目录 `T-824.json`、`T-819.json`、`T-816.json`、`T-768.json`、`T-726.json`、`T-707.json`、`T-703.json` 均仅包含 `schema/review_kind/summary/findings`，符合现有 `spec-review-round/v2` 输入形状。没有生成工具 receipt；cycle 授权、record、共享 snapshot 迁移和看板更新均由主线程按现有工具串行完成。实际 record 时若 SPEC/宪法 hash 已变化，应停在对应项核对新变化，不能直接复用本轮结论。
