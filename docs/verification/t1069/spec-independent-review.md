# T-1069 完整初次 SPEC 独立评审

- 被评审根：`/Users/zyongzhu/.codex/worktrees/t1062-client-integration/Thirdspace-creator`
- SPEC：`docs/features/t1069-installed-media-and-binding.md`
- SPEC SHA256：`1e26068675610acbb86b212b2b4fd5c6ce7da3008d2821cdfb5e73e9f67ad41e`
- 任务包：`/Users/zyongzhu/CreatorOS-local-acceptance/t1062-20261005-wm9zxxwl/t1069-final-spec-readonly-packet.md`
- 实际产品宪法：`docs/产品定位.md`（`PRODUCT_SPEC.md` 不存在，未以该缺失路径作为审查依据）。
- Constitution SHA256：`86bc2c8add6a01ebf5b2ecf9de05d448770ca14a4e0bdbbf376fffc6387e3800`。
- 技能与项目流程版本：均为 `3.27.4`。
- 结论：静态方案可进入实施；完整 findings 为 `[]`，无阻断项、无必修项。JSON 为 `spec-review-round/v2`、`review_kind=initial`。

## 审查范围与事实

读取了 BACKLOG 的 T-1069、完整 SPEC、PROJECT、PROJECT_CONTEXT、物理架构、只读任务包、stage-router 与 reviewctl 的字段/风险/锚点校验规则；核对了账号组 UI_RULES 与项目 oil-ui-pro 的既有方向、状态、视觉与操作验收边界。未修改产品或共享控制面，也未运行 App、数据库、扫码、模型、测试或打包。

原导入链实际是 native processing → registerMediaFile → NativeEditorSurface importMedia → uploadEditorMedia → createUpload/PUT/completeUpload/createMaterialLink。原 registerMediaFile 的 60 秒等待中止没有传给实际导入；整批 processing 返回后才进入 asset manager。原 VideoReferenceWorkbench 媒体 ref 与 native storage 内存态不等于正式工程保存，ProductionEditorEntry 的原模式分支及跨阶段路由会卸载编辑器。这些源码事实支持本方案修复方向，但尚不能证明安装版的实际耗时或素材文件物理丢失。

## 四项完整方案检查

| 范围 | 静态核对与判断 |
| --- | --- |
| 视频导入 | reference-editor-media、native-editor-contract/surface 与归档中的 registration/processing/mediabunny/controller/assets view 已在写集；稳定 mediaId、原 uploadId、阶段回执、原 owner 及用户取消沿真实 signal 的修改有明确落点。create ACK 无已知恢复查询时如实标未知；PUT 未知同 key/同 bytes，complete 同 uploadId，link 原幂等，insert 失败仅重试同 mediaId。单项降级与逐项可用没有新增整单质量门。实际分段计时、旧超过 60 秒成功样例与公共桥回归均是待实施验收。 |
| 共用素材选择 | assetsOperations → ENDPOINTS/typed client → dispatch → application ASSET_OP_IDS owner map → assets.transport → AssetsService.searchAssets → searchAssetLibrary → repository SQL 是已存在可复用的链；增加操作无需另一套注册机制。AssetSearchInput 位于已列 asset-search，服务接口与实现引用该类型，允许在原 service 不改文件的情况下扩类型过滤。原 active/readableGate/字面 ILIKE/keyset 顺序与本页元数据批量读取可保留。新类型摘要与旧三字段摘要已分别声明，旧 list/material.search 兼容可测。 |
| 13 个入口与模板 | 全库与 bounded 清单分开；业务 payload 泛型原样返回，确认保持原 link/CAS/member/slot/association/mediaId/v1 file/inventory 边界。预览错误不阻断合法选择。模板照片增加 referenceFileId 从表单、记忆、收藏、node、HomeTransfer 至生成预约恢复均有精确源码落点；backend 已具 explicit referenceFileId/frozen taskInput，SPEC 仅补未提交预约当前显式 file 比较，保留旧 asset-only 兼容和已有 taskId 原任务回读。 |
| 同作品跨 Tab | 稳定项目 layout 持有完整 ProductionEditorSession，StageChatWrapper 固定结构与 reference/original 稳定 outlet 可消除现卸载来源；ProductionEditorEntry 只注册，导航 registry 只存最小 owner/selectedOutput，未形成第二项目事实或多作品草稿库。B 的 query.outputId 需经过真实 workOutputs 与 scope 校验；不同 owner 先核离开决定、原回执/备份，再 await dispose/drain/DocumentLease，不并行挂 singleton。hidden 暂停 playback/RAF/快捷键且不重读工程、不推进文档 epoch，需与 native-host playback 观察协调，相关 host/controller/preview/RAF 均在归档写集。 |
| 多平台组绑定 | 原 collection 的小红书/快手 identity/login 适配已装配，原 accounts.bind 服务默认抖音 stage；SPEC 明确以冻结 payload.platform 路由新 stage 和恢复，不允许缺 stage 回落抖音。PreparedPlan/committer 的平台、稳定身份锁与组/version/取消守卫、同事务账号/成员/collection_bindings/profile 可回滚采用都在 11 个列出源码的闭包内；平台 proof 为内部输入，不新增公开身份证明接口。永久目录保持旧平台+user+identity 哈希形状，新 staging 与正式目录同父可复用已有 adoption marker/backup/rollback；恢复由原 task checkpoint.externalAccountId 派生 target。 |

