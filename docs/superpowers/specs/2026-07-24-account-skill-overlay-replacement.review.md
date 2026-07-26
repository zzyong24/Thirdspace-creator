# T-513 Replacement 独立评审记录

> SPEC：`2026-07-24-account-skill-overlay-replacement.md`  
> 评审模式：cross-family  
> 评审模型：`gpt-5.6-sol`  
> 日期：2026-07-24

## Round 1

- **Verdict：CONCERNS**
- **摘要**：账号增量 + immutable snapshot 方向成立，但仓内证据、工具授权、首写 CAS、
  基座升级、旧任务恢复和幂等顺序未达到 CONTRACT 准入。

### 原始 findings

```json
{
  "verdict": "CONCERNS",
  "summary": "方向符合账号隔离、人工确认和可恢复原则，但仓内事实、工具授权、CAS 首写、基座升级及任务重试语义尚不足以安全进入 CONTRACT。",
  "findings": [
    {"severity":"major","category":"reinvent-wheel","where":"§1、§8、§10","issue":"缺少 OSS/仓内事实及完整消费入口证据，入口盘点被推迟到 BUILD。","suggestion":"补方案取舍、file:line 事实和 PLAN 入口矩阵。"},
    {"severity":"major","category":"approach","where":"ENT-SKO-02/04、FLOW-SKO-03、FR-SKO-04","issue":"tools 覆盖可能成为权限升级旁路。","suggestion":"只允许缩减官方工具，并与场景/账号/人工授权求交。"},
    {"severity":"major","category":"completeness","where":"FLOW-SKO-01/02、ENT-SKO-02、FR-SKO-03","issue":"首次不存在行的 CAS 协议未定义。","suggestion":"expectedRevision=null create-only；统一冲突与事务语义。"},
    {"severity":"major","category":"completeness","where":"PR-FAQ、ENT-SKO-01/02/03、FLOW-SKO-04","issue":"基座升级后历史增量的回滚语义和不兼容处理未定义。","suggestion":"记录 baseVersion，选定单一回滚语义并定义 incompatible。"},
    {"severity":"major","category":"approach","where":"FLOW-SKO-05","issue":"缺 snapshot 的 running 任务盲目重试可能重复付费。","suggestion":"区分安全重试与副作用未知的人工 reconcile。"},
    {"severity":"major","category":"approach","where":"ENT-SKO-04、FR-SKO-05","issue":"resolvedAt 若进入 inputData 默认 hash 会破坏幂等。","suggestion":"幂等键排除 snapshot 易变值，定义并发创建顺序。"},
    {"severity":"major","category":"value-viability","where":"五大风险、HARD","issue":"PGlite CAS 与入口盘点是便宜且致命的未检假设。","suggestion":"PLAN 内完成真 PGlite/ALS RAT 和入口清单。"}
  ]
}
```

### 处理

| Finding | 裁决 | 处理 |
|---|---|---|
| OSS/仓内事实/入口矩阵 | 接受 | 新增 §9，含官方资料、file:line、CodeGraph/rg 清单。 |
| tools 权限升级 | 接受 | tools 只能是 official tools 子集，运行时继续与 policy/账号/人工授权求交，补负测。 |
| 首写 CAS | 接受 | `expectedRevision:null` 固定 create-only；唯一冲突、零行更新统一 409；当前+历史同事务。 |
| 基座升级/回滚 | 接受 | history 记录 observed baseVersion；历史增量只在当前验签基座重放，不兼容 fail-closed。 |
| 旧 running 任务 | 接受 | queued 可安全重试；running 副作用未知需人工核对，禁止自动重放。 |
| snapshot/幂等 | 接受 | 稳定业务输入先竞争幂等任务，snapshot/resolvedAt 不进入 key。 |
| PLAN RAT | 接受 | Node 25 + PGlite 0.2.17 真库 CAS/事务 PASS；ALS 100/100 PASS。 |

Round 1 不作为开工凭据；修订后进入 Round 2 独立复审。

## Round 2

- **Verdict：CONCERNS**
- **摘要**：迁移 blocker 已消失，仍需补齐 `contextRequirements/completionPolicy` 承载、
  可执行幂等竞争原语，并消除旧表“降级”歧义。

### 原始 findings

