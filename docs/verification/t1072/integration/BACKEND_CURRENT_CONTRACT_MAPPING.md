# 后台旧测试与现行已批准契约逐场景映射

本轮源码冻结基点 `8b8d6d1eaa3a965da67d61a0513dfcba2f3e0c29`。`backend-five-current-contract-red.log` 实际为 5 文件中 4 失败/1 通过，137 场景中 58 失败/79 通过；signal-quality 因退役模块导入导致 33 场景没有收集，所以原输入库存共 170，未删除或跳过。当前先修公开装配，不将基线相等当通过。

依据仅使用应用本次母 draft 之前的 R-01/R-02/R-03/R-05 原文、DEC-RUNTIME-055 既有迁 Worker/退役授权与明确旧业务决定。新增 R-03a/R-05a 和本次扩写 AC 不构成实施或调整预期的授权。下表“现行行为”中未执行迁后场景的部分为源码静态事实，不能冒称已运行或验收。

原始 30 个转写场景全部保留。运行失败的 28 个都首先卡在 `runTranscribe is not a function`；两纯函数 PASS。下表按原场景展开，迁移后的运行证据尚待补齐，待裁决行保持 RED。

| ID | 原输入/断言 | 当前实现事实 | 已批准依据/缺口 | 本轮处理边界 |
|---|---|---|---|---|
| TR01 | 成功取流、ASR、绑定、步骤、成功 | 新Worker有同顺序；宿主保存步骤/终态 | R-02/旧R-05、DEC-RCN-020 | 可迁真实Worker与宿主，不手调旧spies |
| TR02 | 派生重建排队失败仍成功并告警 | 宿主saveArtifact catch派生失败，保主事实；现无相同console文案 | DEC-RCN-020 §2 | 保已存事实和恢复断言；日志文案不是新终态依据 |
| TR03 | 在线失败后local真实identity成功 | WorkerASR有真实effectiveSpec/identity账本 | DEC-ASR-022/旧R-03 | 可测真实fallback，不伪造identity |
| TR04 | 云ASR未配整批failed且不给ASR | 已批准完全未配应local；显式无效配置不能local掩盖 | DEC-ASR-022明确替代021 §3/6 | 可改未配案例；另保显式无效配置拒绝反例 |
| TR05 | 2成功1抽音失败整批succeeded+分类汇总 | complete任意failed item→failed，已成功子集保存 | 旧R-05可用部分partial；没有该批次精确批准 | 待Root裁决，不能改旧expect凑绿 |
| TR06 | 已有稿跳fetch/ASR/重复ensure且成功 | prepareItem恢复已有稿；Worker receipt直接skip | 旧R-01/03、DEC-RCN-020 | 可测真实恢复与调用零新增 |
| TR07 | 已有稿restore成功→成功、零ASR | prepareItem same tx restoreExisting | 旧R-01/03 | 可迁 |
| TR08 | 已有稿restore失败仍succeeded、零ASR | prepareItem抛错经guarded→unknown_result | 旧R-03仅约束未知副作用；普通恢复失败的精确分类未定 | 待Root裁决 |
| TR09 | 图集占位/skipMasterScript，视频成功，分类汇总 | Workeralbum→same host artifact；无ASR/后处理 | T243旧输入族、DEC-RCN-020 | 可迁占位/调用/真实行；原分类汇总文本须核正式批准 |
| TR10 | 全图集成功 | host complete图集无failed→succeeded | T243/旧R-05 | 可迁 |
| TR11 | 抽音首错重取来源一次成功 | Workerextract catch→source再取→extract一次 | 旧R-03/现退役迁Worker决定 | 可迁真实入口，不写test循环 |
| TR12 | 抽音重试仍错且另1成功→succeeded及ffmpeg汇总 | 单件failItem；host整体failed | 同TR05 | 待Root裁决终态与分类展示 |
| TR13 | 2件冷却16分钟→一次remaining+5秒等待→成功 | 来源端口3次有界retryAfter；旧批级一次子集循环退役 | 旧R-03承诺RetryAfter/有界，不指定旧剩余+5s | 保相同冷却输入；等待次数/形状待Root裁决 |
| TR14 | 冷却60分钟超30分钟cap→failed、不sleep | 现sourceFailure若waiting_user即等待用户；retry_wait有3次等待 | 旧R-03有bounded+deadline，无旧30mincap精确替代 | 待Root裁决；不能改failed→waiting_user |
| TR15 | 旧host无冷却端口failed、fetch一次 | 生产不保旧host兼容壳，未知host端口不可当普通失败 | DEC-RUNTIME-055退役授权仅删旧执行，不等价新终态 | 保缺能力输入，终态待Root裁决 |
| TR16 | 后处理applied真→校正稿+步骤+成功 | Worker真实postprocess+宿主保存完整回执 | 旧R-02/03/05 | 可迁 |
| TR17 | 后处理合法declined→原ASR正文+reason+成功 | 真实prepared/skipped/restored有typed结果 | 旧R-03/原T357要求 | 可迁合法明确不执行；不能伪造unknown为declined |
| TR18 | 后处理genericthrow→raw正文、成功、注记 | hostreceipt未知→unknown；模型普通异常有ledger分类 | 旧R-03未知不得冒成功，但genericthrow需明确发生位置 | 拆端口未知与已确认模型失败；后者待Root裁决 |
| TR19 | 无后处理port→raw正文成功、无注记 | 当前Worker需namedhostport；缺回执→unknown | DEC-RUNTIME-055不保旧壳 | 缺能力恢复/终态待Root裁决 |
| TR20 | album不走后处理、成功 | 现Worker直接savealbum | T243/DEC-RCN-020 | 可迁 |
| TR21 | ASR迟到取消，零后处理/保存/下一件 | 实际ASR/guard signal.throwIfAborted | 旧R-02取消admission/迟到不覆盖 | 可迁 |
| TR22 | 抽音取消零重取/ASR | extract catch先signal.throwIfAborted | 旧R-02 | 可迁 |
| TR23 | 首次与重试source/extract同signal | 现source与extract显式signal | 旧R-02 | 可迁 |
| TR24 | 冷却等待取消零后续fetch/ASR | timers/promises delay({signal})，abort后退出 | 旧R-02/03 | 可迁真实RetryAfter等待取消，不能还原旧批循环 |
| TR25 | 已有事实probe=true后取消，零restore/fetch | 宿主probe后signal.throwIfAborted | 旧R-02 | 可迁 |
| TR26 | probe=false后取消，零restore/fetch | 同TR25 | 旧R-02 | 可迁 |
| TR27 | 后处理取消same signal零保存/下一件 | 实际postprocess/guard cancel | 旧R-02 | 可迁 |
| TR28 | 后处理unknown原错误、零保存/下一件 | 真实GenerationFailure停止，不普通failItem | 旧R-03 unknown不盲重放 | 可迁 |
| TR29 | 消息分类解析/ffmpeg/captcha/other | classifyTranscribeFailure现仍公开 | 原纯函数契约 | 原PASS保留 |
| TR30 | 冷却消息分类 | 现仍公开 | 原纯函数契约 | 原PASS保留 |

