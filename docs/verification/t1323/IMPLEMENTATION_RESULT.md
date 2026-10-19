# T1323 本地实施结果

结论：受控本地目标与已审保护已完成，交 Root 独立终审。证据采用同最终两生产源的覆盖拼接，**没有一次六例全绿**；green-full-v2 的真实 5PASS/1FAIL 原件保留，失败的主混流在修正夹具实际对象后仅补跑未完成四族并最终成功。不据此签整任务、新包、真实供应商或父功能矩阵 PASS；共享 timeout Gate 仍待 C 最后独占。

## 实际改动与边界

- checkpoint 在冻结 Codex native 分支先验证全部真实 root/Host/ordinary/model，再适配两处检查点消费；read、首次 save 和幂等 save 快返回共用完整验证。未知类型/归属不能被过滤隐藏。原 generic partition 未改，native 不伪造 assistant/tool 消息。
- dispatcher 仅在真实 native 且当前有 ordinary 时取同 ref 的实际 tools。解析在 lease 事务外，整段 pending/abort/active scope 受原生命周期约束；同步 validator 在 checkpoint 同事务内用当前 task/calls 调原 forCall readonlyRecovery，复用真实参数解析、默认值、validationOutcome、版本及摘要。没有第二套摘要或 JSONB schema 重建。
- non-native 与空/零 ordinary 不取新 parser。事务外判断无 ordinary、事务内却出现 ordinary 时明确拒缺 validator，不把预读当豁免。root unknown 始终保持真实状态；请求记账的 null token、全调用预算/费用与 recovery 值未改。

```mermaid
flowchart LR
  A[原公开 resume / attempt2] --> B[事务外取得同ref真实工具]
  B --> C[同lease事务核当前完整账本与原binder]
  C --> D[原thread只读恢复]
  D --> E[原结算与最终commit]
```

生产两源与最终测试：

| 文件 | bytes | SHA256 |
| --- | --- | --- |
| `backend/src/modules/execution/execution-checkpoint.service.ts` | 19654 | `e5cb65fd0a2d479aacb4174a8e45b4926015af069bc025be6a665c3ca5d87933` |
| `backend/src/modules/execution/model-worker-dispatcher.ts` | 57773 | `d08da799e1246adfa00245402bdfe44c88418de4e4664b76adba834578086f33` |
| `frontend/src/server/__module_integration__/codex-mixed-checkpoint.persistence-client.test.ts` | 35380 | `c9c12147903cf0fbdefa08bfe801513b779056b59828f0310e945683f610db54` |

全部新输出位于 runtime/round3；旧六轮、cases、fixture、索引保持只读。60正式输入末检仅两生产/本测试三项授权变化，其余0漂移，见 `runtime/round3/INPUT_FINAL_RECHECK.json`。最终源已明确冻结/RELEASE，不再读写活源，以下收尾只用已存快照。

## 完整前 RED 与三入口保护

原新 owned 完整 RED `runtime/red-v3`：真实 public submit→prepare/dispatcher→原 immutable worker→Host+ordinary+完整子模型→停止自有 worker→原公开 resume，attempt2 首抛“内部模型调用的父工具归属损坏”，自然 exit1/28.177s。最初两次0port失败没有充 RED。

单源局部修复后，`runtime/ordinary-source-red-v1` 的精确 ordinary.input 单字段污染被 read 错误放行，真实安全 FAIL 保留。round3 新实际路径、新 before 的 `red-target-v1` 再证明 read、首次 save、同 revision/digest 幂等 save 均错误 fulfilled，不能用原单源GREEN覆盖。

最终两源的 `green-full-v2/cases`（实际目录见下表）中，ordinary 三入口均抛原 binder 的准确 `ConflictError: 工具调用与冻结参数不符`。原17项 root/Host/child/source/digest/receipt/重复ID保护按顺序双入口断言成功并保存恢复快照，随后新增 schema 夹具失败，未写该 run 的最终 guard 汇总；不冒17项原始错误逐条JSON已完整留存。精确证据为该 run 冻结test的串行断言、每项 polluted/rejected/restored 原件与后续准确首失败；原单源17项完整错误汇总另保旧run并注明源版本。

