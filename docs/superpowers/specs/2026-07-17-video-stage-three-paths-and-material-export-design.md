# SPEC:视频阶段「成片三路」+ 素材包统一导出(T-366)

> 制作阶段从「受控成片=唯一路径」放开为**三路之一**:① app 内受控成片(现状)② 自带成品视频上传
> ③ 导出素材包 zip 去外部剪辑(剪映等)。**改视频阶段方向,须过 spec-review gate(verdict≠FAIL)才开工。**
>
> 对齐 [docs/产品定位.md](../../产品定位.md) **P-06 不做通用 NLE,做受控成片**:本 SPEC **强化** P-06——
> CreatorOS 收敛为**编导中枢**,像素级编辑明确让给外部 NLE(自带成品/导出剪映),不越界做 NLE。

## 0. 一句话定义

制作阶段加「用 CreatorOS 制作 / 直接上传成品视频」二选一(上传成品跳过四决策/渲染直登成片);
并加「导出素材包(zip)」——把项目关联的**全部素材 + 编导说明**统一一股脑打包下载,供用户手动去
剪映二次加工。**素材包非剪映工程导入(诚实:剪映无通用工程导入格式)。**

## 1. 定位判定(宪法对照,gate 重点审)

- **P-06 不做通用 NLE,做受控成片**(docs/产品定位.md:117):「可基于脚本、粗剪、字幕、素材和编导决策
  生成成片;不提供任意轨道、复杂关键帧、调色混音等专业 NLE 能力」。
- **本 SPEC 三路都不让 CreatorOS 做 NLE**:① 受控成片(现状,确定性渲染非 NLE)② 自带成品=用户在别处
  编辑好再拿进来(CreatorOS 不编辑)③ 导出素材=把料交出去让外部 NLE 做(CreatorOS 不编辑)。**判定=合
  P-06 且强化**:移除「只有 CreatorOS 能出最终成片」的隐含约束,把 CreatorOS 定位为编导中枢、成片路开放。
- **不违反的其他原则**:P-01 确认门(上传成品/导出仍是用户主动动作)· P-03 真实数据(导出的是真实素材)·
  P-04 本地优先(zip 本地打包,不出网)。

## 2. AS-IS 现状(源码证据,不重造)

- **上传链已存在**:`production-workbench.tsx` 备料步已用两阶段上传 `createUpload→PUT→completeUpload`
  传粗剪人物视频 + SRT(stage="production" 挂用料链)。**上传成品路径直接复用这条链**。
- **制作状态机**:`production-flow.ts` `PRODUCTION_STATUS_ORDER = [drafting, recording, editing,
  rendering, ready]`;`statusStepsTo(current,target)` 相邻步进(幂等)。
- **导出机制已存在**:契约 `productions.exports.create`(production.ts:69)+ `completeExport`(:82);
  现在导的是**渲染成片**(rendering→completeExport(resultAssetId=渲染 mp4)→ready)。
- **素材聚合**:`materialLinks` 表(entityType=asset,project 维度)+ `assets.repository.listAssetUsage`;
  asset 有签名下载 URL。项目关联的粗剪/SRT/B-roll/弹药素材都经用料链可枚举。
- **四决策产物**:`video_decisions` 候选(scenes/cards/broll/subtitles + srtLines 快照),已落库可读。

## 3. 目标不变量(TO-BE)

| ID | 不变量 |
|---|---|
| VP-01 | 制作阶段提供**二选一**:「用 CreatorOS 制作」(四决策/渲染,现状)/「直接上传成品视频」 |
| VP-02 | 上传成品路径**跳过四决策/渲染**,uploaded 成品直接成为 production 成片(→ready→可发布) |
| VP-03 | 二选一**可切换/可退回**(选错不锁死;未产生渲染前可改选) |
| VP-04 | 「导出素材包 zip」把项目关联**全部素材 + 编导说明**统一打包(不挑不减);辅助功能,不阻塞主流程 |
| VP-05 | 素材包**诚实标注非剪映工程**(是原素材+说明,用户手动重建);本地打包不出网(P-04) |
| VP-06 | 三路都不引入 NLE 能力(守 P-06);上传/导出都是用户主动动作(守 P-01) |

## 4. 设计

### 4.1 G1 — 成片二选一(上传成品直登)
- **制作阶段入口**:备料/制作面加「制作方式」二选一——「用 CreatorOS 制作」(现状四决策链)/
  「直接上传成品视频」。默认现状路径(不破坏既有流)。
- **上传成品路径**:复用 `createUpload→PUT→completeUpload` 上传成品视频(mp4/mov)→ **不 dispatch 四决策、
  不渲染** → 直接 `completeExport(resultAssetId=上传成品 asset)` → 状态机跳 `ready`(statusStepsTo 步进;
  跳过 editing/rendering 的语义 SPEC 决:允许非相邻跳 or 补记中间态)。→ 成片就绪 → 发布登记复用现有链。
