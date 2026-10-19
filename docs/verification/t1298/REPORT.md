# T-1298 真实模型验收记录

用户要求“做完之后你需要验证”。本轮使用系统Chrome、隔离PGlite与素材目录，通过公共页面和本机已授权Codex运行；不覆盖现用作品，不改现用设置，不安装或部署。

## 当前真实验证结果

源码`8dbccad6a`、生产修复`b6ef3314f`。最终隔离运行`prepared-e5d626b5ff97ae2d`四次真实Codex全部成功：公众号重组、公众号对话校正、图文重组、图文对话校正均预览、采纳、指定版本及刷新读回通过。Playwright退出0，owned宿主退出0，4209个源码/产物哈希无变化，未触用户现用数据。两平台分别保留独立表达，校正只替换要求的末句，脚本版本列表和另一平台在四轮中均完整比较不变。

公众号正文按实际选择采纳；未勾选的非空标题、摘要和事实保留原值，不能声称候选全部元信息无条件保存。图文候选文档与实际保存全量相等。逐字段/逐字复核见`CONTENT_LIVE_REVIEW.md`及最终run的`content-review-checks.json`；视觉复核见`VISUAL_REVIEW.md`。1536与1280宽度的候选/采纳/刷新操作通过，1280刷新后实际从“打开编导”重开助手并完成第四轮。

四轮运行证据在上述run的`*-ids/task/messages/candidate/before/after/exact/refreshed.json`及`result.json`。后续仅E2E真实入口操作修正，生产代码无变，已通过的单元与构建Gate复用。

## 正式完成与受影响回归

三任务均经taskctl重新实际运行旅程后完成：T1294 `PASS:84a45cc08b08`（10项），T1296 `PASS:e78e5852a1d7`（2项），T1298 `PASS:1f86f42c65e8`。每个完成事件均为`verification_executed=true`并绑定当前源码`8dbccad6a`，不是只校验已有日志后补签。

T1298正式门新建隔离run`prepared-78ec5dfefb16c9e9`，再次四轮真实Codex全部成功，测试与owned宿主均退出0，4209项哈希无变化；第二次逐字/字段投影、采纳精确版本和刷新均通过，详见`FORMAL_RESULT.md`与正式run的`formal-content-review-checks.json`。正式门的首次sandbox监听拒绝也保留原日志，未创建模型任务。

T1294当前源码首次和正式门各10项通过，真实新对话各只有1次提交/1次chat POST，同四ID完成，不重发旧任务。T1296当前源码首次与正式门各2项通过，实际全高助手候选采纳、保存刷新、历史恢复和MP4交付恢复原公共链。正式成片为H264 640×360/24fps/48帧，视频2秒，AAC与容器2.089796秒；与既有同源内核逐帧、PCM和容器时长相等。原生回归不调用模型或ASR，不与T1298四轮混算。对应新回执为`T1294_FRONTEND_VALIDATION.md`与`T1296_FRONTEND_VALIDATION.md`，原回执和历史失败均未覆盖。

## 实测发现与修复

1. 锁定Codex把动态工具送进已禁用的code-mode host，没有产生候选。仅对外部编导显式直接暴露已注册functions；保留原工具/线程/回合/权限检查，默认调用和ACP不变。
2. 文章/图文setDraft推进generation，正常采纳却返回“未同步”。两编辑器只在真实同步、仍挂载、作品一致、精确稿相等后返回已有协议的syncedGeneration；保存期间的新输入继续保留。
3. 窄窗口首次挂载聊天时，StrictMode重放使恢复标记晚于自动发送身份检查，导致准备后未提交。把该标记移至layout effect，保留全部session/epoch/owner与真实卸载保护。
4. 候选预览沿用旧装饰版式，出现未解析变量和排版设置。使用已有simplified模式，与主稿一致，保留既有nativeLayout。

```mermaid
flowchart LR
 S[脚本唯一原稿] --> P[平台独立成稿]
 P --> R[重组或对话校正]
 R --> C[真实模型候选]
 C --> A[预览后采纳]
 A --> V[保存与刷新读回]
 V --> I[核脚本与另一平台未变]
```

## 已通过的局部检查

- Worker适配器与外部调用：8文件176测试；负配置回归最终36通过。
- 前端真实Provider+编辑器port与候选预览：最终6文件100测试（含Copilot首次挂载/真实卸载）。正常采纳、保存期间新输入、卸载均有覆盖。
- frontend/worker类型检查、正常Worker构建、frontend生产构建退出0。
- boundary与timeout通过；orphan为0错误、100项既有警告。
- 实际红测与最初测试编写错误分别留档，不把语法失败冒充行为红测。

## 保留的真实失败与中断

