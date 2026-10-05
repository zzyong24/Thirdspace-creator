# T-1062 冻结迁移来源与收敛

三个目录保存来源提交的原始 SQL 与原始 journal，未修改 tag、时间、原 idx 或 SQL。对应 SHA256 记录在 `backend/src/migration-convergence-lineages.json`：root `125bc864`（123 项）、diagnostic `c5316506`（128 项）、canvas `55a526d6`（103 项）。共同 `0000–0100` 为 101 项，按 hash/原 when 去重的历史并集为 152 项。

主 journal 保留共同前缀，随后只有新的 `0128_workspace_convergence`，时间 `1791043200001`。原分支后续 SQL 仅在独立空的参考 PGlite 中重建 catalog；已有用户库不会重放初次组分配、按当前 membership 回填或伪造旧 125 回执。用户库先按已知来源前缀/hash/时间及全量物理结构核验，留完整备份后执行新 0128，记录其真实 hash/when。六张报表/画布表缺失的兼容修复执行同一新版 DDL，并另留真实执行回执。

新 DDL 由实际原 SQL 并集 catalog 对共同前缀差分生成。列、默认值、PK/unique/check/FK、独立索引/predicate、函数、触发器及序列参数/ownership 都由实际 PostgreSQL catalog 核验；已有不兼容定义在任何写入前拒绝，`IF NOT EXISTS` 仅用于经过核验的缺失结构和二次执行。PK/unique约束、独立唯一索引先于 FK 建立。排除 constraint-owned 索引时只排除本表的 p/u/x 约束，不排除引用端 FK 使用的独立唯一索引。

已有组域不再插入 `gm_legacy_*`，保留转组/归档/旧 group 非空值。新物理 group 列只按实际 project/output/composition/canvas/production/task 父链归属；缺父关系的旧账号资料仅可从真实初始 `grp_legacy_<account>` 取归属，不读当前 membership，孤立行保持 NULL 等待显式处理。任务预约可证据继承原 task 冻结的组/版本；输入、digest、原 ID、storageKey 和结算身份不改写。旧 account 唯一键保留；新 group 共享写入 account=NULL，使用相应 group partial unique，避免历史多账号同请求键碰撞导致改行。

复现生成：在本树自己的 frozen install 后运行 `node backend/drizzle/lineages/build-convergence.cjs "$PWD"`。生成器始终使用三个原归档的 152 项并集，不使用已缩减的主 journal；在 `/tmp` 留 common/target catalog。生成只适用于 BUILD，已经保存新收敛回执的发布版本不可再改此 SQL。

实际验证见 `docs/verification/t1062/migration-convergence-result.json`。这些隔离数据库测试不代替真实用户库升级、安装版验收或下一轮服务组归属适配。
