# T1285 实现独立只读审核

审核者 `/root/integration_review`，与本次生产实现分工独立，homogeneous / inherited（同模型、继承上下文）。仅阅读当前 diff、测试源码、已有日志与严格回执消费者；未运行测试、浏览器、模型或完成工具，未改生产、暂存或任务状态。本结论不代签公共浏览器复验。

## 实现结论

未发现当前生产 diff 的阻断缺陷，改动与批准 SPEC 一致。`production-script-markdown-panel.tsx:59–73` 的次序为原 receipt → 同 output current → 同原 request receipt。第一处/第二处 receipt、current、scene digest 与成功回调 await 后均保留 check；run 的 workspace capture 与 active 检查阻止切组/卸载晚响应落入新解锁分支。

- `:63` 要求 production savedBase、相同 productionId、current.revision 大于原 apply.expectedRevision。客户端按正式 contract 解码，不把任意缺失/NaN 字段作为合法 current。版本未前进或实体不符抛错保留 pending；HTTP 错误沿 run 错误分支保留。
- `:64–66` 第二次空回执前不会释放 pending。`persist({base:baseRef.current,draft:draftRef.current})` 同步成功后才 setPendingAdoption(false)，无 await 插入二者；持久化抛错仍保持等待和原存储。保留当前窗口 candidate/requestId/preview，不调用 complete、不自动 apply、不更换 base。
- 第二次有回执仍落到原身份和完整 scene digest 核对，再 await onRecoverReceipt 后 complete；失败不会把已保存结果当作双空。workbench 既有最新版本/本地轨道 guard 不变。
- 丢弃与备份按 pending 锁，解除后可用；文字仍按 candidate/request 锁，明确丢弃后解锁。符合“保留旧候选供核对、用户决定丢弃”的规格。
- 安全依据仍是后端同事务工程行锁、严格 CAS、actual+1 与原 request 版本回执，历史恢复不回退 revision；本轮没有扩大 unknown 结算规则。

## 测试证据与尚未闭合项

已读新增测试覆盖双空顺序/同原 request/无额外 adopt、草稿持久保留、丢弃后输入、同版本/错 productionId、不丢第二次成功回执、current 读错/切组、存储失败；旧未知刷新、原ID和完整 scene 正例仍在。源码没有新协议卸载 deferred 测试。

本轮第一次读取 `green.txt` 实际为 **12 tests / 1 failed**，失败是“缓存失败不解除原等待”，不能因文件名签 GREEN。测试当时在 `production-script-markdown-panel.test.tsx:39` spy `Storage.prototype.setItem`；`frontend/src/test/setup.ts:146–152` 在需要时安装自定义 StorageMock，该实例不必调用原 Storage.prototype，故应对实际 sessionStorage/prototype 注入并断言 spy 被触发。生产 persist→解锁顺序本身正确。此项已报主会话；后续日志若更新，由真实新运行报告闭合，不能覆盖第一次失败事实。

批准 SPEC 明确要求卸载晚响应；建议补一条最小代表：第二次 receipt 延迟时卸载，随后 resolve(null)，检查原持久 pending 记录不被降级、onRecoverReceipt 未调用。它直接覆盖新增解锁点，无需增加状态全排列。第二次 HTTP 错误/坏 digest 的保留从源码可见，本轮不冒称对应新负向测试已执行。

真实原 profile/tab/sessionStorage 的只读恢复、current5/完整计划不变、原 receipt 空、草稿/候选及丢弃编辑可用，仍以主会话实际公共回执为准。本轮没有浏览器签收。

## T1274 / T1275 / T1276 严格回执最小诚实收尾

`frontend-validation.mjs:148–166,663–697,812–823` 对 watched_paths 检查的是**整个路径的 Git 状态**，不是本任务 hunk。完成前后都要求无 staged/unstaged/untracked，复核已完成任务时也检查。因此精确提交自己的 hunk 后，共享文件残留 foreign hunk 仍会阻断；把 source 从 watched_paths 删除、只 watch 测试/证据、使用 assume-unchanged/skip-worktree、缩短合同以绕脏文件，都不能形成诚实的实现绑定。

最小流程如下：

1. 使用本任务真实改动/必要依赖的**精确文件列表**，避免 watch 整个 frontend/backend 或源码父目录把无关文件卷入。T1276 必须包含实际修复文件 `frontend/src/server/persistence-client.ts`，不能因为其中有 foreign 改动就排除；其公共回归对应测试也应列入。T1274 包含真实 contract、候选/Markdown adapter、面板/宿主、prompt 和原生修改的精确文件；T1275 按实际隔离启动/验证入口与所引用修复绑定，不为无生产改动的诊断任务虚构生产写集。
2. 主会话仅提交自己已审 hunk/必要依赖及证据，保留 foreign 工作区字节。对仍脏的 watched 文件分两条真实路径：由所属任务协调审阅提交，使当前工作区最终干净；或在本任务提交的独立干净 checkout 做收尾。后者不能复制 foreign 脏源码或旧 dirty build 来假装 HEAD；若 HEAD 缺运行依赖，只能补已批准的最小依赖，或如实停在未闭合，不混入整块 foreign 实现。
3. 干净 checkout 的验证必须真正由该 checkout 启动/构建的应用提供响应；不能把新 commit_sha 贴给仍从主脏工作区运行的 3919。复用已授权隔离素材/已保存候选和原回执，以无新模型的有限浏览器读回、预览、必要机械路径和两个视口完成新收尾。允许引用历史模型/ASR证据，但保留它们原始日期、原任务/调用ID和实际运行绑定；新 observed_at/commit_sha 仅描述新验证。
4. 三任务分别写真实 AC 映射的合同/报告；可共享原始证据与安全无模型收尾脚本，不把历史执行重标为新 HEAD。登记 allowlist 后 taskctl 会实际执行命令；按真实运行填报告/可见文案并在 HEAD 不变、watched 干净时完成。证据输出目录与控制面文档不要误放进实现 watched 列表造成验证自身输出污染，但真正验证脚本应先提交并绑定。
5. **独立 checkout 不是主脏工作区的洗绿捷径**：它只能产生对应干净 checkout 的真实通过。将其 completion/report 带回仍含 watched foreign 改动的主工作区，后续 reconcile 仍会报代码漂移；必须保留该事实，不能宣称主工作区严格 Gate 闭合。若不触及 foreign 源码且依赖/脏文件仍不可协调，最低成本诚实交付就是提交本任务实现与完备历史证据、记录具体 watched 文件阻断、保持“验收待验”，不能技术性绕过状态工具。

范围外 T1204 的原29ERROR可以按 AGENTS 明示保留；watched 实现漂移是当前严格回执自己的硬条件，不能归入 T1204 例外。无需为了回执新发模型、重演所有真实素材族或改写旧失败。

## 阅读快照

HEAD：`6b1a087b269d4f7902a2eb852a147170fab6d6ac`。

- `frontend/src/features/production/production-script-markdown-panel.tsx`：`3f70909e8910fbac50deecbdcea5a487239d0f1985b6416402192bcee08319df`
- `frontend/src/features/production/production-script-markdown-panel.test.tsx`：`30d9ce13d49485d594cd310a7d9aa97e67ba8eaa31f1ab1b42c938759c6e892a`
- `docs/verification/t1285/green.txt`：`56719fd78ab5aacc88d3093cba42f125ff1facd93f09783a6e641e9424762c63`
