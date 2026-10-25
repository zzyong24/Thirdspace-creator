# T-1413 独立代码与聚焦证据终审

审查结论：**PASS，限本次冻结的实现、六条守卫迁移和聚焦执行证据。** 未发现需要阻断这份实现的新缺陷。FR-141306 官方同步图片正向恢复仍为 **NOT_VERIFIED**；此结论不签署整项需求完成、官方 Pi 402 解决、全工作区检查或发布通过。

审查者：独立子代理 `/root/t1408_pi_diagnosis`。审查日期：2026-10-25。没有参与本次产品、测试或配置实现；本轮只读源码/证据并写此报告，没有运行测试、full、真实 CLI 或模型请求，没有读取用户凭据/数据库，也没有更改控制面。

## 审查对象与冻结身份

- 工作树：`/Users/zyongzhu/.codex/worktrees/t1412-full-validation/Thirdspace-creator`。
- 分支：`codex/t1413-lesson-semantic-coverage`。
- 基线与冻结 HEAD：`c00cef1c3f5a60f57f96aa6f85f09906d1274f81`。
- 依据：当前 T-1413 任务包、SPEC 与独立规格 PASS `2a5f6be66c40`。范围为 3 个封面生产文件、10 个新增/扩展测试、6 条 lesson check 和相应证据。
- 冻结时间：`2026-10-25T08:46:19.718269+00:00`。
- `implementation-freeze.json` SHA-256：`15218cd529aa6ba657b5c38ef2fe1fda34c8de160d8377c351155fb8bcedef03`。
- `coverage-index.json` SHA-256：`5e787976ab34113a9b41cffe4b2898eea21c94bced84d7f5322d34acdc116a95`。

独立重新计算了冻结清单内 **14 个源码/测试/配置文件、74 个证据文件** 的哈希，全部匹配；逐文件覆盖索引中另外列出的 39 个测试源文件也全部匹配当前内容。没有以 HEAD 代替未提交内容的哈希。

## 生产与信任边界

1. `chat-cover-task-host.ts:24–33,47–65`：每次准备前经原租约读取冻结宿主上下文，核 user/account/group 和原工具定义。必需参考只由冻结 `cover.publication_reference` / `cover.reference` 路线决定；模型原始参数先克隆、再按工具 schema 解析并按白名单重建任务输入，不能自报内部标记。缺 ID 在读稿和提交前拒绝。项目仍来自宿主，模型不能换项目。
2. `cover-business-adapter.ts:9–17`：只接受布尔 `true`，将内部约束写入冻结 `__coverContext`；原任务全部 inputData 和 projectId 继续进入 `__coverTaskInputDigest`。没有新建第二套输入真相。普通旧任务没有标记时维持旧语义。
3. `execution-cover.service.ts:85–135`：必需参考和原精确文件约束均拒绝缺失、空字节及读失败；API 图片能力和 MIME/大小校验不会静默换成纯文生图。参考的 checksum、原模型回执、sourceDigest 及完成前二次账本比较仍有效。已有准备回执沿原源摘要回读，重复准备不会创建第二份图片输入。
4. 已读必要依赖：`chat-host-context.service.ts`、`cover-execution-binding.ts`、`asset-generation-modes.ts`、真实 persistence 装配和 assets 读取服务。宿主上下文与业务任务/历史摘要相配；执行绑定继续校验业务、租约及 workspace。引用字节经原 owner/workspace 读取；图片启动前再次校验原 checksum/MIME，不接受 Worker 任意换图。
5. 候选边界未变：封面宿主只提交原子子任务；适配器不能把文案直接作为封面完成。素材仍走原候选/采纳服务，新增元数据测试核对重复保存、恢复和采纳只保留一份素材/链接及 `addedByType=ai`。

本次没有把已读到的同账号素材选择语义改成新内容规则，也没有将普通 legacy Asset 参考的原降级分支取消。该边界由原宿主路线与已有读权限共同限定。

## 预审问题的关闭

- **Codex 参考大小兼容**：最初将通用 `referenceImageAllowed` 提前，会把原 Codex 30 MiB 收紧为 20 MiB。冻结代码仅对非 Codex 凭据执行该通用检查，Codex 仍使用原 30 MiB 上限；25 MiB 通过、31 MiB 拒绝的精确文件回归已收集并通过。
- **父取消不能变成业务冲突**：严格读取 catch 现在先执行 `signal?.throwIfAborted()`，保留父取消原因；对应测试按对象身份核对 reason，并验证不解析模型凭据、不保存准备结果。
- **Pi 测试参数观察位置**：早期测试把 SDK execute 的空占位当真实参数。冻结测试补足 `tool-input-start/delta/end`，在最终消息工具输入与第三轮模型 prompt 两处断言 `referenceAssetId`，同时验证前两步强制 publications/cover、工具名称规范化、第三步恢复自由。已对照真实 Pi 宿主参数权威协议；未修改生产协议来迁就测试。

