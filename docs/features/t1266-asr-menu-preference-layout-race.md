# T-1266 核对并修复设置偏好首载时 ASR 菜单不可达

用户已授权 T1246 完整测试中记录问题后集中修复、开发打包并独立浏览器复验。原 db4669 的第93项 Qwen 设置公共流程真实失败：1280×800下菜单打开时在屏内，偏好异步读回后上方模型说明/文本卡插入，菜单移动到视窗外，普通点击120秒失败；没有保存或连接测试完成。原 FAIL、trace 和图片保持。这是已观察的可达性问题，尚不能单凭截图认定 Radix collision 算法、focus trap 或测试准备条件是根因。

先使用 oil-ui-pro 的存量局部路径，保既有设置Dialog、分类、设计变量与ASR真实入口；不开新视觉方向。正式消费者 settings-model-region.tsx 根据 preference.ready/engine 条件渲染上方区域，ASR在偏好未就绪时已可操作；具体两次坐标及真实源 pin 见 docs/verification/t1261/db4669-incremental/original93-qwen-reachability-readonly.json。补充公共复现对照：先等待偏好已读回再普通点击Qwen；另一例受控延迟原偏好GET，先正常打开ASR菜单，再释放原合法pi/Codex偏好，记录触发器与popup实际DOMRect、容器scrollTop/scrollHeight、focus和滚动事件。只拦外部响应时序，不mock原Settings组件或业务客户端，不force click/直接赋值，不提交真实模型或秘密。

写集仅 frontend/src/features/settings/settings-model-region.tsx、multimodal-model-configuration.tsx、二者相关公共交互回归，以及本叶 docs/verification/t1266/** 中独立Playwright受控复现用例/报告；只有复现确证所属原因后才写产品。不得修改全局Select、Dialog、settings偏好服务、引擎选择/配置真值、账号组/密钥、生产业务Schema或旧原用例。窄范围独立评审后，先真实RED、集中最小修复、GREEN。若布局插入竞态被公共链证实，优先在打开本地ASR菜单期间保持其上方展示布局稳定，关闭后反映最新展示；服务端偏好和执行引擎的真值不能延迟，不禁用合法ASR编辑，不隐藏错误/删文本或改模型选择来掩盖问题。其他根因则先据证据明确必要精确范围，不能自由改全局浮层。

必须覆盖首载已就绪、晚到pi、晚到Codex、菜单关闭后偏好展示更新、已有输入不丢、键盘选择/Escape、滚动以及1280×800/390窄窗。同合法Qwen选择后 provider=qwen-asr、model=qwen3-asr-flash、baseUrl原地址和保存按钮可用的原断言保持；保存行为用隔离假密钥和原公开读回验证，不冒上游认证。真正Codex免文本/生图配置条件、独立ASR按需配置与Whisper路径保持，不新增模型配置要求。操作结果与视觉证据分别验收，真实看图不以截图成功代签。

所有当前冻结profile实际闭合后由Root应用，集中整合成干净源码、新开发包，再原170/103/7/Pi1/Doocs2完整独立复验；仅受控局部回归不签全功能。原六素材缺失获准跳过、App未授权、费用和旧债均保留。正常执行和有限观察最少120秒、保原更长预算，原task身份/期限不变，资源按持有PID/birth/UID闭合。按 taskctl/pmem/reconcile 实证收尾。

```mermaid
flowchart LR
 A[偏好异步读回] --> B[上方配置区域改变]
 B --> C[原ASR菜单被移出视窗]
 C --> D[公共复现并定位]
 D --> E[局部保持合法选择可达]
 E --> F[新包原完整流程与截图]
```
