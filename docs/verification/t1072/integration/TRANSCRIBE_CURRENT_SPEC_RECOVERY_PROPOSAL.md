# 原整批转写场景的最小生产修复候选（未应用）

本提案只分析既有已批准业务与当前实现缺口，未修改 production、schema、合同或母 SPEC。R-03a/R-05a draft 不作依据。操作者已有本人导入作品/真实 ASR 原文与原 transcribe.douyin 任务，目标带走绑定作品的完整口播稿；后续交项目重建/编辑。失败时先回读同任务、已完成作品和调用账本，配置/登录恢复后沿原任务继续；unknown 只能原调用对账或结束，不换键重新收费。

## 既有精确依据与现协议

- 旧母 R-01：execution 是唯一状态权；waiting_user 在实际配置/登录恢复后显式恢复；unknown_result 只查对账或结束；终态不可迟到覆盖；旧 ai task 可回读。
- 旧 R-02：host 权限/租约/fence/状态校验，取消禁止新 admission；仍可幂等结算已经发生调用；Worker 长动作不回宿主旧循环。
- 旧 R-03：来源明确瞬态故障可 Retry-After 有界恢复；未知收费/写入须同 operationKey 查，不换键重放；恢复已确认事实。
- 旧 R-05 原文：正常 succeeded；有可用业务候选但预算/外部来源不足 partial；纯诊断不可成功；不可恢复错误 failed，配置/登录 waiting_user，未知提交 unknown_result。R-05 是旧批准条款，不能把任何异常改 unknown 或 failed。
- DEC-RCN-020 §2：真实稿绑定后才重建，派生排队失败只告警、下轮补偿，不污染转写。
- DEC-ASR-022 §1/2：完全未配云 ASR 本地 Whisper；显式无效云配置仍诚实错误，不能 fallback 掩盖。DEC-RUNTIME-055 的旧代码退役只授权单一执行路径，不取消旧有效业务。

| 层 | 当前合法形状 | 已存在状态/限制 |
|---|---|---|
| DB execution/原公开 get | status + 原预算/call/key/lease；persistent-task.service.ts:185 | retry_wait→公开queued；waiting_user/unknown_result→公开blocked；partial→公开succeeded，并附 runtimeStatus，兼容旧公共状态 |
| 单作品回执 | transcribeItemReceiptSchema | existing/saved/image-album/failed/no-project；不含 partial 或 unknown，不能把未知写入变 failed receipt |
| 来源明确失败 | transcribeSourceFailureSchema | waiting_user/retry_wait + 精确code + retryAfterMs；仅来源读，不适用于收费/工件提交未知 |
| Worker通用 commitResult | contract internal execution-worker.ts:233 | failed/unknown_result/retry_wait/waiting_user；无 partial（成功专用提交，不用 generic 接 partial） |
| 整批 complete host→Worker | host 返回status，Worker local严格enum | 现在只有 succeeded/failed；任意单件failed会导致整批failed，无partial分支 |
| PersistentTaskService.finish | 现公开service TS形状 | succeeded/failed/blocked/waiting_user/retry_wait；无partial；不为本次改通用finish |

## 精确候选与待裁决边界

### TR05/TR12：已保存2件、另1件明确抽音失败

旧 expectation：整体 markSucceeded，两个已保存稿可继续，显示成功/失败/ffmpeg计数。现 host 将任意 failed item 整体 failed，未丢稿但可能使原用户误认为全部失败。

最小候选：只改现整批 `execution-transcribe-workflow.service.ts.complete` 的确定性聚合；全部件已有终态回执、全部收费调用 settled/rejected 后，至少一个 saved/existing 且其它来源/抽音明确失败→execution partial；全成功或全图集→succeeded；无可用稿且不可恢复明确失败→failed。原 ai 公共状态保持兼容 succeeded，并有精确执行 runtimeStatus partial/成功失败列表及现 steps（不构造 AI 候选或新媒体实体）。同时 Worker complete 返回本地严格 enum 加 partial；不是任意Worker自报partial。恢复必须复用原单件ASR/后处理/保存receipt，已成功件不再次ASR。零未确认调用门、lease/fence/owner、同tx facts→terminal保。

需裁决：旧母“可用业务候选”对已落库逐字稿是否正式同样适用，或应沿旧业务整体succeeded+失败计数。不能在未裁决时把旧expect直接改partial/failed。若采用partial，私有返回是加法；旧Worker本地enum会拒绝，所以发布必须同版本host/Worker，不能声称旧混配wire兼容；公开已有投影仍兼容，不改通用finish/commitResult。

### TR08：已有稿 restoreExisting 的普通恢复失败

