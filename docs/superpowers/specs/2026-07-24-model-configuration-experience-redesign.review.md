# T-501 模型配置体验重构 SPEC 独立评审记录

> 被审工件：`2026-07-24-model-configuration-experience-redesign.md`  
> review_mode：`cross-family`  
> reviewer：`gpt-5.6-sol`（`codex exec --output-schema`，read-only）  
> 轮次：3/3（已达 STOP 上限，不再用重复评审代替人的裁决）  
> 当前结论：`CONCERNS（findings 已处理；用户已通过 DEC-BATCH-20260725-001 裁决并确认①）`

## Round 1

```json
{
  "verdict": "FAIL",
  "summary": "范围口径、支持平台、目录权威和指标数据源需要先收紧。",
  "findings": [
    {
      "severity": "blocker",
      "category": "scope-reduction",
      "where": "目标形态与本地模型范围",
      "issue": "“官方/中转/本地三路径”会被理解为承诺本地 LLM/图片等能力，但仓内只有本地 Whisper adapter。",
      "suggestion": "明确本地范围仅为现有 Whisper；Ollama、LM Studio、本地图片/视频 adapter 另立需求。"
    },
    {
      "severity": "major",
      "category": "fit-positioning",
      "where": "Windows 验收",
      "issue": "正式 Windows 验收与产品宪法“当前不得宣称支持”冲突。",
      "suggestion": "正式验收限定 macOS；Windows 仅做非承诺开发兼容检查。"
    },
    {
      "severity": "major",
      "category": "value-viability",
      "where": "流式/tool-call 可行性",
      "issue": "致命且便宜的三协议流式/tool-call RAT 未在签核前完成。",
      "suggestion": "使用实际已安装 SDK 与 wire fixtures 完成 RAT。"
    },
    {
      "severity": "major",
      "category": "approach",
      "where": "FR-MC-04 模型目录",
      "issue": "动态列表、随包 overlay、真实测试和手填之间的权威顺序未定义。",
      "suggestion": "定义确定性合并顺序、过期与未知模型行为。"
    },
    {
      "severity": "major",
      "category": "completeness",
      "where": "Success signals",
      "issue": "指标像跨用户遥测，但数据来源、隐私与样本获取方式不明确。",
      "suggestion": "改成本机计数、用户自愿诊断导出和人工客服样本，不默认遥测。"
    }
  ]
}
```

处理：全部接受。SPEC 已明确本地仅 Whisper、正式验收仅 macOS；完成三协议 12/12 RAT；补齐
模型目录权威顺序；指标改为本机计数和自愿导出。

## Round 2

```json
{
  "verdict": "CONCERNS",
  "summary": "方向基本成立，但错误归因、领域模型、探针费用、恢复契约和仓内复用证据需补齐。",
  "findings": [
    {
      "severity": "major",
      "category": "approach",
      "where": "SC-MC-02、FR-MC-08",
      "issue": "普通 401/403 无法可靠区分 Key 无效、产品线不匹配和权限不足。",
      "suggestion": "证据不足显示“鉴权被拒绝，原因未知”，只有确定证据才精确归因。"
    },
    {
      "severity": "major",
      "category": "completeness",
      "where": "FR-MC-03/04 与 ENT-MC-01/02",
      "issue": "领域实体未承载 discovery、filter、probe、cost 和 capability provenance。",
      "suggestion": "补齐字段或拆出 profile 实体与引用关系。"
    },
    {
      "severity": "major",
      "category": "completeness",
      "where": "FR-MC-07/11",
      "issue": "“极小样本”“低成本”未量化。",
      "suggestion": "规定请求次数、token、音频、图片和费用确认上限。"
    },
    {
      "severity": "major",
      "category": "approach",
      "where": "FR-MC-11、NFR-MC-05、ENT-MC-04",
      "issue": "异步付费 run 缺幂等、重启恢复、僵尸终态和远端对账规则。",
      "suggestion": "增加幂等键、检查点、operation ID、恢复和禁止盲重放规则。"
    },
    {
      "severity": "major",
      "category": "reinvent-wheel",
      "where": "§12 流式/tool-call 探针",
      "issue": "“无实现”只搜索设置测试文件，不足以证明仓内无可复用语义。",
      "suggestion": "做 repo-wide 反查并明确复用现有 runtime/fixtures。"
    },
    {
      "severity": "major",
      "category": "reinvent-wheel",
      "where": "§12 provider product registry",
      "issue": "只检查 preset，未覆盖 adapter/search/multimodal registries。",
      "suggestion": "做 repo-wide 反查并说明扩展既有目录而非另造 adapter registry。"
    }
  ]
}
```

处理：全部接受。SPEC 增加证据置信度、Discovery/Filter/Probe/Cost profiles、固定资源上限、
付费 run 恢复协议，并记录 repo-wide 搜索命中的 chat runtime、recovering model 和三类现有
registry。

## Round 3

