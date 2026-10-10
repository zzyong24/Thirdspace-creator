# T1199 CLI 只读分类增补独立评审

结论：PASS（仅增补SPEC与写集边界，不代表注册修复或测试已通过）。

审稿文件：docs/features/t1199-bound-platform-scheduled-visibility.md
实际审稿SHA256：2f6fac21c63e8dda98cd7ebfb8f0c50f0338e6088ceac5c9915520f4c4461079
日期：2026-10-10
独立辅助审稿，未修改repo、控制文件、任务状态或Git。

增补限制contract/src/cli-policy.ts仅为 accounts.collectionPlanReadiness 增加显式只读分类，并运行真实既有 contract/tests/cli-policy.test.ts。当前路径已校正，原 src/cli-policy.test.ts 不存在的笔误不再进入写集。

真实消费者：cli-policy.ts 的 READ_OPERATIONS / MUTATION_OPERATIONS 穷尽类型校验；policyFor在read与mutation同时true或同时false时抛“classification must be exactly once”。新增资格GET需只存在READ集合，effect=read、confirmation=none、asyncTask=false、idempotency=not_applicable。不能放宽policyFor、穷尽类型门、未知operation fallback，不能进入write/destructive/external/async集合，也不能改既有操作执行权限。

原失败日志 readiness-green.log 实际是模块注册失败，readiness套件0 test，不能叫Green或业务凭据缺失。SPEC已明确保留失败日志。本次读取日志确认原错误正是新增operation未分类。

既有CLI policy回归覆盖全正式operation集合/数量与可信元数据，仍需修后实际运行；建议对新增operation确认四字段元数据，并继续跑原readiness真实dispatch/service回归，证明不是仅policy注册helper通过。

公开只读资格合同的user/group边界、能力与证据分开、静态能力不代签登录、写权限和真实用户组禁止创建/启用/运行都保持不变。此增补属于新增只读operation必要注册，不扩大后端授权或调度业务，不需新增真人研究或凭据读取。

当前可按此范围修policy；实现和实际测试结果仍须如实记录，T1083控制失败不因本评审而放宽。

## workspace-operation-scope 增补

已另外读取真实 contract/src/workspace-operation-scope.ts 与 contract/tests/workspace-operation-scope.test.ts。矩阵类型为逐 EndpointId 完备记录，新增正式operation必须声明，不能按名字/HTTPmethod动态猜。SPEC明确仅 accounts.collectionPlanReadiness 声明group，纯组可传params.accountId读取同组真实成员，仍由 backend 验 user ownership + 请求group + 实际成员group一致；不把组ID代入account，不授账号身份或任何写权。该group归类符合已评审的纯组读取合同。

补该单个matrix项与既有全矩阵回归写集充分。需追加/确认新增operation==group断言，并继续实际readiness公共dispatch的无组选中/跨组/跨user拒绝，不能仅用矩阵完整性代替服务鉴权。现有platforms.collections/start及其他旧op scope保持原值；不移到userscope、不加未知scope fallback、不消除Record穷尽类型检查。

结合两项增补的最终结论仍为PASS；它覆盖CLI READ分类与scope group精确记录，尚未代表修复后测试、实现或安装验证通过。