旧 expectation：restore失败告警但原任务succeeded，0新ASR；现same tx store+restore，抛错由Worker guard统一unknown。

最小候选先区分事实：旧稿真实存在且已确认、restore事务已确认回滚/明确拒绝，与 transport/commit ACK未知分开。既有稿不被回滚或重复识别。只有明确未提交的恢复暂态失败才允许同 task 同 object 原操作恢复；unknown ACK仍原operation对账，不把它变succeeded/ordinaryfailed。若 restore只是原稿的派生口播稿重建，沿DEC-RCN020把已确认逐字稿作为主事实、派生失败写可补偿reason，不污染已确认主事实；需要核restoreExisting真实写集/原子关系后才决定具体端口receipt。

不能在test建立“抛generic Error但知道未提交”的假事实。现prepareItem没有 typed 明确失败回执，需要候选明确error枚举/既有statement rollback证据与 same protocolversion，Root确认最小内部加法写集后独立规范审核。公开恢复仍原taskID；不增加新ASR或收费键。

### TR13/TR14/TR15：来源冷却、超等待与旧host缺能力

16分钟/60分钟保持原输入；来源通道真实 RetryAfter 应由已有 transcribeSourceFailure（只读来源）回执表达，等待累计必须落原deadline/同task；取消立即中止。明确登录/验证码才waiting_user；来源瞬态为有界 retry_wait/原读取恢复，不能把“第3次普通网络错”猜成需要用户登录。超过原deadline依已批准超时失败；合法continuous任务没有新的30分钟总cap。

最小候选：当前`transcribe-worker-source.ts`不将普通来源重试耗尽统一waiting_user，按现host权威code/恢复事实分类。现generic commitResult retry_wait要求真实rejected收费调用，来源读无收费call，**不能伪造rejected模型账本过门**；需现精确来源恢复 seam 或独立 typed 只读source延期记录，绑定sameexecution/aweme/source、原预算与deadline，在已有backend持久状态内实现。该部分至少是内部协议加法，先规范评审，不增加第二scheduler或test旧循环。

旧host没有namedport由capabilities明确缺能力；调动作前给具体不可用/恢复（版本更新/诊断），不执行真抖音/真实profile，不伪造成成功或无限重试。不得恢复被退役production API来兼容测试。TR14旧failed/TR15缺port旧failed的精确公共业务选择待Root裁决。

### TR18/TR19：可选后处理普通失败与未知不能合并

T357现真实`runTranscriptPostprocessRuntime`已有无配置/明确调用拒绝/输出异常/越权改写→applied:false+原文+reason；cancel与unknown必须抛给任务层。现actual integration测试也明确402类拒绝/严格bad-output等与disconnect分开；此处只作为当前实现事实，正式业务来源仍旧T357与R03。

最小候选优先复用现完整后处理 service+Worker：未配置/可选预算未admit→宿主持久 skipped 回执；明确rejected供应商请求→记rejected调用及原文 typed结果；已settled但输出非法→当前保真检查原文，保usage；断流或prepare/saveACK未知→unknown，不落伪造raw成功。不能把测试genericthrow无位置全部当服务失败；迁后需分别注入模型明确拒绝、宿主ACK丢失、原配置缺失，保原“可用原文不被可选校正反杀”与“未知不冒成功”两类业务反例。

缺整个后处理宿主port不是“模型未配置”，不可假返回appliedfalse绕能力；能力准备应拒绝新收费动作，已有ASR真实稿仍保存待恢复。是否允许在host已验证旧冻结任务无后处理协议时仅回放原确认ASR并明确未校正，需要正式内部兼容裁决；不拿旧postprocess可选JSproperty作为新caps事实。

### TR04附加真实配置边界

`execution-transcribe-preparation.service.ts:36-39` 对resolveSpec非control异常且未plan时localfallback；identity解析generic异常也fallback。若是明确存在但无效的云配置，违反DEC-ASR022 §2的潜在实现缺口。最小方案先构造真实resolve配置缺失与显式非法配置两个RED，经现配置错误类型/来源判别；完全未配用合法localWhisperSpec，显式无效云配置在新call admission之前配置恢复阻塞、不掩盖、不泄密。未证实前不修production或写新PASS。

## 精确后续写集候选（未授权实现）

