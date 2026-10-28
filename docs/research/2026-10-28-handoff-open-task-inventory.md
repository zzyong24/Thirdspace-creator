# CreatorOS 接手阶段3与阶段4核对（2026-10-28）

用户决定：阶段1保持待验，先完成阶段3链接补注和阶段4盘点。阶段2记录迁入未获批准，继续跳过；阶段5定位问题由独立任务 T-1430 处理。本报告不启动以下八个产品任务，也不把它们改为完成。

核查基线为本地 `c8589fe7f325be1ccc667c93b85c39df506db64c`，缓存 `origin/main` 为 `6033bdd51e6996cfe80eb041661a2b1a4f15a5b0`。本轮未 fetch，缓存引用不能称为 GitHub 当前最新状态。独立盘点来自 `/root/handoff_stage4_inventory`，链接核查来自 `/root/t1420_review_remaining`；主会话复核文件存在性后实施补注。

## 阶段3：材料链接已补注

11份说明文档共38处添加了接手备注，原路径、原始结论和历史哈希保留。包括 T1425 浏览器报告、T1426 结果报告、T1427 安装/CLI/组合复验报告，以及两份旧 UX 来源研究说明。逐处清单见 [补注清单](../verification/t1431/annotation-manifest.json)。

- `t1424` 验证目录本机不存在；未创建假的 RESULT 或任务卡。T1426旧任务包引用该目录、T1407旧任务包引用缺失 combined-candidate-manifest.json，均仅作为历史来源说明，未手改生成任务包。
- T1425 的5份原始日志已有 `.gz`，保留 [原日志映射](../verification/t1425/raw-log-archives.json)，不能误记未入库。
- T1427中已经入库的 Growth 诊断、ui-source原图/JSON、receipt哈希清单和摘要继续保留；没有给整个目录贴缺失标签。
- 两份研究文档中 `t1424-cos-ux-closure` / `t1424/runs` / `t1424/control` 指旧分支的 T1403 UX 旅程，并非当前T1424的CLI组合任务。已补来源说明，不批量换号、不导入阶段2的旧记录。
- “原始日志和截图在朱志勇机器上，未入库”依据用户提供的接手规划；本轮没有访问另一台电脑，只核对本仓库可得性。补注不等于恢复2.4GB原件，也不重做历史验收。

## 阶段4：八项任务剩余清单

当前状态取 [BACKLOG](../../BACKLOG.md)。下列“已有工作”是仓内历史记录或静态源码核对，均不是本轮在账号组「1」重跑。旧文档的「月明水清深」、65个项目和旧钱包余额属于朱志勇电脑，不能当作本机事实。

| 任务 | 当前状态 | 已有工作 | 仍需完成 |
|---|---|---|---|
| T1421 剪辑转写与按文字剪辑入口 | 进行中，规格PASS，待验 | 已有“视频转文字→按文字剪视频”顺序及真实素材入口；空视频跳转由 materials 修为 assets；历史44项回归通过 | 新Mac安装版验证添加视频、转写、按句定位、候选采用/取消、未知保存/撤销；需要合法新包，新增付费转写另行授权 |
| T1422 试用设备一次模型权益与明确恢复 | 进行中，审核栏—，待验 | 已有详细SPEC和写集 | 当前指定源码仍只见正式v1，未见试用v2协议/恢复错误码实现，验证目录不存在；先核独评后的Growth T250合同哈希及Activity真实签发向量，再开发Creator消费与恢复；不能用T1423代替 |
| T1423 历史激活码无感升级与原授权恢复 | 进行中，规格PASS，待验 | 历史强验签、观察令牌、自动启动协调器及设置联动已有实现/受控测试；合同原件已由T1429恢复 | 与当前源码绑定的自然冷启动、无需点击完成、页面状态及原许可/钱包/Key/唯一首赠保全；旧机按钮恢复不等于无感流程通过，不在账号1重复释放绑定或补赠 |
| T1426 CLI组上下文、模型错误与开销 | 进行中，规格PASS，验收栏— | 可信组锚、精确组GET、402错误分类与冲突提示已有修复；历史359项通过，产品提交已在缓存main | 与T1427共同收口正常官方对话；历史26.784–80.227秒不能算性能问题已解决；以账号1和当前安装来源复验，付费调用须新授权 |
| T1424 沿用已确认账号并实测CLI组合 | 暂停，审核栏—，待验 | 历史事件称六组合已测，官方Pi等待、Codex+Pi拒绝及工具/性能仍未全过 | 本机缺原RESULT、日志及任务包；作为T1426/T1427修复后的组合验收清单，避免三任务重复花费；使用账号1，不沿用旧组ID |
| T1427 官方Pi与未通过验收 | 暂停，规格PASS，待验 | 历史纯组诊断修复、四设置组合12轮及128探针首段文本有记录；8192探针仍402 | 正式官方三轮回复、记忆计算、同组工具未闭环；旧机低余额只是当时原因候选，不能推断账号1余额；不重放旧未知任务、不缩减正式预算，付费/充值/密钥/推送分别核授权 |
| T1406 新版安装八项缺陷（远端含义） | 进行中，规格PASS，待验 | 八项修复及后续宿主/自由简报/CI夹具修正已有记录，限定八项实机复验记为通过；代码已在缓存main | 整体Windows仍PARTIAL；严格数据快照FAIL、两项目仅updatedAt变化原因及凭据内容未验仍保留；核最终安装来源和原八项回执，明确数据保全结论 |
| T1403 Windows全流程实测失败（远端含义） | 暂停，审核栏—，待验 | 当前稿诊断、来源同步竞态、画布引用、搜索和进度/分页等已修，代码已在缓存main | 历史原EXE未替换；需要准确修复源的合法Windows包、原生UI和真实配置模型复验；视觉服务、扫码、作品指标及平台发布适配器分别列依赖，不能暗中扩为整项开发 |