schema 失败原因为 dispatcher 对 resolveTools 返回工具逐项浅拷贝；原夹具改的是拷贝前 map 的 parameters，真实消费者未变。修正仅透明观察原 createExecutionChatToolPorts 的 deps.tools，工厂实参、调用与返回保持原样。`green-tail-v1` 的 `actual-tools-reference-proof.json` 实际证明 map/tool 引用不同、改错对象后消费者 schema 行为摘要与版本不变且真实 read 仍成功；`ordinary-schema-consumer-proof.json` 和 `ordinary-definition-version-consumer-proof.json` 证明改真实消费者后字段/行为改变。这里的 schema 指固定中性输入矩阵的真实 safeParse 行为摘要，不冒 JSON Schema 字节哈希，也不是补拍旧run对象。

随后仅完成 schema/version/source-name/operationKey 四族，每族 read/save准确拒绝、原行恢复再成功；原消息/foreign ref、wrong fence 保护保持，最终原 worker 同 thread/read/commit 成功。wrong-fence 首门实际为 dispatcher `Error: STALE_EXECUTION`，旧期望 lease ConflictError 的夹具 FAIL 保留，未为它改生产。

## 六个最终受控样本

下表为真实成功样本拼接；calls/turns 是账本条数/合成 native turn/start 数，不能写成0调用。0真实模型仅指未调用实际外部供应商。

| 样本 | 实际run | 原execution | 原终态 | calls / starts |
| --- | --- | --- | --- | --- |
| `recovery` | `green-tail-v1` | `execution-task-2ba2eccf-8` | succeeded / attempt2 | 4 / 2 |
| `recovery-ordinary` | `green-full-v2` | `execution-task-533e3b9e-8` | succeeded / attempt2 | 3 / 2 |
| `recovery-order` | `green-full-v2` | `execution-task-4d3f92fd-8` | succeeded / attempt2 | 3 / 2 |
| `recovery-default` | `green-full-v2` | `execution-task-75bc91a1-8` | succeeded / attempt2 | 3 / 2 |
| `recovery-invalid` | `green-full-v2` | `execution-task-ac3f0b0a-8` | succeeded / attempt2 | 2 / 1 |
| `recovery-host-only` | `green-full-v2` | `execution-task-5f01f3e3-8` | succeeded / attempt2 | 2 / 1 |

这六样本共17账本行、10次合成 native turn/start；恢复后没有新增 thread/turn/start、没有重复模型或Host工具，最终重复 commit 后 calls/events逐字节不变。ordinary/order/default 均真实 external_agent 原根+child，非 Pi/model-only 替代；invalid_input 为真实原binder错误回执、0子模型；Host-only 为真实原根+Host、0ordinary。每个样本 attempt2 public succeeded、原业务 succeeded、唯一 assistant/finish/工具回执断言见各 `after-drain`、`recovery-proof`、`after-duplicate-terminal`。

预算保留全 calls：混流恢复前 root unknown 且Host accountingBasis=requests、totalTokens=null，checkpoint spentTokens=null/requires_reconciliation，knownSpentTokens仍为原账本已知之和；不补造token、不改成ready。当前覆盖为已结算子模型与unknown原生根的恢复，不冒“未结算子模型全族恢复”。

## 原命令与退出

