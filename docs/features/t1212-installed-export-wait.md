# T1212 安装版导出等待定位

用户要求自动化可执行、发现明显问题及时修复并创建任务。T1210 e5c已安装，真实HTTP首页/公开CLI/随包摘要通过。原第三空间run-5efd8bb4-530f-42d1-8830-6f3bb379f195和exec_90e4dc58-d3ee-4b9f-8a8d-5a91afdaf729已succeeded，真实导出2行但公开可写结果0。原月明run-4f1bbadf-5506-4090-ae34-12a727fb60ac、exec_14478623-987f-42d8-b2c6-e072e6a4e8a8仍running，export自2026-10-11T02:46:31.393Z开始，七分钟后仍无下一阶段；heartbeat约10秒更新，attempt11不再增加，error=null。公开ingestion.douyin.throttleStatus：creator-center cooldownActive=false、ETA0。不能把等待推断成死锁、页面变更、登录错误或限流。

BUILD故障诊断，先只读源码和公开状态，使用隔离夹具核backend collection self.readExport→frontend persistence adapter→fetchDouyinWorkListExport→openContext/shared read browser pool/宿主profile lease→平台页面串行操作→下载等待/结果处理。已有各级预算按真实消费者核，不缩短合法任务、不设任意提前失败。平台导出慢与代码阻塞、无阶段可见性分别判定。

原记录位于docs/verification/t1210/installed-original-observations.json；继续T1210观察驱动，同ID保留，禁止人为runNow、重发、取消、读真人DB/浏览器凭据或直接CDP私有会话；不扩开已暂停平台研究，不操作真人扫码/帐号配置。诊断只新增SPEC/任务/证据和隔离重现；无产品精确写集已批准，任何产品修改先取得真实RED和独立范围复核。若需要公开子阶段观察，确认当前进度契约后最小扩展，不泄露cookie/token/页面正文/SQL/用户素材，不绕过归属或fence。

验收：明确真实等待点及消费者预算；后续范围经独评后，隔离公共调用链保旧成功与异常/取消/新fence回归，再新包当场观察原任务结果。任务尚无PASS，不代签外部导出完成或全功能。

```mermaid
flowchart LR
 A[原月明任务] --> B[导出入口]
 B --> C[浏览器池与宿主租约]
 C --> D[平台页面交互]
 D --> E[等待原下载结果]
 E --> F[解析及原run完成]
```

## 精确实现范围与验收（2026-10-11）

独立只读核对确认进度缺口；没有证据断言真人任务等待在具体哪一个内部调用。现有公开 scheduling.jobRun.progress 的 stage 为任意字符串、message 可读文本；runner 在 stage 切换时立即序列写入，同 stage 1500ms节流并在终态/停控前收口。因此只改 message 会漏掉紧接 export 的浏览器等待，不满足验收。沿既有 progress 写入固定 export_* 子阶段，不新增端点/schema、任务、权限或预算。该呈现细化属用户已授权的故障诊断，保原自动化操作与结果语义。

产品精确写集仅三处：backend/src/application/collection/self.ts（固定阶段/中文消息白名单、readExport 可选回调，report 仍走原runner）；frontend/src/server/persistence-client.ts（原适配器转发回调并在auth/profile解析前标准备）；frontend/src/server/ingestion/douyin-cdp.ts（既有入口调用固定阶段回调，浏览器、channel、导航、页面初始化、关闭引导、主/子tab点击和等待、日期筛选、刷新、导出点击、下载事件、下载完成、文件读取、资源关闭分别在实际await前上报）。

阶段仅为固定机械事实；禁止将页面文本、原始异常、路径、Cookie或身份素材传给进度/日志。回调通知 best-effort；不让通知异常阻断原合法导出，清理仍必须等待真实context close，不能显示done或伪装释放。取消、fence及未知动作账本仍由原执行/runner守卫决定，不新增重试、提前超时、私有CDP或真人查询。不存在非导出collector阶段行为变更。

新增/修改测试限 frontend/src/server/ingestion/douyin-export-progress.test.ts、backend/src/application/collection/self-export-progress.test.ts、backend/src/integration/scheduled-export-progress.test.ts。现有导出fake页面仍须按真实tab切换/先监听再点击建模，延迟open/gateway/goto/download.path/close证明实际等待前可观察进度，并验证旧成功、失败、取消、通知失败和不泄密。隔离完整公共调度/冻结/claim/consumer/runner/createSelfCollector/导出适配器链证明固定阶段确实落原run，停控回归及固定子阶段落库至少显式55422隔离PG；新fence进度保护由T1213依赖闭合后同包验收。仅注入浏览器和下载外部端口，不代签真人平台导出。

先范围独评与当场RED再改产品。GREEN后原相关导出/网关/collector/runner/消费回归、类型/边界/超时检查；若出新包，重新冻结精确源、固定入口构建并安装，公开观察同原任务。原等待位置只有新安装实际阶段能证实时才判定，不补造旧记录。

前置独评发现既有进度写入只有signal守卫，不能签新fence的即时保护。已登记T1213，先依赖闭合后才构建该观测包；本任务三文件不声称现有runner具有完整fence。真实任务内部等待位置仍UNKNOWN。

## 实际等待已收口与安装版最终见证

03:01:15原月明run失败，公开原错误明确平台modal拦pointer；其后原定时系统自行创建新run于03:09:57成功86新增。没有人工重复提交。T1214修复该弹窗变体，T1213保护旧进度，T1212仍以细阶段闭合诊断。

隔离PG现有self→runner全链与真实Chromium导出分段通过，尚未在同一测试里串生产persistence adapter，不能写模拟全链PASS。沿用户已明确授权逐个功能验收、使用当前安装app测试：新包安装及启动核验后，先公开确认该job所有run终态，再只调用一次正常公共scheduledJobs.runNow作新安装版验收，记录新AI/run/execution ID、当前请求号、阶段与终态；不复用旧failed ID，不将新验收称原恢复，不取消/重发任何pending，不触私人CDP、DB或凭据。若存在running即只读等原完成，不提交新动作。此真实链验证生产适配器与归属/lease装配，成功计数按真实0/更新/新增，不伪造。既有明确全功能验收授权已覆盖该可逆采集操作，不新增对外发布/授权/绑定/模型调用或生产配置。
