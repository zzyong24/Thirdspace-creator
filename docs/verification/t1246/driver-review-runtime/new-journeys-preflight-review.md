# T1246 新增浏览器旅程草稿独立前审

结论：当前 /tmp/t1246-new-journeys 草稿尚未冻结，不可签可运行或全 49 generation key 验收。只读审查，无收费调用、无测试正文执行、无产品代码修改。产品基准仍 533224f334c43cdb81a344424e420cad93784dd1；已实际运行的原 54/170 不受本草稿评审替代。

静态已核：integrated-native 33 key + integrated-dependent 16 key =49，唯一49，与 plan-source.json additionalCases 的全部 generationKeys 恰好相等，无遗漏/额外；integrated-browser 10 例，共59 runtime 草稿。各 key 独立 recipe/test，不能把共同 Journey helper 的一次结果签全部49。输入快照 /tmp/t1246-new-journey-review-inputs.json（草稿仍由 owner 改动，最终版本需重新绑定 SHA）。

| finding | 可反驳源码证据 | 最小约束 |
|---|---|---|
| NJ001：图片族闭包缺失 | integrated-native creative() 只检查 saved.resultId/taskId/status/value 非空，cover/image_card/系列/文章配图未沿原候选采纳到同 asset/file/blob；chat image 只查 material.generate 工具 part。acceptance-support verifyGeneratedAsset() 目前只供直接 asset.generate 两例调用，无法覆盖其它图片 key。 | 逐 key 使用原合法 owner 的 public adoption 入口，关联原 task/result/候选→asset/currentFileId，再 assets.fileDownloadUrl 原 assetFileId 下载200字节，比较 assets.get mimeType/fileSize，保存SHA并由本轮owned只读账本核 stored checksum/真实图片call。不能用直接asset.generate成功代签cover或chat image。冻结合同没有 assets.files.list，不能新增读接口或误用 files.create。 |
| NJ002：聊天工具同ID及成功事实不足 | integrated-native chat() 收集 messages.create response requestIds 但只保存数组，未断言非空或与 task.inputData 原 sourceMessageId/conversationId 绑定；取 tasks[0] 和 conversations.find/project 后跨全部assistant parts找指定工具。output-available 表示工具回执持久化，也可能是 __creatorosOutcome.status=error/blocked；有 p.output 即真不能证明本例工具成功。 | 核本例用户 message→原 task/execution→同 conversation/assistant message→原 toolCallId/outcome.callId/child owner，同操作真实成功 outcome/候选内容，原 ledger 逐 call/thread/turn/binding/usage读取闭包。刷新后同 part/ID仍存在；错误、waiting/unknown保真实状态，不能 PASS。 |
| NJ003：公共UI消费者证据缺少本次结果身份 | direct()→Journey.generate() 公共API创建真实任务后只 reload/shot；responsive/view 只保证main可见。creative()也仅API读saved.value +截图。plan明确真实UI按钮触发及候选审读采纳；现截图没有断言页上显示本次 task/result/candidate/正文，空页面或别的旧候选也能截图。 | 每 key明确其验收边界。需要UI闭包的用原UI触发/观察/采纳，关联原公共response ID和页上候选/文本/媒资；至少保证当前页消费本次真实对象并刷新同ID。仅publicAPI+页面截图的案例不得声明已完成UI按钮/采纳全旅程。共享 main/helper PASS 不代签49key。 |
| NJ004：rewrite真实来源也必被误阻断 | integrated-dependent intelligence.rewrite-text 使用 detail.sourceSnapshotId；冻结 intelligence.items.get（contract/src/operations/intelligence.ts:412）的严格response仅 item/metrics/observations/snapshots/transcript/transforms，没有顶层 sourceSnapshotId。该条件会在已有真实来源后仍固定BLOCKED。 | 从本例真实 public采集返回的 snapshots 中取原id，并核 item/source/逐字稿归属；沿 preview.transform/task原ID读正文/状态/UI。无需改产品合同，不能造snapshot ID。 |
| NJ005：观察外层没有覆盖内部完整请求 | acceptance-support waitTask 与其它 expect.poll 外层timeout=REQUEST120000，内部 op→page.request.post 也timeout120000；末次内部请求可能占满外层，外层不能覆盖多轮串行观察+最后请求/清理余量。test外层3600000较长并不能替代该局部有限观察层。 | 按真实poll消费者给独立观察层覆盖其串行有限窗口和内请求/余量，保单请求最短120000和原更长预算；只观察原task，不更改task持久截止/预算、不自动重发。无法在窗口内完成就保存原ID真实状态，不能认为模型已失败/已验成功。 |
| NJ006：官方Codex/API=0和父子冻结尚无逐key验收回执 | helper记录 modelKey=codex、浏览器probes0 与 workerApiZero=须独立对账，但 journey.status当前可写pass；INT-FREEZE只一个直接planning任务，不核父子/后台。草稿尚无执行config/唯一fresh数据根/新sourceSHA/driverSHA/package绑定或停止后owned ledger报告消费者。 | 运行前补真实冻结config与独立环境，执行后每key绑定task/call/thread/turn/owner/预算/usage及provider/API=0证据；官方模型成功与fixture明确分栏，ledger未核时不得签完整official/noAPI/freeze验收。用本轮owned只读证据，不假造公开call或复用T1238历史PASS。 |

明确的合法未完成前置：真实flywheel平台登录在用户未授权时保BLOCKED；旧strategy_backed任务无历史真实任务就不能用rewrite_only代签。sourceItems、真实ASR/成片视觉/unknown fixture目前 owner正在准备，本例全新空组不能长期替代可安全准备的公开来源/手工逐字稿/owned素材前置，也不能要求额外用户批准来跳过可实施范围。历史Pi兼容/恢复需独立协议fixture批次，不能污染后续无API模型配置的fresh Codex批次。BLOCKED回执必须与最终覆盖表一致，不能标完成49。

排除过的疑点：settings-page真实 multimodalModels 与文本卡共用 settings.models.list，因此该列表 [] 的实际读回可证明独立模型配置为空；不需要另造图片配置接口。chatToolProviderName真实就是非字母数字替换为下划线，当前requiredTool名称转换一致。生成49静态清单完整不等价59实际跑过。

本报告先提供精确阻塞供 owner整改草稿；不是要求改冻结产品。收到新源码/config/manifest后仅对其精确SHA复评，再由原授权继续实跑；本次无verdict工具伪装、无Spec改写。
