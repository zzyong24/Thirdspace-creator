# 旧固定PG端口守门的集中修法（只读方案，未实施）

冻结533224f，静态27消费者精确源SHA/guard行见下表与pg-hardcoded-consumers-source-map.json。只有当场first stack明确旧URL护栏或Socket拒绝时才归ENV；backend仍运行，因此此表不是27文件全部真实环境失败。T1074本轮50028真实组锁观察点漂移明确另列。

修法不是移除guard或将55422数字永久替换成50028。主线程已明确授权集中修‘只操作自己的实例’真实边界，全部首轮结束前不改。

1. 一个**仅测试用途**的owned PG校验helper，沿原公开CREATOROS_TEST_POSTGRES_URL/CREATOROS_ISOLATED_PG_URL接受本轮值；保TEST_DATABASE_URL具体唯一库用途，T1074原creatoros_t1074角色合同独立保留。候选helper物理目录由主线程architecture Gate确认，不引入生产数据服务、第二存储或外部PG执行权限。
2. runner新增明确ownership输入指向本轮tmp根t1246-owner.json。现真实marker含task/root/dataDir/pid/port/database；actual adminRole在pg-environment receipt，集中时把adminRole/run nonce/start身份纳入同一新marker版本并独评。未提供、路径越界/符号链接去用户目录、字段不匹配、PID/启动身份/实际postmaster.dataDir不属于此临时实例时，在任何Pool连接/CLI前拒绝。仅URL环回IP、明确标记端口（拒5432和另任务55422）、marker/admin role、postgres管理库或本轮唯一命名测试库，不能localhost/任意用户库宽泛放行。
3. 初次网络前核本轮postmaster.pid/PID真实命令与marker dataDir/port；只在已证明本轮实例后建立owned管理连接，实际读current_user/current_database/inet_server_port/data_directory核角色、管理库、目录和端口仍一致。严禁先连接任意URL再以读SQL证明‘安全’。marker不满足拒绝并记录ENV，不静默落回旧55422、本机默认PG或PGlite冒充PG并发。
4. CREATE随机测试库沿每族原用途，但名字必须由校验helper登记生成/原nonce生成并检查合法标识符。DROP WITH FORCE只允许本次登记生成的精确names；不准drop postgres、marker以外用户库或所有prefix库。writer/admin/migration/restart连接由同一已验parsed URL衍生，只变本族临时DB名/application_name，不改到其他服务器。
5. migration-convergence.test.ts:95删除**硬coded管理URLfallback消费者**，改必需已验公开URL；其pg_restore:105同时从owned URL生成PGHOST/PGPORT/PGUSER/PGDATABASE并显式清继承PGSERVICE/PGSERVICEFILE等影响，实际argv/env回执不含真实秘密。group-upgrade-postgres.integration.test.ts的pg_restore显式dbname URL同样来自已验src/dst names。backupPostgresBeforeGroupUpgrade内部pg_dump沿真实同URL，不允许仅改Node guard而CLI仍旧55422；保原备份/恢复SQL与正文/count/ledger断言。独评原首轮Node preload阻止SQL使旧CLI未可达，不等于CLI独立安全已验证。
6. 原Node精确旧55422拒绝preload作为额外护栏保留，NODE_PG_FORCE_NATIVE实际删除并留布尔回执；它不是系统防火墙。集中后真实独立owned实例上跑全部原PG并发/迁移/恢复case，保本轮first ENV日志；在被拒URL/marker/角色/未知DB时证明SQL和CLI调用0，在被允许URL时证明真实PG并发锁/原语义与恢复均实际到达。
7. test/hook/request>=120s，保更长原正预算，outer涵queue/createDB/migration/restore/cleanup；原tests显式30s等预算问题须精确校准为执行政策，不能改为无限、降低覆盖或依skip签并发。

最小候选write_set：这27原消费者中真实守门/硬URL点+一个test-only helper+原临时runner ownership/env（不修改生产PG路由、用户数据、公开业务contract、原assert/seed）。最终哪些file实际需要更改与正执行预算，由完整backend first stack和独评确定，表未列为全部已批准改写。辅助helper新增环境拒绝与CLI安全验证保真实I/O可达证明；不把VM响应桩当PG功能PASS。

