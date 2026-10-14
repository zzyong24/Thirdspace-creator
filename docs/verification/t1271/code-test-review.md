# T-1271 独立实现与测试读核

审查者 `/root/ephemeral_spec_review`，模型 inherited。本报告只读产品与测试源码、原日志和真实探针产物；本人未实施功能、未启动模型或 Codex exec，不建立新 SPEC 评审周期、不记录正式 receipt。记录时间：2026-10-13T08:18:40.396902+00:00。

结论：生产窄增量符合已通过合同。当前唯一回归失败可按原 signal 身份精确校准测试，不能删除失败或放宽原恢复、权限及零重放断言。新增临时会话丢失分支测试合理，补丁后的实际完整 GREEN 尚待执行，本报告不代签。

## 两处生产增量

已将当前 `codex-app-server.ts` 的唯一 `ephemeral:true`逆换为原 `false`并实际 SHA256 比较，结果等于 `shared-source-baseline.json`；将 ACP `newSession` CreatorOS policy 条件块新增的 `ephemeral: true,`行撤掉后，实际 SHA256 也等于绑定基线。这证明 T-1271 对两源仅修改已确认新建参数，没有覆盖 T-1261/T-1265 和更早共享修改。

原生 `runCodexNativeTurn`消费者共用参数，文本、结构化、图片、Agent与旧聊天路径覆盖。ACP临时标志只在有效CreatorOS policy下存在，两个受控profile覆盖；新增通用vendor测试要求没有ephemeral字段。TitleGenerator原临时行为保留。旧thread读、resume、backend结算回执、取消/usage/产物代码均未因本任务改变。

## 原实际测试结果及失败判定

原 `RED.log`：3个独立测试失败、57通过，分别为helper、原生公共thread/start与真实vendor newSession参数边界。日志中每个失败重复3份来自现有 retry x2；不能把这记为9个独立失败，也不能说retry0。ROOT报告修改两源后的第一次3文件60/60，本人未取得那次独立原日志，不将口述当额外已独核PASS。

当前 `GREEN.log`实际为4文件76项：75通过、1失败。唯一失败是 `codex-acp-worker-run.test.ts:261`的原恢复断言，期望3参数，而实际收到原RPC对象、原sessionId、原providerTurnId和第四个AbortSignal。该日志必须保留，本次不把它改写成全绿。

当前 `codex-acp-worker-run.ts:26`早已执行 `recoverCodexNativeTurn(session.rpc,reservation.sessionId,reservation.providerTurnId,signal)`。这属于T-1261原持久deadline恢复合同，T-1271两源增量未涉及此调用。因此将测试精确改成 `toHaveBeenCalledWith(expect.anything(),sessionId,providerTurnId,f.controller.signal)`校准当前调用合同是正确的；比只放宽为前三参数匹配更严格地核对原取消/期限身份。原三个对象/ID、最终callId、零prompt、零host、新会话不建立及close一次断言必须保留，生产恢复代码不应为了测试移除signal。

建议新增ACP会话失效测试：保原unknown账本与同call/thread/turn绑定，原恢复边界拒绝；公开runner应返回unknown_result，关闭原独占RPC一次，零createSession、prompt、host、执行工具及新回合。它验证已确认临时会话退出后不盲重发的恢复边界，而不是伪造缺失结果。现新增native恢复测试仅一次原thread/read、原工具零调用，与既有更完整runner结算回归组合使用；仅该helper层不能冒充backend unknown落账或真实模型恢复。

## 原生协议探针限度

已独读真实 `native-probe/result.json`、脚本及RESULT。锁定0.159.3 binary SHA `4d210f7c5a18fd0386434df23b5bdbb8c0e7257d3e8a2b30b0769c8bbe99a878`。记录显示两个进程实际exit0、stderr字节0，模型turn0、未读复制凭据0。第一进程临时thread响应ephemeral=true/path=null，同进程可read，无rollout；关闭后新进程read与resume分别报thread not loaded/no rollout found。

空持久对照响应ephemeral=false及非空rollout路径，但未prompt时实际也无rollout、list不列、新进程read失败。因此这次观测不能证明已完成模型对话的durable与ephemeral差异，不能签个人Codex Desktop历史页面或安装版CreatorOS效果。报告已明确命名 `OBSERVED_EPHEMERAL_NO_TURN_BOUNDARY`并公开该限制；此记录方式正确。没有将辅助SQLite/安装ID/技能等文件错误称作零落盘。

## 当场证据绑定

- `docs/verification/t1271/shared-source-baseline.json` SHA256 `8ccb5fffffde2c414277cf6ccfd07b58c750bfa1c2dc41bd15936f46ec51158b`
- `docs/verification/t1271/RED.log` SHA256 `f89af19747affd30c4317077fa1359f941ccf0427254c11a54a43b38788f29e9`
- `docs/verification/t1271/GREEN.log` SHA256 `69278762473dfbdf86317beaa85b860dff19c335589b0b77db0e897f1eb36e56`
- `docs/verification/t1271/native-probe/result.json` SHA256 `585c63ad3e3d5667fe366f65f462d8d2c17da8077e739dce5ca5833e3c49326f`
- `docs/verification/t1271/native-probe/probe.mjs` SHA256 `772cbbedcb1902ea79dbd8787c4bd55652b6343f2f7a8de102cd2df491d604f1`
- `docs/verification/t1271/native-probe/RESULT.md` SHA256 `f4cfea229db43f764068afb5a8d5c1c65cd66f048019880260edc0f161f55245`

当前独核源码：

- `ai-worker/src/execution/codex-app-server.ts` SHA256 `af38c7ede2f8c5a056a384f1d2e8a2433a0b7df7a53da125472c99134ce4105a`
- `ai-worker/vendor/codex-acp/src/CodexAcpClient.ts` SHA256 `ce295df842535835fa424f0cb8c3bb81d15624554246b9bf3c8150ba6f1b920a`
- `ai-worker/src/execution/codex-acp-worker-run.ts` SHA256 `49b442130ee20a7eb77464fc6353691260bc88908a3756db08c8057c6c078f96`
- `ai-worker/src/execution/codex-acp-worker-run.test.ts` SHA256 `58a515bd31d20c130da4587112bd0f15e2a32d98d4a3b373f0355cde918efefa`
- `ai-worker/src/execution/codex-native-turn.ts` SHA256 `cde306b3311304239e6e02a4ce9adf9d8a1aab4c56efd91d26f2576ccbdebc8e`
- `ai-worker/src/execution/codex-native-turn.test.ts` SHA256 `73a4c247e54c0154e3d6c92b65d00bff2dba772b1a63abc5aa1bb4babd149c04`
- `ai-worker/src/execution/codex-acp-policy.test.ts` SHA256 `f89945251afd9e67bde2f44a0c51970d177d7531deaf21fc77b54cd505eba9ca`
