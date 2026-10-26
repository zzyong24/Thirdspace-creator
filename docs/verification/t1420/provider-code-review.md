# T1420 真实 Provider 兼容分支独立代码复核

2026-10-26；只读独立复核，继承宿主模型的同构会话，未核实具体型号。本会话未实现该修复、未执行测试/模型/用户 CLI/浏览器/安装。HEAD `839d7f280282a0ae93bee79bcc9cdddb4dfff2ac`，结论绑定下表文件字节。

**本次增量未发现需修的代码缺陷。** 修复落实已批准的“无脚本但有保存图文正文或图片页，也可重组”结果；不代签修复包安装及真实模型产稿/候选采纳/UI体验。

## 生产调用链与边界

- 只读核实真实 `DraftChatRequestProvider.prepareEditorRequest` 调用 `prepareFresh(true)`，实际向已注册端口传 `requireScript:true`。先前工作台无 Provider 场景走默认 no-op provider，不能证明安装态这条分支可用；安装失败事实和此覆盖遗漏保留，不将前次组件全绿改称当时体验已通过。
- `graphic-post-workbench.tsx` 端口当前先处理原未知保存/脏稿，再读取当次 `latest`；新的 `hasCurrentContent` 来自 `latest.current.body` 或真实 cardBriefs 中非空 title/body，`hasScript` 要求 ready、真实 scriptRef、非空 scriptText。requireScript 为真时，仅在两者都无内容才拒绝。没有用 mount 时旧草稿或单独放宽 Provider 全局规则；公众号未改。
- 放行后仍读取同一版本 `exact`，检查 `latest.currentVersionId === current.currentVersionId`、exact.document 与 latest.current 完整 canonical 相等、当前 draft 与 exact 相等；目标 digest 继续从完整 exact.document 计算，原 savedBase/artifact/version 仍绑定。新分支没有仅凭文字存在就跳过原冻结校验，没有伪造 scriptRef 或写来源。
- Provider 自身仍检查 preparation epoch、注册 editor、generation、dirty、scope、回合 token 与一次性 prepared ticket。该修复只调整 graphic_post 对当前内容资格的判断，未删除这些守卫。
- 候选创建/采纳/保存协议本轮未改，重新组织仍是准备真实稿后打开对话；不能据此宣称真实 AI 输出、预览或用户采纳已经完成。

## 测试证据与实际限度

- 新正文/卡片两族用例实际挂载 `DraftChatRequestProvider` 与 `ChatPortWitness`，工作台的 hook wrapper 只保留记录端口并替换 openChat spy，未替换真实 prepareEditorRequest/prepareFresh/prepareForTurn；因此确实穿过 requireScript:true 分支。
- 两族分别使用无脚本且 scriptRef=null 的已存正文 / 已存 cardBriefs，点击真实工作台按钮后要求 autoSend=true、preparedEditorTurn 非空，断言无 createGraphicPostVersion、目标版本v1且 documentDigest 与精确完整已存稿一致。它证明准备链资格/冻结成功；openChat 仍为 spy，不是安装对话请求及模型执行证据。
- “当次最新稿已清空”用例保留本地原稿状态后修改 latest 回执为无脚本/无正文/无卡片，再要求 requireScript:true 拒绝。该负向直接核 port，未声称它也完成了 Provider/UI旅程；原普通对话未要求重组资格的路线保留。
- 实际 `provider-red.log`：1文件收集19项，其中2失败、17因筛选跳过；两个新失败项均显示 retry x2，并保留原“请先在脚本中保存原稿”错误。它是选中两族的真实失败证据，不能宣称19项无skip或retry0。
- 实际 `provider-green.log`：2文件23项通过，日志未列skip或重试；只按该轮报告数量，不臆造未提供的外层argv/exit/time receipt。红绿日志读取未触发本人重跑。
- 新修复源码尚需进入新包并复验原安装点击路径；此次不将已有安装包行为或真实模型生成/采纳判成已通过。

## 规格增量

已运行 `reviewctl context T-1420 --spec docs/features/t1420-graphic-post-content-structure.md --constitution docs/产品定位.md --json`，取得 previous_round=2、previous_verdict=PASS、原 findings=[]；唯一新行 `SPEC-LINE:21:9ccf8041f9bf8e5f` 是已授权兼容结果的具体 Provider 读链补漏，没有扩大结果/角色/权限。因当前 SPEC hash 已变，另存第三轮 recheck JSON 到 `provider-spec-review.md` 供主线程 record；本报告不写正式review快照或控制面。

## 文件及运行证据绑定

| 路径 | SHA256 |
|---|---|
| `frontend/src/features/projects/graphic-post-workbench.tsx` | `c19597a03989c25276ee245e336e4ecb815ab86e9f618e9803d13543e77c0b5c` |
| `frontend/src/features/projects/graphic-post-workbench.test.tsx` | `dd34909f01eafca2b1f8b93a6f2adc318939646189cf6ee4af33d8588109c907` |
| `frontend/src/features/draft-workbench/draft-chat-request.tsx` | `bd19be312667d6122ac60a841bd72f7219b20700110f6d989633ae0b81ef4117` |
| `docs/features/t1420-graphic-post-content-structure.md` | `1f943c20fa7de82ff33ad9610538f9a2e54ae2f5222a228fc286864be2bb0759` |
| `docs/产品定位.md` | `86bc2c8add6a01ebf5b2ecf9de05d448770ca14a4e0bdbbf376fffc6387e3800` |
| `docs/verification/t1420/provider-red.log` | `8d2c49106a6bcaadd9bb45f4477c0b9e0b442a06305f76d11ee57e71b5875344` |
| `docs/verification/t1420/provider-green.log` | `a6267b723cf22e23cf9876bc199fdd4cc6fc57d91f23e162607a24c4c6b968b2` |
