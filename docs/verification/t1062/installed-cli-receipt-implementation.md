# 已有 CLI 失败回执的安装实现候选

当前实现已正常准入、提交并完成独立评审；新包安装复验仍待发生。用户已授权 T1062 的整合、修复、本地打包和逐功能验收；原 SPEC SHA256 为 `cfbaf9e80e6c8b005899c9be2f06d080e66cc119a14be381b721850a4fd36a1c`。本修复落实原 CLI FR-CLI-05、FR-CLI-06 与 API-CLI-002，不新启规格周期或消耗旧的一次复审授权。

用户看见的错误是：一次准备素材失败后，再查询同一个请求，客户端却显示成功和空结果。原服务已经正确保留失败并避免重复写入；修复只把这个真实失败传到命令行。原请求始终失败，不因后来素材已关联而重新执行。新的合法准备意图由用户已授权的验收流程另行发起，保留旧失败记录。

```mermaid
flowchart LR
  A[第一次准备被业务拒绝] --> B[原 invocation 保持 failed 与原请求编号]
  C[再次请求同一 key 和输入] --> B
  B --> D[Gateway 返回非成功 HTTP 和原回执]
  D --> E[客户端保留原回执]
  E --> F[CLI 显示失败与原编号 非零退出]
```

## 六路径与最小实现

| 路径 | 允许变化 |
| --- | --- |
| frontend/src/app/api/v1/dispatch/route.ts | 仅既有 receipt 分支将 failed 映为409；保持 running202、outcomeUnknown409、成功/过期200与原meta.requestId，不进入业务handler |
| mcp-server/src/dispatch.ts | 非2xx正文只解析一次，DispatchError可携带既有public receipt与meta.requestId；只投影已知公开字段，不传任意原始正文 |
| mcp-server/src/cli.ts | 既有成功/重复调用输出保留已有receipt；失败捕获输出ok:false、原receipt及原requestId，保持既有HTTP_409与非零退出4；无receipt的旧错误输出保持 |
| frontend/src/app/api/v1/dispatch/route.test.ts | 添加真实POST/SQL失败回放及同链CLI证据；现有测试和断言保留 |
| mcp-server/tests/dispatch.test.ts | 验证已有receipt字段跨非2xx保留、普通错误兼容、JSON/非JSON安全边界 |
| mcp-server/tests/cli.test.ts | 验证真实CLI入口main输出/退出码与回执；保留成功缓存、running、过期成功、unknown等语义 |

公开回执只包含原来存在的 `duplicate`、`requestId`、`status`、`taskId`、`targetRefs`、`resultExpired`、`outcomeUnknown`、`manualReconcileRequired`，及已有 `meta.requestId`。失败原文与数据库errorCode未被缓存到public receipt，不能伪造、补投影或复原；若提示缺失，只说明原终态与请求编号，不声称再次执行或原始错误已完整重放。HTTP状态由已有terminal state确定，CLI保留其receipt.status；不新增operation、公共DTO或数据库列。处理按通用回执字段完成，不按业务名称、关键词或创作语义分支。

后端 cli-invocations service、schema、身份/组账号归属、key/hash冲突、缓存权限回查、访问凭据与壳授权保持原字节。`begin.kind=receipt` 不设置新的 invocationId、不进入handler、不自动重试；已有 running 与未知结果不转新任务，返回的taskId/targetRefs不伪造。预览/渲染的overlay问题是独立诊断，不进入六路径。

## 正常准入与保护

ROOT先独立复核本候选，保全自己的WIP并释放相关旧租约，再应用本控制增量；禁止活跃lease漂移。modules仅增加一个六路径step、它的只读上下文和验证命令，原 integration592、compatibility283、bootstrap45 与全部旧 commands/read/write 集合原样。实施说明由ROOT控制提交创建，writer的六路径不包含它；不以大write_set通配符扩大授权。

正常工具生成progress/context并完成控制提交、workspace审查后，再 `node orchestrator/process/progress.mjs claim T-1062:installed-cli-receipt --agent root-installed-cli-receipt`。由正常工具保留旧done状态，新step始终pending直到实际实现提交；不手改progress、e2e_verified或阶段Gate，不写旧typed capability。实际新产品提交后用 `progress.mjs done T-1062:installed-cli-receipt --agent root-installed-cli-receipt --commit <真实提交>`；总体integration和安装验收仍未完成时不得完成T1062。

