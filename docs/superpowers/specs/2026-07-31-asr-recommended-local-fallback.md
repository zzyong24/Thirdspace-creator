# T-641 ASR 建议配置与本地 Whisper 回退 SPEC

日期：2026-07-31  
状态：用户已确认，可进入 BUILD  
上游：T-639 历史逐字稿渐进回填与小米 MiMo ASR。

## 1. 用户确认

云端 ASR 应继续放在设置页重点模型配置区，但它是建议配置，不是使用门槛。配置云端 ASR
可以避免本地转录等待过长；完全未配置时，后台渐进回填和手动提取逐字稿仍自动使用随包的
本地 Whisper。

## 2. 产品与执行规则

1. 有效的用户云端 ASR 配置优先；完全未配置时返回 `whisper-local`。
2. 后台每轮最多 5 条的渐进回填不再检查“云端 ASR 是否配置”，照常创建小批任务。
3. 本地回退不是“云端连接成功”；设置页测试连接显示中性说明，不显示绿色云端连通。
4. 设置页将文本模型和 ASR 一起放在“重点配置”区。ASR 标记为“建议配置”，并展示：
   “建议配置 ASR 转录模型，避免本地转录时间过长。未配置时仍可使用本地 Whisper，但处理较慢。”
5. 显式云端调用失败仍诚实报错，不允许在调用失败后静默切本地掩盖错误。
6. 不新增表、公开 operation、调度器或数据写入路径。

## 3. frontend-journey-contract/v2

```frontend-journey-contract
{
  "schema": "frontend-journey-contract/v2",
  "task_id": "T-641",
  "journey": "建议配置云端 ASR，未配置时继续本地转录",
  "entry": "设置 → 模型配置 → 语音转文字（建议配置）",
  "watched_paths": [
    "frontend/src/features/settings/settings-interactive-region.tsx",
    "frontend/src/features/settings/model-configuration-manual.tsx",
    "frontend/tests/e2e/asr-configuration.spec.ts"
  ],
  "required_checks": [
    {"id": "AC-ASR-PRESET", "test_id": "E2E-ASR-CONFIG-01"},
    {"id": "AC-ASR-RECOMMENDED", "test_id": "E2E-ASR-CONFIG-01"},
    {"id": "AC-ASR-ADVANCED", "test_id": "E2E-ASR-CONFIG-01"},
    {"id": "AC-ASR-NARROW", "test_id": "E2E-ASR-CONFIG-01"}
  ],
  "required_conditions": ["unconfigured", "preset", "narrow"],
  "viewports": [
    {"width": 1536, "height": 1024},
    {"width": 1024, "height": 768}
  ],
  "coherence_groups": [],
  "copy_guard": {"forbid_internal_ids": true},
  "states": [
    {"id": "unconfigured", "visible": "建议配置 ASR 转录模型，避免本地转录时间过长；未配置时仍使用本地 Whisper"},
    {"id": "preset", "visible": "选择小米 MiMo 后自动带出 mimo-v2.5-asr，只需粘贴 Key"},
    {"id": "configured", "visible": "保存并测试后显示已配置"},
    {"id": "backfilling", "visible": "历史逐字稿由后台小批量逐步补齐，不阻塞作品导入"}
  ],
  "actions": [
    {"from": "unconfigured", "action": "可直接继续本地转录，或选择小米 MiMo", "to": "preset"},
    {"from": "preset", "action": "填写 Key、保存并测试", "to": "configured"},
    {"from": "configured", "action": "运行统一作品采集", "to": "backfilling"}
  ],
  "honesty": [
    "未配置不伪装成云端已配置，但本地 Whisper 仍可用",
    "一个后台任务最多包含 5 条作品",
    "云端调用失败不静默切本地",
    "不以文件大小限制替代长音频分段"
  ]
}
```

## 4. 验收

- 未配置云端 ASR 时，解析得到 `whisper-local`，后台仍按每轮最多 5 条排队。
- 有效云端配置仍优先使用；本地回退级别非法时归一为 `small`。
- 设置页重点配置区、配置手册和 ASR 卡展示一致的自然语言说明。
- 测试连接对本地 Whisper 显示中性可用状态，不伪装云端连通。
- 聚焦测试、三包 typecheck、目标 lint、双视口 E2E、boundary 与 `git diff --check` 通过。
