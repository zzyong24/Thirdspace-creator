# T1246 设置交互族首轮预归因（只读）

基准：533224f334c43cdb81a344424e420cad93784dd1。读取 unit-first/frontend.log:406–486 的真实已结束族：80 tests /52 failed /28 passed，族 duration4850ms；52 摘要完整 case IDs 见 /tmp/t1246-settings-first-cases.json。整个 frontend 首轮仍在运行，当前没有全部52的最终 failureMessages/堆栈，因此本报告不把52项预签为同根因、不重跑、不改代码。

已确认可反驳 fixture 缺口：

- settings-interactive-region.test.tsx:30–77 的 mockClient 和 client mock 提供 patchPreferences、putModel、testModelConnection 等，**没有 getPreferences**。
- 真 hook use-assistant-engine.ts:36 effect 调真实 loadAssistantEngine；assistant-engine.ts:17 调 client.getPreferences，缺函数同步抛错，由 :26 catch 仅写“引擎设置暂未取得，请重试”，初始 state仍 engine=pi、ready=false。
- SettingsModelRegion:23–25 usesCodex=ready&&codex、showIndependentModels=ready&&!usesCodex，:34 defaultProbe.enabled=ready&&!codex，:141/:177 文本/图片卡严格 gated。不是“默认Pi值已经可用”；placeholder Pi尚无已保存服务真值，加载/错误状态必须先诚实保持未就绪。
- 原 fixture beforeEach:172 同步清 mock，没有加载/等待服务偏好。model-test-* 取 element立即 fireEvent 而此元素不存在；很多病例30–200ms失败，根本尚未到 PUT/probe 或延迟scope/取消等下游。这与缺卡而不是网络超时一致。

已获批合同：T1238 FR1/AC1 服务偏好真值，浏览器旧偏好只在服务null时迁移；UI :70 明确加载/失败/切Codex状态，Codex不得提示配文本/生图API。assistant-engine.ts 仅在后端null时以旧cache或默认Pi比较初始化PATCH，不能在GET失败时显示Pi模型卡。write保存失败保原已读值、不改 engine 或偷偷切Pi。settings-model-region.codex.test.tsx 已有 pending→Pi/Codex、加载保ASR/video、真实未登录/无图片能力、Codex probe0 与切Pi原配置案例；use-assistant-engine.test.tsx 有服务值、null初始化、保存失败、storage/focus重新读等真实hook测试。无需删除 ready 门来迁就老测试。

集中修复最小写集：**frontend/src/features/settings/settings-interactive-region.test.tsx 一文件**。

1. mockClient 和对应 client export 添加 getPreferences，给实际合同兼容的已保存 assistantExecutionEngine=pi 响应（可用 ENDPOINTS.getPreferences.response 构造完整原偏好，别把返回值仅作为 input echo）。每例 reset/恢复该响应，避免上例或Codex外部store值残留。
2. beforeEach 改为可 await，以真实同模块 loadAssistantEngine(true) 在 act 中完成服务读并核 ready=true/engine=pi，再进行该族旧Pi card/probe操作。不要 vi.mock useAssistantEngine、直接写模块state、只写localStorage或把准备默认改为Codex。
3. 若单例需要测试服务pending/错误，用该例显式真实GET deferred/error，遵循加载/错误门；普通Pi wiring案例则必须先完成已保存Pi前置。不要删除UI/请求/顺序/次数/同scope/迟到回执/取消/assert，也不要向生产添加default bypass。
4. 新GET fixture不能制造多一次 migration PATCH混进 autosave精确次数；默认用明确Pi已保存值，只有null迁移专例才PATCH。保原 patchPreferences autosave/profile等消费断言与Pi probe计费阻止，T1238 Codex独立模型配置/probe0原例不受改变。

真实失败映射的界限：29个 T1236 生命周期病例首先读取模型卡控件，多个模型PUT/预设/高亮/图片病例同样依赖 gatedPi；这是候选共同前置，尚不能宣称每个具体 failed stack都是此错误。T679 受管ASR缺路由、ASR中性Whisper说明等涉及其它条件文案，也应逐例核完整错误与原UI获批合同；不能一次机械改52个expect。前置补齐集中后才可原80完整实际跑，看暴露的真实下游；未执行下游不能以首次迅速fail当验证成功。

此外，原28PASS中“本地文本已保存不显示渠道状态”等纯缺席断言也可能在未ready时得到相同空DOM；补正确Pi前置才能恢复它的本来覆盖。这里不取消其首轮真实PASS记录，也不把它当当前Pi卡已真实消费证明。

本报告不签全执行预算合规，不改原80/52结果；没有任何官方/API/原生App执行。新59 runtime前置另由browser owner补闭包并提供新SHA复核。
