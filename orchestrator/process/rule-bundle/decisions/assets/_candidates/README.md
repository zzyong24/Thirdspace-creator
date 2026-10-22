# _candidates — 候选待审区

> 三源采集(A 工程复盘 / B 本地扫描 / C GitHub 蒸馏)的产物**全部先落这里**,`status: candidate` + `verified: false`。任何来源都不得直接进 `modules/`(质量防火墙,见上级 `../README.md`)。

## 一个 candidate 长什么样
`_candidates/<MOD-slug>/`:
- `ENTRY.md`(frontmatter `status: candidate`、`verified: false`、`provenance.source` ∈ {A,B,C})
- `files/`(vendor 蓝本)
- `example/`(`portable-slice.mjs` + `example.test.ts`)

## 晋升路径(过 5 门 + 人确认)
1. **重写成本仓 schema**(不是原始分析)。
2. **example-as-test 跑绿**(`node process/assets-runner.mjs` 命中该候选)。
3. **真实交付 / 跨项目复用过**(A 源实战背书 / B 源 reuseFreq≥2 / C 源蒸馏 + 验证)。
4. **license 干净**(确定性工具核;copyleft BLOCK 进 module)。
5. **高危域人审**(crypto / auth / key-management / payment)。

→ 5 门全过 + **人一次性确认** → **物理搬进** `modules/MOD-NNN/`(分配正式 MOD 编号)或 `patterns/`(若降级为 methodology),改 `status: active` + `verified: true`,在 `ASSET_INDEX.md` 加一行。

## asset-check 对本目录的约束
- 住在 `_candidates/` 的卡 `status` 必须是 `candidate`(不得 active/verified)——`asset-check.mjs` 强制(candidate≠active 门)。
- license 未知 / 待核在此降级 **WARN**(允许待核候选暂存);而 `modules/` 下的 active 卡未知 license = ERROR(fail-closed)。