私有保护清单绑定当前六源before、全部只读生产/测试源、原SPEC、原三个step与原scope/runner。原 integration 的801快照包含mcp-server/src/cli.ts与mcp-server/src/dispatch.ts；旧快照及PASS是历史证据，新增step必须单独绑定两源新字节，不能修改旧日志冒充旧验收覆盖新实现。原18验收命令和旅程均保留；需新运行时，以真实新源记录补充，不签过期快照。

## 必须现场发生的测试

先只添加回归得到实际RED并封存源码hash/完整日志，再改三个生产文件。使用内存PGlite的真实POST路由，不mock幂等service/业务写handler/SQL结果：合法fixture中的一次准备因素材未关联而409，真实关联成功后，同key同body回放仍failed/原requestId，source仍不存在、业务handler不重执。以node:http临时loopback服务器承载真实POST路由，实际DispatchClient经真实HTTP连接并调用CLI main，把失败响应带到公开CLI JSON及非零退出；仅fetch→POST适配器不能代替真实网络链；独立mock客户端测试只补兼容覆盖，不能代替完整链。

同时覆盖同key不同hash409、不同user/组隔离、缓存归属回查、成功缓存重复、running202、结果过期成功receipt200、unknown409/manualReconcileRequired、原taskId/targetRefs不变、无receipt的普通错误和非JSON错误。原测试断言不削弱；生成fixture只用测试token，恢复环境变量与process.exitCode，关闭内存库，禁止触碰当前用户库或真实凭据。若上述链不能在这三个既有测试文件内实现，先回到ROOT重新登记精确范围，不偷偷加测试文件/依赖。

验证命令在当前package、Vitest include、脚本与CLI选项下可解析；此候选未执行这些命令，不能签RED/GREEN。frontend命令显式清空两个优先DB环境项并由Vitest设test环境，使backend/db.ts选memory-pglite。

```text
env DATABASE_URL= PGLITE_DATA_DIR= pnpm -C frontend exec vitest run src/app/api/v1/dispatch/route.test.ts --maxWorkers=1 --retry=0 --testTimeout=120000 --hookTimeout=120000
pnpm -C mcp-server exec vitest run tests/dispatch.test.ts tests/cli.test.ts --maxWorkers=1 --retry=0 --testTimeout=120000 --hookTimeout=120000
pnpm -C mcp-server typecheck
pnpm -C frontend typecheck
```

每例及hook最少120000ms，单个外层观察必须覆盖整份串行测试、启动和清理余量，不能只给单例同长的整体上限；不删除失败、跳过断言或重复写业务请求消除错误。原任务的持久期限、取消、轮询状态、其它超时配置保持。当前 MAIN 实际不存在用户最新规则所指的 `tools/timeout-policy/verify.mjs`；该命令标为不可用，不登记为可运行验证、不补签通过，也不为本六路径新增整套运行时工具。根会话须按实际消费者核新测试预算与公共链，明确保留这项验证环境差异；不以helper单测替代。全局旧失败需如实记录，不能借本修复移植其它会话222路径。

实际测试通过后，逐文件核保护hash/最小diff并独立实现评审，再按既有打包Skill重建、安装并验收新的公开CLI失败回放与合法新准备流程。旧安装的失败和空成功证据完整保留；本静态候选不证明新包、桌面或功能验收通过。

独立静态复核6852566469880adceadbc74453bebe453c19f7231fbcce02586bb2f15356fea5明确：route.test.ts两条原显式60000单例在本精确路径机械改120000，所有断言保留；外层CLI flag不覆盖单例第三参数。DEC仅追加新后缀，保留已提交9a04481e全部控制记录。上述测试调整仍待实际发生，不声称预算检查或测试PASS。


## 当前实际实现证据（2026-10-06）

源码提交d68dfbcf6a77ebd7782e0ee86addea61b38f6c66，严格六路径、父918b0a1c。实际RED分别为真实HTTP四断言失败、focused客户端6失败及成功meta2失败；最终route26/26、MCP36/36、双端typecheck exit0。完整私有回执位于/Users/zyongzhu/CreatorOS-local-acceptance/t1062-20261005-wm9zxxwl/cli-receipt-implementation-n5nj5791；独立评审SHA256 1fc03d6dd270cea153fa28d3774c790bc362fd85d5ec59e20884fcf11904b958。ROOT正常FF和progress done已发生。两个原显式60000已在六路径内改120000且原断言保留；旧801与Original18不改。运行态、unknown和过期分支明确为隔离状态夹具；新包、安装、原生操作与用户验收待发生。前文静态方案及历史未验状态作为当时记录保留。
