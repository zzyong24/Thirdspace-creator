# T-727 完整稿件语义分界与逐字保真导入旅程契约

```frontend-journey-contract
{
  "schema": "frontend-journey-contract/v2",
  "task_id": "T-727",
  "journey": "用户在同一条消息里先向编导说明视频状态、随后提供完整逐字稿；系统仅在用户明确授权写入后由 MiniMax 识别正文边界，产出逐字保真候选，采纳后稿面与正文来源完全一致，未采纳的重复候选不改变稿面",
  "entry": "/projects/project-b200598a-780",
  "copy_guard": { "forbid_internal_ids": true },
  "required_checks": [
    { "id": "AC-VERBATIM-SEMANTIC-BOUNDARY", "test_id": "E2E-T727-01" },
    { "id": "AC-VERBATIM-EXACT-PERSISTENCE", "test_id": "E2E-T727-02" },
    { "id": "AC-VERBATIM-UNADOPTED-NO-MUTATION", "test_id": "E2E-T727-03" },
    { "id": "AC-VERBATIM-RESPONSIVE-COPY", "test_id": "E2E-T727-04" }
  ],
  "required_conditions": [
    "real-minimax-semantic-selection",
    "mixed-assistant-preamble-and-complete-manuscript",
    "explicit-user-authorization",
    "exact-hash-after-adopt-and-refresh",
    "repeated-unadopted-candidate",
    "normal-and-minimum-viewports"
  ],
  "watched_paths": [
    "backend/src/modules/ai-runtime/script-runner.test.ts",
    "frontend/src/features/copilot/chat-script-draft-card.tsx",
    "frontend/src/features/copilot/chat-script-draft-card.test.tsx",
    "frontend/src/server/script-draft-task-input.ts",
    "frontend/src/server/script-draft-task-input.test.ts"
  ],
  "viewports": [
    { "width": 1100, "height": 908 },
    { "width": 1024, "height": 720 }
  ],
  "coherence_groups": [
    {
      "id": "verbatim-source-candidate-persistence",
      "members": [
        "MiniMax 语义分界",
        "候选字符数与原文预览",
        "采纳后的稿面正文",
        "刷新后的稿面正文与版本"
      ]
    }
  ],
  "honesty": [
    "只发送或粘贴完整稿件不得被当作执行授权",
    "助手说明、拍摄状态和操作要求不得混入面向观众的稿件正文",
    "保真模式不得调用写稿模型，不得润色、纠错、补写或按项目 Brief 重写",
    "候选只能经用户采纳后追加稿面版本，未采纳候选不得改变当前正文",
    "语义选择或精确边界校验失败必须停止，不得回退到 extraBrief 摘要生成"
  ]
}
```
