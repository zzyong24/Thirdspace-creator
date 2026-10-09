# T1140 素材浏览与公开选用验收合同

沿用已审SPEC，签field六视口完整媒体、单滚动责任、取消不写、精确选用/保存回读、刷新/返回和一次明确读取失败后真实重试。gallery自然占位修复由独立已审T1145承担，AC-SHARED同时验证原共享消费者预览/关闭和不写。512×340为实际最小窗口200%等效CSS压力样本，不冒充原生zoom；390为极窄兼容。真实Chrome/fresh私有库、正式上传内置生成示意图片；不调用模型、平台登录或真实用户库，不代签原生App。

```frontend-journey-contract
{"schema":"frontend-journey-contract/v2","task_id":"T-1140","copy_guard":{"forbid_internal_ids":true},"watched_paths":["frontend/src/components/media/asset-picker.tsx","frontend/src/components/media/asset-media-preview.tsx","frontend/src/components/media/use-asset-picker-source.ts","frontend/src/features/creative-canvas/canvas-asset-picker.tsx","frontend/src/features/creative-canvas/canvas-editor.tsx","frontend/tests/e2e/t1140-picker-low-height.spec.ts","docs/verification/t1140/run-picker-journey.mjs"],"required_checks":[{"id":"AC-LAYOUT","test_id":"TEST-T1140-LAYOUT"},{"id":"AC-CANCEL","test_id":"TEST-T1140-LAYOUT"},{"id":"AC-EXACT","test_id":"TEST-T1140-PUBLIC"},{"id":"AC-SHARED","test_id":"TEST-T1140-PUBLIC"},{"id":"AC-STATES","test_id":"TEST-T1140-PUBLIC"}],"required_conditions":["refresh","repeat","back"],"viewports":[{"width":1366,"height":900},{"width":1024,"height":680},{"width":683,"height":450},{"width":390,"height":900},{"width":390,"height":450},{"width":512,"height":340}],"coherence_groups":[]}
```