```json
{
  "verdict": "CONCERNS",
  "findings": [
    {"severity":"major","category":"completeness","where":"ENT-SKO-01/04","issue":"snapshot 遗漏现有 contextRequirements，声明式上下文会丢失。","suggestion":"作为 official-only 字段完整进入 snapshot。"},
    {"severity":"major","category":"completeness","where":"ENT-SKO-01/02/04","issue":"completionPolicy 不在 official base，清除增量后无默认语义。","suggestion":"补可版本化结构、合并与 null 语义。"},
    {"severity":"major","category":"approach","where":"ENT-SKO-04 幂等顺序","issue":"先胜出后解析 snapshot 没有现成选举原语。","suggestion":"竞争者先纯读解析，再 INSERT DO NOTHING；败者回读胜者，或新增 claim。"},
    {"severity":"major","category":"completeness","where":"非目标、FR-SKO-08","issue":"旧表“作降级”与“运行时不读取”冲突。","suggestion":"限定只供离线人工取证，自动链路永不读。"}
  ]
}
```

### 处理

| Finding | 裁决 | 处理 |
|---|---|---|
| contextRequirements | 接受 | 补入 OfficialSkillBase 和 snapshot，账号不可覆盖；入口矩阵补真实消费点。 |
| completionPolicy | 接受 | 定义 `CompletionPolicyV1` 载体、base 默认、overlay 整体替换与 null 回基座语义。 |
| 幂等胜者 | 接受 | 采用“竞争者纯读解析 → INSERT DO NOTHING → 败者回读胜者”；PGlite RAT PASS。 |
| 旧表降级歧义 | 接受 | 删除“降级”，固定仅离线人工取证，自动 fallback/恢复/执行永不读取。 |

Round 2 不作为开工凭据；修订后进入 Round 3 独立复审。

## Round 3（本工件终轮）

- **Verdict：CONCERNS**
- **摘要**：0 blocker；剩余 5 个 major 均为契约可执行性细化，不改变 DEC-SKI-002 的产品方向。

### 原始 findings

```json
{
  "verdict": "CONCERNS",
  "findings": [
    {"severity":"major","category":"approach","where":"EffectiveSkillSnapshot 幂等创建","issue":"稳定 key 命中终态后无法区分网络重试与用户新 attempt。","suggestion":"显式 attempt key，并定义所有任务状态的命中行为。"},
    {"severity":"major","category":"approach","where":"FLOW-SKO-03、system overlay","issue":"账号完整 system 可能覆盖平台安全/确认策略。","suggestion":"固定 immutable platform policy → method overlay → untrusted context 层级。"},
    {"severity":"major","category":"completeness","where":"skills[] 闭包","issue":"多节点/Chat 未定义创建前 required Skill 闭包。","suggestion":"taskType/runner 到 requiredSkillIds 的确定性映射。"},
    {"severity":"major","category":"completeness","where":"基座升级兼容","issue":"旧 overlay 在基座升级后的读取、失败和修复闭环未定义。","suggestion":"解析时重验，返回兼容状态，付费调用前失败。"},
    {"severity":"major","category":"completeness","where":"FAQ、snapshot、NFR","issue":"“不复制官方 Skill”与任务保存完整 snapshot 矛盾，且无大小边界。","suggestion":"区分配置增量与执行账完整快照，并设大小/保留规则。"}
  ]
}
```

### 处理与终局裁决

| Finding | 裁决 | 处理 |
|---|---|---|
| attempt 幂等 | 接受 | 每次用户动作生成 attemptId；同 attempt 任意状态复用，新重试生成新 attempt 并可关联 retryOf。 |
| platform policy | 接受 | 账号 system 降为 method slot；平台确认/权限/安全策略不可覆盖并随 snapshot 固定。 |
| Skill 闭包 | 接受 | 增加 `requiredSkillIdsForTask` 单一注册映射；子任务独立 snapshot。 |
| 基座升级 | 接受 | 每次解析重验；响应兼容状态；不兼容在模型调用前失败并保留 overlay/history。 |
| 快照存储 | 接受 | 配置表只存增量；执行账存完整闭包快照；256 KiB 上限且与 task 同生命周期。 |

依据 STOP 规则不发起第 4 轮“刷 PASS”。终态记录为：

```text
Gate: independent SPEC review
Status: CONCERNS（已处理，0 blocker）
Decision: continue to CONTRACT
Rationale: 全部 finding 已落实为更严格且与产品宪法同向的安全/恢复默认，不新增产品方向、
           IA、数据归属或收费行为；用户已明确确认增量覆盖方向并授权设计与编码。
```
