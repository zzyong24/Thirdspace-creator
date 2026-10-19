# T1124 剩余 UI 来源整合准入审查

- 审查时间：2026-10-09T13:24:38Z
- 当前主线：`6c35033e66be24c618426dd0cb84569572e75023`
- 清单 SHA256：`378059fcafeee6e7e4c1625c27121b21acd8c99c75f33528a8244aac7cd733bf`
- 结论：**可分别进入两个当前主线 SPEC 的正式评审，但现有私有草稿不可直接应用，也不继承来源 PASS。**

## T1106 封面比例与页组画幅

四路径是一个最小、可解释的产品闭包：新增纯展示标签 helper、模板比例用途展示、CanvasEditor 页组比例同步与能力交集、现有 CanvasEditor 测试追加两例。产品语义候选 `562c7e0c…` 基于当前主线 `ad8b4d07…` 合并，保留了：

- 保存成功回执后才调用 `rememberReferences(snapshot, resolvedSnapshot, legacySnapshot, revision)`；没有恢复来源旧版 `updateNode()` 内的无参调用。
- 旧连线参考必须由用户显式“使用连线参考”；没有自动恢复引用。
- T1117 的 `describeUserError`/中文保存错误链未被覆盖。
- 参考素材仍为 `AssetPicker showIdentity={false}`，并继续写入 exact asset/file 身份。

比例同步只作用于选中节点所属 `visualGroup` 的 `image_generation` 成员，同时更新组的 `aspectRatio`；组外节点、prompt、reference、generationAttempts 不变。能力判断取组内各节点模式的 `aspectRatios` 交集，已知不支持时阻止写入；能力未提供比例表时不凭空禁用。这一方向符合“比例由真实模型能力限制，标签不做创作选择”。正式 SPEC 应明确 visual group 当前只承载图片页；如果允许视频节点进入同组，现候选的成员筛选需先定义并测试，不能靠内部不可达的 video 分支冒充支持。

当前测试草稿 `440a8e2b…` **尚不可运行准入**：主线 fixture 的 `getCanvasGenerationCapabilities` 是固定异步返回，`f` 没有 `capabilities` spy，而新增用例调用 `f.capabilities.mockResolvedValue`。正式移植必须把既有 fixture 改为可配置 spy，默认值保持原返回、每例 reset，且保留原全部断言。建议当前主线的必验至少包括：

1. 组内两个不同图片模式取能力交集；禁用任一模式不支持的比例，可用比例仍可选。
2. 选择可用比例后以原 revision 一次保存，组与组内图片节点一致；组外节点、引用、prompt、attempt、标题和项目不变，不触发 generate。
3. 保存失败仍走当前中文错误、保留 dirty；成功回执后引用记忆才更新。
4. legacy 引用仍需显式恢复，`showIdentity=false` 与 exact file 身份不变；跨组迟到回执不可写回。
5. 模板页的 21:9 仅标“接近的生成底稿、发布前裁切”，不得宣称公众号头图精确比例。

来源浏览器 runner 绑定旧 isolated ID/Ego 环境，只能作来源 provenance。当前主线必须用新任务自有 ID/fixture，重新取得当前组件回归及 900/1366 视觉证据，不能复制旧 runner 或截图作为当前 PASS。

## T1107 排期弹窗布局

两条来源修改的目的成立：共享 `DialogContent` 增加 `grid-cols-1`，防止 grid 子项的 min-content/长文本撑宽；调用点把 `max-w-md` 改为 `sm:max-w-md`，避免基础组件的 `sm:max-w-sm` 在断点层覆盖排期所需宽度。它们没有改变归属、加载、归档、保存或发布确认逻辑。

但 `dialog.tsx` 是共享组件，不能只凭排期来源 PASS 直接引入。正式任务应把共享影响列入范围，并验证：

- 排期创建与重新选择目标两个调用，长项目名、长账号 handle、中文说明在窄屏和桌面无横向溢出；关闭、焦点、loading、archived、错误和保存仍可操作。
- 至少覆盖现有共享 Dialog 的代表性长文本/表单调用，确认 `grid-cols-1` 不改变嵌套网格布局和 footer。
- 390/900/1366 当前主线截图与键盘可达性；旧来源 isolated ID/Ego runner不能替代。

若希望进一步缩小全局风险，可在正式 SPEC 中比较“共享 `grid-cols-1` + 调用点 `sm:max-w-md`”与仅调用点容器约束；但不能删除 `grid-cols-1` 后仍声称已处理长内容的 min-content 撑宽。

## 准入边界

建议登记两个独立任务/SPEC：T1106 四路径，T1107 两路径及必要的现有测试追加。两者均须从当前主线生成 RED/GREEN、类型、LED-047 和当前视觉证据。此报告未运行测试、浏览器、数据库、模型或 App，不是 SPEC PASS、实现 PASS、来源合并批准或当前包已包含声明。
