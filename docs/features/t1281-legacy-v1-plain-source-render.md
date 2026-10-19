# T-1281 旧V1纯原片的安全渲染兼容

## 事实、范围与结果

T1274真实旧V1公共验收task `ai-task-a792de1b-6`已经通过冻结执行引擎阶段，随后在横屏质量门失败。原计划只有真实主文件，duration=2秒、320×180、24fps，无字幕、卡片、B-roll或导演方向；契约及公开保存合法。它不是历史成功样例，也不据旧纯函数放行补写历史PASS。本任务只闭合该实际输入族在旧V1公共入口的安全原片输出能力。

FR：原V1计划保持可读、可编辑、可恢复；合法纯主文件渲染优先输出同一原片，而非因缺少可选视觉/字幕拒绝整单。保留原计划与版本，不追加虚构内容，不改变资产归属、时长、音轨开关、原请求或原失败任务。

## 最小实现与边界

在 `backend/src/modules/production/production-v1-compile.ts` 提供同模块纯适配器，同时接入 `production.service.ts` 的V1渲染编译分支与 `production-preview.ts` 的V1预览入口；不改公开契约版本，不修改数据库计划，不改V2/V3消费者，不全局移除模板质量门。

仅当真实解析后的V1输入无已有clips、横屏、无非空字幕、无B-roll、所有场景无cards/special、无direction且无显式scene.mode时，从已核验主文件机械构造一个执行用clip：file=原talkingHead.file，startSec=0，endSec=原durationSec，sourceInSec=0，hasAudio=原值；使用确定性内部编译标识，不伪造资产ID。其它所有props保留；正式plan不变。若复核发现该现有clip模板路径仍无法保留这些值，则先登记具体证据调整SPEC，不以降级名义裁内容。

加 `SEMANTIC_BOUNDARY_ALLOW:` 说明只按实际结构缺省与原片时间边界适配，不判断内容意义、不做创作选择。现有完整asset/file可用性、组/项目归属、原请求幂等、任务冻结/租约/期限与取消继续先执行。

## 必须实际取得的验收

1. 公共预览与正式渲染复用同一执行副本适配，核两者主文件、片段起终点、sourceInSec、hasAudio及contain几何一致；预览不写正式版本。预览原先不执行硬质量门，但会走旧无clips构图与时长舍入，不能只修导出而保留预览差异。原已保存V1同输入的公共failed回执与本轮RED保留；不能改fixture加假字幕，也不把V2成功替代V1。
2. 服务真实渲染编译回归：纯主文件正确生成等价执行clip；正式V1及legacyExtension/历史字节保持、同request只一个任务。字幕/卡片/B-roll/special/direction/显式mode、已有clips保持既有路径；缺失/越权/坏媒体不绕过原校验。
3. 输入族至少覆盖320×180与1920×1080横屏、横/竖源素材contain、有声/无声、合法非整数时长。不能将同helper镜像断言代替公共链。
4. 新明确业务请求完成 `outputs.production.editor.render`→持久task→成果回执→下载MP4，ffprobe核实际尺寸/fps/时长/音轨，真实解码核主画面有原片而非黑底，实际原片时间范围未改变。旧原请求仍保持failed，原工程/revision不变。
5. 独立选取已有真实旧V1成功样例回归，证明有内容的原模板仍可完成；V2现有公共成功与V3既有内核保持。范围外既有失败单独登记，不扩展审美改版。
6. 相关production集成/contract/type/boundary/timeout检查；若不改timeout值仍检查公共任务期限继承未新增续期。完成后按主流程pmem sync、reconcile、taskctl留审计；不冒全局全绿。

## 审核与状态

本任务是已授权剪辑兼容验收暴露的必要修复，不新增产品方向、权限、数据归属或发布承诺；独评通过后实施。当前没有实现或验收PASS。
