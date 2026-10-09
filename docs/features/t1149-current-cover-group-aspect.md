# T1149 当前主分支封面用途与图片页组画幅整合SPEC

T1124当前独立来源核查确认此闭包仍缺失。本任务只把来源已确认功能语义移植到当前main，正式SPEC独立PASS前不写产品。用户已授权把来源代码整合到主分支并继续验收。原来源 454e9241 只作 provenance；当前控制基点 2af9cab4c4cff2677f470ee096e4f2a2e98fca40（产品字节仍为efe9f1ce），读写归属、保存版本与生成所有者不变。

大白话：比例旁边告诉用户它通常用在哪里。同一套图文的任一图片页改比例时，整组图片一起保持一致；选择由用户决定，模型真实能力限制可用项。

```mermaid
flowchart LR
 A[用户选择图片页画幅] --> B[核同组各生成模式真实能力]
 B --> C[同步页组与组内图片生成节点]
 C --> D[原版本保存并正式回读]
```

## 当前基线与范围

复用现有 CanvasEditor、CanvasTemplateLibrary、AssetPicker、Dialog 与 tokens，沿用紫色工作台。oil-ui-pro 0.10.0 已加载，账号组 UI_RULES、existing-project/layout-and-viewport 适用；不改全局导航、侧栏、密度与布局，只精修画幅控件文案及一致性。

服务当前只允许 visualGroups.pageOrder 包含 image/image_generation；视频不加入图片页组。组外图片和视频仍用现有独立模式能力检查，image_to_video 画幅由首帧决定，不能声称视频页组支持。

