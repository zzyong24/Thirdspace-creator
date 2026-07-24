# T-487 SPEC 独立审核记录

> 2026-07-23 后续说明：三轮审核后新增了 Tauri 官方 Windows 安装器证据，并据此把 Windows 默认候选从“独立 runtimeRoot + 自定义选盘页”简化为“优先复用标准 NSIS directory page，runtime 跟随 `$INSTDIR`；只有 RAT 证伪才增加独立 runtimeRoot”。这属于 PLAN 候选修订，不把旧审核冒充为对新候选的 PASS。按既定三轮上限，本轮不追加第四次审核；RAT-PKG-02 回填后必须以修订全文重新独立审核，再申请最终架构确认。官方证据见 `docs/research/2026-07-23-tauri-windows-packaging-official-practices.md`。

- 工件：`docs/superpowers/specs/2026-07-23-desktop-packaging-first-launch-design.md`
- 宪法：`docs/产品定位.md`
- review_mode：`cross-family`
- reviewer model：`gpt-5.6-sol`
- sandbox：`read-only`
- 审核轮次：3（达到 `spec-reviewer` STOP 上限，不再自动重审）
- 最终 verdict：`CONCERNS`
- 人的裁决：**待用户确认是否授权探索性 RAT；当前不得进入最终架构签核或实现**

## Round 1

- verdict：`FAIL`
- 结果：2 blocker + 4 major。
- 处置：6 项全部接受并修订。

| Finding | 处置 |
|---|---|
| Windows 实现目标与宪法“不宣称支持”冲突 | 接受；引入条件式 DEC-PKG-01，证据补齐期间不更新公开支持口径 |
| Wave 4 未计入 appetite | 接受；Wave 0–4 全部纳入，T-487 未关全量 AC 不得完成 |
| cache key 未含 closure，UI 与 runtime 边界不清 | 接受；拆 app-code 与 heavy layers，加入 normalized closure/dynamic registry digest |
| current/last-good 无字段级状态机 | 接受；新增 ENT-PKG-04、原子写、锁、断电恢复与故障注入 |
| 仓内事实/现成方案缺直接证据 | 接受；新增 §10 逐项 file:line/反证与官方候选表 |
| RAT blocker/non-blocker 语义矛盾 | 接受；新增统一 RAT 表与平台准入布尔表达式 |

原始 findings JSON：

```json
{
  "verdict": "FAIL",
  "summary": "方向有价值，但 Windows 发布范围、交付范围和 Runtime Image 核心契约存在阻断性矛盾，当前不可进入实现。",
  "findings": [
    {
      "severity": "blocker",
      "category": "fit-positioning",
      "where": "§4.1、FR-PKG-10、§11 Wave 3/4、§12",
      "issue": "SPEC 将 Windows x64 定为实现及正式验证目标，但宪法当前仍禁止宣称支持，且没有生效 DEC。",
      "suggestion": "先取得条件 DEC，或把 Windows 正式实现移出任务。"
    },
    {
      "severity": "blocker",
      "category": "scope-reduction",
      "where": "§3.0 Appetite、§4.1、§11 Wave 4、FR-PKG-07～09、AC-PKG-10",
      "issue": "完整范围含 CI 分层和发布门，但 appetite 只承诺 Wave 0–3。",
      "suggestion": "Wave 4 纳入同一 appetite，全部 FR/AC 关闭前任务不得完成。"
    },
    {
      "severity": "major",
      "category": "approach",
      "where": "FR-PKG-02、FR-PKG-08、AC-PKG-05、ENT-PKG-01",
      "issue": "cache key 没有实际 closure digest，UI/application code 与 runtime dependency 边界未定义。",
      "suggestion": "拆物理层并把 closure/dynamic registry 纳入 key。"
    },
    {
      "severity": "major",
      "category": "completeness",
      "where": "ENT-PKG-03、§5.3、FR-PKG-03/05/06、§9",
      "issue": "current/last-good 原子切换缺字段、并发锁、断电恢复和一次回滚契约。",
      "suggestion": "补 RuntimeRegistry/InstallLedger 与故障注入状态机。"
    },
    {
      "severity": "major",
      "category": "reinvent-wheel",
      "where": "§1、§3.2、§10 HARD-PKG-01～04",
      "issue": "仓内实现和候选方案断言缺直接 file:line/反证证据。",
      "suggestion": "新增仓内事实与现成方案证据表。"
    },
    {
      "severity": "major",
      "category": "completeness",
      "where": "§3.7、§10 HARD-PKG-04/05、§15",
      "issue": "“5 个 RAT 全过”与 non-blocker/conditional gate 定义冲突。",
      "suggestion": "统一 RAT 表并给出正式构建布尔表达式。"
    }
  ]
}
```