| 运行 | 真实结果 |
| --- | --- |
| prepared-89e6af33aa5b3d0d | 真实模型回合结束但无候选，未采纳 |
| prepared-ef201de341e4322f | 新隔离项目复现无候选；旁观钩子未进入worker，未宣称捕获工具信封 |
| prepared-9cd9d42850a962e2 | 工具修复后产真实候选；采纳状态误报，预览出现旧控件 |
| prepared-a3007a39904d5689 | 公众号两轮通过，图文未提交；起初怀疑Fast Refresh，后续实验排除该归因，不计整轮通过 |
| prepared-006213a02afbcacc | 无并行build仍图文未提交；保留中断记录 |
| prepared-9067fc9d55a9de34 | 保留初始化流、过滤增量更新后仍图文未提交，排除HMR假说；公众号两轮通过，源码哈希未变 |
| prepared-d4c6f20881ec6eb0 | 完全阻断HMR误拦初始React调试流，设置页未hydrate；属于测试隔离缺陷，真实退出1 |
| prepared-7ae1fbcc35954c05 | 会话执行环境中断，最后任务running，最终结果未知；ID保留，无重发原任务 |
| prepared-4969bcc1704901e7 | 公众号两轮、图文重组共三轮完成采纳及刷新读回；图文刷新后窄窗助手默认收起，测试未点击真实“打开编导”入口就断言textbox可见，第四轮未提交。测试退出1、宿主正常退出0、4209文件哈希不变。仅校正测试操作并由新隔离运行复验，不算整轮通过 |

新旅程首次启动另被sandbox的`listen EPERM 127.0.0.1`阻止，未创建模型任务，原限制日志`logs/browser-sol-final-live-sandbox-blocked.log`保留。仅对新owned宿主监听申请必要提升并获准后完成最终run，没有改授权或复用用户App数据。

协议探针仅证明工具暴露机制，不代替业务验收。探针原配置没有工具请求；直接暴露functions后收到namespace:null的真实item/tool/call并返回固定结果。生产namespace/归属校验未放宽。

早期独立复核：原/root/content_audit核实公众号校正仅替换末句，其他正文逐字保持；候选正文、精确版本及刷新内容相等，脚本不变。候选额外提出的summary未被默认采纳，因此只描述正文采纳。原/root/final_visual_review实际看1536视口四张公众号截图，确认占位符和排版设置消失、与主稿版式一致、无裁切。最终四轮内容与两种宽度的视觉复核已由sol_content_live完成，详情见上述两份独立记录。

## 全局对账与派生状态限制

完整全局对账已实际执行并保留33ERROR/0WARN；逐身份比对为29项既有基线及本轮新增4项。新增LED055/061已修复并实际通过，T1294/T1296已由当前源码公共旅程及正式taskctl回执重新绑定。最终只读调用同一审核/前端receipt函数：20项既有审核错误、前端receipt错误0、T1294/T1296/T1298新增审核错误0，三任务均✅且具有实际执行完成事件。详见`GATES_REVIEW.md`、`GLOBAL_RECONCILE_COMPARISON.json`及`logs/receipts-final-before-commit.json`；没有再次执行完整全局suite，也未把原33项输出改成29项或全绿。

派生`progress`仍有既有入口错误：T1111 unsafe `write_set`使全模块预校验退出2；最窄`done`尝试也未执行到状态写入，日志`logs/progress-done-final.log`保留。未改无关模块或手写派生状态，三项implementation在旧progress中仍pending；canonical完成以BACKLOG与taskctl事件为准。根因调查归T1292并关联T1083；manifest与PROJECT同步真实完成及未验范围。

未实测ASR或图片生成；未安装、部署或替换用户现用App。剪辑本轮公共回归及实物证据见`regression/t1296-artifact-inspection.json`、`regression/t1296-formal-result.json`。

图文截图覆盖第一页，第二页视觉未单独检查；完整body以候选、公共指定版本及刷新逐字核验。未新增200%或键盘全量验收；T1297既有键盘缩放欠债保留。单文件eslint前后同为10项既有错误，未称lint全绿。验证按用户要求委派GPT-6.1 Sol高思考；工具无service tier读回，不声称技术上验证已关闭极速。

### 根因实验与开发宿主说明

初期仅观察到Fast Refresh重叠，不能作为因果证据；过滤增量更新仍复现，已排除该假说。最终测试恢复同源WebSocket完整透传，不隐藏编译消息。源码与worker哈希在旅程结束复核。生产宿主需要Rust壳签发token，本任务未绕过授权门，没有安装版运行证据。

研究卡保留当时实验记录，补充纠正：最初完整Provider夹具也重挂编辑器port，红测受到合法身份失效干扰；随后嵌套StrictMode夹具没有触发根StrictMode重放，不能作为复现。有效夹具先稳定根StrictMode下Provider与编辑器port，再首次挂载聊天，与真实抽屉一致。`copilot-mounted-editor-red.log`实际复现应发送1次却为0；真实卸载为0通过。修复后`copilot-final-green.log`六文件100例通过。其余失败日志全部保留，未冒充有效TDD证据。

独立实现复核由runtime_audit和final_acceptance完成：最小生命周期修复通过，未放宽身份、会话或卸载边界；局部绿测不代替真实旅程。

全局新增LED055/061失败均定位到worker-runtime旧四参数断言，本轮新增第五参数true未同步。独审确认后补齐断言，worker三文件68例退出0，后端三文件61例已通过；完整资源生命周期门五组379例退出0。LED047八文件174例退出0。退出码由主会话实际poll确认，C模块只读复核日志。此项属于本轮修复，不能登记为旧债。
