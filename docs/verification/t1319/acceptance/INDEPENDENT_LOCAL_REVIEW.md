# T1319 独立局部复核

结论：认可当前最小接线与已发生的局部验证，可以精确集成。共享 timeout Gate、新包真实 RSS/供应商、父功能矩阵仍待验；不是整任务完成。审者 Root 只读源码、原始运行证据并核算文件，没有运行产品测试、HTTP、模型或操作候选数据库。

## 精确来源

| 对象 | SHA256 |
|---|---|
| 唯一生产 `frontend/src/server/persistence-client.ts` | `ffb864d34c4546b3d53813cd88d437cb54cf98731a6dfd9a2fc641c55e16757a` |
| 新组合测试 `agentic-public-admission.persistence-client.test.ts` | `b1abc4aafbca2e63cdd29e5ae5bd27f5293fb145d20cd5d1ad836cd7c3c10215` |
| `IMPLEMENTATION_RESULT.md` | `780edc57d73978daad055dae1e095a72c2c8065debd88668452bbae7301d47a9` |
| `runtime/OUTPUT_INDEX.json` | `cfac8c4d87522d0896b4bd6eaa7924520587a2d9cb55e72b34edce547c0163c0` |

Root 实核索引 985 文件及单列的 1 生产源、1 测试，bytes/SHA 全匹配。另核 red-v2、green-v1、matrix-v2、final-narrow-v3、source-guard-v4 的事前实际快照，分别 68/69/69/74/81 项，全部匹配。不能把各轮不同测试字节合成一次最终全套通过。

## 实现判断

已读原 public execution.create、registry、agenticBusiness definitions/supports/prepare 及最终 diff。改动只在组合根声明初始化安全的 defaultfalse 查询闭包，公开 hasExecutor 与 loopTypeOf 请求期读取，真实 agenticBusiness 装配后才绑定 `supports(exec.<bare taskType>)`。确定性 registry、真实定义、执行准备、scope、网络及预算不变；未注册假 executor，没有硬编码能力白名单或恒真授权，也不会同步访问后置 service 的 TDZ。

```mermaid
flowchart LR
 A[公开创建采集任务] --> B[核真实已装配定义]
 B --> C[原准备与独立 worker]
 C --> D[原采集工具和领域服务]
 D --> E[真实来源子任务与结果]
```

三处现有 marker 没有新增或改变规则语义；C 可以在精确 diff 与当前 SHA 上更新原基线绑定，不能放松门卫。

## 实际证据判断

- red-v2 自然失败 16.699 秒，首错为公开 operation 的 `未注册的 executor: agentic.collect`，0 AI/execution/call/RSS。red-v1 仅启动前清单路径错误，不算目标 RED。此轮是实际 composite transport/service，不冒真实 HTTP listener。
- green-v1 完整链通过；matrix-v2 9PASS/1FAIL，外组素材更早被原数据库引用门拒绝而夹具误等异步 prepare。final-narrow-v3 的 input/collect 2PASS 闭合该预期并核同 key/body、改 goal/timeout 拒绝及原执行整行不变。原 v2 FAIL 和误标 caseSelection 均保留。
- collect 用真正 immutable agentic-worker（1538258 字节，SHA `24c1e7d8eb385e87ed7c69bc5d9b5f4d180df61abe09afe561335a30804a8728`）、原 dispatcher/host/ledger、collect.plan/run/status、实际来源子任务及 owned HTTP RSS。最终 1 GET、1 succeeded_with_items run、1 item、1 sourceSnapshot，父业务/执行 succeeded，4 calls settled；稳定父任务/来源键及原请求重放无新增已核。
- material/research 仅实际定义、循环与 dryRun 模型回合通过，不能冒真实联网研究或素材提案采纳。未知类型在 closed enum 契约早拒，不能冒单独命中 registry unknown 分支。确定性 echo 真实沙箱产物及公开丢弃已核。
- network、browser、原 attempt/fence、取消前领取、预算拒绝、原 UNKNOWN 不自动重发各有真实消费者证据。预算/未知负例终态仍 unknown_result，业务 AI 部分仍 queued；不改写为业务成功。
- Root 发现原 foreign-source 仅断言上层任意错误，不能证明具体归属门，已要求精确补证。source-guard-v4 自然 1PASS/20.364 秒：透明 wrapper 原参数调用真实 runCollection，保原返回/throw；原 `OwnershipError / Intelligence source not found` 来自 requireSource→startRun→runCollection；显式 0 runs/items/snapshots/来源子 execution。原英文未伪造为中文，v2 原不充分证据仍保留。
- 最终 frontend type-v2 exit0/53.679 秒，原 frontend type-v1、backend type、boundary、semantic 实际退出0。没有重跑未受新增透明观察影响的全部业务 case；已有各轮源及差异准确分列。

## 限制与释放

Codex 仅外部子进程协议替身，真实外部模型为0；RSS 仅 exact DNS/fetch 边界转到自有 HTTP，原 assertUrlAllowed 与私网拒绝保持，不是 BBC 公开实采。协议模型中有限 status 观察只覆盖本次快速自有 RSS，不代表慢网站或上游延迟性能验收。PGlite 不代签多连接 PostgreSQL。原身份状态/本地 authority 替身也不证明真实 Codex 登录或用户授权。

已读清理记录：10 个自有运行 PG、28 个已记录 wrapper/native PID 无存活匹配，各 case 真 host.stop/dispose/HTTP.close；未单列全部 fork PID 的限制保留。两个候选 controller、旧 UNKNOWN 和用户数据未在本轮操作。证据可能含本任务隔离库已失效测试租约字段，不能称没有任何运行时身份；不是用户/候选凭据。

本复核不改原 OUTPUT_INDEX，供 C 单独精确纳入提交。Root 写完即 RELEASE 本文；后续实际新包、统一 timeout 和总验收继续，不能凭本复核补签全绿。
