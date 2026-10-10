# ASR 显式配置失败的后续正式来源核对（未修改代码/expected）

前一报告把真实invalid-cloud的local调用1次判断为DEC-ASR022实现缺陷，需要更正。按时间与现行批准链继续追踪后发现T768已经明确变更该语义；现阶段不得据旧DEC修production或把R05a draft当依据。原RED与原expected均保。

| 来源 | 原批准语义/当前事实 | 对本例的含义 |
|---|---|---|
| DEC-ASR-022，2026-07-31，orchestrator/DECISION_LOG.md:2001 | 无云配置→Whisper；显式无效云配置诚实错 | 是旧新增反例采用的来源，不能据此忽略后续批准 |
| T768，2026-08-11，SPEC FR76801 | 无配置、不完整/已保存供应商不可用、渠道票据/签名/lease解析失败都丢弃线上路径→本地一次 | 真实配置解析失败没有线上调用/未知收费，不应阻断本地 |
| T768 SPEC §3.1 | resolveTranscribeSpec捕获所有在线/渠道配置解析异常，不能只捕获未配置 | 修改genericcatch成fatal会违反该后续条款 |
| T768 FR76802/AC76804 | 每音频线上至多1次、本地至多1次；不重领lease/换key/使用坏在线配置 | 应保不出网/不伪造可信model/同音频原账本/不二次申请的真正安全反例 |
| T768 review current | round3/3 PASS，SPEC f0771cc886f5…，receipt3eb18966ea59，old findingsresolved | 读取现文件真实事实，不冒称该历史receipt是本轮新审 |
| 当前母R01/03、prepare原guard | frozen云plan或已有calls不可随意换身份；未知收费/ACK/取消不新submit | T768配置fallback仅在未固定实际云plan/未发生调用的阶段，不重放未知线上调用 |

现真实生产位置：multimodal/resolve.ts末resolveTranscribeSpec genericcatch注释T768并返回规范local；execution-transcribe-preparation.service.ts:36初次resolve genericcatch仅在无initial.plan且非AsrExecutionControlError时local；已有initial.plan或控制异常继续抛。identity解析catch:53同样仅首次无plan可local；其它配置冻结/input/lease/fence及已有calls门不动。本例prepare.resolve抛TranscribeConfigError，未线上reserve/start，安全选local成功；不是把不可信线上配置发出去。

最小恢复候选是**test-only**，不是production修复：仅transcribe-runner.test.ts同原F7-a输入保持完全未配两音频分支，invalid-cloud分支按T768证明fetch0/按次prepareSpec0、pipeline1、保存真实本地正文、原账本仅local1settled、用户task succeeded、数据库不含坏云凭据。保未知/取消/已有云plan不fallback原integration反例。为精确证明后续解析真实来源，可注入真实resolveTranscribeSpec+合成channel resolver失败，返回规范local，或直接使用当前真实preparation初次配置失败路径并核同audio digest；不得绕production控制guard/重放旧循环。

需主控确认允许按该后续正式来源迁原断言，未确认前12FAIL仍准确包含此项。不创建新cycle/正式review、不借T915draft、没有production patch/write_set。真Mac/Windows本地推理仍待验。


主控随后完成独立只读来源裁决：原3轮事件hash重算匹配，现SPECf0771…/round3 receipt3eb18966ea59一致，T768明确覆盖旧DEC022；报告Growthcompletion/creator-asr-fallback-authority-independent-review.md。主控仅授权原30库存F7-a bad配置test-only按后续已批准语义迁，历史approval不冒本轮新正式PASS。实现仍只有该test，同音频实际local1、fetch0/按次prepareSpec0、原artifact全文/真实settled账本/冻结whisper-local identity及不采坏token；未知/取消/已有云plan guard原样保。无production fallback/terminal改动，最终数字按回归真实日志更新。


最终原5file170重跑backend-five-approved-t768-final-red.log：3file通过/2失败，137通过/33失败（chat22+转写11），58.60秒exit1；F7-a按后续批准语义已通过，原未知/取消/已有plan守卫不变。backend-approved-t768-final-typecheck.log exit0。第一次新增账本断言误写asr1的FAIL完整保，按真实execution-asr-ports:17/durable:35的whisper-local稳定local-asr1校准；这不是换新operation或production行为。