精确产品写集：frontend/src/features/creative-canvas/cover-aspect-ratio-labels.ts（新增纯展示 helper）、canvas-editor.tsx、canvas-template-library.tsx。测试写集：同目录 canvas-editor.test.tsx、canvas-template-library.test.tsx（如现有文件确需追加标签断言）及任务自有 frontend/tests/e2e/t1149-cover-aspect-group.spec.ts 与 docs/verification/t1149/run-aspect-journey.mjs。控制写集为独立 SPEC/review/PAGE_SPEC、docs/verification/t1149/**、BACKLOG/PROJECT、orchestrator/process/modules.config.json、orchestrator/process/reconcile.config.json 中一个新增 frontend_verify_commands 别名与真实流程事件。不得覆写来源控制文件或删既有 Gate。

## 精确行为

- 各比例值仍使用 contract visualAspectRatios；用途只为可读的常用创作标签，不是平台校验器，不自动选平台/模板/内容。21:9 明确为公众号头图底稿、发布前裁切，不写它等于发布精确比例。无法获得官方当前规格证明的标签不标“官方要求”或强制标准。
- 对组内选中图片生成页选择非空画幅，仅更新该 group.aspectRatio 与其 pageOrder 中全部 image_generation.aspectRatio。静态图片裁切仍走原页组机制，不改资产、file、sourceRect 或生成结果。组外 nodes/groups、模式、prompt、reference、attempts、edges、viewport、标题与项目逐项保持。
- 已知组内任一生成模式 aspectRatios 不含选值，控件禁用且程序化更新同样拒绝；真实支持列表取交集。缺少比例表不假造“不支持”；后端原能力与保存校验仍有效。不得因为某一可选比例不可用阻断全部保存/生成合法任务。
- 图片页组已有明确 aspectRatio，组内 Inspector 不提供“模型默认”空值；未显式 node.aspectRatio 的旧页显示组当前比值作为说明，不自动改写旧数据。程序化空值动作在组内保持原文档并给出“这组图片使用统一画幅，请选择具体比例”的操作提示；组外默认保持原合法行为。不同组相同比例无需联动。
- 组内 mode 切换在同一次 updateNode 中以目标新模式和其它成员原模式核对当前 group.aspectRatio；真实已知能力冲突时不改模式/参考/页组，提示先选择共同支持的画幅。Canvas节点卡与 Inspector 两个入口均已实核汇入同一 updateNode（onPatch），无需另改 InfiniteCanvasNode；必须分别通过交互验证，不能只测试一个入口。
- 能力晚到后不重写或阻断读取/保存原文档、其它合法修改。组的新生成在原 generateGroup 唯一路径只跳过当前待提交页中模式明确不支持有效画幅的页，提示其未提交及修改入口；继续提交其它合法或未知能力的页，不能由单页阻断整组。已完成、在途及历史未知提交/失败恢复边界先按原逻辑处理，不因当前能力重解释旧任务或重发在途页；若全无可提交页则真实提示，不创建幽灵attempt。未知能力不等于明确不支持，仍走原公开校验/错误恢复。旧节点没有显式比例不新增全局保存拒绝；当前T1141已经落实图片新请求有效比例node ?? group；已有可信旧预约及旧null任务语义不变。这里只补用户显式统一选择/组能力校验和用途展示，不能再改后端或把旧null自动解释为明确比例。保T1141原25service/27component/public root组合回归；原采纳72PASS/3既有PGskip如实保留。
- 保留当前 T1108/T1117/T1122 修复：save 成功回执后才 rememberReferences；legacy 必须显式采用；中文失败反馈、dirty、exact file 与 showIdentity=false 全流程；过期/切组回执不可写回。修改比例不调用模型、不创建 task/attempt、不自动采用。

## 当前验证

当前任务/精确模块登记后正式独评；来源字节只作provenance，不移植旧私有候选或旧fixture：将现有 getCanvasGenerationCapabilities 固定默认改为 f.capabilities spy，每例 reset 后保持原默认返回，原全部测试/断言保留。

在产品未改的当前 main 上先追加有意义的同组一致性、能力交集和正式读回 RED；不能将 import 缺失或 fixture 错误算行为 RED。GREEN 保留原工作台、素材选择、引用记忆、保存失败、跨组、视觉页组和模板全部相关验证；type 串行于 Next dev；LED047、boundary、semantic、orphan、timeout 原公共链及完整 reconcile 如实记录。

任务自有 Playwright 使用现有 fresh 隔离 PGlite/auth、Chrome、无外网和真实 public dispatch。新建中性组/项目/画布，正式 save/get 并重复/reload/返回进入；模型能力列表可声明合成双模式 fixture（不是模型验证），领域保存与回读不可替换。检查相同比例支持/不支持两族、组外文件/描述/attempt 逐项不变、原 revision、保存失败原输入保留。真实模型生成/视频/平台发布均不触发、不签 PASS。

1366/900 同状态前后截图、实际看图、控件中文可读；390 为现有桌面极限布局观察，等效窄视口不得冒称真机缩放。报告绑定当前 source/contract SHA、commit、0retry、真实状态与 runner 别名；不能继承来源旧 Ego/截图/isolated ID。局部低风险由根按 oil-ui-pro 自检，产品行为按独立实施复核。pmem、canonical、taskctl 真实事件后才关闭；既有全局债务另列，不标全绿。

范围审查历史：初稿结论 NEEDS_REVISION_BEFORE_FORMAL_SPEC，原报告与原SHA保留；本轮已收口组内空值、两模式入口、能力晚到及同组新生成保护。原草稿与补充审核记录保留，不继承为本SPEC的正式PASS；本SPEC仍待独立初审。

## 当前已整合字节与待审核边界

T1140/T1145已修复参考与图库布局，当前资产选择器全流程仍showIdentity=false和exact file；不得移植来源旧picker/名称展示或回退当前fixed低高drawer。T1141当前failed单页恢复比较有效组画幅，旧null明确引导节点再创作；generateGroup的recreate显式分支已先于恢复比较，必须保留。来源标签中未验证的公众号2.35:1官方精确规则不直接写回产品；21:9只做宽屏底稿/发布前裁切说明，不改平台发布校验。当前完整canonical已结束1093.915秒exit1/42ERROR；原39保留，新增三个旧UI receipt漂移由T1148维护最终补验。T1140已当前正式taskctl完成，本任务更改其watched CanvasEditor时必须通过同一正式失效与最终重验路径，不声称旧PASS仍签新字节。

## 可执行验收合同

- AC-ASPECT：从图片页Inspector选择一个共同支持比例，组与所有image_generation成员一致；静态图片/组外节点、prompt/reference/exact file/edges/attempts全部逐项不变；save/get仅原revision一次递增，reload/返回一致。
- AC-CAPABILITY：比例真实支持交集；已知不支持项禁用且程序化拒绝不改文档，组内空值拒绝，组外默认不变；未知/晚到能力不重写或阻断原保存。节点卡与Inspector两个模式入口分别覆盖拒绝与合法切换；原参考不因被拒动作清除。
- AC-AVAILABILITY：同组混合已知不支持/支持两页时仅跳过不支持新页，合法页仍按原公开调用进入；其它组原生成可用，已完成/在途原任务保持，旧null和相同有效画幅失败恢复原边界保留。仅端口/能力合成观测，不实际模型调用，不自动采用。
- AC-COPY：模板与Inspector显示常用用途，宽屏底稿裁切提示可读；保旧可访问比例名/交互身份，未验证规格不冒作官方要求。1366×900与900×900保实际同状态前后图，并独立实施审核。

taskctl通过新PAGE_SPEC真实执行本任务Chrome；不继承来源报告、不是安装/模型/平台验收。后续剩余源码若改此任务watched路径，同样正式失效与最终重验。当前没有产品变更。
