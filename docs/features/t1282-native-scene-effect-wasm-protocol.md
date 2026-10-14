# T-1282 原生场景效果WASM描述符兼容

## 当场事实

T1274 `output-94c2affe-201` revision5 的deleteB候选已经保留blur/effects/animation与独立audio；预览实际失败`Invalid frame descriptor: Error: missing field effect_pass_groups`，同页thumbnail也失败。原文档未变，未apply/重发。原证据`public-families/PREVIEW_FAILURE_SUMMARY.json`及其trace必须保留。

当前生产内嵌WASM与独立实际探针同为opencut-wasm0.2.10且SHA逐字节相同。WASM的layer变体接受camelCase；sceneEffect变体只接受snake_case字段。真实GPU红蓝纹理实证：原scene驼峰报原错、只改字段名后blur像素与同参数layer blur完全相等，且不同于无效果。详见`native-effect-protocol/RESULT.md`。

## 用户结果与范围

用户原有合法场景效果在预览、缩略图、导出继续实际生效，不因TS/WASM字段命名差异中断输出。不删除、跳过、降强度或替换任何效果，不改音轨/动画/轨道/工程格式，不升级WASM或重设计renderer。

唯一生产实现边界：原生源码 `apps/web/src/services/renderer/compositor/wasm-compositor.ts` 调用真实renderFrame前的sceneEffect适配。仅转换该变体的字段名，将原effectPassGroups完整送为effect_pass_groups；layer与其它描述符保持既有协议。内部模型继续使用原字段；映射创建临时副本，不修改frame/工程。无sceneEffect路径保持原传参，避免无关性能变化。

声明 `SEMANTIC_BOUNDARY_ALLOW:`：仅对已知协议变体作字段命名适配，不识别素材内容、不选择效果、不改变顺序或参数。仍由原frame-descriptor与真实WASM负责效果内容；不加入静默catch或删除未知效果的容错。

## 验收与交付

1. 保留原公开失败和本次真实WASM RED。先在原真实WasmCompositor入口加能够捕获sceneEffect字段不匹配的回归，而不是只测试独立对象helper。
2. 真实GPU测试覆盖无效果、layer效果、sceneEffect空/单组/多组、layer与scene混排；比较同参数预期像素。确认顺序、参数及输入对象未变，不能仅以不抛异常通过。原layer masks/opacity/blend与动画时刻保持。
3. 同一丰富轨原工程副本经完整公开候选链完成deleteB、clone与fresh三族真实preview→MP4解码；blur/场景effect/动画/独立音轨仍存在并输出实际效果。原工程revision5完整文档与非目标轨未被preview修改。由主会话协调共享3919窗口，禁止子代理修改原output或用删effects的fixture代替。
4. 缩略图和原导出使用同桥：真实触发且检查没有协议异常；导出媒体/采纳/同业务幂等由已有公开链验证。不把16×16ABI探针当作完整MP4/公共采纳通过。
5. 原native类型、生命周期/preview/resource/controller回归；源码标准patch F0复原、归档重建、双生产目录七产物一致与SHA清单。只更新该源、所需真实回归及归档元数据；不只改bundle。若新增测试源文件，报告真实源文件数，不强留旧715数字。
6. 协议以当前冻结0.2.10为准，包版本/二进制SHA保持；不依赖npm最新行为。跟随父T1274的最终type/boundary/timeout/全局收尾，不代签未发生的真实设备/安装/历史RED。

## 状态

本任务已登记待独立审核，尚无审核收据或生产实现。当前子任务只有源码读取、原trace读取、隔离真实浏览器ABI探针与文档；没有调用公开写接口或改任务/fixture。
