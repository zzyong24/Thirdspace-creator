# T1300 前端只读初稿

本稿绑定源码`4eb101161fa25f1a446fd84a67817cd904497d65`。当前处于维护期BUILD的必要CONTRACT/SPEC独审前盘点，技能与项目流程版本均为3.29.0；本轮未改产品、未运行新模型或浏览器、未打包安装。功能验收矩阵以同目录`FUNCTION_MATRIX.md`为准，旧任务成功不移作本轮PASS。

## 最符合用户症状的现有证据

现用`/Applications/CreatorOS.app`的二进制及`sidecar.tar.gz`实际SHA256，分别与T1294的`PACKAGE_DELIVERY.json`和构建attestation完全匹配，来源为`8bbbe79d01f5b2c1f16503277f3fb922a647076a`。详细身份保存在`INSTALLED_SOURCE_IDENTITY.json`。版本字符串同为1.2.0不能判断是否更新。

这份安装产物已经包含T1294当时的设置/对话调整，但尚未包含后续`b6ef3314f`修复的真实模型成稿工具暴露、采纳回执与首次autoSend。当前源码成功的T1298旅程因此不能证明用户手上的安装版已恢复。版本差异是“执行功能失败”的高可信候选；没有操作现用App、没有读取用户设置或登录状态，**普通对话失败原因仍未复现**，不能直接归因于版本、模型或超时。后续应先在来源明确的新隔离候选核真实入口，再由Root判断交付方式。

## 设置到发送的真实消费者

```mermaid
flowchart LR
 S[公共设置六族用途选择] --> W[writeModelRouting：PUT与GET读回]
 W --> R[按账号组与账号隔离的routing store]
 R --> H[useAssistantEngine：用途能力准入]
 H --> C[AI面板：普通输入或真实功能入口]
 C --> P[编辑器prepare：版本与dirty处理]
 P --> T[真实POST与冻结能力路由]
 T --> K[模型工具候选]
 K --> A[用户选择字段并采纳]
 A --> F[服务写入、刷新读回与隔离核]
```

`copilot/assistant-engine.ts`的`writeModelRouting`提交完整choices与expectedRevision，核PUT结果再GET核读回，按当前账号组/账号及generation防过期发布；focus、storage和routing事件触发刷新。旧localStorage仅用于未配置状态迁移，不是当前用途路由的执行真值。

`use-assistant-engine.ts`按`choices ?? effectiveChoices`解析六族配置，文字和视觉`copilot.assist`分别检查能力。可重试的Codex登录/状态/运行时原因允许真实提交后返回具体错误，真正不支持的版本仍阻断。`ai-copilot-content.tsx:873`的准入由该hook提供；`sendPreparedRef`在发送前再次检查workspace、能力及准备状态，保留输入和附件；编辑器请求经`prepareEditorTurn`取得当前版本后再发送。设置页保存成功并不代替这条公共链成功。

只选择文字Codex不会自动把视觉、图片、视频或音频也切成Codex；默认六族来源为官方服务。图像附件有独立视觉能力，图片/封面/画布按image用途，ASR/TTS按audio或其本地能力；不能把文字Codex成功代签这些能力。导出等确定性操作不应被无关文字模型配置阻断。

已排除一个未证明可达的候选：legacy不完整DTO下可能出现`canSubmitText=true`而`available=false`，但B已核当前正常组合根`settings.service.ts routingResource → persistence-client.ts effectiveModelRouting`始终投影六族完整effectiveChoices，缓存缺失产生unverified能力行。该legacy输入只能列兼容负例，不能称当前用户根因。

## 公共功能必验骨架

