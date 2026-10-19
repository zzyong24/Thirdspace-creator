# T1364 R2 导航诊断窄delta独立审阅

规范包为`findings.json`（`spec-review-round/v2`、`recheck`、`findings: []`）。未发现需整改的新增规格缺口；本结论不借用R1的空finding，不代签实现、受控公共GREEN、打包安装或真实导航执行。当前冻结SPEC SHA256为`bd1e0a0691ba51c9865a3fd1e94335c6e2a4e164210de1e70798b0a86004b119`。R1的REV:756ccf30ea9c与空finding按正式round2-context继承，新增FR6—12完整增量核对；精确R1→R2 diff及输入SHA保存在`inputs.json`，冻结文本为`SPEC.input.md`。

审阅仅写本round2四份原件；未修改SPEC、中央状态、生产或测试，未运行测试、浏览器、平台、新采集或新导航诊断。源码逐项与e676 Git对象核字节全等；本轮不是对待实现代码的审签。产品流程版本仍为3.29.0，阶段为4-build中的运行时契约范围修订，需先独审再由Root放行实施。DEC-136402已记录本次用户授权范围与单运行时交付边界。

## 逐项结论与真实消费者

|范围|当前合同与核对结果|
|---|---|
|入口与真实scope|FR6规定唯一新operation、空strict body、group scope、write/gateway幂等、默认off及可信配置；FR7冻结真实ctx与账号、组、membership证明。`assertOwnedAccount`确实校验user/active/platform，但仅ctx.groupId非空时核成员；SPEC明确非空组并补active组/version与membership读回。账号没有数值version，现已使用平台/稳定身份/status/updatedAt，不虚构版本。|
|原正式profile|`authorizeBindingTarget`从真实账号派生目标；`resolveProfile`再次核active/稳定身份，不能独自核group。FR7的authority前、host排队后、采样/截图前后及发布前新鲜scope读回因此必要且已写明，ABA由membership id/version识别。通用Lane或任意目录/URL输入不是替代路径。|
|跨重启一次准入|现CLI服务同key的running/failed/unknown返回原receipt；成功才可返回缓存。FR8额外要求authorizationId原子wx准入、首可信invocation绑定、启动前消耗、重启不再launch；损坏/缺失结果保UNKNOWN，不删除标记换key。这样新key不能绕过本次人工授权额度，网关幂等与一次授权不互相代签。|
|缓存重放|现dispatch成功缓存守卫没有account范围验证。FR8已要求同backend scope端口比较当前active及原冻结证明，变化scope conflict且不重跑；不在frontend复制DB授权判断。旧op缓存保持原合同。|
|信号与四包装|当前Transport及`withPageReadInvalidation`、composite、application owner分发、platformAccount transport均三参。FR10仅新op增加第四参，从dispatch真实req.signal/gateway invocation取得，原op仍三参；输入不能注入controls。仅新增service port不等于真正接通HTTP取消，因此R2明确要求真实断连公共链，失败必须阻止真人执行。|
|有区分度的观察|FR9以同Page身份核验为前提，两viewport帧与有限导航结构能够区分同样0/0下的顶层、frame、遮挡、隐藏、Shadow与菜单差异；不是仅重复known selector计数。无容器/不可读取字段保UNKNOWN，私有候选数量/长度、帧数、权限、路径、大小和原子文件合同有界；不抓全DOM、body或网络正文，不猜新selector。不能把无法机械确认的closed Shadow内部结构写成已证，更不能为满足测试绕过封闭边界；应按既有UNKNOWN约束保真实不可读范围。|
|原deadline与停止|FR10固定新诊断期限，不沿用281过期额度；实际预算2450000ms有串行分解，增量消费者须加足而非借清理。FR11只增真实auditReceipt，保宿主算法；区分未启动释放、实际context停下、释放成功与stopPending，失败保占用/重试职责。不能无条件finally调用onStopped冒充实停。|
|安装与原任务保护|FR12承认e676没有新op；禁止共享用户库的第二开发实例或热改安装资源。受控验收、独立实现审、冻结和正式安全交付/Root审等价单运行时证据之后，才可能明确放行一次真实导航。原281/1499/1502/1726及global44/foreign9/T1255均不回写，导航不能签采集恢复。|

