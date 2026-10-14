# T1290 全worktree只读库存

本轮固定Main保护检查点 `0b0913635c2910fdf488ee3b47dc95acd5d619b0`；原e651为前一阶段剪辑运行/合并来源，二者不替换。Creator实际15棵登记工作树。R最初观察为f74已合并W03d+Maine651；随后Root普通合并Main0b，最新R HEAD `f74fdf8c069d097be8f3bd4f38ff7c992dc85f7e` + MERGE_HEAD `0b0913635c2910fdf488ee3b47dc95acd5d619b0`，实际97 unmerged路径。库存与后续冲突各留独立时点，不能把任一dirty快照当打包冻结。

| 工作树 | HEAD | 对Main独有提交 | 已为W03d祖先 | dirty | 源字节(匹配Main/匹配W/改动路径) |
|---|---|---:|---|---|---|
| Main | `0b0913635c` | 0 | False | `{' M': 1, '??': 63388}` | 0/0/0 |
| codex-ephemeral-sessions | `196321a012` | 2 | False | `{}` | 2/2/5 |
| codex-text-image | `5dfd1c706f` | 13 | False | `{}` | 179/141/215 |
| daily-client-observability | `90f3a6f48f` | 8 | False | `{}` | 257/171/290 |
| integrated-dev-acceptance | `64ca6add43` | 6 | True | `{}` | 552/697/768 |
| integrated-frontend-unit | `533224f334` | 1 | True | `{}` | 218/252/336 |
| integrated-unit-acceptance | `533224f334` | 1 | True | `{' M': 2, '??': 2}` | 218/252/336 |
| t1062-client-integration | `a091de271a` | 0 | True | `{}` | 0/0/0 |
| t1255-client-writer | `f54f184d39` | 6 | False | `{'??': 2}` | 239/172/287 |
| t1273-release-hardening | `c98e7a958c` | 2 | False | `{}` | 28/0/31 |
| t1274-markdown | `949ec22997` | 1 | False | `{}` | 11/0/14 |
| t1274-native-workspace | `19a1d87cee` | 13 | False | `{}` | 401/0/401 |
| unified-capability-models | `03d60d39c8` | 9 | True | `{'??': 1}` | 496/818/818 |
| unified-editing-integration | `f74fdf8c06` | 10 | False | `{}` | 502/798/813 |
| wechat-stats-evidence | `a3bc947d4b` | 0 | True | `{}` | 0/0/0 |

完整HEAD/branch/main共同祖先、git cherry相同补片标记、独有提交SHA/安全subject、精确源/测试/构建路径及当前SHA在 FULL_INVENTORY.json。git ancestry仅证明提交可达，byte match仅证明该完整文件等同；git cherry的+不证明功能缺失，不能因此用旧树覆盖最新。多数前置代码通过早期整合commit已包含于W/R或Main保护快照，需要普通合并/最小差异而非copy全树。

Main保护后没有待保护的常规生产source变更；大量未跟踪为隔离源码副本、真实证据/原型DB或候选。文件私密分类仅按路径识别，不读取内容；未知项继续保留，不将“隐藏计数”解释为可以删除。原型/沙盒深层树按根聚合，避免把63k派生文件当63k新产品源码。四个旧树仍有少量未提交evidence；W未跟踪私有目录必须保留并查ignored用途，不能git add -A。

Growth本任务G clean，HEAD `bbf225eb2aa73a9c8ae0f9b925289f3ec79f2bdf`；该仓真实main ref `86add97008fa7a804255a5b2505dffe251d50a60`，primary checkout却在 `codex/t182-managed-channel-runtime` / `b833cdd81c23509c1cf50b09856c7c7e5b1f5cc3`。合Growth到自身main，不能将primary checkout branch冒main，更不能揉入Creator目录。其相对main源/测试路径235项与独有提交在JSON；Growth全部registry仅记录元数据，3个prunable失效登记不当作可直接删除的实体目录。

整树覆盖危险点：最新W六槽完整map/逐call credentials/ASR paid/admission/bootstrap不能被旧v1/global模型源覆盖；R/Main剪辑Markdown+写作上下文、tx workReviewAiFor、CAS与V1原声不能被旧W恢复；Main新硬化/observability/Windows profiles不能因stage3来自checkpoint而忽略。控制队列/审计按Main当前真相，旧事件保Git历史，不拼假链。随后按实际R stage base/2/3逐源辨别旧W blob与真正新增，Root唯一串行应用。

清理前先由Root确认每一unique source/head可达main或可恢复checkpoint；所有ignored用户库、激活/机器身份、密钥、运行中目录与最新安装包单独保留。此库存不读取这些内容/敏感值，不stage/commit/merge/delete，不签空间释放或本地包。源哈希也不证明源码不存在秘密，打包冻结前仍须正式敏感输入检查。
