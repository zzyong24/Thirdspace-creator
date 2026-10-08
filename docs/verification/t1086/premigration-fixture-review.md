# T1086 legacy-premigration 测试夹具独立评审

- 方式：只读当前测试、platform account repository、schema 与最终三 scope 证据；未修改仓库或运行测试/API/数据库。
- 结论：**GO_WITH_EXPLICIT_FIXTURE_INVARIANTS**。该夹具可加入同一已准入 frontend 测试路径，不需要改五个产品路径。

## 已有最终证据

`t1086-frontend-registered-scope-final.json` SHA256 `96eca6cdd9ec675e62f54d3b6fe86200dfb7050b5e337aaa1ac48d31cd5a0f35`，日志 SHA256 `d5e9924645e04f8443d4c2db09d9b62db0f89e2fe06cef502ff2ef4fb41678ab`，实际 3 PASS / 0 FAIL。它覆盖 pure-group、group-account、legacy-registered；其中 legacy-registered 明确使用账号公开登记后真实归属组创建来源，再以 legacy account 上下文提交，不证明旧 `group=null` 来源。

## 夹具合法性

`createPlatformAccountRepository(db,{userId,now,nextId}).createAccount(...)` 只向 `platform_accounts` 插入该 user 的 active account 行。该函数不调用 account group service，不写 `account_groups` 或 `account_group_memberships`，也不自动生成 `grp_legacy`。因此在已初始化的隔离 PGlite 中用它创建一条无 group/member 的账号，能精确构造当前 schema 可承载的迁移前孤立账号数据形状。

这项直接 repository 写入只允许用于测试初态。其后项目、artifact/version、output、article、graphic、production editor、conversation/message、`prepareChatReply`、submission、Worker、system.features/read、Projects/Production owner 和 ledger 必须全部沿现有正式公开服务/端口；不得继续用 repository 直接造业务父链或回执。

## 必须保留的断言

1. 创建账号后、创建任何业务对象前，实际查询证明该 account 对应的 active membership 为 0；不得存在由本例新增的 account group。测试结束再次断言没有凭空新增 membership/group。
2. `RequestContext` 从头到尾保持同一真实 `accountId` 且 `groupId` 缺失；冻结 task、AI business、project/output/article/graphic/production/editor 的 legacy owner 均为 `groupId=null`，不能在 prepare 或 Worker 阶段补组。
3. 正向读取仍须完整走当前三 scope 用例的真实链，并保留主脚本、文章、图文、editor GET、revision、零候选/零生成/零渲染、账本与消息断言。
4. 保留 cross-user、其它 legacy account 或伪 group 负例；旧 account 只能读自己的 legacy 父链。
5. 测试名称和报告必须写“合成的迁移前孤立账号行”或等价表述。该用例验证的是 legacy owner 兼容，不是 migration/backfill 实跑，也不证明已登记账号可读旧 null 来源。
6. 隔离库须在 repository 插入前已完成 schema 初始化，且不得连接用户库。finally 继续关闭 Worker、HTTP fixture、临时媒体和 PGlite。

## 非阻断限制

这种做法是在最新 schema 上合成旧行，并没有重演历史版本数据库升级。因此 T1089 的迁移归属问题、真实升级 backfill 和旧 null 来源转组仍须独立验证；不能因本例通过而关闭 T1089。
