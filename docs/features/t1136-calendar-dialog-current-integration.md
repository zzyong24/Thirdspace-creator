# T1136 当前main修复长项目与平台账号撑宽排期弹窗

承接用户“代码合入主分支、继续全功能验证、发现问题建task及时修复”与T1124来源审计。来源454e9241排期两条布局增量仍未整合；当前基点de7bc56e，来源仅作provenance，不复制旧PASS。用户结果：安排创作及重新选择目标在长名称、窄窗口仍能操作，保存按原组与真实目标回读。

## 现状与方向

项目采用oil-ui-pro0.10.0与账号组UI_RULES，保留品牌、tokens、Button/Dialog/CreatorDatePicker和中文文案。当前DialogContent只有grid，没有允许收缩的单列；排期实例max-w-md与默认sm:max-w-sm断点不同。先在当前Chrome对原代码取得真实尺寸与截图；没有复现不得编造RED，只保实测并核依赖。

局部布局精修，不新增弹窗体系或改流程。允许改两条产品路径：

- frontend/src/components/ui/dialog.tsx：默认grid加grid-cols-1，让单列为minmax(0,1fr)；不改Portal、overlay、focus、关闭、footer、gap/padding及其他断点。
- frontend/src/features/content-calendar/group-calendar-planning-control.tsx：max-w-md改sm:max-w-md，与默认同断点合并正确；如果实际长select仍撑出父框，在同一路径仅给原父label增加min-w-0、select增加w-full/min-w-0。不删option、缩小字体、加overflow:hidden掩盖问题；原完整option文本和真实ID保留。

当前诊断另发现 T1137：原直接Button+setOpen未注册DialogTrigger，Esc关闭后120秒触发器仍inactive。明确允许在同一路径导入并使用既有DialogTrigger asChild包裹原Button，删除冗余onClick/setOpen；原Button文案、variant、size、图标不变，open仍由原受控onOpenChange和pending守卫管理。共享Radix焦点/Portal/关闭实现不变。该扩展先独立recheck，原诊断在首轮审核进行期间启动，正式record晚于启动，不补拍前置PASS；后续产品改动与GREEN均在适用正式record之后。

SEMANTIC_BOUNDARY_ALLOW：收缩边界仅落实窗口几何，不解释项目或选择发布目标。

## 功能与数据边界

两入口保留同一client.getAccountGroup/createGroupEntry/setCalendarEntryTarget及loading/pending/epoch/inflight逻辑；空组允许targetAccountId=null；归档不能写；保存失败保留项目、日期、目标及原entryId。Esc、取消、右上关闭不保存，焦点返回触发器；保存成功一次刷新，回读与reload后同一正式计划存在。账号移出后原目标需要重新选择的合法守卫不改。无AI调用、真实平台登录/发布或App/用户库写入。

共享Dialog使用方先完整检索；至少检查排期、issue-feedback和AssetPicker。NewProjectDialog是自有overlay，不计作共享DialogContent消费者。共享控件允许原内嵌布局，不能强迫其子级变成一列。

## 写集与执行

产品仅上面2路径；允许当前任务frontend/tests/e2e/t1136-calendar-dialog-layout.spec.ts与docs/verification/t1136/run-layout-journey.mjs、当前截图/报告/SPEC/review/PAGE_SPEC、BACKLOG/PROJECT/DECISION_LOG/modules/events/review-events，以及reconcile.config.json只新增calendar-dialog-layout:e2e前端验证别名。不修改退役来源控制文件、源码以外vendor、版本、构建、凭据或其他任务。

4-build maintenance。先正式SPEC独评PASS，产品代码保持原字节；任务实际Chrome行为RED之后才做2路径修复。受测参数和断言0retry，动作、请求、观察>=120秒；整条旅程600秒以上，覆盖串行准备/操作/清理；外层runner>=完整测试及服务器启动/清理余量。Next dev与typegen串行，私有fresh测试库/auth、scheduler关闭，使用当前正式dispatch/controller/service，不以SQL种数或替换成功HTTP结果验收保存。

正式命令：

- node docs/verification/t1136/run-layout-journey.mjs（真实Chrome、fresh隔离库/auth、1366/900/390同输入；683×450只为200%等效布局，不签原生zoom）。
- frontend原group-calendar-planning-control/readonly/account/month-view相关测试，AssetPicker与issue-feedback原测试；backend原group-calendar integration归属/保存测试；原LED047、frontend type、boundary/semantic/orphan/diff、timeout-policy公共链、pmem sync后完整reconcile。

公共旅程通过真实API创建中性长名组、两个组内手工登记平台账号及共享项目，不连真实平台。长中文、长无空格handle；实际UI选项目/日期/账号→保存→listGroupCalendar正式回读；reload/返回后再开操作；账号转出后重新选择目标真实保存并回读，取消前后正式列表不变。空组、归档、loading、失败保留输入通过原unit断言加必要浏览器状态；加载/失败可显式一次HTTP延迟/失败，不伪造成功读写、权限或任务终态。全局只读/真实写链明确区分这些状态夹具。

弹窗及表单控件边界用getBoundingClientRect/scrollWidth核验，完整option身份保留；实际截图主Agent查看，保留正常、长内容、窄屏与相邻共享消费者。局部低风险视觉由主Agentoil-ui自检，独立实施复核仍必须绑定最终sourceSHA和当前真实收据。

正式前端验证报告由calendar-dialog-layout:e2e允许命令消费，标注合成输入、有限失败夹具、browser surface和non-fixture公共写回；静态局部共享控件回放不冒充整页功能旅程。pmem/reconcile/taskctl实际事件后完成；当前39项范围外失败逐条对照保留，新增属于本任务的失败必须修复，不能称全功能全绿。父T1124继续负责剩余封面/微信来源整合、未用worktree清理，T1062在代码稳定提交后重新冻结打包，无App/库备份或推送/tag/Release。

DEC-T1136-01：用户已授权主线整合和及时修复，当前只接入有真实尺寸证据的局部布局增量，保持产品IA/服务/归属/发布标准；不是新功能方向确认。

```frontend-journey-contract
{"schema":"frontend-journey-contract/v2","task_id":"T-1136","copy_guard":{"forbid_internal_ids":true},"watched_paths":["frontend/src/components/ui/dialog.tsx","frontend/src/features/content-calendar/group-calendar-planning-control.tsx","frontend/src/features/content-calendar/content-calendar-view.tsx","frontend/src/components/media/asset-picker.tsx","frontend/src/components/shell/issue-feedback-dialog.tsx","frontend/tests/e2e/t1136-calendar-dialog-layout.spec.ts","docs/verification/t1136/run-layout-journey.mjs"],"required_checks":[{"id":"AC-LAYOUT","test_id":"TEST-T1136-LAYOUT"},{"id":"AC-WRITE-READ","test_id":"TEST-T1136-PUBLIC"},{"id":"AC-TARGET","test_id":"TEST-T1136-PUBLIC"},{"id":"AC-SHARED","test_id":"TEST-T1136-SHARED"}],"required_conditions":["refresh","repeat","back"],"viewports":[{"width":1366,"height":900},{"width":900,"height":900},{"width":390,"height":900},{"width":683,"height":450}],"coherence_groups":[]}
```

```mermaid
flowchart LR
 A[长项目名和平台账号] --> B[弹窗单列可收缩]
 B --> C[窄屏保边距 桌面表单448宽]
 C --> D[原入口选择 保存 正式回读]
```
