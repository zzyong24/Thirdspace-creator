# T-1037 建立作品级制作工程、版本与公共编辑服务

状态：已按用户要求加入队列；实施前补齐本任务合同/范围并独立评审。2026-10-01。

## 任务来源和依赖

依赖 T-1036；按具体 video output 绑定脚本、制作素材、方案、任务与成片，统一 revision/CAS/历史/回执及旧方案兼容，先定稿合同并独立评审。

整体需求：[T-1035](t1035-video-production-workbench.md)，本子任务不得替代或缩减父任务的完整用户结果。

## 范围

承接 FR-1035-1/3/5/7。为具体 video output 定义制作方案唯一真值、稳定 item 身份、保存/查询/版本恢复、局部修改 CAS 与请求 receipt、渲染冻结版本及成片关联。后端执行业务归属与权限，项目公共素材保持可选共享；非视频 output 不进入制作。

先形成接口与存储/兼容策略，再独立评审后实现。修复旧页面和旧 video-edit-candidate 取第一条作品的问题；清理旧 decisions 与新 renderProps 同时可写的歧义。旧合法项目路径保留，明确多作品选择；未完整可用不迁移用户数据。

## 验收

同项目两条视频、图文、文章不串；双账号拒绝越权；保存→公共读回→刷新、并发 CAS、回执丢失、版本恢复、旧方案兼容有真实证据；单独保存不创建渲染。对应 AC-1035-1/3/5/7。

## 2026-10-01 定稿合同（待独立评审）

用户已认可执行；ChatCut MCP 与浏览器实测见 `docs/research/t1035-video-production-reference.md`。以下约束承接父 SPEC，评审通过前不改本任务生产代码。

### 唯一真值与兼容

当前方案仍是 `production.recordingConfig.videoEditingPlan.renderProps`，增加 `editorVersion:1`，不建立第二份 current plan。`decisions` 保留为来源说明；新版所有修改和重渲染直接使用 renderProps，禁止从旧 decisions 重组覆盖。旧确认/remove 与通用 put 中方案写入均进入公共 CAS 服务，其他 recordingConfig 字段不变；不能留通用 put 绕过版本保存。

现有 cardBase、caption、broll 增加 optional id，旧 props 无 ID 仍合法。新 editorVersion:1 要求 scene/card/caption/broll 的 ID 全工程唯一。旧稿只读不自动写库；首次用户明确保存才生成缺失锚点并保留原件。ID 移动/重排/改字后不变，同素材多次插入是不同 item。未知扩展原样保留并返回未支持字段清单，不以解析后剥离字段的对象覆盖旧原件；固定模板不执行未知代码。

旧 `editingPlan.broll.remove(assetId)` 的唯一兼容后置条件：未转为 editorVersion:1 的旧稿保留旧“排除该素材”语义，经公共 CAS 保存，避免破坏原合法路径；editorVersion:1 必须使用带 itemId 的 apply.removeItem，旧 assetId-only 调用明确返回“请在工作台选中要移除的片段”，零写入，不能批删或任选首项。新版手工与助手界面均发送 itemId；新版单项移除不追加全局 excludedAssetIds、不影响该素材其他插点。验收包含旧稿排除素材成功、新稿双插点误用旧接口零写入、带 itemId 只删除目标。

### 存储与请求

新增 `production_edit_versions`，唯一 `(productionId,revision)`，保存不可变完整快照、requestId、规范 JSON SHA-256 摘要、来源 manual/assistant/restore/legacy 与时间。CAS 当前稿、插入历史和请求回执在同一事务提交；历史不是另一个当前方案。首次旧稿转换保留 revision=旧值 的原件，再提交新版本。事务写入前沿 output→project 校验当前 user/account。

新增 `production_render_requests`，唯一 `(productionId,requestId)`，保存冻结 revision/spec、请求摘要、attemptId、taskId(未创建为空)、assetId(未采纳为空)。仅是渲染请求回执，不新增执行权、调度器或数据库；运行状态/预算/取消仍属于既有 execution。schema 属 backend，包含正常迁移与 fresh DDL；验证只用隔离 PGlite，不手工改用户库。

requestId 长度16—128，每次用户动作生成并在重试沿用。相同 ID/payload 在重新鉴权后返回原回执，即使 current revision 已变化也不重复写；同 ID 不同 payload 冲突。CAS 冲突返回实际 revision，保留输入，不自动覆盖。摘要只判断幂等，标注 `SEMANTIC_BOUNDARY_ALLOW:`。

### 公共操作（contract → transport → service → repository）

