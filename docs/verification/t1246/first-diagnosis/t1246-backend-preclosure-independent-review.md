# T1246 后端前置、类型与封面投影窄独评

结论：**当前窄实施合同可实施，无剩余合同阻断（PASS_CONTRACT_ONLY）。不是 helper/runner/修复代码或测试运行通过。**

绑定 parent SPEC `b295cb6fc92b22433ee7415c12861a1c8b94fc3e842125d7bc99615d1256c875`、产品 `533224f334c43cdb81a344424e420cad93784dd1`；逐来源旧533/current SHA及全部191原栈对照在同名JSON。parent已补PB001唯一service与18原回归、DR006新driver路径，先前缺写集/旧driver歧义已关闭。本轮未改SPEC/产品/原测试，不运行PG/模型/App或完整测试。T1097引用另一route agent独评，不评自己 authored 提案，不自行解冻。

## 195 ENV与27真实消费者

当场独核完整 backend-failures.json：191 case的原first错误、冻结guard行（只去行首尾空白）与真实file:line堆栈全部一致；4 migration-convergence真实Socket拒绝都是 `T1246_ENV_NOT_OWNED_PG`。195唯一case没有重复；26文件已实际ENV。静态27表额外 `intelligence-source-workspace.test.ts` 先缺collection fixture，未进入PG；不把它算已执行ENV/PG功能。

旧50028实例首轮marker只含task/root/dataDir/pid/port/database，adminRole在独立receipt；没有新nonce/PID出生/UID等完整authority，**不能直接复用旧marker签集中runner安全**。新helper与新runner尚未交付。这是实施/执行准入的必做项，parent已明确，不阻断可实施合同。

```mermaid
flowchart LR
 A[本轮fresh实例出生与完整marker] --> B[连接前核nonce UID PID出生 dataDir与端口]
 B --> C[仅owned管理连接核实际身份]
 C --> D[登记随机精确库名]
 D --> E[同URL Node与pg_dump pg_restore]
 E --> F[仅登记名清理]
```

实现必须保持：numeric loopback、真实本run根/路径无symlink逃逸、marker/UID/PID出生/命令/postmaster.pid与dataDir/port/admin一致；未满足先拒绝，SQL/CLI均0。仅已证明owned实例的postgres管理库是管理例外，不开放本机默认postgres/任意用户库。每族writer、migration/restart、backup/restore都从同一校验URL衍生，所有CREATE/DROP名称均原run精确登记，不能prefix扫描或删postgres。

`migration-convergence.test.ts:95`旧hardcoded管理地址与:105 restore env必须同修；`group-upgrade-postgres.integration.test.ts:16`显式restore URL与生产backup helper所调用pg_dump同受owned参数约束。保原SQL/旧ID/count/ledger、真实PG并发锁和restore，不改生产PG路由或用PGlite/stub冒充PG。libpq的PGSERVICE/PGSERVICEFILE等继承必须明确清理；NODE_PG_FORCE_NATIVE实际删除且旧Socket preload保留只是额外护栏，不是系统防火墙。正预算/完整外层与清理按原LED053保持。新helper静态独评及正负真实运行仍待交付，不能据本合同提前启动SQL。

## 两个现存源码夹具与类型闭包

canonical两个实际SHA与登记完全吻合：T1217 `aba25b0714313c0e22c5c21a59223a3262e0620c21b2193f1a8f3e8290cebd6c`；T1229 `702df82aa972de2ce65dd0886934ebfd8adc520bc82ecb0e1c29ef4fa0f411da`。两原Git raw真实对象与登记SHA一致，wrapper整文件不同仅据整SHA不能叫逐字历史证据。

额外当场静态TypeScript AST核对：排除ImportDeclaration后，T1217原/包装62条、T1229原/包装10条top-level statement，getText逐条精确相同，parseDiagnostics=0。此证据仅说明本次非import源码相同，**没有历史执行/红测/PASS**。全部直接相对import目标存在，node builtins正常；T1229特意引用backend/node_modules/zod/index.js，实际文件/类型入口存在，其版本/真实依赖闭包要随候选保留，不能偷偷换包。

复制到候选两个明确路径后仍需真实collect、完整body、backend types；当前缺文件导致row implicit any先随真实imports复核，不加any/passthrough。AST与直接import检查不等于跨模块类型或运行契约通过。fixture SHA/import目标详见JSON。

## DR006

实际原与生成t1070均只import join，生成第75行resolve新增而无导入，真实TS2304和两个保存后截图ReferenceError同因。parent本版选择**补resolve import**，新机械driver限定 `round-2/browser-original/driver/prepare-browser-driver.cjs`；旧driver/round1封存。可逆记录必须包含新增import（不只有路径替换），保证全100输入/副本和原body/断言逆构；不得因“只有import”跳过库存/types与两个原完整case。此方案不改产品、不签旧39FAIL已消失。

## PB001 公共封面保存产品回归

原18例16FAIL/2PASS，独读16原栈：14 first message是ZodError；2是AssertionError包裹同Zod，尚未到原negative期望。错误键精确为revision.visualAdoptionKey/visualAdoptionDigest；不是fixture误填。数据库schema含两个内部采纳字段，public publicationRevisionResource未含，publicationCoverSaveResult.revision严格校验。

`publication-cover.service.ts:20`save createRevision raw只剥userId，严格解析失败；`:19`request重读历史raw同样只剥userId，修save而不修request会回放比较失败。现transport `toRevisionResource:72-90`已准确列公开12字段，service应沿其定义在本文件设统一内部publicRevision投影，同用于两点；不能service依赖transport。保id/publicationId/revisionNumber、title/description、精确cover pair、category/series/platformTags/platformSettings/createdAt，不泄露内部字段，不删DB唯一采纳键，也不放宽公共strict。

唯一产品写集当前已获parent明确为 `backend/src/modules/publishing/publication-cover.service.ts`；原integration18只是回归，断言不改。保owner/真实file/checksum/CAS/requestDigest/receipt/幂等及历史metadata。特别两个negative必须真实到原CAS/锁/错误分支，不能再次被保存投影前置挡住却称负覆盖。实际保存/读回/重放、公开链与相关跨层保存依旧必须运行，本报告没有签绿色实现。

## 剩余执行准入

此窄合同没有新增阻断；新helper/runner源与所有实际预算、负例SQL/CLI0、正例真实PG、fixture collection/types、DR006 inverse/body、PB00118原例及后置尚未发生，必须按合同验收。原205业务body失败库存仍保真实事实，由engine后续逐族收敛，不能以195 ENV修复或PB001确定根因授权未证的产品更改。没有App授权，App仍未验。

JSON SHA256 `03ffb8ffa28126918c23e4913088c9bea29f729ab7d3bb3a37d380d7fda22c39`。
