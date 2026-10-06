# T-1062 安装页面启动的合同初始化修复（实现范围）

原已批准SPEC cfbaf9不变。本记录落实用户已经授权的本地安装与逐功能验收，不是新产品方向、服务契约变更、规格复审或用户typed capability。当前处于BUILD：真实安装发现失败→有界实现独立评审→真实回归→干净提交→SHIP重新出包和安装验证。原18命令及历史失败保留。

## 当场失败

005141ef的本地DMG实际生成并安装，镜像/签名与277补充迁移资源逐字节通过；公开CLI status/full、账号和组列表均成功，各3项。安装浏览器tab3真实报 `ReferenceError: Cannot access ... before initialization`，位置是 `Module.creativeCanvasOperations`。首页没有可用功能，不能填写安装全绿。完整实际候选、包hash、PID、公开回执摘要及console错误只留用户私有 installed-client-contract-cycle-failure-actual-20261006/result.json。

源码endpoint注册表导入操作，操作又从注册表取得defineEndpoint，形成循环。原开发浏览器与Node根导入的成功不能代签经过构建和混淆的客户端。一次tsx诊断因工具不存在exit254，不是红测或产品失败证据。

## 最小待评审实现

将原HttpMethod/Endpoint/defineEndpoint定义原文提取为contract/src/endpoint-definition.ts叶子；endpoints.ts原路径重新导出同名定义，原ENDPOINTS对象、所有展开顺序和creativeCanvas的原重复展开保持。40个操作文件只把../endpoints定义导入改为../endpoint-definition，不改operation ID、路径、schema、权限、归属、模型、数据库或用户内容。新增真实先操作入口再注册表的初始化回归，覆盖所有40操作入口。精确43路径另列新substep；原integration592与迁移283不改。

此时仅方案，尚未改产品代码、未签测试或新包成功。独立Agent先只读核对循环、兼容导出和内部拆分范围，再执行原字节基线与修复回归；最终必须用新包真实页面公共入口检验，不能以孤立helper代替。

```mermaid
flowchart LR
 A[原注册表] --> B[各操作模块]
 B -->|旧循环| A
 B -->|修复后| C[原样提取的定义叶子]
 A --> C
```


## 真实回归与测试语言校正

正常控制提交40477d19及root-installed-contract租约后先新增TS回归：42个真实fresh Node ESM入口实际RED40失败/2通过；42生产源按独立方案实现后新回归+原registry/client实际49通过，完整合同62文件367通过。contract typecheck实际exit2仅新增TS Node harness缺node:child_process/node:url/process声明，未把它写为类型全绿。

独立复核同意将唯一新测试改为Node ESM的endpoint-bootstrap.test.mjs，保留全部42独立子进程入口与全部断言，只移除as const类型语法并把新子进程/外层观察预算设120000/135000。不加跨层Node类型、不改TS生产检查或忽略错误，不移植其他会话的运行时222预算。原TS实际RED/GREEN、类型失败和完整源码字节保存在私有目录及own stash bf7642fa；正常释放旧租约、提交精确测试路径控制后重新claim再恢复已审候选。43产品/44 substep数量与原592/283保持。

新mjs的type/fullsuite、新包与实际页面都需重新验证；原TS测试版本已发生结果不能称mjs版本当场RED。公共初始化协议和全部断言保留的字节差异另独立核对，不删除历史失败。


## 新回归文件的精确发现配置

mjs版本现场contract/frontend typecheck均exit0；完整测试实际仅61文件325项，因为旧Vitest include只匹配.ts。该结果只证明原suite，不签新42回归。独立只读复核同意另准入既有contract/vitest.config.ts一条路径，只在原include数组追加精确tests/endpoint-bootstrap.test.mjs，保留原.ts glob、Node环境和其他配置，不删测试或扩通配范围。

当前精确产品写集44=42源+1mjs+1测试配置，substep45含本说明；原integration592、compat283、SPECcfbaf9与原18不变。已hash核验私有保存43候选，并保留own stash5d5c854f，正常释放/控制提交/重新claim后恢复，仅对新配置执行上述独审的增补。要求当前完整实际62文件367项且真包含新42，原focused真3文件49项；当前新观察尚未发生。


## 当前真实实现闭合（安装仍待验）

最终44产品源实际pre-run/post-run hash相同，完整contract62文件367项通过（session7190/exit0），精确module命令3文件49项通过（session77189/exit0），新42fresh进程实际执行。原61测试字节不改；contract type55911/frontend2599均exit0，完全相同42生产源的结果复用，不虚签全backend或新commit运行。独立最终44报告空findings，SHA256 026c7968470198a793b434b5d45afd4c11a31f5041bbfe358ce22948a201ea4c，私有implementation-review.json；原注册余文/40仅import/叶子原文/公共导出/零SCC均核对。

支持的task-preflight对45精确路径实际exit0；一次不带task的全仓默认audit实际419项HALT且工具输出截断，保留为全局未绿，未据它改基线或清洗旧账。原reconcile36错误/1告警保留。新源尚未进入安装包，真实页面/ASR/Skill/用户验收未通过。


## 提交前EOF分隔校正与当场复验

首次cached diffcheck实际exit2仅新叶子EOF多一分隔空行，未产生产品提交。只删最后一个LF、所有定义语句与其余43文件完全相同；独审分隔校正通过，私有leaf-eof-trivia-independent-review.json SHA111f1d8378fa8d09a71c9334180367355acb1b23739c5cb38c936badf83df9bf。此最终44字节在复验前封存，实际full session79475 exit0/62文件367通过，module session66879 exit0/3文件49通过，测试后44 hash全与pre-run相同。私有final-eof-execution-receipt.json SHA efc520f91c568dba23d1d5dd9d81076e556da3a477c511a85bb6d211a12ab913；旧报告与失败保留。新混淆包及安装功能仍待验。
