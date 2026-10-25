# T-1406 B：规则组归属与蒸馏采纳调查

状态：仅源码调查与实施边界建议，尚未实施、未跑红绿回归。当前产品来源为 `6592b575`，工作树包含已有 T-1405 未提交内容；未访问安装库、密钥、UI或GitHub。已读最新AGENTS；codegraph工具和本机命令不可用，按规则以rg兜底。

## I-02 已证根因和所有入口

`backend/src/schema/review-gate.ts:12-34` 的review_rules只有user_id，没有group/account列；`review-gate.service.ts:118-121` 构造仓储只传userId。仓储 `review-gate.repository.ts:73-161` 的list、active词表、get、create、patch和delete均为user域。契约 `contract/src/workspace-operation-scope.ts:292-297` 则把规则操作声明为group，报告声明project-derived，确有归属实现不一致。

公开写入口为reviewRules.create/patch/delete，均经review-gate.transport→service→repository；source=retro仍必须candidate，不能借修复改成AI自动active。内部种子入口在 `frontend/src/server/persistence-client.ts:6820-6828`：rrule-seed-用户前缀、onConflictDoNothing。实际审稿执行读取 `backend/src/modules/ai-runtime/script-review-context.ts:73` 的listActiveLintRules，必须与管理列表使用同一生效规则选择。scriptReviews.getLatest/trigger和内部saveReport还须保留真实项目父门，不能仅让管理列表表面隔离。

上次 `review-gate.contract.test.ts:7,24-31` 只验证other-user隔离，ctx没有group；不是同用户跨组的证据。

## I-02 与根SPEC一致的最小方案

1. review_rules新增nullable group_id及按user/group/status查询的索引。新manual/retro创建只能从真实ctx盖组，拒绝body指定归属；新group规则的list、listActive、by-id改删统一当前组谓词及组/成员写保护。
2. 既有NULL行原样保留，来源seed显式标系统共享，其余标历史共享；保留原ID、内容、active/disabled、时间及原有效性。不推断创建组、不批量回填当前组、不删除或全复制。新group行永不回流到共享层。
3. DTO增量返回scope（group/system_shared/legacy_shared）、groupId及适用/可编辑说明；旧响应缺字段兼容。有效lint=可信共享兼容层+当前组私有规则，跨用户仍结构性不可见。UI清楚告知旧共享行不代表已完成组隔离。
4. 后续显式归组/共享规则覆盖另做对象级选择，不在此次补迁移。普通组上下文不能无提示改写共享层；推荐旧共享行经普通组CRUD只读，并明确提示其共享性质。若独评决定保留共享修改，必须增加明确的共享范围确认，不能静默影响其他组。
5. scriptReview报告只按真实项目派生访问范围；历史报告不重算。新后台任务使用冻结组，缺组老任务不猜当前活动组。

必要回归：同user A/B创建/list/active/patch/delete隔离、跨user404、retro候选、归档/版本冲突无写入、旧共享层仍有效且明示、迁移/seed幂等且旧字段全同、实际lint选组正确、旧meta空/非空响应保持合法。

## I-06 已证根因及应保留入口

`knowledge-atom-gate.tsx:126-134,145-190` 只在React存adoptedCount，逐条普通knowledge.create并最后才设完成；刷新清状态，部分失败已写不回滚且提示重试。`chat-distill-card.tsx:81-85` 仅传atoms/tags/originalText。`ai-copilot-content.tsx:1323-1328,3394-3411` 已有稳定workSourceLocation，却未交给蒸馏卡。

普通knowledge.create仅评论外部锚去重（knowledge.service.ts:170-193），不能改为全文hash全局去重，否则会破坏手工重复录入的合法意图。必须保留知识库/原文文件录入、评论QA回流、复盘、弹药、seed、ingestion、research-material-adoption及既有agentic_proposals确认入口。

现成 `knowledge_adoptions` 按user/group/proposal唯一，回执不随实体删除；`knowledge-proposal-adoption.service.ts` 提供同事务创建和稳定重放模式，但只写reference/import并要求真实agentic来源，不能直接伪造task/tool/evidence或丢掉四原子类型复用。现有work-candidate-source.service仅允许work.editor.propose/work.creation.propose，也不能无校验拓宽为任意知识工具。

## I-06 最小后端闭环

- 给蒸馏卡传真实持久conversation/message/toolCall定位；服务端沿实际任务、执行账本、工具输入/输出验证来源、候选、原文和当前组。若从knowledgeGeneration取得taskId/resultId，应保留原真实身份的additive envelope，不能新造ID冒充来源。
- 新增只读采纳状态/回执操作和本地事务adopt操作；来源验证与写入分别成独立service，避免扩宽旧work工具白名单。effect为read/write，不触发模型。
- 稳定批身份由真实来源决定，候选使用稳定索引/原子ID，archive原文使用独立稳定子键。不能只靠随机请求幂等键或正文hash。
- 服务端重读候选，校验用户选择和允许编辑字段；selected原子+可选archive+回执同事务，组/成员与候选锁定。失败全回滚；相同意图重放原ID，采纳后变更意图409或回读原回执，不新建副本。
- 刷新先读回执再渲可操作状态；原文归档同样幂等。标签best-effort不能反过来使核心条目重复；知识索引和来源metadata走既有domain/投影端口。
- 历史已重复条目保留，不按文本猜测删除。旧卡缺子任务envelope时，只能从真实持久tool账本唯一恢复；缺可验证证明则说明原因，不能伪造来源。
- SPEC需明确一次选中子集确认后整批结束（未选明确舍弃），或允许分次采纳并逐原子收回执。建议一次确认决策收口整批。
- 通用knowledge_sync_candidate确认G02范围另列：只实现蒸馏不能宣称classify/relate/qa均已修。

必要红绿回归：首次6+archive恰好7；刷新/重启/换请求键/并发/响应丢失重试ID不变；第二写故障整批0写入；变更已采纳意图不重复；跨组/伪造source/切组迟到拒绝；四类型、正文、出处、tags、archive与搜索精确；普通knowledge.create和评论锚行为不回归；旧条目不改。

## 建议实施文件边界

规则：backend/src/schema/review-gate.ts、backend/src/modules/review/**、必要backend/drizzle迁移/lineages/meta、contract规则resource、最小设置说明和实际lint读取。
蒸馏：backend/src/modules/knowledge新增source/adoption服务、既有knowledge事务端口、必要回执schema迁移；contract知识resource/operations/endpoints/index、cli-policy及workspace-operation-scope；ChatDistillCard/KnowledgeAtomGate和ai-copilot-content的最小来源传递；persistence-client最小装配及相应测试。

当前根SPEC写入边界未明确列出实际schema路径 `backend/src/schema/**`、迁移实际路径 `backend/drizzle/**` 和新operation必改的 `contract/src/cli-policy.ts`、`contract/src/workspace-operation-scope.ts`。应由根补充并独立核对后实施，不改无关模块。

完整结构化调查底稿：`work/creatoros-installed-full-validation-20261025/t1406-i02-i06-readonly-investigation.json`。其中旧归属方案是供决策的草案；以根T-1406 SPEC的历史共享兼容决策及独立评审结论为准。