| 入口 | 需要核对的真实配置/行为 | 本轮必要结果 |
| --- | --- | --- |
| 设置模型来源 | 六族完整PUT、GET、revision/CAS、刷新、切账号组隔离 | 所见选择与冻结执行来源一致；未配置原因真实 |
| 普通AI对话 | 文字`copilot.assist`；有附件时视觉用途；旧模型required分支 | 输入→POST→真实回复；失败保输入/附件/原ID；不静默fallback |
| 脚本一键公众号/图文 | `work.creation.read/propose`及实际owner/原稿 | 候选前不写；采纳、刷新与原稿/另一平台隔离 |
| 公众号/图文重组与对话 | `work.editor.read/propose`，当前版本与显式字段选择 | 首次autoSend、手动发送、候选预览、采纳读回；校正范围精确 |
| 视频助手与导出 | 原生owner工具；媒体/转录实际能力；确定性导出 | 视频实例保活、dirty/保存/版本/CAS不减；真实产物验证 |
| 选题、定位、审查、资料工具 | 各真实公开入口和冻结能力；有外部依赖即明确记录 | 不以聊天通路代签；依赖未具备标未验/阻断 |
| 图片、封面、画布、ASR/TTS | 各用途来源独立，合法能力与明确负例 | 不把Codex文字模型当图片/音频实现；不伪造媒体 |

矩阵具体task/call/owner及产物证据由本轮执行补齐。尚未运行，当前没有任何一行新PASS。

## 独审后的最小前端落点

同次prepare去重候选写集为`article/article-workbench.tsx`、`projects/graphic-post-workbench.tsx`、`draft-workbench/draft-chat-request.tsx`及`copilot/ai-copilot-content.tsx`，仅消除同一个显式turn的重复准备，不建通用“当前稿缓存”。准备凭据须绑定turn、editor/owner、scope/group/account、registry entry token、generation、version及digest，还须绑定writingContext与selection的机械指纹；generation不保证随写作偏好或选区变化，不能单独作凭据。article的prepare目标确实包含`writingChoice()`及`selectionRef.current`，draft registry已有entry身份/generation/dirty守卫，均须保留。纯机械canonical/hash只用于相等校验，不做语义选择；任一上下文、token、dirty、目标或归属变化即失效并走原准备。执行服务真实重读/CAS保留；保存结果未知沿原回执恢复，不重新创建任务。红测必须覆盖同turn一次有效latest/exact、不同turn重读、dirty后失效、切owner/组不复用、同generation选区/写作偏好变化、registry注销重注册、卸载/迟到结果不回写、并发准备及未知保存结果。

历史候选卡候选写集为`copilot/chat-work-editor-card.tsx`及其现有测试，必要小型读取合并helper须先锁写集。先证明关闭预览不必立即读取source/exact，再按用户打开触发；合并仅针对不可变候选/精确版本身份，有界、单在途，失败可重试，跨scope不能复用。红测覆盖旧历史卡重挂不重复读取、同时打开合并、source/version身份不同不混、拒绝/卸载清理、没有预览时不丢候选摘要、无自动采纳或当前稿写入。若当前功能合同要求采纳前预检，仍须在实际预览/采纳前完成，不能用缓存跳过服务校验。

`assistant-engine.ts`、`use-assistant-engine.ts`与AI准入只在实际复现来源同步/准入缺陷后修改；不能为猜测legacy输入先重写路由。B负责冻结contract、worker和可信工具阶段事件，A仅在其版本协议锁定后验证现有UI消费者。ordinary实时通路与external_tool终态批量必须分开；裸onText没有可公开phase证明时不直连正文。

Tab沿用T1071既有实例复用。T1299的小空工程已观察同一video host及六次返回无新editor/media读取；16次Link加一次本地打开的数据只是“点击至自动化检测目标状态”的上界，不是可交互/CPU耗时。后续使用生产模式、代表性隔离工程分段定位route/服务/DOM状态与一次实际操作；保留视频dirty、保存、版本、归属守卫，不改`StageChatWrapper`、布局或全开prefetch。不把RSC差额当已证客户端耗时，不因体验目标新增阻断合法生成/保存/导出的硬门。

相关精确测试文件在独审和Task Packet锁定后沿现有测试定位；本稿不是额外实施计划，也未授予候选目录任意修改权。正式实施须先保存真实红测与原失败ID，再按冻结功能矩阵逐模块验证，交Root复核。
