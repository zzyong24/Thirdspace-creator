# T1101 全局Gate根因待办

隔离main基线68dfffb3。最初前置对账exit1/76项失败发生在依赖尚未安装阶段，不能全归为代码失败。安装依赖后的完整reconcile-final.log实际exit1/45项失败；独立复核后的第二次完整reconcile-post-review.log同为exit1/45项失败，继续保留实际结果，不改为全绿。

## 范围判定和补测

- 26项看板/历史收据问题：BACKLOG超硬上限、旧审核缺hash-chained event或hash不匹配、T1023/T1022旧frontend completion event缺失。T1101初评与补充独评由reviewctl当场记录，不能替历史补PASS。
- 19项教训检查：LED-052, LED-006, LED-014, LED-017, LED-018, LED-020, LED-022, LED-032, LED-040, LED-041, LED-042, LED-048, LED-049, LED-050, LED-054, LED-058, LED-057, LED-061, LED-053。归档门初次未传第二个隔离PG变量，是真环境失败；补齐两变量后的archive-guard-final.log实际59PASS。LED048单独最终复验209PASS/1FAIL：唯一失败cover-file-repair.test.ts直接创建不存在的output-1，publishing.assertOutputParents在进入封面修复前拒绝。该测试、publishing/assets/db及补采实际消费者相对base68dfffb3无改动（git diff空）；不经过本轮调度/平台代码。另同名单跑复现同因，见cover-repair-scope-diagnosis.log。保留原失败，不改旧fixture。
- contract.log实际397PASS/43FAIL：42个endpoint-bootstrap消费者都仍断言404个endpoint（真实注册面已增加），另registry allowlist遗漏4个已存在端点。本轮contract未修改，不能靠变更旧快照洗绿。
- timeout-policy-final.log实际27项静态失败均不命中本轮平台/画布路径；5项实际公共CLI/配置消费回归PASS。原问题关联T1081，本轮保持实际两分钟browser执行和原任务信号/期限。
- LED049前端单独复验76PASS/3FAIL，三个失败全部在未修改的shell.test.tsx（导航条目顺序、预取断言和contentFill旧布局）。其余自动化/发布等6文件通过。backend另行复验44PASS（包含本轮改动的scheduling.repository），结果见led049-backend-final.log。
- 额外浏览器整页观察：共享资源面板持续“正在读取共享资源…”，新增辅助等待断言实际失败（journey-shared-state-failure.log）；原ResourceGrantsPanel与原key本轮未改。与本轮能力表扫码AC分开登记，不能称整页共享授权已验收。
- taskctl start事件晚于首次修改（独立初次SPEC PASS早于修改），保留真实审计次序；历史读取新增测试的初次失败被locator/夹具干扰，不冒充有效实现前红测。
- 首次taskctl complete时两条功能旅程通过，但可见文案SHA不一致而未完成任务（completion-copy-mismatch.log）。窄窗“适合内容”根据实际布局计算缩放，复跑出现不同百分比；只将验收操作改为点击实际“缩小”按钮并等待83%。第二次完成校验同样因取证过早读取到缩略图加载前的“预览暂不可用”而未完成（completion-preview-mismatch.log）；补充等待真实图片complete且naturalWidth大于0后再截屏与读取全文，不改产品、不删改可见文案证据。

## 原始失败列表