## 六项语义覆盖

| 范围 | 已核对的实际证据 | 边界 |
| --- | --- | --- |
| FR-141301 / LED-014 | assembly 与局部改稿宿主保原版本/段落/原文锚点；真实 Worker 4 项覆盖 success、unchanged、lostAck、crashAfterPatch，回放仍一条工具记录和一份原版本候选 | 复用现有正式链测试，未重建退役 runner |
| FR-141302 / LED-017 | 来源准备保完整正文、长度与 SHA；授权节点保最新指令；坏 ref/伪锚点/截断/未授权拒绝。真实 Worker 8 项覆盖授权、原子子任务、丢回执和崩溃恢复 | 未授权零子任务；不以摘要或模型重抄替代原文 |
| FR-141303 / LED-020 | 宿主 8、适配器 3、参考执行 14、Pi 协议最终 31 项；严格失败不保存/不降级，普通 legacy 和精确文件保持兼容 | host/adapter/执行服务为分层测试；Pi 参数另在真实 core 消息投影核对，不冒充线上模型验收 |
| FR-141304 / LED-023 | 正式普通正文入口超时/父取消/迟到 3 例证明 provider 收到 abort、无保存/成功结算；新增真实持久 continuous 个案核 superseded、retry_wait、同 executionTaskId、deadlineAt=null，并沿原 task 再领取 | 单次 180000 ms 上界通过受控 timeout signal 触发，未缩短生产值；持久语义使用真实表/账本/outcome，未用旧有限预算 fixture 代签 |
| FR-141305 / LED-036 | 素材保存回读保服务原文/画面职责；重复保存/恢复/候选提交不复制；实际采纳后的 materialLinks 保 AI 来源 | `addedByType` 在真实链接表验证，没有往 assets 虚构字段 |
| FR-141306 / LED-045 | loopback HTTP + 原 Worker IPC + 持久账本验证受管标签和自配网络未知各仅一次提交，重启不重提，0 素材/候选；正式 cover 复用已结算文案、原参考和同 key | **仅 unknown 安全路径通过。当前官方线上幂等资格与 1s/3s 正向恢复未证** |

`ai-worker/src/execution/asset-worker-run.ts` 已按字节与 `c00cef1c3` 比较，完全未改；SHA-256 为 `8a070521270ec5117078ed1f4b783830aa557d4e7fa52d2d9672ce9e91efb055`。本地 HTTP、受管标签和旧 DEC 均不能证明官方服务端同 key 不重复生成/计费。资格报告继续有效，没有启用新重试分支。

## 配置守恒与逐文件证据

独立比较基线配置和当前配置：55 个 lesson 的数量、ID、顺序、what、onFail、T-1412 timeout_ms/buffer 及所有其它字段完整保留；**只有 LED-045/014/017/020/023/036 的 check 改变，其余 49 条逐值相同**。六条中原有效路径都保留，删除的只是六处已失效 token，并追加已批准正式链覆盖。当前配置 SHA-256：`c8c13b6788b08f48aa4f154bcbdd0d1f74cf72a0e3e4863788e9b4aaa9cb8ffc`。

独立从当前六条 check 解析出 39 个去重路径，与 coverage-index 精确一致；每个路径都存在、收集数大于 0、全为 passed。将每文件的完整测试名逐项与原 Vitest JSON 和 receipt 对齐，并检查原日志 SHA、argv/cwd、开始结束、exitCode=0、signal=null、timedOut=false。全部实际 Vitest 命令带 `--retry=0`，JSON failed/pending/todo 均为 0。去重合计 **1169 项**，不是把重跑或多个 lesson 共享的同一文件重复相加。

| 最终聚焦回执 | 文件数 / 通过数 | 计数说明 |
| --- | --- | --- |
| cover-freeze-final | 3 / 25 | 冻结封面行为 |
| backend-safety-final | 3 / 83 | 素材结果、continuous、真实 IPC |
| backend-existing-lessons | 12 / 551 | 包含真实 Worker patch 4 / draft 8 |
| frontend-lessons | 13 / 363 | 原前端守卫路径全部保留 |
| worker-final | 7 / 143 | 其中 Pi 文件 31 项由后面的最终版本替代 |
| worker-material-match | 1 / 4 | 保留原 material.match |
| pi-protocol-final | 1 / 31 | 增强参数投影；替代计数，不额外叠加 |

