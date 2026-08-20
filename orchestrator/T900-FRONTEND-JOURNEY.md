# T-900 前端旅程契约

大白话：模型只要已经给出一份可用的“我的改写初稿”，即使观众痛点、核心冲突、内容形式等辅助字段
没填全，用户也能把它保存为选题或直接升级项目。系统只用真实来源标题补项目名，不编造缺失字段。

```mermaid
flowchart LR
  A["改写初稿已生成\n辅助字段不全"] --> B["转为选题 / 一键升级项目可用"]
  B --> C["正式确认候选"]
  C --> D["来源标题补项目名\n空字段保持为空"]
  D --> E["项目读回改写初稿"]
```

```frontend-journey-contract
{
  "schema": "frontend-journey-contract/v2",
  "task_id": "T-900",
  "journey": "内容雷达仅有改写初稿和局部选题字段时仍可保存选题并一键升级项目",
  "entry": "内容雷达 → 已生成改写初稿但辅助字段不完整的作品详情",
  "watched_paths": [
    "contract/src/operations/intelligence.ts",
    "backend/src/modules/intelligence/intelligence.service.ts",
    "backend/src/modules/intelligence/intelligence.contract.test.ts",
    "backend/src/modules/intelligence/topic-preview-runner.test.ts",
    "frontend/src/features/intelligence/intelligence-workbench.tsx",
    "frontend/src/features/intelligence/intelligence-workbench.test.tsx",
    "frontend/src/server/persistence-client.ts",
    "frontend/tests/e2e/content-radar-one-click-project.spec.ts"
  ],
  "required_checks": [
    {"id": "AC-RADAR-PARTIAL-ACTION", "test_id": "E2E-RADAR-PARTIAL-01"},
    {"id": "AC-RADAR-PARTIAL-SOURCE-TITLE", "test_id": "E2E-RADAR-PARTIAL-01"},
    {"id": "AC-RADAR-PARTIAL-READBACK", "test_id": "E2E-RADAR-PARTIAL-01"}
  ],
  "required_conditions": [
    "partial-topic-candidate-with-draft",
    "regular-window",
    "minimum-window",
    "promotion-replay"
  ],
  "viewports": [
    {"width": 1536, "height": 1024},
    {"width": 1024, "height": 720}
  ],
  "coherence_groups": [],
  "copy_guard": {"forbid_internal_ids": true},
  "states": [
    {"id": "partial-candidate-ready", "visible": "确认写入选题池 · 一键升级项目"},
    {"id": "promoting", "visible": "正在升级…"},
    {"id": "project-ready", "visible": "进入使用真实来源标题和改写初稿的项目"}
  ],
  "actions": [
    {"from": "partial-candidate-ready", "action": "确认写入选题池", "to": "partial-candidate-ready"},
    {"from": "partial-candidate-ready", "action": "点击一键升级项目", "to": "promoting"},
    {"from": "promoting", "action": "正式确认并立项", "to": "project-ready"}
  ],
  "honesty": [
    "非空改写初稿是最小创作门槛，辅助字段不再反杀主动作",
    "缺失辅助字段保持真实空值，不写占位内容",
    "候选标题为空只允许使用当前真实来源作品标题",
    "账号归属、来源、逐字稿哈希、初稿版本和幂等校验继续严格执行"
  ]
}
```
