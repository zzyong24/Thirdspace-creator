# T-915 母规范正式复审：工具拒绝，未生成新裁决

**独立规格核对未发现新增 confirmed requirement gap；真实 reviewctl record 因 constitution hash 变化拒绝，本次没有正式 PASS 或新 receipt。** T-915 仍是 cycle1 round2，最后 round3 尚未成功记录。不能用本报告的设计判断、旧 PASS 或 T-1072 链授权新母行为实施。

Root 本轮明确委派对实际母规范进行同 cycle 最后 round3 recheck，允许 packet/report/相邻 review 与真实工具控制面写入；禁止源码、DB、浏览器和生产操作。评审者为 homogeneous 同模型独立上下文，model 真实记为 inherited-root-model；review-mode=independent-subagent-homogeneous，不声称 cross-family。已读 Creator AGENTS/BACKLOG、PROJECT/PROJECT_CONTEXT、当前 product-to-code-orchestrator 3.29.0 的公共授权/规则与阶段路由、实际 T-915 packet、上轮完整 event.packet/previousFindings、母精确 patch/新增行和旧 S5。当前控制面 step=build 的写集确实被缩窄为本轮规范文件，不据其运行代码或必需 implementation suites。

## 实际规格与历史链核验

| 对象 | 准确事实 |
| --- | --- |
| 当前母 SPEC | SHA-256 `32dfc6b72fe0d923947d0f5df625d4f6a4f4afec2917e55c39cf9ab1ca4c56c3` |
| 上轮 T-915 末事件 | cycle1/round2 recheck，event_hash `1d0f281764a2d94f245bbaedad518a9d89ad8fc824c531ba04bf5609a747b93b` |
| 上轮 SPEC hash | `b990a38a015698105d29d2da0cada4767b3be4bd09948cc5ef147621fb98d8ce`，旧 receipt 已过期 |
| 旧 S5 | SHA-256 `a34296ee8290e59fa86c642ae7af29218fbed2df691f1c1c04a7594a7176167d`，价格可配/成本角标责任未删 |
| 当前 AGENTS.md | SHA-256 `c53bd9f14bb368cdf4d2462e36397c33d17463c5a0253cc7209cbf359c5c044a` |
| 上轮冻结 constitution | SHA-256 `ab6003112be4c5b680fba05abf8326eaf59eeafd1613b4ca44464ef3d0cff126` |

实际 reviewctl context 的 previous_packet 与提供的完整末事件逐字段一致，previousFindings 也精确一致。REV-001/REV-002 原样保 status=resolved、severity、anchors、origin/origin_ref、failure_mode、suggestion、resolution_evidence 等全部字段，不设 findings=[]，不重开已销账项。母 R-01 pause/fence/预算与 R-05 blocked/失败/配置等待/未知映射原条款仍保，新增 AC 没有移除其验收。

本轮相对冻结代码 HEAD6dd9db7a 的精确规范 patch，仅 168–199 R-03a、220–251 R-05a 与 259/260/263 AC 加法；与 t915-mother-changed-line-refs.json 的四 hunk 一致。真实 reviewctl context 相对旧 round2 还给出后续既有历史接线记录的 changed refs；这些记录明确未测试/未验收，不将它们读作新的业务 scope 或运行 PASS。若有新增 finding 必须按真实 SPEC-LINE/EVIDENCE origin 报告；本轮没有新确定性规范缺口。

## 正式母条款独立判断

