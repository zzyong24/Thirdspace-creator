# T1317 本地实施结果

纯组原公开 inspect/events 已恢复；完整受控候选生成后，纯组与同组账号筛选均能读取真实 task/source、计划、冻结工具和全部分页事件。本地实际覆盖通过，尚不签新包/真实供应商/父矩阵；共享 timeout Gate 待 C 最终同源码执行。

生产仅改 workbench-public.transport.ts、workbench-plan.service.ts、workbench-public.service.ts。transport 只新增纯组 inspect/events 入口资格，其余 artifact/read/render/reconcile/files 原账号门保持。plan.read 先通过原 persistent tasks.get 授权，再以已授权真实 task 的 user/group/account 精确空值安全取原行；inspect 冻结投影也按该真实 tuple 取，页面筛选账号不当任务 owner。原写入/stream/分页/摘要政策未改。精确3源、2test字节与 SHA 见 runtime/FINAL_SOURCE_MANIFEST.json。

33项原输入锁首次及前RED复核0漂移。完整 RED red-v1 的混合前段使用已审兄弟 T1320 修后源码 SHA33168684e7b3a74504d6d446e99038239c1580c0e9187f2582e4dd4da6ee4da9（实际产品commit26372553e），不称旧候选0e1本来可通过该前段。该额外依赖不在原33锁内，来源由 RED 前已冻结 T1320 manifest/原件及 Root 当时读取交叉绑定，后补 SIBLING_DEPENDENCY_BINDING.json 明确其性质，不冒补拍独立前快照。当前不可变候选、旧任务和服务未修改。

| 原运行 | 自然结果 | 事实 |
|---|---|---|
| red-v1 | exit1 /24.345s | 新纯组公开create→真实prepare/dispatcher/immutableworker/SDK/ledger→候选及任务succeeded，inspect首门“当前账号不存在”；真实前RED，未冒后两SQL已到达 |
| green-v1 | exit1 /24.372s | 来源/工具/plan已读出；测试误要求真实空capabilities非空，属于夹具断言错误，原件保留 |
| green-v2 | exit0 /40.061s，1PASS | 原完整公开链；纯组/同组合法账号筛选取同原task/source/plan；inspect与events逐页读完；外user/group/错legacyaccount/缺任务拒绝，纯组artifact/reconcile仍拒 |
| backend-public-v1 | exit0 /38.934s，6PASS | 原5个组合tests全部通过；新增非空冻结capabilities/tools/source/plan与脱敏fixture通过 |
| backend-type-v1 | exit0 /67.071s | pnpm --dir backend exec tsc --noEmit --incremental false |
| frontend-type-v1 | exit0 /73.411s | pnpm --dir frontend exec tsc --noEmit --incremental false |
| boundary-v1 | exit0 /1.825s | 原boundary-scan --quiet |
| semantic-v1 | exit0 /1.270s | 原semantic-boundary-scan |

完整公开fixture的 capabilities 原为真实 []，修正为与原 payload 逐值一致；frozenTools实际非空且计划是原真实 service.save 产生的 planRevision1。另 backend 原服务fixture显式非空能力确认该列没有静默漏读，不冒该fixture是公开生产能力准入。未改产品为填能力。原 SQL 查询/工具参数截断/模型正文不公开/legacy读取均由原5测试保留验证。归档读政策未增加新公共执行，仍由原 tasks.get 原门决定，不追签未测归档族。

每轮完整运行前存原33输入、当前测试/config/native替身/完整immutable worker；worker5618216B/SHA3851b4fb132035f1b03528d68b0fa1c5ab86bda8134d8b98795252295c5a6454，无build/dist。仅替代外部Codex子进程协议及可用性状态，实际业务/prepare/worker/ledger/节点没有mock。0真实供应商模型，仍有真实合成native root/child及账本，不能称0调用。test3600000ms/hook180000ms/外层86400s、retry0、单worker；未续任务期限。原run-gate记录器复制时 sources字段仍额外绑定1320生产源而未列1317三个源；原命令/退出/时间真实，三个源同字节由此前green-v2 BEFORE_INPUTS、最终manifest及期间未改源交叉核验，保原记录不改写历史。后续runner应修正清单。

独立检查12个fixture审计PID均不存在；各case host.stop/dispose回执保留，自有DB磁盘留存。实际扫描6743文件的高置信私钥/API/Bearer特征0命中，限制见 SECRET_SCAN.json；fence快照哈希。无当前candidate/用户库/配置/认证/服务操作。完整索引列实际原件、前快照和最终manifest，排除可再生cache及owned DB/temp媒体目录。报告、源/测试冻结交独立复核；未commit、未taskcomplete或控制写入。
