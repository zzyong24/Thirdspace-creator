# 完整转写后处理回执 JSONB 顺序守卫修复候选（未应用）

真实 RED：`backend-transcribe-jsonb-receipt-real-red.log`，正常原输入执行真实 Worker→宿主/PGlite→OpenAI ASR adapter→真实 reserve/start/settle→可选后处理合法无配置回执；保存报“后处理最终正文与原回执不符”，原 succeeded 预期实际 unknown_result，未调断言。

安全白名单实测：DB raw `keysFrozen=[reason,applied,transcript]`，`post.read` strict schema解析 `keysParsed=[applied,transcript,reason]`；Node `isDeepStrictEqual=true`、`JSON.stringify equality=false`。没有输出正文、凭据、用户来源或模型私密配置；fixture只使用合成隔离对象。

正式字段形状 `contract/src/internal/execution-worker.ts:285`：applied=true分支严格 `{applied:true,transcript:string}`；false分支严格 `{applied:false,transcript:string,reason:string}`。整个结果都须相等，正文、applied标记、reason、字段缺失或额外字段不得跳过；actualEngine与数组**不在此严格结果schema**，不能造新业务字段。实际模型identity在独立冻结plan（schemaVersion/capability/model/apiFormat/baseUrlDigest/customEndpoint等）上由真实 postprocess/preparation 深相等守卫；数组顺序在当前原 awemeIds binding 深相等校验，不能顺便改为集合比较。

唯一拟生产写集 `backend/src/modules/execution/execution-transcribe-workflow.service.ts`：新增Node内建isDeepStrictEqual import，原 `JSON.stringify(frozen)!==JSON.stringify(post)` 替为 `!isDeepStrictEqual(frozen,post)`。保完整对象类型/字段/嵌套/数组顺序，保原 error、same tx、owner/workspace、fence、lease、取消、postprocess read/frozen回执和已收费调用门，不增任何状态或schema。准确未应用patch为 `JSONB_RECEIPT_GUARD.patch`。

现行同源依据：旧已批准母R03“只恢复已确认事实/完整回执”、`execution-transcribe-postprocess.service.ts:139/156` 已用同Node isDeepStrictEqual校验冻结identity/原完整request；`execution-transcribe-preparation.service.ts:36/58/63/64` 验真实identity/plan/input，`transcribe-execution-binding.ts:15/26` 比原awemeIds数组顺序。无需新母R05a/通用比较框架或canonical字符串序列。

验证候选：真实正常jsonb键重排→全Worker原始成功输入GREEN；真实same tx post.read对应结果被篡改正文/applied/reason/字段缺失→拒绝保存，0新产物且原已settled ASR不重发；结果inject actualEngine/数组额外字段的严格schema拒绝（不声称schema含这些字段）；现原awemeIds顺序篡改与冻结plan model/engine identity篡改由真实binding/prepare拒绝，0新模型/产物。所有负例保完整守卫，不只比正文。原30转写入力和未裁决终态预期继续保，修该等价守卫不能说全部产品已验收。