| 已审范围 | 结论 |
| --- | --- |
| R-05a 新消息与原 source | 显式 SDK locator 是受核请求定位符，服务器生成 source；原子 conversation/request/source 唯一 winner，同 locator 异正文/附件/功能/scope409；新 locator 为明确新意图；旧无 trigger/regenerate 保当前恢复及旧协议限度，不新增 generation key。pending 封套/刷新/丢回执续原 source/task 形成完整恢复。 |
| R-05a 终态无候选与 unknown 费用 | 原 assistant/owner/workspace/source/task/finish 精确绑定，execution→AI→conversation 锁内核双侧 succeeded；只有原冻结 script.patch 必需候选入口无成功工具事实才放专项请求。在途/unknown/partial 零新任务/调用；预填取消零调用，用户发送前明示可能费用，原预算/历史不改，普通合法消息不被删除。 |
| R-03a 可信身份与公共安全 | root/child/fallback 各自精确 operation/inputDigest/parent/capability 宿主冻结，reserve 首写、start 重验、旧 null 不补。公开严格 allowlist：managed 仅 channel-managed，nested 实际 model/端点事实/认证/秘密不得出 DTO；BYOK显示来自原 call，混合或必要未知顶层 null。 |
| R-03a 历史/加法 wire/迁移/回退 | 请求映射表、可空 identity、可选原 assistant 引用/usage 和安全 metadata 的 old→new 已写明，旧客户端不强制。旧 completion 无 v1 保原 metadata/resultData/finish 深比较；新 v1 同事务冻结后只读原对象。迁移备份/副本/重跑/旧行不改，旧 schema 单项关闭不吞异常；兼容回退保新增事实，不 DROP 列/清非 null。 |
| R-03a 取消实际入口/费用集合 | ai.tasks.get 业务 chatTaskId 可达 requireTask owner/workspace 和原 execution 映射，拟查原 model calls 的 allowlist；get/list/find同投影、旧无 execution字段缺省，exec.* guard保。只 model 自有usage按 callId 去重，父 tool 不叠加子tokens，cache 不加两次，unknown数字 null，取消不造回答/finish/费用。 |
| AC-04/05/08 与旧 S5 | 原停止/暂停/预算/唯一scheduler/完整入口兼容仍保，新增竞态、丢回执、identity/nested脱敏、旧深比较、取消回读、加法迁移/保事实回退可验；S5价格配置及成本角标没有被 tokens/identity替代。 |

当前没有确认必须由用户接受的 breaking 业务选择；真实实施若强制旧 locator、改变原 regenerate/source/计费、放宽 exec namespace/权限、删除合法读取或回退丢新事实，仍须先记录准确差异并确认。正式规范判断不能预先为这些实现偏差放行。

## 真实工具结果与不绕过

packet 为 `t915-mother-current-review.json`，schema=spec-review-round/v2、review_kind=recheck，仅 schema/review_kind/summary/findings，不填 verdict。SHA-256 `1120c287d014785b8cd1a30997f1ae698ba51649814c8f67ea8d08514fe5c5d6`。真实执行：

```text
node orchestrator/process/reviewctl.mjs record T-915 --spec docs/superpowers/specs/2026-09-04-agent-runtime-refactor.md --constitution AGENTS.md --input docs/verification/t1072/integration/t915-mother-current-review.json --review docs/superpowers/specs/2026-09-04-agent-runtime-refactor.review.md --backlog BACKLOG.md --review-mode independent-subagent-homogeneous --model inherited-root-model
exit: 1
✗ review receipt 已过期：constitution hash 已变化
```

原因是 reviewctl 同 cycle record 的 verifyReviewReceipt 只放行 spec 变化，不放行冻结 constitution 变化；并非母条款新增 finding，也不能将其制造成可忽略的偏好。`t915-mother-reviewctl.log` 保存准确命令/exit/stdout/stderr，SHA-256 `7163a8b2ffa94e3d5c3a51712cd17fd2f18f08e01c41a87e71161eb7797b7740`。拒绝后只读复核：T-915 末事件 hash 与原相同、cycle1/round2、REV-001/002仍原 resolved，没有追加 round3 或新 verdict/receipt；相邻 review 和看板仍是原已过期旧 PASS。

未修改 AGENTS 以伪装旧 hash，不换 constitution 路径，不 new-cycle、重置轮数、借 T-1072、手工写 PASS 或更改工具。后续须由 Root 核定合法 constitution lineage 处理方案并取得真实工具接受，才能完成正式记录。本报告不自行推进新母实现。

```mermaid
flowchart LR
 A[实际母与旧 findings 独立核对] --> B[完整真实 recheck packet]
 B --> C[reviewctl record]
 C --> D[constitution hash 变化：拒绝]
 D --> E[原 cycle1 round2 链保留，未生成新裁决]
```

本轮只写 packet、真实日志、Creator 报告与 Root completion 副本。没有修改产品代码、母规范、数据库、生产或浏览器；没有执行/宣称新行为测试、价格成本、安装、真实模型或 UAT PASS，T-915/T-1072 本身未销账。
