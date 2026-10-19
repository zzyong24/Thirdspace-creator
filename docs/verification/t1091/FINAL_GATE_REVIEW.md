# T1091 当前 Gate 独立复核

## 结论

T1091 当前九个实现与新增测试文件可以冻结，并可进入用户已授权的固定本地打包入口。该结论限于本任务实施、专项回归和源码冻结资格；不表示任务完成、安装验收通过、真实 Codex 成功、原生 UI 可用或全仓全绿。

扩大回归的两条失败已经用旧 main `fae2d1f595b70a45d3c8b40c424c035150f5a851` 的隔离源码当场复现为相同失败，属于既有联合创作测试对可信工具回执投影的解析漂移。失败被完整保留并登记 T1092；T1091 没有修改该旧测试、投影协议或正式消费者来制造绿色。

## 当前源码与专项结果

`docs/verification/t1091/evidence.json` 记录的九个文件 SHA256 已逐项与当前工作树复采，九项全部相等、零漂移。实施独立复核 `IMPLEMENTATION_REVIEW.md` 的 SHA256 为 `0cc5ef26f88cc59c9b188757c090c979d919330e00f9e5b1beb2ebdbbc967301`。

三份新增测试的当场 RED 合计为 52 FAIL / 20 PASS；修复后新增测试 72 PASS，与相关旧测试同跑共 97 PASS。当前证据继续支持：严格公开 schema、Pi/Codex prepare/submit 同值、真实会话项目绑定、source:user creation 守卫、public-request 内部补齐、纯组与同组账号边界、四族原目标 reader、摘要/CAS 和失败零孤儿均已覆盖。

原完整 Worker 两文件实际 8 PASS、exit 0、日志 SHA256 `f33729e4006d5371d2a11141ea817d79415dfb5301bae1821b35033d9171ed7b`。这是既有真实 Worker/工具/owner/账本协议回归，模型仍为测试协议夹具，不是联网 Pi/Codex。

类型与静态门均实际 exit 0，且 JSON 声明的日志 SHA 与日志文件逐项一致：

- contract type：`d819a6e1f78b2951433132e182dffbbd1eaa881e6c535db02871314377997331`
- backend type：`931327292db1bbff62320abd8dd57032ae19ad39b9e012d04233dc49d716637b`
- frontend type：`4c0cd880abe2a1a1a1f20e2f9d2825951e19ae4e848a3f36d2216d3b9e20d035`
- boundary：`21063424253db0601ff571f39f0474072b3476d34ee10a8920361b20db642f24`
- semantic：`b972b2b1d6a12435c4034d60290afc2db036e5e439f96cc3f617e5e78a476923`
- orphan：`ee3224654cf1b13b1bcd3948dd942050a0435380b5b2a84bbb61e9058d056b0e`

打包基础四文件测试也已实际 45 PASS、exit 0，日志 SHA256 `e4330303032be3ddc926e933cf913133eb629e4d46187dbcb9957255b2bcd0a8`。这只证明固定打包入口的基础测试当前可用，不代替真实构建、DMG 字节核验、安装或启动。

## 两条扩大回归失败的归因

当前扩大回归运行八个文件，共 156 例，154 PASS / 2 FAIL，日志 SHA256 `c16fa3f53c2f9176082d6a18c07b57a206ff11ea4d3d1c69668d5cc3cb270be8`。两例都位于未被 T1091 修改的 `backend/src/modules/ai/work-creation-chat.integration.test.ts:104`：测试直接把消息 part 的 `output` 交给 `workCreationProposalResult.parse`，但该 output 是带 `__creatorosOutcome` 的可信展示回执，严格业务 schema 因额外字段拒绝。

隔离反事实使用 `git archive` 提取旧 main 的 contract/backend/ai-worker，并让临时 workspace 依赖明确指向该源码。原四例真实结果同为 2 PASS / 2 FAIL，错误发生在同一行、同一 `__creatorosOutcome` 字段；基线日志 SHA256 `e49dfb803f36a9370117490b3c64098f7b3f77200641d0f6f870b48b9c5a815c`。比较记录还绑定了旧产品和旧测试 SHA，临时目录已删除，未建立 worktree、未复制或删除用户数据库与媒体。

正式前端消费者 `frontend/src/features/copilot/ai-copilot-content.tsx:2720-2739` 先调用 `readChatToolOutcome(part.output)`，检查 `blocksData`，再把 `outcome.data` 交给 `work.editor` 或 `work.creation` 候选卡。因此旧测试直接 parse 展示 envelope 与正式消费路径不一致。该静态证据解释测试漂移，但不代签页面点击或候选卡实际操作。

据此，两条失败不是 T1091 九路径引入的行为回归，也不阻止 T1091 当前源码冻结和进入本地打包。它们仍是实际失败，不能从汇总中删除、改断言洗绿或写成原回归全通过；T1092 必须独立修订和验证。

## 允许的下一步与边界

允许 ROOT 按用户既有明确授权冻结当前九路径，进入固定入口的本地构建、无备份安装和隔离验收。构建后仍必须核对源码提交、包内四类字节、DMG、安装应用、启动 HTTP 首页及动态 operation describe；随后通过公开入口验证实际 Pi/Codex 任务、原 ID/key 恢复、文章/图文/native/联合候选及回执。新候选只生成和回读，不直接改用户稿件或扩大采纳权限。

完整 reconcile 应在出包/安装阶段当场运行并与前轮 42 项旧债逐项比较。范围内新增失败须先修；范围外既有失败可以诚实保留，但不能写成全局 PASS。本报告没有签署完整 reconcile、安装版、真实 Codex、候选质量、native UI、用户签收或父 T1062/T1070/T1074 全功能矩阵。

普通浏览器受到 local application origin 403 保护的事实继续保留，不允许通过私接 cookie、连接文件或降低来源守卫绕过。真实用户稿件、图 401、平台扫码/采集/发布和凭据不在本次验证写入授权内。
