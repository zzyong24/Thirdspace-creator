# 最终联合元数据采集源码候选（不执行）

目标是给真实原170、新103/7/1与Doocs2建立完整加载来源；原170、新111、first100、测试/SQL/配置不改。原6CJS/2Python八工具逐字复制保存，尚无新joint图；074的131唯一pair/194context只属旧Doocs历史。当前HEAD/开发包/同HEAD11Worker尚未闭合，因此本包只源审，不运行collector、OTool、reseal、SDK、服务或浏览器。

大白话：先让新提交、安装包和Worker对齐，再读取真实两种浏览器、媒体工具和依赖的加载清单。清单决定要检查多少项，不能沿用旧131或运行中延长期限。

```mermaid
flowchart LR
 A[真实新HEAD/开发包/11Worker齐备] --> B[已封Node/Git/OTool/Python运行时]
 B --> C[只读完整根与binary discovery]
 C --> D[冻结真实N与完整串行预算]
 D --> E[独评与ROOT准入新metadata输入]
 E --> F[一次真实OTool及全部raw/关闭/后验]
 F --> G[后续reseal与owned副本闭包另验]
```

读取顺序：UNCHANGED_EIGHT_TOOL_SOURCE_LINEAGE → JOINT_ROLE_REQUIREMENTS_SOURCE → tool/prepare-metadata-input.cjs → tool/discover-joint-pairs.py → budget-formulas/freeze-discovery-plan → tool/prepare-joint-dyld.py → 容量表 → LEGACY253_REAL_F70_LINEAGE_STATIC_SOURCE_PROOF → 新reseal完整正逆/候选 → 语法raw/完整binding。

两阶段保持分别单出生期限。先执行原prepare-metadata-input(1.14M=Git240k+原库存IO900k)和binary discovery(900k)，各自保独立2.16M生命周期，父before/after各840k=IO600k+真实HEAD240k，末ps180k/margin180k，总8.4M。freezeDiscoveryPlan只在该父afterIO600k内部消费读写槽，不是第三child，不执行metadata；它核实际discovery与原输入SHA/根库存才生成不可覆盖的新容量资料；私有原PRE输入另存完整原bytes后，只给该私有PRE追加原collector必须消费的discoveredPairsSha256，计划同时绑定旧/新输入SHA。旧生产/验收源JSON不写回。计划资料仍不准OTool，供ROOT/peer完整复核。下一metadata子进程在新单出生前派生N，旧131不当下限或默认；不能在inventory旧birth上临时追加N。

实际OTool child保持原公式：N×(120k正命令+120k启动/关闭/raw)+entry900k+post900k+margin600k=N×240k+2.4M。父另保2.16M独立生命周期及before/after各840k、ps180k/margin180k，完整父=N×240k+6.6M。所有命令逐完整remaining N×240k+post/margin admission，Python单调期限固定，父长timer分段≤60k不续期。真正N/contexts/sourceKeySHA现在为空，必须来自该新candidate真实读取的完整binary discovery，不靠手填或旧图。

根范围：原工具实际默认headless-shell1223完整实现，Doocs实际fullChrome及所有Helpers独立纳入；真实ffmpeg9f5全部递归库；Node、两真实PG工具、所有installed regular Mach-O/Codex官方资源/Node addons、实际HomebrewGit和逻辑helper、实际OTool。每MH_EXECUTE独立mainExecutable；addons沿Node真实LC_RPATH；绝对load不重写，相对load逐真实context；Chromium可能dlopen调用者未观察明确留false。Python未来真正执行入口/库也需bootstrap准入，当前未签其闭包。source stage无CJS vendor替换；protocol唯一新inode替换只在后续真正private profile由旧完整guard处理。

新的reseal-legacy253-lineage.cjs单独关闭静态来源失配：旧7391把所有253要求存在于348 approved-source map，实际只有16，另237会误拒。原8本体完全不改。本候选从真实f70.legacy253Sources读完整253：237只承继current=previousSeal=旧b994=physical且unchanged-first-seal；16仍需sourceEntries/currentSHA/非空exactSpecPaths/实际SPEC SHA，原absent精确保留。没有把237变成批准改动或扩大348。完整253 current只读proof、原consumer错误原文、机械全正逆保存；不执行reseal/元数据来故意触发。新消费者与原lineage/snapshot均在同代候选中完整提供。

最终真实包装器/完整final输入还未生成或准入。本SOURCE包允许未来复用工具和公式，不代表已创建fresh N/graph，不能拿当前source-only或stage f70签新HEAD/包/11Worker。App继续未验。