- **可退回**(VP-03):未 completeExport 前可切回「用 CreatorOS 制作」;已登记成片后切换语义 SPEC 决
  (建议:已 ready 后切换=覆盖 resultAsset,给二次确认门,不静默丢)。

### 4.2 G2 — 素材包统一导出 zip
- **触发**:制作阶段加「导出素材包」按钮(辅助入口,不占主流程)。
- **打包内容(统一、不挑)**:
  - 项目关联的**全部素材 asset**(经 materialLinks 枚举:粗剪人物视频 / SRT / B-roll 素材 / 弹药素材文件),
    各按签名下载 URL 取字节。
  - **口播稿全文**(output_script 当前版本)。
  - **编导说明 readme**(人话版四决策:分场 + 每场信息卡/B-roll「几秒出、放什么」+ 字幕校正稿),
    从 `video_decisions` 候选渲染成 markdown/txt(**非 JSON dump**,给人读)。
  - 一份 `manifest.txt`(清单:文件名 → 是什么 → 来源),方便用户对照。
- **打包位置**:**本地打包**(P-04 不出网)——host 侧(persistence-client)取各 asset 字节 → 组 zip →
  落一个下载 URL / 直接触发浏览器下载。复用/扩 `productionExport` 概念(它已是「产出物→asset」范式),
  或新增 `productions.exports.materials`(SPEC 决:复用 exports 表加 kind vs 新 op)。
- **诚实门(VP-05)**:导出 UI 与 readme 头明确「这是原素材 + 编导说明包,供你手动在剪映等工具重建,
  **不是可一键导入的剪映工程**」。

### 4.3 不做(边界)
- 不生成剪映/任何 NLE 的工程文件(无通用格式,承诺不了);只出原素材 + 人话说明。
- 不在 CreatorOS 内做轨道/关键帧/调色/混音(守 P-06)。
- 上传成品不跑四决策/渲染(那是「用 CreatorOS 制作」路径的事)。

## 5. 待决点(SPEC 定稿/gate 时收敛)

1. 状态机跳转:上传成品跳过 editing/rendering→ready,是「允许非相邻跳」还是「补记中间态占位」(倾向前者+注释)。
2. 导出落点:复用 `production_exports`(加 kind=materials)vs 新 `productions.exports.materials` op。
3. zip 打包实现:本地 zip 库选型(node 内置 zlib 手搓 vs 轻量 zip 依赖;倾向复用仓内已有依赖,无则最小引入)。
4. 大小/超时:B-roll 视频可能大,zip 可能几百 MB——是否给大小提示/流式打包/上限告警(诚实)。

### 5.1 review 补充拍板(2026-07-17 常规审 PASS-WITH-NOTES,三条落实进实现)

5. **[major] 上传成品与飞轮衔接**:上传成品路径**不脱钩飞轮**——盲预测/发布物料生成(publish.package)/
   发布登记/指标采集/复盘对照全部照常挂接(它们锚 outputId/publication,与成片怎么来的正交);
   T-366a 验收加一条「上传成品的项目可正常盲预测+生成发布物料+登记发布」。**基本校验**:上传成品
   收窄格式(mp4/mov)+ 可读探针(时长>0),坏文件诚实拒收不直登 ready。
6. **[minor] readme 空态诚实**:项目没跑过四决策 → zip 的编导说明 readme 明确写「本项目未跑四决策,
   无编导决策可导;以下为素材清单」,只出 manifest+素材,**不给空段冒充完整说明**(宪法 §11 空态诚实)。
7. **[minor] 已发布不可覆盖**:成片已被 publication 登记引用后,「切换制作方式/重传成品」**不覆盖**
   已登记事实(BR-03 外部发布事实不丢)——只允许新增版本或提示先解除登记,绝不静默换片。

## 6. 影响面 / 风险

- G1 动制作状态机 + 备料入口 + production 服务(上传成品→ready 分支);风险=状态机跳转语义没定清→卡态。
- G2 动 asset 字节聚合 + zip 打包 + 下载;风险=大 zip 内存/超时(缓解:流式 or 上限告警)。
- 全程守 P-06(不引 NLE)、P-01(用户主动)、P-04(本地打包不出网)。

## 7. 拆切片(gate 过后 SPEC→Task 进 BACKLOG)

- **T-366a(G1)**:制作阶段「制作方式」二选一 + 上传成品路径(复用上传链,跳四决策/渲染直登成片 ready)+ 可退回。
- **T-366b(G2)**:素材包 zip 统一导出(materialLinks 聚合全素材 + 口播稿 + 编导说明 readme + manifest,本地打包 + 下载 + 诚实门)。
- **T-366c**:真机验收(上传成品→发布走通;导出 zip 解开含全素材 + 可读编导说明;诚实标注非剪映工程),与其他批次同批重打包验。

## 8. spec-review gate

- **待过**(改视频阶段方向)。reviewer 预设 MiniMax(orchestrator prompts/spec-reviewer.md)。重点审:①是否真合 P-06
  (三路都不做 NLE)②诚实门(非剪映工程)③不破坏现状受控成片路径。verdict≠FAIL 才拆片开工。