| 操作 ID | 参数 | 返回/作用 |
| --- | --- | --- |
| outputs.production.editor.get | outputId | 当前完整稿或空/legacy、revision、未支持字段；纯读 |
| outputs.production.editor.save | outputId,expectedRevision,requestId,完整方案,来源 | 真实保存回执与新版本；无渲染 |
| outputs.production.editor.apply | outputId,expectedRevision,requestId,edits[] | 所选编辑原子应用，失败零写入 |
| outputs.production.editor.versions.list | outputId,limit,offset | 历史摘要分页与真实 total |
| outputs.production.editor.versions.get | outputId,revision | 不可变完整快照 |
| outputs.production.editor.restore | outputId,expectedRevision,requestId,sourceRevision | 恢复真实历史为新 revision；不回写旧版 |
| outputs.production.editor.receipt.get | outputId,requestId | 该次保存/应用/恢复回执，不存在明确空 |
| outputs.production.editor.render | outputId,revision,requestId | 冻结已保存版，返回同一真实 taskId 与 revision |
| outputs.production.editor.renders.list | outputId,limit,offset | 各次冻结版本与真实 task/已采纳成片，不编 assetId |

edits 是严格 union：updateCaption/updateCard/updateBroll/updateSceneTitle/removeItem/addBroll。更新提供 itemId/type/expectedItem 摘要，新增完整真实资源参数；无任意 JSON path 或自由脚本。支持现有字幕文字/英文/时间、卡片结构内容/at/明确 motion、B-roll 插入替换移除/时间时长/明确 motion、场景标题。主口播源和时长、分场边界、delivery 沿原明确配置流程，不能声称任意原录像切割。

时间有限且不越片长，start<end，card.at 落所属场景；同素材只改该 ID。字幕变更仅清理该项失效 emphasis，不猜新重点；结构引用修复只按明确身份/时间。语义、关系、素材选择仍归 Skill/模型。完整批次先校验再提交。部分候选已采纳后，其余项以 ID/前值检查，前值未变可明确重绑最新 revision 再提交，不能仅因 revision 变化无端拒绝，也不能静默改前提。

### 归属与入口

所有服务按 RequestContext user/account，沿 production→output→project 验证；editor 只支持 video。越权/不存在均404，非视频明确不可制作；同项目两个 video 不共享方案。新插入替换须真实账号 Asset 且明确加入当前项目，检查完整分页，不能只看首100条。其他项目素材先走明确加入项目。

制作深链与助手必须明确 outputId。旧调用仅在唯一 video 时可定位，否则展示选择、阻止无明确目标的写入，不能取 outputs[0]。旧分场 UI 对新版仅作来源说明，修改入口转新版方案，避免旧 decisions 覆盖。保留备料、直接上传成品、素材包和旧合法生成；新可选效果不得增加整单质量门。

### 渲染冻结与断线恢复

真实 execution.create 当前无 attemptId，但 AI.createTask 已有 attemptId/fingerprint 幂等。为 execution.create 增加 optional attemptId/contentOutputId，旧调用兼容；窄 service port 向 AI.createTask 传递。现有 prepareTaskCommit 要求父租约，不伪造它来提交手工渲染。

production.render 从服务器保存版派生真实 inputs/mount 与 props，先保存冻结 spec 回执，再调用 execution.create，后补 taskId。attemptId 按该 production/request 唯一绑定。创建前崩溃重试原 spec；创建后回执未补则现有幂等返回原 task。不同 request 是用户明确的新生成动作，不使用默认 legacy hash 合并。请求恢复不读取新草稿重组，也不增加自动补发后台队列。未知提交状态保留可恢复同请求，不盲建新任务。

保存B不改变正在渲染A。执行采纳后通过既有任务/Asset service 回读真实 adoptedAssetIds，再关联 request/revision。新成片不静默改已发布 primary asset，沿原明确选择成片流程。短时 URL 不持久化，保存真实资产引用。Worker只读工程/产候选，用户采纳由同一 backend service 写入。

### 当场验收与实施边界

- 同项目两视频+图文+文章、双账号读写/历史/渲染不串，首100条外合法素材可插入、外账号资源拒绝。
- 保存→公开读回/重启，CAS并发仅一成功、快照唯一；同请求回执恢复/异payload拒绝；保存不创建 execution。
- 同素材两插点、重排保ID、字幕重点按项失效、未知字段保存、旧确认/remove/生成兼容，不从 decisions 复活已删项。
- 历史分页/恢复新 revision，旧原件仍可读；冻结A后保存B任务仍A；创建前后断线恢复同task，两个request不同task；实际采用后成片关联且旧发布引用不变。
- contract/client/transport一致、production/execution/输出入口旧回归、boundary/semantic/reconcile逐项记录。先真实红测，再实现；不补造前置测试。

修改 contract production/video-render/execution、backend production/schema/drizzle/必要execution适配、前端production/output入口与组合根窄port。完整时间轴/iframe归T-1038，完整候选工具循环与卡片归T-1039，字体音效归T-1040，真媒体与实包归T-1041，不能用本任务服务测试冒充客户端交付。回滚保留旧 JSON 与新历史表，不删除素材/成片。
