# T-1110 私图状态候选及 EXP-1 独立只读评审

结论：本次已读的候选与研究仪器未发现具体阻断项，可作为研究卡 EXP-1 的一次最小区分实验。此结论不批准合入生产、不关闭研究门，也不证明真人截图或采集成功。

## 已核对对象

- worktree 仍为 69ac739d 的产品源，wechat-browser-source.ts SHA-256 为 ec7c53bc4c83bb57b8f707acd2ba1602f6722f9626c6a3843f8b3031814df19a，未包含本候选。
- /tmp/t1110-private-status-candidate-a286t33o/production.patch SHA-256 为 ec1abd8c418fe425f47793df9623733f614c41b8f0c071080cfaf788d3f911d5；manifest.json 为 5d7fa396b8cfdb488292c3790998e0a257846d53626c4964f0a27ebd6a270a4e。
- 研究私有计划 /tmp/t1110-section-research/plan-private.json、当前 researching/v2 研究卡及实际 clone 仪器源均已只读检查。clone source SHA-256 为 4937c08b3a94b6a0a1abf9dd2b0f94edf2d6a95b650e6ac42159cdee0042a84d；仪器基于 ded9ba42304cbd8f4c617a74e00a794b1870ff76958e6f31cef2163a4c03f0fd 候选。
- clone 的 frontend/src/server/persistence-client.ts 与 root 当前原版 SHA-256 均为 ab11053526e4f2a4f71b45fad6e012b5215a1502d4d5124a8e4db4b5d0457dd8，未保留 QA 的 persistence-client fixture injection。

## 候选的具体语义

只在受信 privateFailureImageDir 已配置、视频号 prepare 阶段、实际 WechatBrowserSourceError/REPORT_SECTION_MISSING 时附加 optional privateImageStatus。七个固定值是 SKIPPED_CURRENT_PATH、SKIPPED_LOGIN_REQUIRED、SKIPPED_LOGIN_PROBE_FAILED、CAPTURE_FAILED、SAVE_FAILED、SAVED、LOCAL_BUDGET_EXHAUSTED；emitDiagnostic 明确重构字段并二次校验白名单，不展开 trace，不信 SourceError 的额外字段。默认关闭以及公众号、其他错误、submit 阶段均不获得该字段。没有路径、正文、URL、认证材料、图片 bytes 或错误消息的新输出；无第二个诊断回调、公共 DTO 或 DB 字段。

截图观察仍沿用原 signal/end，并有最多 120000ms 的局部预算；固定官方 origin/path 和登录状态在截图前后核查。普通 probe/capture/save 失败仅形成有限内部状态，保留原 typed 失败。父取消及原期限先通过原 controls 检查抛出，不被局部预算状态取代。返回后再核查 op.signal/op.timeoutMs，才写入本次 trace；晚截图 bytes 或挂起动作恢复不能写入枚举、补发诊断或进入业务提交。既有自有 writer、有限 unlink 清理和 closeProfile/onStopped/onStopUnconfirmed 所有权未被这份 patch 改动。

## 一次研究实验的停止与归属

实际 clone 第 317–319 行：首次 prepare 返回后先 throwIfAborted，再 op.timeoutMs(120000)，然后固定 console.info('[t1110-research-prepare-ready]', {kind, ready:true}) 并 throw Error('RESEARCH_PREPARE_READY_STOP')。此点位于 receiveReport 与 onReport 之前；正常控制流无法进入任何下载、解析、逐份业务提交或 terminal 完成。固定私有 ready 标记仅包含内部 kind 和布尔值，避免 Error 经既有外层脱敏后丢失实验分支证据。意外 ready 只能解释为实验主动停止，不能解释为采集成功。

prepare 原本失败则没有 ready 标记；仍走原 typed 错误、原五字段诊断及新增有限枚举。既有明确登录检测仍只有 LOGIN_REQUIRED 才能成为 needsAuth；私图中的登录跳过状态不改原业务错误。抛出研究 Error 后仍走原 finally 实停/未确认停止流程，仪器没有伪造 onStopped 或提前释放 profile。

研究卡明列 EXP-1、maxRuns=1、单独 newclientRequestId、单一公开 collections.start→backend 持久任务→worker 受管 profile 链，以及生产不应用候选。该计划属于 Gate 04 允许的卡内最小区分实验，不是重复完整报表运行。停原已归属服务后单一 clone 复用原 PGlite/profile 权属、还原原装配并删除 fixture env，符合此边界；本评审没有操作服务、查看 Cookie、直接启动浏览器或提交 intent。服务停止、fixture env 删除和 max1 执行计数仍由 root 的当场证据承担，不由静态 review 代签。

## 证据限制

只读取作者已产生的真实日志：RED 汇总 12FAIL/100PASS，GREEN 汇总 112PASS/3files，type log 为空且 manifest 记录 exit0。本评审未重新运行测试、SDK 或真人实验；日志不能替代 root 的实际公共实验。原 54 failed0、公众号 56 failed、实际私图0的事实保持，skip 原因仍待 EXP-1 取得当场证据。

共享 guard 的启动预检及锁清理存在 race 前 await 未覆盖，这是既有明确限制，本候选未修复；不得声称全启动链都被新增局部预算覆盖。永久 OS unlink 故障仍可能残留敏感工件，root 继续承担本次私目录结束删除责任。截图是敏感本机工件，不承诺未知 UI 永无二维码，不公开显示、分享或入 Git；SHA 仅用于证据追溯，不等于脱敏。

评审方式：homogeneous inherited；只读独立判断，无真人签收、无生产 PASS。
