# T-1106 Chrome 操作证据

执行命令：在工作树根运行 `node docs/verification/t1106/run-journey.mjs`。需要本机现有 Google Chrome 和 frontend 已安装的依赖；脚本自行启动临时 Vite 服务与独立浏览器上下文，结束后关闭两者。

真实运行的部分是正式 `IntelligenceWorkbench`、其 hooks、Button、Dialog 和 `frontend/src/app/globals.css` / `tokens.css`；页面外壳只提供24px画布边距。Next宿主导航由本地fixture代替，`refresh` 会重新渲染真实组件并回读fixture状态，未运行完整Next路由或桌面App。

信源名称、来源ID、原采集账号、上次运行ID/时间/状态/错误，及原升级任务ID、缺失归属版本、checkpoint子任务ID均投影自 [installed-witness.json](installed-witness.json) 的安装版公开CLI只读回执。作品标题、作者与代表指标取用户截图，URL与辅助资源ID为fixture。所有执行方法都是隔离RadarApi fixture；成功/在途/扫码待决等转换专为检验前端操作，不是平台或模型回执。外部网络请求被阻断，不读取Cookie，不调用真实服务，不写用户数据库，不重试安装版原任务。

`journey-results.json` 记录最终结果、每步操作、API输入、原任务链、窄窗几何与异常；`actual-visible-copy.json` 只采集视口及overflow裁切区内实际可见文字，记录截图、viewport和源文件SHA256。脚本要求源码SHA256首尾一致。截图成功保存仍需人工看图，实际看图结论单独记录。

验证动作包含：历史失败的主要重试走已有采集账号；在途重复点击和组件刷新不再提交；原升级任务只发同ID `retry`，不新增入队且保留原转写子任务；可选扫码入口开正式弹窗，Esc关闭和回焦；显式打开扫码窗口只传原collector，扫码待决时不开始另一项同步。1366×900与1024×800分别取证，窄窗要求源重试与升级提示可达且无整页水平溢出。

第一次现场观察发现1024固定高度窗口里源列表/作品列表被裁掉，截图归档 `narrow-red/`；该轮没有记录panel DOM boundingbox，不能事后补拍。该轮还发生过源码HMR重载，不能作为最终通过结果。第二轮的Esc回焦断言实际失败，完整JSON及失败截图归档 `focus-red/`。这些归档仅保留当场观测，不冒充更早的历史TDD或已通过旅程。

操作执行者完整重跑在2026-10-09 12:55:19—12:55:26（Asia/Shanghai）通过；主会话在源码提交4269240b后于13:05:03—13:05:10再次完整重跑通过，该轮回执绑定该源码提交。Google Chrome、浏览器错误0；3个生产源码SHA256首尾一致。一次主要重试只调用 `startRun` 一次，刷新与重复点击不增加调用，未扫码；原升级只调用原任务的 `commandTask(retry)` 一次，未调用新入队，原转写子任务保持不变；独立扫码仅调用原采集账号的 `reconnectCollector` 一次，待决时没有第二项同步。Esc关闭后实际焦点是“扫码登录 Geo逸哥 的采集账号”按钮。1024的源面板、作品面板和详情面板实际高度均为320px，重试按钮可见，原归属提示滚动后整段可见，整页无水平溢出。

实际逐张查看了本次9张最终截图：

| 截图 | 观察 |
| --- | --- |
| `radar-history-1366.png` | 保留三栏工作台与紫色主动作，历史登录状态、主“重试”、升级归属提示可读，无内部冻结版本术语。 |
| `radar-history-1024.png` | 单列下来源身份、历史状态和“重试”可见，作品主动作可达；升级提示完整文字需滚动作品列表。 |
| `radar-upgrade-1024.png` | 滚动到提示后，原作品标题、重试按钮及整段账号核对提示可读。 |
| `radar-running-1366.png` / `radar-running-refresh-1366.png` | 在途“同步中”状态稳定，主要按钮禁用，扫码图标隐藏，刷新后保留其余作品与布局。 |
| `radar-upgrade-retry-1366.png` | 原卡片进入“AI 转写中”，原升级按钮禁用，原项目队列计数更新。 |
| `radar-reconnect-1366.png` / `radar-reconnect-1024.png` | 正式扫码弹窗居中，账号与来源名称明确，按钮和多行中文无重叠或裁切。 |
| `radar-reconnect-pending-1024.png` | 显式发起后“等待扫码…”禁用，等待状态保留原账号说明。 |

本记录是实现/操作执行者的实际看图自检，不声称独立视觉评审，也未另选视觉方向。没有重构版式或缩小字号；仍使用原组件与tokens。主会话的独立评审另行记录。

这些证据证明前端代表状态与操作链，不证明此刻Cookie有效、真实平台采集成功、模型运行、真实数据库恢复或安装版已应用源码修复。

主会话随后在7f2168d5将取证脚本改为等待正式弹层的有限入场动画结束，再采集实际文字几何；未改产品动画或生产源码。原两次运行的弹层rect差异保留于bound-4269240b-actual-visible-copy.json。13:10:48完成的完整重跑通过后，strict frontend verification再实际执行一次通过，可见文案完整SHA不变（frontend-receipt-execution.log）。主会话再次实际看了1366历史状态与1024扫码弹窗，文字、按钮和账号说明可读。最终taskctl的执行时间与绑定另见events.ndjson，不回填为此前时点。

最终taskctl complete于2026-10-09 13:52:04（Asia/Shanghai）真实执行旅程并记录PASS:e0a14deeab3e，绑定e19fd2d2；可见文案9张捕获SHA04d9e4e705e3b37428b7e04a2eba174b3c54acad5e96c327da385fff25b168f2。此后只提交收尾工件，不改watch实现。
