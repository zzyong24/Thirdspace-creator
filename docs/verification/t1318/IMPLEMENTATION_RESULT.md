# T1318 本地实施结果

纯组策划论点候选已可经原公开 confirm 原子采纳为 thesis_tree；组内账号筛选与合法 legacy 入口也完成相同真实链。本地受控实现覆盖通过，真实供应商、新候选包、原 thesis103 和父矩阵未重验；共享 timeout Gate 仍待 C 最终一次原命令。

## 精确实现与锁

唯一生产 `backend/src/application/thesis-adoption.ts` SHA256 `554daa79ac831bddad1f741a1f8cc382d6e1c35ee75a8d016a112fe55edc7fc3`；唯一新组合测试 SHA256 `5883285149a96330abc8d2feb0a6dfb69b11f8dc540f935db5c1d6079bcae962`。31原锁复核0漂移；完整运行前源/测试/config/runner/native替身/immutable worker字节均保存。最终清单与差异见 runtime/FINAL_SOURCE_MANIFEST.json、FINAL_DIFF.patch。

UoW 同一 transaction 内先按实际调用者合法 workspace 读原任务冻结身份，沿既有 assertFrozenWorkspaceMembership 取得原 A→member→G（纯组仅G），再 project→task 加锁；锁后核任务冻结 tuple/版本、execution映射与lease token未被更换，重读状态/任务类型/project及原输入project映射、原最新候选。确认内容必须与本tx原候选一致。比较的是任务自身不可变快照，不新增当前groupVersion相等门，真实仅重命名组后原任务照常完成。

AiRepository 携完整原冻结group/account；ArtifactsService 的 assertProjectOwned 来自本tx已锁项目和精确调用scope证明，不跳通用guard、不另开DB。采纳artifact/version沿原入口scope：组与筛选均group-owned/accountnull；合法legacy保accountA。只锁原任务A，不锁页面B；其它采纳与通用workspace/Artifacts源码未改。既有空白 user v1、唯一 AI v2、指针恢复和重复确认策略保持。

LOCK_ORDER_ANALYSIS.json 对三条真实 confirm SQL 原件独立断言：原冻结workspace锁在project和task前；筛选B没有出现在任一FOR UPDATE参数，锁的是原A。pure仅G；legacy为A/member/G→project→task。AiService外部短tx锁与UoW内部锁分别实际发生，前者不冒后者仍持有。PGlite证明真实消费者SQL顺序与回滚，不冒PG并发死锁测试。

## 当场前测与实际结果

| run | 原退出与时间 | 事实 |
|---|---|---|
| red-v1 | exit1/17.380s，1FAIL | 新公开project/create planning.thesis→真实prepare/worker/SDK原生协议/完整usage ledger→awaiting_confirmation；原confirm首AccountRequiredError，完整有效目标RED |
| green-v1 | exit1/32.021s，3FAIL | 三scope实际confirm均成功；测试错把总版本断言为1，真实原服务有空白user v1和唯一AI v2。失败原件保留，未改产品抹掉空白版本 |
| green-v2 | exit0/44.725s，3PASS | pure/filter/legacy完整公共生成/候选/confirm/原产物版本读回/重复confirm成功；pure内安全与回滚保护实际执行 |
| green-member-v3 | exit0/19.005s，1PASS | 只补filter冻结member版本/转组受控变化拒绝及恢复后的原公开采纳，不重复无关pure/legacy |
| backend-type-v1 | exit0/64.567s | 最终生产字节类型通过 |
| frontend-type-v1 | exit0/71.092s | 三scope保护版测试类型通过 |
| frontend-type-v2 | exit0/58.275s | 最终测试字节类型通过 |
| boundary-v1 | exit0/1.063s | node orchestrator/process/boundary-scan.mjs --quiet |
| semantic-v1 | exit0/0.400s | node orchestrator/process/semantic-boundary-scan.mjs |

类型原命令 `pnpm --dir backend/frontend exec tsc --noEmit --incremental false`。test3600000ms/hook180000ms/外层86400s，retry0单worker，不缩或续持久deadline。记录器 caseSelection 的 main 是未显式设置环境变量时的旧元数据默认，实际测试默认执行 pure/filter/legacy 三项，原Vitest输出和各case原件为准；不把 main 冒仅一项，也不改写原记录。

pure安全保护沿原公开confirm核外user/外group/错legacy账号、cancelled与归档拒绝；原项目映射被改和直接UoW确认内容篡改拒绝。artifact insert与artifact_version insert各真实SQL失败，确认事务回滚，原任务仍awaiting_confirmation，全artifact/version行hash与前值相同，无孤儿。原候选/ledger未捏造。filter保护先完整生产候选，再仅在owned DB受控修改原member版本/组；原公共confirm按实际冻结member拒绝，无新artifact，精确恢复原member后正常采纳。不是冒真实public transfer成功或PG并发。候选采纳结果均是单一aiTaskId版本，原空白v1保留；重复confirm返回原成功及全版本逐值不变。

fixture仅替换外部Codex子进程JSON-RPC与本地可用性边界、owned媒体/库；真实公开create、prepare、dispatcher、固定immutable worker、SDK、ledger、节点与UoW没有mock。worker5618216B/SHA3851b4fb132035f1b03528d68b0fa1c5ab86bda8134d8b98795252295c5a6454；无build/dist。0真实外部模型仍有实际合成native turn/model账本，各原件完整保留。

## 资源、安全与未验边界

各run失败和原退出不覆写；索引覆盖原件与before快照，排除可再生cache和owned db/tmp/media/empty-CODEX_HOME。实际独立扫描17738文件，高置信私钥/API/Bearer特征0命中，不称全秘密证明。fence快照SHA256，未取用户认证。16个fixture审计native PID独立均不存在；逐case own host.stop与persistence.dispose实际await回执保留，隔离DB磁盘留存。无当前候选、服务controller、原任务/用户库或全局配置操作。

共享timeout-policy待C统一实际执行与绑定；PG多连接并发、真实供应商/新包与原失败任务不代签。原planning.contract/outline未更动或重跑；不以本地scope通过宣称整个T1318/父功能完成。不commit、不改控制状态。冻结源/测试/报告后交独立只读审核并RELEASE。