| 原file | 55422真实源行 | 冻结SHA256 |
|---|---|---|
| backend/src/application/generation/work-review-root.test.ts | 108 | cf7347cb43e7127c05e2197ade1e67e9d5b878754293f163dfe6b7bf72790026 |
| backend/src/group-upgrade-postgres.integration.test.ts | 7 | 21e7611fde3d4df4bbe0b6d3592ae374e1879497fd7fb31783beda3821dd5013 |
| backend/src/integration/adjacent-parent-migration.postgres.integration.test.ts | 38 | 61e2bc9b394f12618922fc180ea232a4a5d3a80e272c1d935fa6873c988d7645 |
| backend/src/integration/calibration-archive-concurrency.postgres.integration.test.ts | 31 | cd55d1cede15641e1b668cfecc10763d63944b4c310e2f49aa6a367524681ffc |
| backend/src/integration/group-knowledge-write.postgres.integration.test.ts | 23 | 86da1c83a1a3c9f92278c703bea301290f472f0d46458aae1e29ff881544b8a3 |
| backend/src/integration/group-migration-concurrency.postgres.integration.test.ts | 21 | 131ffdfdb6952a4e888224fc210e2c3c8df196f0661440402f993ed19dadbc00 |
| backend/src/integration/intelligence-source-workspace.test.ts | 32,137 | 0769e7f8de6f73e7a68c71057fcf126aca184a722d915011f0efeead821a3a7b |
| backend/src/integration/project-create-archive.postgres.integration.test.ts | 32 | f5beea0e13df190139ecf4666e086bb17695640325c156f2ccd118faaf61d7d4 |
| backend/src/integration/publication-mutations-migration.postgres.integration.test.ts | 34 | 84dda08648a2de8b0f098bc21352ab20de4cb512e662785874fa146acf051ed9 |
| backend/src/integration/scheduled-export-progress.test.ts | 31 | 3265af8ce246585d6a45db95f47f3e18bf8311e38ea321c5a6103bdf38f4655d |
| backend/src/integration/scheduled-flywheel-consumption.test.ts | 28 | 43128c2d8b74baf6786350e87542aa18f7b658ace868a9ee31f1d17760df1f82 |
| backend/src/integration/shared-parent-writers.postgres.integration.test.ts | 27,82 | a0af88f4cd72f2968703d0e7044182ada4f5607f61bf43ae8d70c0034cc511ff |
| backend/src/integration/startup-group-collectors.postgres.integration.test.ts | 16 | 969c43578cc96a84ac8714c194443efa24fce531c73203f0c3bf2b8706a544e3 |
| backend/src/integration/t1062-new-domain-group-workspace.integration.test.ts | 134 | e94d5210c11df4883d455c954ab16418bf6d4dd7916b6422ff6cca15da6ad60f |
| backend/src/legacy-scheduled-job-migration.test.ts | 146 | bb89b6a28aad5d6edbc2551f543fa252913078418b46e46c2466d66cda9d2e97 |
| backend/src/legacy-source-migration.test.ts | 116 | aa4dd55141084440831898be6bf7f09ea5f30e5885a3cb38b7b2898b48413c6c |
| backend/src/migration-convergence.test.ts | 95,105 | 8653853cbcceba9dd58d88ceb65e1d8ed31abc9ee6138fcf16f8a1857cc686bd |
| backend/src/modules/ai-runtime/asset-business-execution.service.test.ts | 85 | 9e1df5f7d667165a0a7cd97baf56ee30c716cb53e872197b8ee1039a5fd6ba49 |
| backend/src/modules/articles/articles.integration.test.ts | 797 | eacc71df7b216f528ad6db72c124c48c038c82350ca5c2c9242e63aff612ad46 |
| backend/src/modules/artifacts/workspace-parent-write.integration.test.ts | 26 | d3bf2d4da45460d02ff5a8f137d13abb819967c1a36c133a5000aa1094d70e58 |
| backend/src/modules/creative-canvas/creative-canvas.service.test.ts | 238 | 1690eb7a6dc6ff4adb20444dccd3dda3d4b3a8c31e0115d28f5ffa8cb11a8553 |
| backend/src/modules/graphic-posts/graphic-posts.integration.test.ts | 330 | 14761851e1ca3d6c45575e86ff22fa2769f452e5e07571b7498b054861eec51a |
| backend/src/modules/material-links/workspace-parent-write.integration.test.ts | 33 | 40f269b1026c9cfbbe4625c0473327be9f86564fc749a136f24d542567932983 |
| backend/src/modules/moments/moments-model.integration.test.ts | 97 | 0619b3f891485d73839c55ff1a6571492bfe561f15c6446d4ac1abde361b610a |
| backend/src/modules/production/production-asset-asr.integration.test.ts | 140 | 3fd93ea3546080fd6190a535a6647dd5fb4271cb71c993234799dc48f6648fee |
| backend/src/modules/production/production-rough-cut.integration.test.ts | 130 | 3eddedaedaeed193144ab360ab4417d8de8313072276ff3015a33b51abef5b01 |
| backend/src/modules/production/workspace-parent-write.integration.test.ts | 26 | 08e34f1297a06785bc7ce1e67529f13c98ce9ae2810197301865b46393d0e724 |