可能需要现 `execution-transcribe-workflow.service.ts`、`transcribe-worker-run.ts`、`transcribe-worker-source.ts`、`execution-transcribe-preparation.service.ts` 与其现contract私有transcribe-workflow形状；每项仍先冻结具体规范diff/guard/失败恢复/兼容，再由独立正式审核决定。不得backend/**宽域。先保原30输入族及全部断言语义、真实整链RED，按批准项逐个最小修；原未知/取消/跨owner/lease/fence/deadline/原key恢复反例均必保。真实双机安装/供应商与用户抖音登录验收不在本次fixture冒称通过。


## 真实Worker装配与JSONB修复后剩余12项（原expected未调）

源码46f7f5c8已完成test-only真Worker装配；4b0b69b5只修完整JSONB等价guard，独立11守卫与完整51专项通过。原30实际18通过/12失败，配聊天90与其它50总170为136通过/34失败（backend-five-real-worker-guard-fixed-red.log，48.55秒、exit1）。不再以退役runTranscribe未定义解释剩余失败，母draft仍未作依据。

| 实际剩余原场景 | 原expected | 当前真实事实与最小后续边界 |
|---|---|---|
| TR04显式无效云配置 | 0local/等待配置，不掩盖 | 原prepare.resolveSpec抛TranscribeConfigError被genericcatch降local，真实pipeline1次；DEC-ASR022§2反例证实，不是仅潜在；拟按现typed配置来源区分，guard缺口先独立规范/写集 |
| TR05混合+TR12持续抽音失败 | 保存成功部分、整体succeeded+成功失败分类计数 | 确实保存2/1稿，但当前complete failed；旧R05是否partial的裁决不明，继续RED，未改状态 |
| TR08已有稿恢复失败 | 告警，已有稿保留/0ASR，succeeded | 原稿真实保留、0ASR，但restore same tx抛错→unknown；普通rollback与ACK未知需typed区分，不能一概success |
| TR09混合图集 | 原占位锚正确，汇总图集跳过1 | 主事实/终态成功，只有原汇总步骤缺；拟现complete按真实receipt统计，不编模型结果 |
| TR13来源冷却 | 960000+5000一次、恢复来源/汇总 | 实际只等待960000，旧5秒缓冲/汇总未保；本测试只mock等待IO即时，没有真实16min等待或外部deadline验收 |
| TR14超过旧等待上限 | 不等待、failed/具体超上限步骤 | 当前source有界次数却2次3600000，然后waiting_user；mock等待IO即时，不冒真实60min或supervisor deadline结论；continuous任务总cap不得凭旧fixture恢复，需原批准语义精确裁决 |
| TR15旧host无sourceport | failed，0新ASR | 当前typed未知ACK→unknown；缺能力与未知提交不能混，先公开capabilities/准确拒绝提案 |
| TR16后处理生效 | 保存逐字稿X(已校正)/完成注记 | 实际HTTP/回执完整成功，但这4字原文→追加已校正不通过现真实保真比例，持久appliedfalse原文；旧mock绕过保真，不因此改expected或放宽production；需批准迁合法断句输入或保该原非法改写反例 |
| TR17后处理未执行 | 原文成功/步骤含真实reason | 原文/终态确实成功、0HTTP，真实reason存原payload，steps仅逐字稿已保存；拟现真实receipt理由投影，不回报不存在校正 |
| TR18普通后处理throw、TR19整个端口缺失 | 原文仍存/succeeded（throw具体注记） | 当前Worker泛未知收口，原已确认ASR尚可回读但没有工件；须确认错误阶段/实际缺能力，不能genericcatch伪成功或补旧host生产壳 |

所有取消、未知、已存在/正常恢复、云明确拒绝→实际local/幂等、全图集与重试成功真实通过。上述12不是全部状态问题：包含身份fallback、用户步骤展示、旧mock越权改写、来源缓冲/能力与原恢复业务。精确原30库存/完整失败diagnostics绑定backend-five-real-worker-guard-fixed-result.json，母R03a/R05a未获正式审核，任何新增行为继续只候选。


### TR04来源判断纠正：T768后续正式批准覆盖旧DEC022

继续追踪真实配置解析与批准来源发现，T768（2026-08-11，FR76801/§3.1/FR76802，现review3eb18966ea59）明确包括已保存不可用云配置与全部在线解析异常，安全丢弃后规范local一次。此前把invalid-cloud local1判为DEC022产品缺陷不成立；不实施production fatalcatch。精确旧→后续来源与最小test-only恢复候选见ASR_FALLBACK_AUTHORITY_RECHECK.md。当前原expected/12RED保，在主控确认前不改。已冻结云plan、未知收费/ACK/取消仍原strictguard，不因配置兜底许可重放。


T768后续批准来源经主控独立重算核实后，仅原F7-a坏配置test-only迁为安全local一次/0在线/0lease/真实原账本与稿读回。最新完整170为137通过/33失败（chat22+转写11）、58.60秒exit1，backend-five-approved-t768-final-red.log；后台最终backend-approved-t768-final-typecheck.log exit0。旧34FAIL保作前态，未实现其余终态/冷却/generic错误候选，不声明产品全部通过。
