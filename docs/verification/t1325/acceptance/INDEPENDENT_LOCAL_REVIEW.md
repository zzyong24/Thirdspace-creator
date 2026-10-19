# T1325 独立本地结果审核

本轮独立核验未发现局部实现阻断。仅签下述受测源码和受控证据；不签整任务、新包、40功能/56 routekey 父矩阵或真实供应商通过。作者 C 已冻结并释放 implementation；审核 B 只读源码与原件，仅新增本文件，没有运行测试、HTTP 或模型，也没有修改原报告、索引或控制面。

## 实际改动与权限边界

生产只有 `backend/src/modules/creative-results/creative-results.service.ts` adopt 原两行 readiness probe 被原 `cellFor` 静态匹配及 `cell.owner === row.owner === adapter.owner` 替换。原 cells/rows 没有第二矩阵，未 catch 错误放过；same body/key 的已有 receipt 仍先返回。可写工作区、真实 output/owner、candidate 状态/值类型、版本、来源、媒体文件、原 owner adopt 与 CAS、最终 receipt 存储保持。generate、能力目录与 retry 原 probe 未改。

实读七个 adapter 消费者与 root 组合：文章 text/structure、图文 text、output_script、publication text、article media、graphic media、publication cover；root 仍组合文章/图文 text+media、publication text+cover。未删除 owner 端的 kind/绑定校验：文章 sections 仍需实际结构任务及 articles port，publication cover 的真实 service 缺 assertCoverAssetFile 仍明确拒绝；output_script 合法静态 kind 由原 cell 限制。采纳无需当前生成 readiness，并不赋予不存在 adapter/port 或不支持 kind 的新能力。

## 来源与退出核验

实际重算 OUTPUT_INDEX 三列：1355 files、1 productionSources、3 tests，全部 bytes/SHA 匹配；report 与 index 自身也匹配交接 SHA。额外逐件核 red-v1 66 件、green-v1 67 件、green-protection-v2 71 件、backend-final-v5 72 件、两个最终 type 各 74 件事前快照，均无漂移。red-v1 与 green-v1 主测试 SHA 相同，生产分别为 b794d931… 与最终 991f0759…；新增 article text owner 只读源晚于原 RED 的限制保留，不追签原 RED 已锁。

| 实际 run | 自然结果 | 秒 |
|---|---|---:|
| red-v1 | 两条独立完整链均在采纳 probe 被 MODEL_NOT_CONFIGURED 拒绝，exit1 | 28.175 |
| green-v1 | 原主测试两条通过，exit0 | 29.210 |
| green-protection-v2 | 加强后两条通过，exit0 | 60.265 |
| backend-final-v5 | 两文件 23 PASS，exit0 | 97.058 |
| frontend-type-v1 / backend-type-final-v3 | 均 exit0 | 91.623 / 87.146 |
| boundary-v1 / semantic-v1 | 均 exit0 | 1.357 / 0.783 |

完整主链分别为文章 image_card 与图文 reference image.edit：真实公开 compositeTransport、生产 prepare/dispatcher/ledger、原 immutable execution worker、受控 Codex native 进程协议、真实新 owned 库/媒体文件；文案/图像两个 model call 均 settled，execution succeeded、AI awaiting_confirmation。公共文件 URL 经真实 blob GET 返回 200，真实 PNG 解码为 2×2。随后仅该 owned root 当前 text/image 改未配置 official，原合法候选仍采纳并在真实 article/graphic owner 读回，原正文/结构保留。重复原 body/key 的 receipt、全部 calls/results 严格全等，媒体目录不新增；换 key 拒绝，未配置下新生成仍拒绝。每族另有 11 项采纳拒绝及恢复原行，不与 worker 链数或 backend 23 项相加计总数。

后端新增七个实际 owner 组合包括 article title/sections、graphic title/cardBriefs、output_script、publication text/cover；sections/cardBriefs 独立验证正确结构写回、错误值类型、foreign source/version 和原 key 重放，未由 title 互签。原四个 media 组合覆盖 article/graphic × legacy/pure group 的真实 owner 保存/回执/CAS 恢复。辅助生成结果和 readiness 只在原端口受控；publication-cover 的 asset/file/download 端口是 fixture，不能称真实 PNG、真实平台登录或外部发布。generate/retry 零新提交的独立 probe 对照属于受控 service 测试，不冒完整 worker 重试。

## 保留失败与适用限制

15 个 run 的原自然 exit 均核对，未把它们合成一条全绿命令：green-protection-v1 两 FAIL 是测试错误导入 accountGroups；backend-v1 为 19 PASS/1 FAIL，其 publication-cover unknown kind 先被原状态门 CANDIDATE_NOT_READY 拒绝，不能称命中 cellFor；后续 targeted 与最终全测分别保留。backend-type-v1 exit2 仅新测试类型错误，原件保留；最终类型通过。主链合成 status/credential/RPC、空 CODEX_HOME 与 0 真实外部模型均在测试明示，不称真实 Codex 可用性或真实图片质量。

统一 wrapper 将 backend/CLI 的 testTimeoutMs 字段也记为 1h 的元数据限制已独立核原 BUDGET_METADATA_LIMITATION 与事前 config/it：完整 worker it 为 3600000ms，backend 辅助实际 120000ms、hook 180000ms，外层 86400s；不改历史 JSON 追签。原较短 backend 预算仅上调，业务断言未删。

这些 run 的 dispatcher SHA 为 91f1ac7402e6567b8c254769b2c3202e4ffe4e6d04f7c6e1ff2b7f350ceb08db，当前证据不签 T1323 未来增量。两阶段媒体走非 chat model 执行，未调用 chat checkpoint 新分支；后续若只改该分支，应按真实 diff 决定证据复用，不能冒新包已经验证。

统一 timeout-policy Gate 尚待 C 最终独占执行；新包真实供应商生成候选后配置不可用仍可采纳的功能验证尚未发生。旧 UNKNOWN 首因仍 UNKNOWN。原 RESOURCE_CLEANUP 保存 15 个 owned PGID 无 live、逐 case stop/dispose；本次普通 sandbox 的 ps 被拒后，经授权只读升级检查原 15 个确切 PID，输出为空/exit1，未发现存活，未操作任何进程或两个 controller。原有限握手值秘密扫描记录已核，不扩大为全域秘密保证。

## 精确最终绑定与释放

- 生产 `creative-results.service.ts`：991f075918faadb6d38f83ed5a36bf85469204f0883286cae4ecaed7fc6541f2。
- 前端 `creative-result-adoption-readiness.persistence-client.test.ts`：326b0eccb14db9c4b88856f06bdbbcbfcb5bd413529b4f2761b77db0abb14203。
- 后端 `creative-results.integration.test.ts`：6fa3aa903ae273c070fa13a50673d58377f572a7b21ffb18b36afe580805e362。
- 后端 `media-adoption.integration.test.ts`：08f1609dc421d4e1ec4185f7387f566ac300d6f0991c299aca886f8b5d537f40。
- IMPLEMENTATION_RESULT.md：33beabd8a1de3f930ae4cdc7fd57a61f905349a9f57fb689e487c95dbd468002。
- runtime/OUTPUT_INDEX.json：0baa73a6c5545188170d11204754f4eabb18accfc2541e2758857fc8538092b5。

本独审文件是索引冻结后的新增产物，不冒已包含在原 1355 项索引中。完成后 RELEASE 此唯一文件写权，后续集成、统一 Gate 与父任务裁决交 Root/C。