## 各任务证据入口

| 任务 | 规格与直接证据 |
|---|---|
| T1421 | [SPEC](../features/t1421-transcript-editing-clarity.md)、[44项回归与安装缺口](../verification/t1421/add-video-fix.md)、`frontend/src/features/reference-editors/video-reference-workbench.tsx` |
| T1422 | [SPEC](../features/t1422-trial-device-model-benefits.md)、`frontend/src/server/activation/model-benefit.server.ts` 中正式v1常量；本轮未发现 `docs/verification/t1422/` |
| T1423 | [SPEC](../features/t1423-legacy-license-one-click-upgrade.md)、[受控验证](../verification/t1423/AUTOMATIC_LOCAL_VALIDATION.md)、[独审中的冷启动缺口](../verification/t1423/AUTOMATIC_IMPLEMENTATION_REVIEW.md) |
| T1426 | [SPEC](../features/t1426-chat-model-combination-fixes.md)、[结果](../verification/t1426/RESULT.md)、[无UI改动裁定](../verification/t1426/ui-applicability-review.json) |
| T1424 | [SPEC](../features/t1424-cli-chat-combination-acceptance.md)、`orchestrator/events.ndjson` 中原暂停事件；`docs/verification/t1424/RESULT.md`缺失，未制造链接目标 |
| T1427 | [SPEC](../features/t1427-official-pi-acceptance-and-push.md)、[组合结果](../verification/t1427/model-combinations-b4e174a84/RESULT.md)、[旧机Growth诊断及关联限制](../verification/t1427/growth-diagnosis/RESULT.md) |
| T1406 | [SPEC](../features/t1406-installed-eight-defects.md)、[合入与实机保全限制](../verification/t1406/MAIN_MERGE.md) |
| T1403 | [SPEC](../features/t1403-windows-flow-repair.md)、[源码验证及未更新EXE](../verification/t1403/GATES.md) |

T1403、T1406、T1426产品提交分别为 `3d741fc9…`、`3ff74c16…`/`ba2e74c1…`、`93a972b9c…`，已通过本地Git祖先关系确认在缓存main中。后续不应再重复合入这些代码。

## 任务包及同号来源

现有T1421/T1423/T1426/T1427任务包锚定旧HEAD，部分状态/审核票据与当前BACKLOG不一致；恢复执行前应正常生成。T1422包缺失但有模块绑定；T1424/T1403/T1406包和同号模块绑定均缺失。本轮按AGENTS允许的BACKLOG＋SPEC回退读取，未伪造任务包。

旧 `codex/cos-ux-closure` 的T1403是导航/模型/剪辑UX闭环，T1406是公众号扫码身份核验；当前缓存main同号则分别是Windows全流程及八项安装缺陷。本盘点只处理当前main含义。编号来源见 DEC-142801，阶段2仍未执行。

## 供用户选择的后续顺序

1. T1421：界面可见、范围较窄，合法新包具备后先闭合实机验收。
2. T1426 → T1427 → T1424：同一对话链合用一次经授权的账号1验证，避免重复付费。
3. T1423 → T1422：先确认已有正式授权无感升级，再做试用v2；共享产品文件，串行推进。
4. T1406 → T1403：Windows环境就绪后先补八项保数据证据，再收口较广全流程。

以上只是建议，最终由用户排优先级，本轮没有据此启动任何任务。阶段1仍需新Mac包、真实正文及安装态原图导出验收；另有两项已复现但未修的图文缺陷，见 [阶段1续接记录](../verification/t1420/continuation-20261028/README.md)。