这是对有效子路径的去重聚焦执行，**不等同于原样串行执行全部六条复合 shell 命令，也不等同于 full reconcile**。各文件完整名册与原日志/回执引用保留在 `coverage-index.json`，本报告没有把多 filter exit 0 当作收集证明。

## 红绿与静态检查的诚实边界

- 正式生产 RED：`cover-red` 为 22 项中 9 项行为失败、13 项通过、exit 1；失败分别是必需参考缺 ID/读失败/空字节/不支持/MIME、宿主严格标记及冻结传递。随后 cover-green 22/22，兼容与父取消补充后最终 25/25。
- `worker-new-first` 参数观察错误、`worker-safety-green` 空 skills fixture 违反现有 schema、`metadata-continuous-first` 把 AI 来源断言到错误表，均保留原失败回执，但不列为生产红测。修正测试后通过；没有为这些测试改 Pi、图片恢复或元数据生产行为。
- 初次 backend/worker typecheck 的测试类型错误保留原 exit 2；最新 `typecheck-backend-final` 与 `typecheck-worker-freeze` 均为自然结束、exit 0。未从日志最后一句推断成功。
- 最终 diff-check、boundary、semantic-boundary 均 exit 0。boundary 仍有 **5 条旧基线**，结论只是无新增；不写全仓违规清零。
- timeout-policy、全工作区 typecheck、原 8 组及 full 对账由主线程统一核验。本报告收口时主线程已报告原 8 组 exit 0、无剩余进程且源码未变，全工作区 typecheck 仍进行中；本审查没有独立审核这些外层结果，不提前代签。

## 冻结文件 SHA-256

下表是本次签署的精确内容；任一产品、测试或配置继续修改后须重新核对对应差异与验证。

| 文件 | SHA-256 |
| --- | --- |
| `backend/src/modules/ai-runtime/chat-cover-task-host.ts` | `882e0710d405a25c230cce7753270a65d4171b1c6018b99d254c5fe6ac7ceda4` |
| `backend/src/modules/ai-runtime/cover-business-adapter.ts` | `a51a72439b4fedaaba78328a75d249d77bbd767d31926cf331cab56768e9266f` |
| `backend/src/modules/execution/execution-cover.service.ts` | `d5a6734f3b0e068ffddecdf802f001612d5f4a79ab5ebb0d3ebbcdc18db516bb` |
| `backend/src/modules/ai-runtime/chat-cover-task-host.test.ts` | `cdaff86ce72a82bfe973d8385b12a718bdbe8b03777c2cdb08890c6436a6740e` |
| `backend/src/modules/ai-runtime/cover-business-adapter.test.ts` | `72b6d67c389806e9dfb5feaf832a24a7ec2d948cf84603f72f7a959a7fdbd1a4` |
| `backend/src/modules/execution/execution-cover-series.test.ts` | `99fb757596520dc872630043bd69a63c9c40d5034f12bbb363e7186a1907aa1b` |
| `ai-worker/src/runtime/chat/chat-pi-loop.protocol.test.ts` | `beaf4c40e81a3f61cfa3e0c59acff18aa5b0dede7b151d577ab727c42ba850cd` |
| `backend/src/modules/execution/execution-asset-result.service.test.ts` | `920ff80fe37034d9eb01720d97b724be4aa29646639378bc273d256255fa5946` |
| `ai-worker/src/execution/intelligence-generation-worker.test.ts` | `56c2b90b557603abf7dbb3a01e0384d9038d410b91f3a0977016cf93ed857aed` |
| `ai-worker/src/execution/asset-worker-run.test.ts` | `0aa79cc209690ca73b26f17429c8f53a2038ef67e4250ec940c3f9105178b5de` |
| `backend/src/modules/execution/asset-worker-runtime.integration.test.ts` | `03326f2d87bf0d5a3c4698c35a000499ed9609b7ed956b7246b10e1c5a8786f3` |
| `ai-worker/src/execution/cover-worker-run.test.ts` | `ce4901cf0686c9f2d6b7f0f2cec2ca8e2cb05842bd9bcf0ccce03e1a72dbe7d4` |
| `backend/src/modules/execution/execution-worker-outcome.service.test.ts` | `66a591bb8459ce586639d27d50b27acf86d5536bb51a8082178f0e4c3d8e8134` |
| `orchestrator/process/reconcile.config.json` | `c8c13b6788b08f48aa4f154bcbdd0d1f74cf72a0e3e4863788e9b4aaa9cb8ffc` |

## 尚未完成的验收

官方同步图片正向恢复、官方 Pi 402 的现场复验、原 8 组/full 和发布验收没有由本报告取得 PASS。FR-141306 的 unknown 安全覆盖已收集，但不得据此将正向恢复缺口销账。主线程仍须按真实结果处理未过项，完成后再决定任务状态和推送。