## 资源与恢复边界

host-browser-profile-lifecycle 原 schema/domain 固定抖音，SPEC 已声明增加内部可选 domain 并默认兼容；authority、组合根、两 worker source 的修改均在写集。两原 worker 的 browser close 错误被吞、快手缺 signal 的现状，已被 SPEC 的真实 signal/onStopped、retryStop、未停不得删除或确认 cancelled、cleanupPending 与旧宿主停止证明要求覆盖。旧 direct beginBind、旧账号正式目录、采集/发布合同保持可用。绑定成功后的采集失败不反转成功回执，原 onBound 语义已有兼容基础。

原 NativeEditorSurface 的生命周期 cleanup 是异步 dispose；SPEC 明确先 await 真正释放后接新 owner，并在 native source 保留唯一 DocumentLease/NativeLifetime。隐藏不应以 disabled 或 edit epoch 冒充卸载；这是已写入方案的验收约束，不能在实施时用单纯 CSS 隐藏代替。

## 可测性与交付闭包

SPEC 提供公共 typed client 搜索/真实 SQL 超 135 条与作用域 cursor、13 入口逐项旅程、模板同 asset 异 file 身份链、原生一次 load/Undo/dirty/隐藏与 owner 切换、导入各 ACK 未知阶段、绑定原组及事务/profile 恢复等可观察验收。归档原生成员、bundle、构建图、授权清单和交付校验均精确列出；控制面由 root 单写，候选先跳过自动安装，保留 T-1068 启动直连与真实用户资料。

未发现必须扩大写集才能落实已声明需求的静态闭包缺口。实际编码遇到额外消费者需要修改时，仍必须按 SPEC 约定先补具体文件与独评，不能自动使用目录通配符。

## 完整 findings 与证据限制

`findings=[]`。没有以未确认攻击者、审美偏好、全局跨项目路由拦截或永久草稿恢复增加通过条件。

本结果只确认该哈希版本的静态方案一致性与可实施落点；不等于 RED/GREEN 测试、真实 SQL、性能提速、实际视觉/任务走查、用户扫码、原生公共旅程、打包或安装版 PASS。上述证据均须在实施后按 AC 和 Gate 真实取得，fixture 与用户截图基线不能代签。

## 实际产品宪法补核（仍为同一初次评审）

完整读取 `docs/产品定位.md` 后，结论保持 `findings=[]`。该文档第 18 节明确它是产品需求权威。原报告现在记录其真实路径及内容哈希；此补核不创建新评审轮，不改变 SPEC 或产品代码，不宣称 reviewctl 已 record 或任务已准入。

- P-01/BR-01：选择器确认才改变业务字段；AI 仍产候选；绑定与素材采用均经原 backend service 和 ownership。没有前端/worker 直写数据库或绕过人工确认。
- P-02/R-ACCOUNT/R-INGEST：T1069 冻结真实 group/account/project/output，组模式 accountId=null 代表已确认的明确组工作区，绝不表示所有账号；跨组身份不自动搬迁，登录/采集 profile 与真实稳定身份一致。原宪法的抖音聚焦和旧账号模型描述，不抹去当前用户已明确授权及仓库已装配的账号组和小红书/快手登录链；本任务只连通这些现有能力，不把平台枚举本身当成交付证明。
- P-03/R-LIBRARY/第 11 节：不造缩略图、时长、连接状态、素材总数或性能数字；分页搜索保留 active 和 workspace readable gate；预览失败可局部降级，不伪造成功。
- P-04/NFR-PRIVACY：数据仍在原本地持久层；用户主动扫码使用其明确要求的现有平台登录目的地，不新增遥测、凭据读取、云托管或自动发布。
- P-05/BR-02/NFR-RELIABILITY：原 run/upload/request identity 和回执恢复先于重试；Tab 活会话修复并未声称刷新/崩溃保存全部未保存内存稿，持久长任务恢复契约也未被缩减。
- P-06/第 16 节：继续使用现有剪辑器与受控制作链，只修导入、选择、隐藏暂停及同作品状态，没有新增专业 NLE 的任意轨道/复杂关键帧/调色混音功能。
- NFR-ACCESSIBILITY/第 13 节：焦点、Esc、键盘、200% 与真实安装/公共调用证据仍是待完成 Gate；静态通过、fixture、旧截图及本次补核均不代签发布门。

因而没有新增已确认范围内的产品矛盾，也未以旧发布阻断账替代本任务实际 Gate。
