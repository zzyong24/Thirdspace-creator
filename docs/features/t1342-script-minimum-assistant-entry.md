# T1342：脚本页桌面最小窗口缺少可见编导入口

本任务在用户已授权的功能修复范围内。当前已登记本轮真实验收发现的用户入口限制，实现前仍须最小SPEC与独立技术/交互评审；不把本轮验收边界说成用户未授权，也不借此扩大T1328锁卡恢复范围。

## 原事实与准确边界

0953固定候选包的 `/projects/<projectId>` 使用 `DraftResizableLayout`，右栏为 `aside[data-slot="draft-chat-rail"]`，类名 `hidden xl:flex`；收起态展开按钮也仅xl显示。该组件没有StageChatWrapper的窄窗“打开编导”入口。`/projects/<projectId>/review` 属现役StageChatWrapper，提供正常窄窗编导入口并复用同project的DraftChatRail与历史；这条替代入口的锁卡恢复通过，不能证明脚本页1024×680自身可打开嵌入编导。

2026-10-18 T1328首轮观察器错误只找stage-chat-rail而在脚本页有限等待180秒失败。原1366截图中真实source2/v31锁卡可见，卡业务前后全等，故该observer失败不能当作锁卡功能失败。原run `docs/verification/t1328/final-integration/runtime/formal-ui-acceptance/prediction-lock-seed/runtime/final-ui-readonly/runner/runs/20261018T035420Z-fa7c785ce60f49a789b3451bdc941976/` 保留。后续同旅程将保存1024脚本入口实图与可见布尔，再正常点击顶栏“复盘”；新增原件链接在实际产生后追加，不补造历史。

## 待完成范围

未来修复须先给最小SPEC/独立评审及项目oil-ui-pro判断，保留已有tokens/组件/键盘归属；正常脚本页与1024×680最低宿主均应能通过真实入口打开同项目编导、历史选择、关闭返回/刷新且不误发送或新增模型。不能将右栏强制显示、放大窗口、删掉minimum检查、注入DOM或隐藏原失败当验收。390原型极限与1024宿主minimum不同，原T1296收据仍按原合同保留。

0953作为已完成的可审查检查点保持不变。修复将在新的产品来源与后续固定包中核验，入口限制与T1328复盘承载的已验证锁卡行为分列；不需要新模型根，父T1300不因登记欠账或现有复盘验收通过就冒全部功能通过。

## 2026-10-18 已授权的最小实现方案（独立评审输入）

已加载项目oil-ui-pro 0.10.0与账号组UI_RULES，保原工作台/tokens/Button/中文文案与页面骨架，不做新视觉方向或另造组件框架。R实际读正常/最小原图与组件后给候选 `docs/verification/t1342/design-proposal/R_MINIMUM_ENTRY_PROPOSAL.md`（SHA47a483267f2aa861c982ee32ff9077cff07e2426bea9167ce7bc320936ef0ddd，20ref索引4c7049a0…），是设计输入而非已实现/已渲染PASS。Root已接受下列单实例与隐藏feed成本取舍，仍由本SPEC走独立设计审核。

### 精确生产与数据边界

唯一拟生产W为 `frontend/src/features/draft-workbench/draft-resizable-layout.tsx`；唯一现役拟test W为同目录 `draft-resizable-layout.test.tsx`。不改DraftChatRail/共享AICopilot/请求nonce发送协议、project/output/scope、worker/backend/contract。`docs/verification/t1342/runtime/**`记录TDD、监督、真实新包UI旅程，执行driver的具体字节/预算/来源另锁。产品W与1343模板修复串行，不能使公共RED源锁漂移。

沿现有StageChatWrapper的本地打开模式：断点精确1279/1280；1024默认关闭的outline“打开编导”按钮，在同页仅本地状态打开现有同project编导，绝不整页路由/新建会话。一个稳定aside/同一个right实例，在窄窗打开时固定侧面板（现有max640/100vw、surface/border/shadow tokens），角色dialog/aria-modal/编导对话；原稿面此时inert/aria-hidden，关后恢复。面板关闭时hidden/inert且无可键盘达后代。正常打开/关闭/断点切换不改变nonce、scope或key，不同时挂两个right；真正切project/离开仍正常卸载。

桌面380默认/300–640钳制/原16px键盘步长、rail-width与rail-collapsed偏好及用户可见收起展开保持。内部唯一明确差异：desktop收起也改为单实例hidden/inert，不能宣称生命周期原封不变。窄窗mobileOpen独立，不写desktop折叠/宽度偏好；新非空显式request nonce按原动作仅打开当前同实例，不重放已消费nonce。

### 生命周期与焦点硬条件

单实例为保未发输入、当前历史及nonce消费记忆；不向共享AI新增visibility API。挂载right会沿原单在途8秒feed读取，已有在途任务隐藏后可继续；终态必须停，无重开叠加timer/新期限，不称0请求或性能提升。原消息树保留成本明示；historyOpen=false不能挂大历史列表。卸载/换project清理监听/RAF/恢复任务读回，无陈旧跨scope写。

焦点/Tab/Escape严格沿T1304真实物理最近dialog/alertdialog owner：嵌套来源/确认弹窗优先，不被外层抢键；event.defaultPrevented/非物理DOM内portal不得外栏处理。开后焦点真实关闭控件，关后回触发器；断点变宽不focus隐藏按钮。不能force/删inert或DOM注入绕过。

### TDD与正式验收

原0953脚本1024原图及actual SCRIPT_ENTRY_OBSERVATION已证无入口，是实际UI RED；新组合测试仍需在生产改前真实命中无入口/不符合期望，不能仅把旧截图冒新测试RED。保原正常宽窗基线。

1. 1024×680实际同页打开→历史两来源→未发输入→关闭重开→继续脚本；刷新/返回维持正确source/原锁定，0发送/模型/采纳，业务和账本前后全等。
2. 1280×800/1366×900默认、512宽度记忆、collapsed真/假、separator拖动/键盘正常；1366→1024→1280→1366真实mount计数1与输入/历史保持，真正换project旧实例卸载不串scope。
3. 原已消费nonce随重开/断点/渲染额外发送0；一个新显式nonce在原受控组合只发送1，不启动真实供应商或新持久模型根。UI正式验收不点发送。保原same-body/source/version/CAS，不为本问题重发旧UNKNOWN。
4. 关闭态无可键盘达节点；Tab/ShiftTab/双层Escape/来源错误恢复/焦点返回真实操作；正常、加载/空/错误与长消息滚动不裁输入。
5. 现役feed单在途、隐藏继续原在途、终态停、重开无新增interval、卸载无陈旧回写；history关闭不挂大列表。精确计数留证，不用hidden推测零请求。
6. 新固定包在1024/1280/1366与真实Chrome200%获取并实际看图，原CSS zoom=1/Chrome zoom=2证据保；390只极限观察，不改宿主minimum/原旧合同。

只跑受影响layout/provider/阶段键盘/共享AI相关现役回归及必要完整frontend类型、LED047、超时/边界；正请求/有限观察至少120000并保更长期限，外层覆盖实际串行/启动/清理，具体测试清单与预算交C核后执行。不重跑40功能/56route或供应商模型。与1343本地实现稳定后一次冻结/固定新包；0953原收据与旧失败保留，新包只受影响实际UI与精确consumer复用，不能说旧0953已含修复。

报告将写实际视觉自检/独立评审与未验证项，不伪造评分；本任务完成必须有真实本地入口与新包操作证据，不能只登记或用review替代脚本。
