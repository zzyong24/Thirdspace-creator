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
