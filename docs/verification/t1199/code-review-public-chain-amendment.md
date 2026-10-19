# T1199 公开链闭合增补实现只读复核

结论：PASS（此前4项已按合同关闭；仅代码复核，不代表公共HTTP/安装验收）。仅代码当前快照判断，未执行新测试/Gate/安装，未修改仓库/控制/Git。

## 已核修正

- proof 原 user/group/member 守卫先运行，然后仅证据 port 得到 {...ctx,accountId:target,membershipVersion:actualMember.version}；原 ctx 对象不突变。跨组仍在任何证据调用前拒绝。新增单测模拟旧 port 的 ctx.accountId 等值守卫，测选A读B实际版本1，跨组零追加调用。
- getHistoryClient 只在实际 accounts member.status===archived 时切 accountId=null；未知成员保原账号 header。仅 latest 和详情 client 使用它，详情 runs/getRun/steps 全沿该只读 client；toggle/create/update/runNow 全用原 getClient。既有 shared nonnull 保原目标，只有该成员归档时用纯组读。
- 根 route 的 group key 与 parent alive/accountRef/detailEpoch 保切组卸载不刷新新组，读 effects 包含实际 client 依赖及 active cleanup，默认空 accounts 已提稳定常量，避免 callback→effect→setState 的空数组循环。服务器新 props 引起一次真实重新读取可接受，不属于循环。
- toggle catch 仅原 job.id 存真实错误，同scope/alive才回写；失败不 refresh，controlled 开关仍原值，finally清pending。重试先清当前行旧错误，其他行错误不混淆。原header拒绝不被纯组写绕过。
- formError 新开与明确提交清空，已结束的失败不带到下一目标；当前失败保输入。
- groupPromise/accountsPromise 立即附成功/拒绝处理，最终错误照抛；任务列表失败也不会留下已启动的组/账号 Promise 未处理 rejection。

## 表单生命周期更正与可增强项

初版复核漏看 CreateJobDialog 的 Dialog Root 实际 onOpenChange 消费者：`if (!submitting) onOpenChange(v)`。因此顶栏Close和Escape虽然仍触发 primitive 事件，但提交中被该控制消费函数拦截，原报告所称用户能通过顶栏关闭并重开另一目标的实际公共链反例不成立。原错评按原字节保存在 code-review-public-chain-amendment-initial-reviewer-error.md；已通知 root 撤销该 FAIL，不能偷偷将原错评覆盖当作未发生。

生产切组还有 route group key 卸载，旧 parent alive/accountRef 保护；React 卸载后旧本地表单 setState 不会写入新组件。外部 props 强制关闭/重开同一实例时仍可增强 form epoch/alive，确保旧 success 不关新表单、旧 error/finally 不改新表单，这是通用组件生命周期防护，当前不可作为已有用户合法顶关闭失败的证据。root 已提出保原 submitting 控制并加这项保护与 deferred 外部关闭重开测试，允许依当前授权继续；实施后应核新提交pending不被旧finally清除、输入不丢、请求目标始终原冻结且不自动重发。

## 公开链证据仍待

纯组真实守卫代码支持（上一增补SPEC报告已核）不等于已完成HTTP验收。root正在补的隔离HTTP应含 runslist/get/真实AI steps，同用户异组/异用户拒绝，归档写header仍拒绝。parent报告的2文件23PASS、backend23PASS是转述，未冒充本审计独立运行；原RED、selector失配、首次空数组循环保留。

## 快照

时间：2026-10-10T21:11:57.321923+08:00。

- `docs/features/t1199-bound-platform-scheduled-visibility.md`：`f72d00d833efbf9394f9d65a89ad1d6989e761de4b2ae61b74d5a15906ad0b72`
- `backend/src/modules/platform-account/platform-account.service.ts`：`ada9f6f2b51fe80baa4c6267fe7a4e13666f769185720c24652852395fb1a599`
- `backend/src/modules/platform-account/collection-plan-readiness.test.ts`：`5d1f1c9a2a5b307ede72efc43057e7038a36dcc37f515c93d354c83a6ea8680f`
- `backend/src/modules/scheduling/scheduling.service.test.ts`：`db115b97f2b0183ddc5924d9d75099924d6421bbb100b821574d380127b65a4e`
- `frontend/src/features/automations/automations-page.tsx`：`79cfb995df8f7e0e0213ee1bcd20ce94041dabbc6a8491e35d0db8ca5a813a66`
- `frontend/src/features/automations/automations-island.tsx`：`6b602ecaf4d2c04753f9d7f8e6f42471e04e3951d885b081a5d6aa5ef1e2f2e9`
- `frontend/src/features/automations/automations-group-scope.test.tsx`：`c0ad6a9140cda90dcea1cc3c603b31cdf3df206ddb43ad45668ff62818e3e603`
- `frontend/src/features/automations/automations-edit.test.tsx`：`fadc75c3bb75e71dd6087d09e3968d83aff08240997a6b3b419ac4ed519e74de`
- `frontend/src/components/ui/dialog.tsx`：`ef0a8b1da82a5079c59979e364c69cd7051e6c6992cea5ffaf02530b6566f2e5`