准确源码锚点：`transcribe-worker-run.ts` 是唯一整批 Worker；`execution-transcribe-workflow.service.ts:37` same tx existing restore、`:69-83` complete 将任何 failed item 投影 failed；`transcribe-worker-source.ts:15-25` host RetryAfter 有界三次，`:50-60` 匿名来源失败三次后 waiting_user；`transcribe-postprocess-run.ts` 按持久回执分类，不将缺回执伪造原文成功。正式旧母 R-05 原文仍要求可用候选 partial/纯诊断不可成功，因此当前 failed 与旧 succeeded 的精确批级行为需裁决，不能只以代码当前这样为准。

已完成的其它测试工程：signal-quality 原 31 纯函数场景保留、两个旧计数输入迁到真实 topic Worker pipeline/严格冻结快照/实际 renderer，共 33/33；asset-business 保 7 原场景，原旧 checkpoint/retry/result 与 fingerprint 等事实逐字段不变、current readonly recovery 映射、0 模型调用及停机迟到拒绝，7/7；asset-worker 原 10 场景实际独立 Worker 10/10，无 legacy 属性仍严格拒绝。`backend-signal-and-asset-public-green.log` 文件名不能代表通过：其中 signal 两个 strict snapshot 配置错误，实际整体 FAIL；最终修复日志是 `backend-signal-quality-strict-snapshot-green.log`。

聊天 90 原输入场景：25 RED 中账号 snapshot 当前 fixture `account-a` 与实际上下文 `acct-current` 不符，可修同身份并保现跨账号拒绝反例；T770 缺 guide 的整轮失败不能仅改为可用，仍待准确母/业务来源；两个退役长动作 ports 要迁到真实 ingestion host 和 web Worker，旧 pre-aborted 还期待启动读取违反旧 R-02，需保“已经启动后取消”与“取消前零启动”两个事实。其它 tool list/count 与静态 system 方法文本差异不能只改数字或字串：T920 明确业务方法迁管理 Skill、同有效快照运行，需验证真实方法读回与同权限工具集合，仍保原工具/业务反例。
