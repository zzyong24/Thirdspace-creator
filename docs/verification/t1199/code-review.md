# T1199 当前实现独立只读代码复核

结论：FAIL（当前代码快照仍有实际公共链缺口）。不是已实现或安装验收结论，也不代替 Gate。审计未修改产品、控制文件、任务或 Git；仅记录私有报告。不读真实数据库、凭据内容或内部会话，不创建/启用/运行真实任务。

## 必须修正的缺口

1. **同组跨账号 readiness 调用把当前账号误当目标账号。** AutomationsPage 使用 createServerClient(session.ctx) 查询全部成员；platform-account.service.ts getCollectionPlanReadiness 用原 ctx 校验 user+实际 membership.groupId 后，仍原样传给 collectionPlanEvidence。根组合对快手/小红书的合法持久证明调用 platformCollectionService.hasCredentialEvidence。该服务 ownedAccount 在 ctx.accountId 非空且与参数账号不同就拒绝。故组内选 A、读 B，B 没有新版 account_binding 成功记录但有合法旧持久采集证明时，返回读取失败而不是 verified。startup 已传目标 scoped ctx，旧启动不受影响。建议先用原 ctx 完成同组属主校验，再给证据 port 传真实已验目标 accountId；不可在归属守卫前重写 group/user。测试应覆盖同组 A→B、跨组/跨用户/无组零 port 调用、原 caller ctx 不被突变，以及真实旧证明消费路径。

2. **归档账号历史在真实 HTTP 入口无法读取。** 页面完整成员包含 archived，SPEC 明确保历史读。新 getClient(job.accountId) 最近/详情请求携带 archived x-account-id，真实 dispatch 使用 resolveRequestContext→verifyAccountSelection 拒绝 archived 选择，现有 request-context.server.test.ts 同貌拒绝断言已明确。现有 mocked fetch 测试不会经过该守卫。不能全局放宽 active 或写权限；须给归档历史只读链一个明确的同组真实属主方案，先补具体合同/write_set，再测公开 dispatch history 可读、跨组/跨用户仍拒绝、archived mutation 仍原规则拒绝。若决定用组上下文历史读，必须明确更新“所有 job 请求严格原 accountId”合同，不偷偷删除 header。共享旧 nonnull 行同样需检验。

3. **开关失败没有用户反馈。** toggle 只有 try/finally；Switch 与 disabled 模板调用均丢弃其 Promise。真实 setEnabled 404/500 后没有显示失败原因，且产生未处理 rejection；旧状态保持却无法解释为何没生效。建议按 job.id 保存真实操作错误，catch 并保当前组/卸载迟到保护、pending 清理；实际 HttpTransport 500/OwnershipError 应验证未假称成功、原开关仍一致、有重试反馈。runNow 现有 catch 正确，可作为模式。

4. **创建/编辑错误跨表单残留。** 新 formError 只在 catch 设值，打开新表单或开始下一次提交未清空。一次失败后关闭、切目标再打开或改为编辑，仍显示上一次目标的错误。建议打开初始化及新尝试时清空，同时保实际本次失败。测试先失败→关闭→打开另一目标无旧错误→第二次失败仍有新错误。

## 已成立的实现部分

- accountGroups.get 当前 get(ctx,id) 无 LIMIT，读取实际用户、当前组完整 members；无需通过 listAccounts 的前100条推算成员。任务列表 pageSize100 循环到末页，新 page test 覆盖101条，未发现200条硬截断。仍需实际分页静态数据公共链验证完整性，不能把一次 fixture 当安装版全量。
- readiness DTO strict，仅 account/platform/status、collectAvailable boolean|null、planEvidence；无凭据/登录断言。无 port 为 unknown、实际 evidence 失败抛出、归档不读 port；能力 null 与 false 不创造私有任务。
- 根组合提取原 startup 函数复用，未改变历史成功绑定 / 快手小红书持久证明 / 抖音授权目录 stat 的实际证明语义，没有访问外网/触发任务。函数闭包实际 invocation 在全部 service 装配后，未见 TDZ 立即执行。
- 当前 island 各 job 最近读、详情、toggle、update、runNow 使用冻结页面 groupId 与该 job 原 accountId。legacy nonnull shared 保原读取 ctx，最新 diff 已独立按 kind 标“组内共享”。新共享 create accountId=null。
- 详情 client memo 与两个轮询 effect 已包含 contractClient 依赖；getClient 已含 scoped/frozenGroupId 依赖。最新 snapshot 不再存在最早观察到的遗漏，不能重复报已修缺口。
- 创建弹窗打开时 setCreateTarget(selectedTarget)，allowedKinds 与实际 create 仍沿 frozen target，筛选改变不会重定向已开表单。组件 group key/unmount、alive/accountRef/detailEpoch 保迟到不刷新其他组；任务 ID 与历史不改。
- 私有新增严格 verified && collectAvailable===true && active，抖音只普通 metrics/comments，其他支持媒体只 metrics，topic.daily 可新建，intelligence.sync/system kinds 未扩权。
- 模板非共享按 target account+kind 去重；共享按 kind 查全组所有行，包括 legacy nonnull，已 enabled 只定位、disabled 按明确用户点击启用，未发现自动补真账号任务。
- 最近记录读取失败已有独立 error map，不以空记录假称尚未运行。LED047 最近轮询单在途+hidden暂停+active清理，详情本地打开路径继续保留。
- 新 operation 已在 CLI READ 恰一次矩阵与 workspace group 矩阵新增，未改变写分类或用户授权。