```text
✗ [ERROR] backlog-health.mjs: BACKLOG RUNAWAY (exit 2, >2× hard limit) — every session pays this tax; compact BEFORE other work: `node orchestrator/process/backlog-compact.mjs` archives ✅ rows mechanically, then squeeze flagged rows per rules/task-ledger-rules.md.
✗ [ERROR] review receipt: T-1073: review receipt 缺少任务 T-1073 的 hash-chained event
✗ [ERROR] review receipt: T-1072-owned-devices: review receipt 缺少任务 T-1072-owned-devices 的 hash-chained event
✗ [ERROR] review receipt: T-1069-completion-json: review receipt 缺少任务 T-1069-completion-json 的 hash-chained event
✗ [ERROR] review receipt: T-1070-transcript-reliability: review receipt 缺少任务 T-1070-transcript-reliability 的 hash-chained event
✗ [ERROR] review receipt: T-1063-release-pipeline: review receipt 缺少任务 T-1063-release-pipeline 的 hash-chained event
✗ [ERROR] review receipt: T-1021: review receipt 已过期：SPEC hash 1ca8392b4d5e != 242b25c4f83f
✗ [ERROR] review receipt: T-915: BACKLOG review receipt 692283b8bace 与 snapshot ad76cf555129 不一致
✗ [ERROR] review receipt: T-859: BACKLOG review receipt 9895a91a63a8 与 snapshot 5818394813ca 不一致
✗ [ERROR] review receipt: T-858: BACKLOG review receipt 2521be715a0a 与 snapshot c76009a5586c 不一致
✗ [ERROR] review receipt: T-824: BACKLOG review receipt 18361dc8c3c3 与 snapshot f0e215103ddf 不一致
✗ [ERROR] review receipt: T-819: BACKLOG review receipt 0425ab7b87b8 与 snapshot a8879edf798f 不一致
✗ [ERROR] review receipt: T-816: BACKLOG review receipt fb03de3a57d7 与 snapshot 7896d566ccf8 不一致
✗ [ERROR] review receipt: T-768: BACKLOG review receipt 3eb18966ea59 与 snapshot 64f8010b2045 不一致
✗ [ERROR] review receipt: T-726: BACKLOG review receipt 2809820bf64a 与 snapshot 39e3f41ca866 不一致
✗ [ERROR] review receipt: T-707: BACKLOG review receipt 06867c4bf60c 与 snapshot 87de34262527 不一致
✗ [ERROR] review receipt: T-703: BACKLOG review receipt c1a3920aea71 与 snapshot 0662dafac8fa 不一致
✗ [ERROR] review receipt: T-691: BACKLOG review receipt 9444ca5b32a9 与 snapshot 2f2a131519e7 不一致
✗ [ERROR] review receipt: T-694: BACKLOG review receipt 2c7be136aea0 与 snapshot 171b7c9ad2f2 不一致
✗ [ERROR] review receipt: T-656: BACKLOG review receipt 5f6970ac76f2 与 snapshot bd8a6ac135f0 不一致
✗ [ERROR] review receipt: T-652: 审核列为「待审」；存在未销账问题，不得开工
✗ [ERROR] review receipt: T-645: BACKLOG review receipt 5dfe24b42eb7 与 snapshot 7ff0c3cb1906 不一致
✗ [ERROR] review receipt: T-642: BACKLOG review receipt 7728c9ed44bd 与 snapshot 9002b8dbeb4d 不一致
✗ [ERROR] review receipt: T-635: BACKLOG review receipt b8add273a494 与 snapshot 84661017fde5 不一致
✗ [ERROR] frontend receipt: T-1023-agent-recovery: PASS 验收缺 taskctl completion event
✗ [ERROR] frontend receipt: T-1022-agent-recovery: PASS 验收缺 taskctl completion event
✗ [ERROR] lesson LED-052 RECURRED — 归档执行门失败：普通AI/source_sync claim与新动作必须拒绝；四类实际collector按真实job/member/owner/version验证；已存在同键调用settlement必须保留幂等。缺隔离PG配置不能skip。
✗ [ERROR] lesson LED-006 RECURRED — 桌面启动门回归：必须保留静态 splash、显式 sidecar cwd、runtime 失败可见且落日志，并在 Windows 安装后真启动 GUI 等待 MAIN_PAGE_LOAD_FINISHED。
✗ [ERROR] lesson LED-014 RECURRED — 局部改稿门回归：脚本写入必须持久化稳定段落 ID，存量无 ID 版本须用稿面同一兼容锚点并在新版本自愈；技术锚点必须由稿面点击时可信绑定；模型只产新段落正文；未保存稿先自动保存；采纳只替换目标段；冲突不得静默覆盖，也不得让失效锚点污染后续普通对话。
✗ [ERROR] lesson LED-017 RECURRED — 逐字保真门回归：必须从本轮受信 sourceRef 恢复精确原文、校验长度和 SHA-256，并由确定性 runner 生成待采纳候选；恢复失败不得退回 extraBrief 摘要或模型生成。
✗ [ERROR] lesson LED-018 RECURRED — 桌面浏览器交付门回归：壳层注入目录必须覆盖宿主机残留环境；入口先系统 Chrome、再随包 Chromium；正式桌面态不得依赖 CLI/npm/联网下载；安装校验必须看到真实 chrome.exe。
✗ [ERROR] lesson LED-020 RECURRED — 封面工具链回归：生成封面入口必须绑定 cover.generate；发布参考候选只含真实已发布且有封面的作品；模型按相关性优先、时间次序选择后必须传真实 coverAssetId；组合回合禁止 local.tools 且不得静默纯文降级。
✗ [ERROR] lesson LED-022 RECURRED — 跨平台文件定位门回归：win32/darwin/linux 必须各有 command/API、shell-free argv/path、completion 和中性 user copy；route 必须消费 plan + launcher，禁止直接执行单平台命令。
✗ [ERROR] lesson LED-032 RECURRED — 竖屏编导落地门回归：人物 beat 保持全画布，card/B-roll 辅助窗保持固定左下人脸常驻；direction 的 B-roll ref 必须随沙箱物化文件同步改名；字幕强调只执行 AI 给出的 Unicode 范围与时间窗，禁止代码猜重点。
✗ [ERROR] lesson LED-040 RECURRED — B-roll 删除版本门回归：删除必须先写新 editing-plan revision 并清 decisions/render props/inventory/direction；runner 失败回退只保留当前 inventory；旧 sourceRenderTaskId 解绑，晚到旧任务不得覆盖当前成片。
✗ [ERROR] lesson LED-041 RECURRED — Whisper 分层消费门回归：生产 worker 必须显式加载随包 creatoros-module-resolver 并绑定同一 runtime root；传统 runtime 兼容；Windows closure 必须用随包 Node 启动真实 worker consumer，主进程 import 不能替代。
✗ [ERROR] lesson LED-042 RECURRED — 分页真相门回归：可见总数必须消费同一服务端查询的 meta.total；items.length 只表示已显示；超过首批必须能继续加载并保持筛选、排序、账号上下文一致。
✗ [ERROR] lesson LED-048 RECURRED — 保留原执行与成功进度，修复独立优先调度、按账号资源管理及各源计数；禁止总时长误杀、TTL抢锁、关闭开关后自动新建任务或盲目重试。
✗ [ERROR] lesson LED-049 RECURRED — 修复有界读取与同用户账号缓存失效，保留日历/运行真值及稀疏趋势口径；禁止删除历史或统一长TTL提速。
✗ [ERROR] lesson LED-050 RECURRED — 按真实过渡完成token合并同目标、先筛选再展开；保留不同导航与失败重试，不缓存整页动态待办。
✗ [ERROR] lesson LED-054 RECURRED — 恢复短事务读取可信身份→事务外 I/O→短事务复核租约；对象存储回读必须在租约事务外完成；外部副作用按原键对账后自动续跑同一任务。
✗ [ERROR] lesson LED-058 RECURRED — 恢复模型候选的 superseded→retry_wait→同任务重试链；保留预算、检查点和原对话。只有无模型配置进入设置引导；用户取消与外部副作用 unknown 继续禁止自动重放。
✗ [ERROR] lesson LED-057 RECURRED — 保留完整性校验并修复已完成隔离目录的安全复用；禁止清空用户 AppData、放宽入口校验或无依据重试。
✗ [ERROR] lesson LED-061 RECURRED — 资源生命周期回归：修复实际消费者的释放、背压、单在途和停止屏障；保留原任务/attempt/fence/deadline、审批、完整历史与合法大输出。等待状态按真实任务ID保护；取消接受仅释放原turn本地关联，最终终态由原租约确认。禁止删历史、重发任务或伪造释放/成功。
✗ [ERROR] lesson LED-053 RECURRED — 超时预算回归：正执行最低两分钟；独立外层覆盖完整内部预算；原绝对期限/continuous/即时取消保持；前端保留原任务ID；HyperFrames同版本补丁与实际CLI配置必须一致。公共链回归失败不能用词法扫描替代。
```