| 原产物目录 | exit | 秒 | 实际含义 |
| --- | --- | --- | --- |
| `docs/verification/t1323/runtime/red-v1` | 1 | 19.733 | worker首port前失败，0calls/0ports |
| `docs/verification/t1323/runtime/green-v1` | 0 | 44.614 | 原单源主链局部GREEN |
| `docs/verification/t1323/runtime/red-v2` | 1 | 19.833 | 同前置失败，非目标RED |
| `docs/verification/t1323/runtime/ordinary-source-red-v1` | 1 | 42.496 | 修后ordinary参数来源真实保护FAIL |
| `docs/verification/t1323/runtime/red-v3` | 1 | 28.177 | 完整原公开恢复目标RED |
| `docs/verification/t1323/runtime/green-guards-v1` | 0 | 66.694 | 原单源17项保护局部GREEN |
| `docs/verification/t1323/runtime/round3/frontend-type-v2` | 0 | 110.979 | 修导入后前端类型0 |
| `docs/verification/t1323/runtime/round3/frontend-type-v3` | 0 | 107.601 | 最终test透明观察器后前端类型0 |
| `docs/verification/t1323/runtime/round3/boundary-v1` | 0 | 1.747 | 真实boundary0 |
| `docs/verification/t1323/runtime/round3/green-target-v1` | 1 | 48.19 | 三入口准确拒绝；wrong-fence夹具旧断言FAIL |
| `docs/verification/t1323/runtime/round3/semantic-v1` | 0 | 2.081 | 真实semantic0 |
| `docs/verification/t1323/runtime/round3/green-full-v1` | 1 | 1.283 | test直接导入无依赖zod，0tests前置FAIL |
| `docs/verification/t1323/runtime/round3/backend-type-v1` | 0 | 128.192 | 真实后端类型0 |
| `docs/verification/t1323/runtime/round3/frontend-type-v1` | 2 | 142.202 | 唯一test zod导入错误，exit2 |
| `docs/verification/t1323/runtime/round3/backend-checkpoint-v1` | 0 | 55.148 | 原checkpoint24PASS |
| `docs/verification/t1323/runtime/round3/red-target-v1` | 1 | 50.084 | 新路径三入口均错误fulfilled的RED |
| `docs/verification/t1323/runtime/round3/green-tail-v1` | 0 | 69.832 | 补正实际对象，仅余4族+同thread终态1PASS |
| `docs/verification/t1323/runtime/round3/green-full-v2` | 1 | 183.028 | 5PASS/1FAIL，schema夹具改到拷贝前对象 |

所有命令/源码/test/config/fixture/worker运行前快照在各run `execution.json`、`BEFORE_INPUTS.json` 与 snapshot。原 immutable worker实际加载路径及SHA3851b4fb…在各新 WORKER_BINDING；复制worker仅供快照，不能冒复制目录与原目录依赖布局相同。旧首两run没有实际worker stderr首错，只能依据0port与已核模块解析布局区别分类，不捏中文错误。

组合 test1h、hook180s，唯一include/singleworker/retry0，业务原期限不续期；组合外层86400s。原checkpoint24项对照使用同1h test上限，外层加长172800s以覆盖串行全部单例与清理；不是缩业务预算。类型 --noEmit（前端 --incremental false），专属Vitest cache在round3内。green-tail-v1 的 GUARD_TAIL=1 未被旧runner execution.json单列，实际工具命令与只有该分支才生成的 map/reference/四族proof交叉证明，原记录未回写；不冒原预写元数据齐全。

backend type0绑定最终两生产源；最终test由frontend-type-v3真实0绑定。原checkpoint24项含既有Pi/Agentic/model-only消息/预算/损坏关系对照；不冒新的dispatcher Pi完整公共验收。boundary/semantic均最终生产源真实0（末次只有测试透明观察器变化），共享 timeout-policy 尚待 C，不写成全部 Gates 绿。

## 资源、秘密与未验范围

`RESOURCE_CLEANUP.json`：15个实际case cleanup文件均在原stop/dispose await后形成；独立 ps白名单检查74个已记录native PID及精确runtime Node路径，0仍属本任务、0owned Node。无双controller/候选/旧任务操作，owned磁盘原件/db/tmp/cache留存。进程退出验证不是仅凭finally意图。

实际敏感值扫描已执行：1,602份现存安全证据/快照与报告、389,713,169字节；provider key、Bearer实值、完整私钥块、含凭据URL、敏感字段长字面值五类规则0匹配，见 `runtime/round3/SECRET_SCAN.json`。未扫描留存db/tmp/cache/媒体，不据此保证未知格式或外部环境无秘密。最终报告替换本段后再单独扫描，结果同为0匹配。

没有真实供应商、新包、原生壳、父40功能矩阵、旧825首因或新增真实跨user/group公共矩阵结论。真实首个目标RED、修后ordinary安全FAIL、前置fixture/type失败、green-full-v2的5PASS1FAIL都保留；未新增产品范围。当前文件是实施者报告，最终独立验收由Root/R执行。

索引：`runtime/round3/OUTPUT_INDEX.json`（排除db/tmp/cache及索引自身；report与旧/新安全证据包含，实际sha/bytes逐项核对）。完成后全部源码/test/证据/报告写权与活源RO明确RELEASE，C进行控制集成/新包后再验。