## Round 2

- verdict：`FAIL`
- 结果：1 blocker + 2 major。
- 处置：3 项全部接受并修订。

| Finding | 处置 |
|---|---|
| 未做 blocker RAT 就申请最终架构签核 | 接受；工件回退为“候选架构 + RAT 授权”，本轮只请求探索许可 |
| mac 更新失败语义矛盾 | 接受；统一为平台特定的升级失败恢复 |
| NFR/IA/故障状态无逐项追踪 | 接受；新增 TEST-PKG 映射、样本/口径/artifact/AC |

原始 findings JSON：

```json
{
  "verdict": "FAIL",
  "summary": "方案方向总体符合本地优先与零白屏目标，但在请求架构签核前仍把多项致命可行性假设留到实施阶段验证，且 macOS 回滚契约和非功能需求追踪存在实质缺口。",
  "findings": [
    {
      "severity": "blocker",
      "category": "value-viability",
      "where": "§3.1、§3.7、§11、§12、§16",
      "issue": "production closure、installer hook、mac 注入和 cache 都是便宜可验 blocker，却在最终方向签核后才做。",
      "suggestion": "先授权探索性 RAT；RAT 完成后再提交最终架构签核。"
    },
    {
      "severity": "major",
      "category": "completeness",
      "where": "§5.2、FR-PKG-06、§13、AC-PKG-07",
      "issue": "mac 替换后启动失败究竟自动回滚还是人工重装不一致。",
      "suggestion": "统一状态与恢复验收。"
    },
    {
      "severity": "major",
      "category": "traceability",
      "where": "§7、§8、§9、§14、§15",
      "issue": "NFR、IA、故障补偿与状态转移没有逐项测试/artifact。",
      "suggestion": "扩展矩阵到测量程序、样本、证据和 AC。"
    }
  ]
}
```

## Round 3（最终）

- verdict：`CONCERNS`
- 结果：3 major，无 blocker。
- 处置：3 项全部接受并已写回 SPEC；因达到三轮 STOP 上限，不继续用同一流程磨评审。

| Finding | 处置 |
|---|---|
| B 成功后清理 A 会删掉 lastGood | 接受；明确 A 保留到 C 成功、B 接任 lastGood；加三引用禁止删除不变量 |
| mac 替换后失败恢复依赖网络 | 接受；候选契约改为替换前缓存并验签旧 archive，独立 helper 断网恢复，RAT-PKG-03 必验 |
| Value 行把性能当价值验证 | 接受；新增 RAT-PKG-VALUE，3/3 完成安装、至少 2/3 接受取舍 |

原始 findings JSON：

```json
{
  "verdict": "CONCERNS",
  "summary": "候选架构与宪法总体一致，RAT 边界和证据门也较清楚，但 Windows last-good 生命周期存在内部矛盾，macOS 升级后启动失败的恢复依赖联网且未形成可靠契约，价值风险验证亦尚未真正闭合。",
  "findings": [
    {
      "severity": "major",
      "category": "completeness",
      "where": "§5.2 RuntimeRegistry「断电恢复」与 FR-PKG-06",
      "issue": "B 首次成功后若清理 A，会没有 lastGood。",
      "suggestion": "A 保留到 C 成功、B 接任 lastGood；禁止删除 registry 三引用目录。"
    },
    {
      "severity": "major",
      "category": "approach",
      "where": "§5.2 macOS 失败恢复表、FR-PKG-06、§13",
      "issue": "替换后新 App 启动失败时只提供在线下载入口，断网无恢复路径。",
      "suggestion": "首次健康前保留本地签名上一版并支持原子离线恢复。"
    },
    {
      "severity": "major",
      "category": "value-viability",
      "where": "§3.1 Value 行",
      "issue": "一条白屏反馈只证明痛点，不能验证用户接受安装期等待换 5 秒首启。",
      "suggestion": "增加安装完成率/首次成功率/接受阈值的用户行为 RAT。"
    }
  ]
}
```

## Gate 记录

```text
Gate: Product Gate / Spec Review
Status: concerns
Evidence:
  - docs/research/2026-07-23-desktop-packaging-skills-manager-reference.md
  - docs/superpowers/specs/2026-07-23-desktop-packaging-first-launch-design.md
  - 三轮 gpt-5.6-sol cross-family 结构化审核
Findings:
  - 最终 3 major 均已接受并修订
  - blocker RAT 尚未执行，最终架构仍不得签核
Decision:
  - 只向用户请求不收费的探索性 RAT 授权
  - 用户裁决前不实施候选架构、不触发构建
```