## 预算与实停的静态证据

现source的SDK launch为120000ms；`completionWaitMs`使guard为370000ms，三个启动预算合成1120000ms；WechatVideo身份串行预算为120000+480000ms。SPEC的host排队120000、启动1120000、初goto120000、identity600000、观察120000、两截图240000、关闭120000、结算10000，和为2450000ms。`mcp-server/src/dispatch.ts`实际POST_WAIT_MS=8100000、CLEANUP_WAIT_MS=120000、FINAL_MARGIN_MS=60000，无凭据观察8280000ms，静态包络足够；SPEC仍要求核实际执行CLI身份与真实公共外层，不凭这些常量冒运行证据。

现`host-browser-profile-lifecycle.ts:27–54`内部确有owner.hostOperationId与真实receipt.leaseId，但仅返回authDir/onStopped。只读追加auditReceipt不要求改DB或租约算法。原guard包装context.close，在原close成功后await release；关闭事件在主动close期间不提前放行；onStopped释放失败会保留重试职责。因此FR11可复用原真实机制，但不能仅凭auditReceipt存在就把physicalStopConfirmed置true。实际实现和受控回执应区分物理关闭成功、DB释放成功及两个时间，保晚context/close异常的占用，不能把原281公开close UNKNOWN倒填成confirmed。

Scope复核须按FR7/FR10贯穿真实排队与动作：host取得租约并不保证guard启动队列已结束；长等待、晚context和导航前的归属变化必须由本轮公共保护验证，不能只在最初ctx解析时核一次。此为已确认“变化后阻止新导航/取证/发布”和排队变化验收的实现审查点，不要求新增另一种任务/锁/授权机制。

## 实施前后必须保留的证据界限

R2写集覆盖唯一endpoint、CLI policy、显式workspace scope、observability库存、四包装、backend业务、worker source/观察器与宿主auditReceipt，以及直接受影响的测试。现`platform-account.persistence-client.test.ts:60`确实断言七个OP_IDS，清单明确精确+1；不能把新增op造成的库存失败归旧债。原witness selector、collector/parser、guard策略、schema、UI和调度均无写集；清单外实际消费者需要先有限增补再审。

当场RED必须经过真实CLI SDK/gateway、本机HTTP/context、四包装、合成owned backend authority/lifecycle、真实Chromium/source、PNG解码/SHA、私有manifest和实停释放。旧版不认识新op的RED只证明新能力缺失，不证明真实平台首因。边界族包括同key各状态、跨重启、scope ABA/排队/截图变更、HTTP断连、期限与晚结果、私有文件安全、关闭/释放失败；还须保旧op三参/原持久取消/缓存和原T1363入口保护。上述均是后续验收要求，本审没有运行或签通过。

特别是Next真实断连能否传播到req.signal必须由公共链回答。若不能，FR10明确停止真人诊断、另审最小契约；不能暗增cancel或借原collect cancel代签。因此当前规格没有把未经验证的运行时假设直接转为真实执行许可，也无须在本轮静态评审伪造此结果。

## 已有281事实与本轮读取边界

T1359安全终态投影确认281为failed/EXPORT_FAILED、committedPages=0，完整UTC为2026-10-18T22:45:43.005Z—22:47:48.452Z。既有事件仅证首channelsDaily prepare的入口等待最后0/0及centreClicked=false；source先完成同Page identity核对再到prepare。它不证当前登录、菜单更名、原1499首因或物理从未点击。VIDEO_FAILURE_SAFE_EVENTS副本本身没有group/account；该关联来自T1359最终摘要的collection目标与同attempt终态，不能说事件自身包含归属。

证据处理限制：外部命名为SAFE_SUMMARY.json的摘要，其collection目标段仍混有clientRequestId/idempotencyKey字段。本审为核group/account读取该段时，工具输出意外带出这两个字段；未使用、未另存、未复述其值，已通知Root。报告和inputs不复制该值。后续应使用明确字段选择的安全投影，不能把“SAFE”文件名当作无须检查的白名单。本轮没有读取实际profile、凭据、用户库或raw日志，也没有重跑decoder。
