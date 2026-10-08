# T1091 公开编导消息的引擎和真实稿面目标

用户继续全功能验证、要求及时补齐AI操作缺口，并已明确Codex执行、右侧自然语言剪辑及脚本联合生成文章图文。当前main `fae2d1f595b70a45d3c8b40c424c035150f5a851`，安装产品5915784。本任务承接T1062/T1070/T1074验收暴露的公开入口，不新增创作方向、保存权限或UI。

## 实际缺口与结果

安装版动态operations list为420项，`ai.conversations.messages.create` describe只含content/attachments，AiService准备与提交均固定Pi；页面chat route已有executionEngine和editorTarget/creationTarget。普通浏览器真实打开安装origin受“request must originate from the local application”保护拒绝，不算UI失败或PASS，不私接cookie/连接文件绕过。原describe/页面snapshot留在外部functional-verification-20261009。

大白话：同一公开消息入口应能选择Codex，并携带实际要修改的文章、图文或剪辑工程。助手先读真稿、只出候选；采用仍由原服务验证，CLI不伪装成本地窗口。

```mermaid
flowchart LR
 U[授权的公开编导请求] --> G[同一正式消息入口]
 G --> O[校验实际会话和作品归属]
 O --> F[冻结所选引擎和真实目标]
 F --> P[Pi或Codex原任务]
 P --> R[原工具读取并提出候选]
 R --> A[用户采用后原owner保存]
```

## 兼容契约和守卫

原operation ID、effect、确认策略、返回Message DTO、gateway幂等和默认行为保持。body新增可选`executionEngine:pi|codex`及可选`chatContext`；后者只允许已有严格editorTarget或者creationTarget，不能同时提供两者，不接收functionKey、任意surface/projectId、工具目录、owner证明、摘要替换或执行期限。原合法content/attachments继续默认Pi；坏引擎拒绝，显式Codex不能静默改用Pi。

editorTarget完整复用WorkEditorTarget三个owner、真实savedBase、documentDigest、selection及120000 ticks。公开creationTarget复用WorkCreationTarget实际项目、composition/revision、两member、scriptSourceRef，但省略scriptConfirmation，禁止客户端/模型伪造内部声明。经原RequestContext归属守卫的显式公开生成请求，由AI owner补`confirmedBy:user,source:public-request`；它只说明本次请求选择该真实保存版本，不声称点击了页面按钮、不授权保存候选。WorkCreationTarget只将source扩为current-click|public-request，原UI current-click、旧冻结历史及摘要字节保持。公开CLI仍需要原apply/key/confirm-impact。

会话user/workspace及写权限先验证，再严格解析新增字段；任一目标projectId必须等于非空的实际conversation.projectId。准备端口继续事务外读取真实项目/稿件/媒体/Skill/模型与目标；版本、前值digest、composition/script、输出父根、账号组和工具由原readEditorTarget/readCreationTarget及hostContext核验。失败不留消息/task/result，不改业务稿。历史漂移仍拒绝，membership/父锁及消息+task原子提交、engine/hostContext冻结、lease/fence/回执与未知不重发不变。

同一引擎选项传prepare与submit；目标沿纯contract类型端口送frontend组合根，后者仅补真实conversation派生surface/projectId并调用原prepareChatReply，不搬业务到frontend或新增执行器。原Worker目录/版本、MCP safeNames、submit重放、候选采纳端口不改。

## 精确写集

产品6路径：新增`contract/src/resources/ai-public-message.ts`；修改`contract/src/operations/ai.ts`、`contract/src/index.ts`、`contract/src/resources/work-creation.ts`、`backend/src/modules/ai/ai.service.ts`、`frontend/src/server/persistence-client.ts`。

只新增3测试：`contract/tests/ai-public-message.test.ts`、`backend/src/modules/ai/public-chat-options.service.test.ts`、`frontend/src/server/public-chat-options.integration.test.ts`。原断言/时钟不改，复用createDb/正式service/compositeTransport；不手改用户库、删失败或把模型stub称为真实Codex。控制限本SPEC和三review文件、T1091精确pending绑定、BACKLOG/DEC/PROJECT/events、docs/verification/t1091/及父T1062实际索引，不修旧glob或改旧任务状态。

## 验收与结束条件

1. 独评后捕获真实RED：当前公开body丢失engine/target，真实公开service固定Pi；原默认Pi和无目标合法调用保持通过。没有当场RED不补签。
2. 严格body及确认来源：三editor owner、无客户端confirmation的creation有效；双目标、坏引擎/类型、额外权限/期限字段、伪造scriptConfirmation拒绝。原current-click仍有效，新内部public-request保完整target约束。
3. 后端真实PGlite service证明默认/显式Pi/Codex准备及execution.modelInput一致、目标保真；会话/组/账号/项目越权、prepare失败、历史漂移及task失败拒绝且零孤儿/业务写。真实准备库读不能移到membership事务自锁；旧nullable及同组账号边界保持。
4. 前端compositeTransport→真实prepare/原目标reader→原task冻结，覆盖article、graphic、native、creation来源；无网络部分只标消费者/冻结集成。重跑原完整Worker两文件、原消息/提交/完成/proposal/external、相关contract、双端类型/boundary/semantic/orphan和完整reconcile。test/hook≥180秒，完整Worker1200000；不改生产期限。
5. 独立实施复核后main提交，固定入口无备份新包，核包/安装字节和真实HTTP首页；动态describe新body，经公开入口实际Codex只读并回读工具回执。Pi/Codex各有候选及原任务恢复证据，文章/图文/native目标和真实共同脚本的联合候选分别按实际base核对；原ID/key恢复，不重发未知任务。
6. 未批准的新候选仅生成/回读/预览，真实用户稿件、图401、平台扫码/采集/发布及凭据不动。已明确批准S1导出可原请求验证；新语义候选不能直接保存。原生自动化不可用、普通浏览器来源拒绝保留，不代签全UI/全功能或用户签收。

无UI变更，验收分类—须独审确认，不关闭父T1062/T1070/T1074矩阵。完整reconcile42项既有错误当场重跑对比，范围内新增失败先修，旧欠债明确保留而不签全仓PASS。收尾实际pmem/reconcile/taskctl及审计提交。
