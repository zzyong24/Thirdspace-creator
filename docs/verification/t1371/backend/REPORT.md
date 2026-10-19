# T1371 真实服务消费者 RED / GREEN

隔离树基线 `72f167cd2a04f64ea0e3881a7d58d6ed90fcf2bf`。全部使用新建私有合成PGlite，不读写用户库、不登录/采集真实平台、不调用模型。原始日志、退出码和源码身份分次保存，不覆盖前次结果。

## 实际结果

| 尝试 | 自然退出 | 实际用例 | 证据 |
|---|---:|---|---|
| backend-red01 | 1 | 22项：16通过、6失败；54.47秒 | 同名前缀 `.log`、`-freeze.json`、`-exit.json` |
| backend-green01 | 0 | 两文件47项全部通过；64.96秒 | 同名前缀 `.log`、`-freeze.json`、`-exit.json` |

首次红测生产SHA `7c5f24fa46ba40320342210807d0c1bce50ab05d66247da16107dd803fc950e0` 未修改。5个失败是真实摘要遗漏：完成current目录里unknown已有可用typed456，公开transport仍只读原public123而非579；private/hidden历史保护组中的另一条合法unknown7被漏计；unknown归属正例与转组新样本读为未知。另1个失败是本次夹具错误地提交`deleted`，真实协议只接受`removed`；它在commitPage schema失败，不能冒充摘要RED。原日志保留，随后仅将该测试族改成现有`removed`删除语义；没有修改parser/commitPage迎合夹具。

GREEN另加入2个原public冻结保护例，最终dashboard消费者24项加原platform-collection集成23项共47项。两个Vitest文件可在框架内并行；没有并发运行另一任务的测试/Next。控制方仅并行修改其T1370前端，不把该前端差异作为本次后端证据。开始完整dirty身份与三份精确backend源都已记录，结束三个backend SHA逐字不变。

## 新行为与保护

- 真实 `start/claim/commitPage → readDashboardSummary → groupWorkspace transport`：完成current unknown在有唯一归属typed样本时可见；priority0且`outboundFrozenAt/uncertainVisibilityAt`均非空的真实同族覆盖；public123与unknown456合计579，真实0保留，缺失不补0。
- 同优先级100的private/hidden/removed先入库、后更新unknown，当前行确为unknown且真实tombstone仍存在：该身份999排除，另一条合法unknown7正常纳入；不是靠旧visibility碰巧未更新保护。
- generation0/legacy_import来源、未完成目录和旧generation的unknown仍排除；原public且两冻结字段null的分支保持，任一冻结字段非空仍排除。
- unknown的A→B→A、入组前/跨组重叠/错误用户、最新不可用与同刻冲突经真实服务消费者保护；原T1356日期/去重/指标类型/错误隔离用例继续通过。
- 摘要读取前后完整同ID作品、catalog、typed指标、tombstone及membership全等。原collection集成包含unknown、目录缺失、第二pass未知和非公开水位的冻结守卫。

生产仅修改`readDashboardSummary`的scopedWorks准入：原public分支原样；unknown只在当前完成目录且同一user/account/platform/externalId没有任何tombstone时允许内部读取。没有修改原始visibility、外发冻结、parser、commitPage、schema或用户数据。

GREEN生产SHA：`2ae48fd73e65849bd4727a2d13baef4fd036916127df54a9e003785704fdc6ee`。消费者测试SHA：`3d27b2d9619b393725778f297e410adafd20ccc3463c183b529e3ef1a27f4da0`。原collection测试SHA：`e24fc90a32f19e8caccc9905323f7750ab74b19532bbbe1de73c3d2ee921918f`。

本报告仅证明受控服务消费者与现有冻结守卫。双视口真实Next/HTTP/UI、全局适用门和独立实现审另记；未安装候选、未恢复真实采集、未运行外发/导出/发布真人E2E，不能代签这些结果。