## 需补实际证据/风险

- 新3个group-scope测试目前覆盖组内3账号2平台、共享筛选/模板去重、各job recent header、异账号toggle/detail header及 unknown/最近失败；不覆盖 create打开A后筛选B再实际提交、update/runNow实际header、切组迟到读写、归档真实dispatch及真实证明消费。旧测试有部分原scope保护，但不能当新版上述组合已验证。
- groupPromise/accountsPromise 在开始后直到所有任务分页结束才 await；若组读立即 reject、jobs慢读或也失败，存在独立 Promise 未处理 rejection 风险。建议立即附 rejection 处理/settled并发，最终仍传播真实组错误；用 deferred jobs+组读reject测试“不吞错、不未处理rejection”。本条为失败分支风险，未运行完整 Next 宿主反例。
- 全组 recent 每job一个请求、readiness 每member一个读，均 Promise.all 全量并发；列表不截断正确，但100+规模需真实页面耗时/在途观察，避免把完整性修复变成页面长等待。审计未以猜测判性能不达标。
- “需重连账号”现在到现有 /accounts，而非旧统一抖音扫码，避免投错平台；仍需真实操作检验从当前组定位正确目标是否清楚。没有开启任何扫码/采集。
- 本次不运行 root 已进行的测试/类型/Gate，避免并发资源争用。root报 backend37/contract12/oldautomation119PASS、新3 fixture校准复验中仅为转述，不冒充本审计独立通过；新安装验证仍待真实包。

## 快照

HEAD：315cf179a5f14b876f47f80381bff3ef00c95904。
时间：2026-10-10T21:00:34.567896+08:00。

- `docs/features/t1199-bound-platform-scheduled-visibility.md`：`2f6fac21c63e8dda98cd7ebfb8f0c50f0338e6088ceac5c9915520f4c4461079`
- `backend/src/modules/platform-account/platform-account.service.ts`：`13d3a55b601b3322d2a426598a75d2abe0884fcaab42cf62210b07b73f288aca`
- `backend/src/modules/platform-account/platform-account.transport.ts`：`3b88e3121e9f30f56e886ec83aad9557826415033db2b5001c917f2fc489c43a`
- `backend/src/modules/platform-account/collection-plan-readiness.test.ts`：`1b35524b5f901a7d8eea6181ebd2bc204882d48d43606b87e001086b4c154bb6`
- `contract/src/resources/platform-accounts.ts`：`dc9510c917245cc0f71d9e91783fb166d9a68444de05c9baf80ee576dead2dab`
- `contract/src/operations/platform-accounts.ts`：`9850f85ea46942297d31223d4fdd3180434b0a75aa3668a0bab8b01ca258825f`
- `contract/src/cli-policy.ts`：`04926f4bc6b9ef2620983c633c07585b974f01d03dcadeacb84da72984fd9659`
- `contract/src/workspace-operation-scope.ts`：`c657f02191bacfd3381ca7b4215f11920a1aba31c3ecd3a43b96bec56f1a39ce`
- `frontend/src/server/persistence-client.ts`：`1cb58de4ad5526273daa7899f03569099581d696fadaccab706d966d2ad39409`
- `frontend/src/app/(creator)/automations/page.tsx`：`1163bb7f58cb87f5e15f6d9e464a04fe77d3f6a563eb3718521e5c0b53c3eaa0`
- `frontend/src/features/automations/automations-page.tsx`：`192403159fea781395b0b325984fc4116636d7adabb94a21c474fe6bc12443c0`
- `frontend/src/features/automations/automations-island.tsx`：`2bf1c92601accbd8885619a3c3da04632117d373c2bb1df8aedf687422282504`
- `frontend/src/features/automations/automations-page.test.tsx`：`2e8b13c3378a9f076be66e89ac1442004a16ea2fea11ce128e79fbf8618723f3`
- `frontend/src/features/automations/automations-group-scope.test.tsx`：`20b498d26a8e41b8391d66e32ff7bd95238f2ec5620415e24c6948587e469a2a`
