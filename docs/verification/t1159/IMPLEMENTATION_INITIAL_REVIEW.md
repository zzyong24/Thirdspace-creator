# T1159 独立实施复核

结论：**FAIL（范围限定）**。主要归属、迁移和数据边界符合已审设计，当前完整验收仍有三个明确待处置点。此报告不改状态、不代签完整 Gate、安装或真人微信。审查只读，未运行任何测试、Next、数据库、模型、CLI、App 或进程操作。

## 当前绑定

- main 基点：`aa7de1e91183ec0236a82cd954a4f4bf9bb1aeb1`；冻结来源：`293d4e98d2cedbd04eebce16a62f921711ee8079`。
- SPEC SHA256：`b95d6954c52e5251f3b4b430ae6af2fb6e4a571c3839e0f9230ee33abae59073`。
- 56 条来源路径当前 52 条逐字一致；3 个产品保留当前语义，1 个 registry 测试由独立 T1162 改固定清单。59 条当前实现/验证 SHA 字符串、上下文 SHA、逐项来源处置及全部实际日志 SHA 见 REVIEW.json。
- 0130 字节与 main 相同，SHA `cc25f17ac270d230b82f1697bd20c674931877459cc0a70f667cab3461a3fc70`。journal 原105项保留，仅追加0131；6个 superseded 路径没有覆盖main。
- 审查结束时已看到另任务 T1165 的 envelope 源码变化；首轮原失败保留。本报告不提前签该增量或新 Chrome。

## 发现

### I001 · 高 · 真实公共链失败，T1165 待闭环

正式身份拒绝HTTP400仅带字符串error，HttpTransport得到code=null；native-report-panel.tsx:95走OTHER，未出现“扫码绑定账号”。根因边界为dispatch/contract登记的固定错误码，不应按中文正文猜状态。首Chrome实际exit1、52.602101秒，日志SHA `3539bacc1b22833a9ba2fddbd027697b2a249223fd3252b23fd3596caa41506c`。已实际看失败截图，确认普通身份错误及恢复按钮缺失。组件直接构造带码HttpTransportError的PASS不能覆盖此链。关联T1165已登记且源码变化可见，但完整原Chrome和停止后同隔离库零副作用证据尚未通过。

### I002 · 高 · 原deadline可被在途续租拖住（源码反例，未执行新探针）

`backend/src/application/collection/wechat-native-collector.ts:239`无条件等待renewalInFlight。续租在截止前开始并保持pending时，driver的deadline race即使已退出、failRun即使已返回，execute仍不能返回原TASK_TIMEOUT或取消结果。原续租测试在第210行明确resolve第一笔后才结束；原close挂起测试续租立即返回，未覆盖交叉族。生产renewLease是事务端口，本层没为该等待设原剩余期限界限。

最小确认应复用原窄端口fixture：原run剩余1分钟，20秒续租返回不resolve的deferred，60秒原deadline到点仍要求原attempt兑现TASK_TIMEOUT并保持真实stopUnconfirmed；最后resolve旧续租，核晚回调/报告不写、不重领。当前**没有执行该RED**，也不声称真人已发生此卡顿。先由根会话明确准入这个精确族，勿扩大账号实验、任务或期限。

### I003 · 中 · 新旅程外层未覆盖串行预算

`frontend/tests/e2e/t1159-wechat-native-report.spec.ts:23`外层1500000ms。两账号×三视口仅goto、reload、正式read、返回click四项的配置等待已是2880000ms，未计建组/账号、管理弹窗和身份回读。`run-report-journey.mjs:18`外层3300000ms也需随完整单例闭包校准。只改本新测试/runner的有限外层，不缩120秒正执行/观察，不改旧case或业务期限。这不是当前52秒失败的原因。

## 有限通过与证据

- current纯组contract增量保留；membership原锁序与assertFrozen语义保留，仅native queued/running在途计数新增。owner、member版本、generation、lease、平台真实身份和scope在原事务提交前重验。
- 0131 append及固定迁移身份/未知拒绝保留；报表原组不转写；sha与机械日期窗口去重，全DTO冲突拒绝；原生报表不得写成works/catalog。
- 五类报告保留原raw/0/null/单位/负关注/日期语义、字节/行列边界，无标题相似匹配或平台全目录假声明。
- custom/disabled旧job保留；默认仅补缺失项，调度及页面恢复复用原task/attempt/key；超时不会自动重发。profile真实停止证明、pending stop和默认私密截图关闭保留，但期限整体仍受I002影响。
- SheetJS仅精确官方0.20.3依赖/完整integrity新增，原worker/Pi和patch依赖保留；未验新安装包。
- 当前类型4项exit0；worker108、frontend76、T1162合同12、T1163原backend109实际PASS。原backend105PASS/4角色FAIL及原合同11PASS/1 registry FAIL均保留，并分别有实际纠正重跑；不是来源历史PASS替代。
- 390空态截图实际查看为真实“尚未采集/尚无报表”。组件状态/单在途/过期与卸载防回写已审；不评价新审美方向、不代签完整浏览器。

## 未验证边界

首Chrome仅走过视频号三个空态窗口后在身份拒绝失败；不能签第二账号完整旅程、扫码恢复、停止后同库0run/0report/0binding/profile证明。没有完整Gate、新安装或真人采集证据。原来源族仍researching，2实验已耗尽、剩余0、首页/导航原因UNKNOWN、报告0、真人执行暂停。恢复流程和已有稳定ID必须保留，不建议宽泛页面兜底、删护栏、清历史或自动重发。