```json
{
  "verdict": "CONCERNS",
  "summary": "方向符合定位，但可用性 RAT、付费测试凭据恢复、重复扣费锁、文本探针序列、追踪和外币估价仍需收紧。",
  "findings": [
    {
      "severity": "major",
      "category": "value-viability",
      "where": "§4.4 Usability 与 RAT",
      "issue": "四类代表接入的低成本走查未回填，无法证明向导没有把复杂度换个位置。",
      "suggestion": "完成 Kimi、通义、MiniMax和中转站走查，记录决策次数、高级模式和阈值。"
    },
    {
      "severity": "major",
      "category": "completeness",
      "where": "FR-MC-06/11、ENT-MC-03、NFR-MC-03",
      "issue": "草稿 Key 不持久化与异步 operation 重启后仍需凭据查询矛盾。",
      "suggestion": "付费异步测试先安全保存 pending 配置/credential handle，或移到保存之后。"
    },
    {
      "severity": "major",
      "category": "approach",
      "where": "FR-MC-11",
      "issue": "新 confirmationNonce 会形成新幂等键，可能绕过未知结果锁并重复扣费。",
      "suggestion": "增加不含 nonce 的稳定 attempt-group/reconciliation key。"
    },
    {
      "severity": "major",
      "category": "completeness",
      "where": "FR-MC-04/07",
      "issue": "“一次会话”没有定义供应商请求数，无法同时验正文、流式和工具。",
      "suggestion": "明确请求序列、每步成功条件、token、费用和三协议 fixtures。"
    },
    {
      "severity": "major",
      "category": "traceability",
      "where": "§15 Acceptance criteria",
      "issue": "评审快照中 AC-MC-10～12 重复且缺 FR/NFR→AC→TEST 映射。",
      "suggestion": "唯一化 AC 并增加完整追踪表。"
    },
    {
      "severity": "minor",
      "category": "completeness",
      "where": "FAQ 4、FR-MC-07、CostPolicy",
      "issue": "人民币 0.01 元门缺外币汇率字段与过期规则。",
      "suggestion": "补汇率来源，或所有非人民币价格一律视为费用未知。"
    }
  ]
}
```

处理：全部接受。

- 新增四类代表路径纸面走查，4/4 在最多 4 个产品决策内完成且无需原始字段高级设置；
- 付费异步测试先保存 `pending-inactive` 与安全 credential handle，终态前不替换 active；
- 新增稳定 `attemptGroupKey`，新 nonce 不能绕过未对账锁；
- 文本探针固定为最多两次供应商请求，分别验证非空流式正文和合法 tool-call；
- AC 已唯一化为 AC-MC-01～16，并补 FR/NFR→AC→TEST-MC-01～21 映射；
- 只对人民币且未过期的公开单价做 0.01 元自动门判断，其他币种一律确认。

## 人的裁决

`resolved`。用户已于 2026-07-25 通过 `DEC-BATCH-20260725-001` 确认 SPEC §17 的产品
方向，允许进入 CONTRACT。该裁决只关闭 PLAN 确认①；没有替代 CONTRACT 独立评审、Gate 12、
Gate 15b 或确认②，也没有授权修改生产代码。

## 用户补充后的目录交叉审计

用户要求把常用主流模型一并兼容，并指定可参考 CC-Switch 或中转站代码。已完成：

- 检查 `farion1231/cc-switch@878c26f31e012ba32b9772bd080bd4fa9e7d495e` 的 provider
  presets、Coding Plan 分叉、模型发现和能力目录；
- 检查本地 `Thirdspace-api@511465e459041175bbaea2e987c33581cc51e752`（New API
  derivative）的 channel、endpoint type、relay mode 和协议转换边界；
- 在 SPEC 新增 `FR-MC-14`、`AC-MC-17`、`TEST-MC-22/23`，把主流支持定义为
  “provider product + region + protocol + capability”的受证据约束目录，而不是静态模型名；
- Azure/Bedrock/Vertex/本地 LLM 因当前凭据和运行 contract 不足，只能进入高级/实验性，
  避免新增假选项；具体模型 ID 采用动态发现或有日期的官方 overlay。
- T-508 真机反馈进一步证明“纯文生图可用”不等于“参考图生图可用”；`FR-MC-07` 已把
  `textToImage/referenceImage` 拆成独立付费探针，并新增 `AC-MC-18/TEST-MC-24`，禁止
  generations 绿灯冒充 edits/reference 能力。

该补充没有改变前三轮评审确认的架构方向，只把 `FR-MC-03/04/13` 原有“全量审计”的供应商
边界具体化。`DEC-BATCH-20260725-001` 明确确认的是 §17 的五项产品口径；`FR-MC-14` 只能
作为“有证据才显示”的 truthfulness 约束进入 CONTRACT，不能扩大解释为用户确认新增厂商或
adapter。CONTRACT 仍须独立评审并通过 Gate 12/15b，确认②前不进入生产代码。
