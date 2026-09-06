# T-915：聊天素材搜索接入 Worker 浏览器执行

日期：2026-09-06。基于 `c379aaa9`；沿用已确认 SPEC 和 DEC-RUNTIME-055，仍为 BUILD，完整目标未完成。

素材搜索现在使用已有 Worker 浏览器执行器。后端保存原查询的上下文、验证真实工具调用和结算搜索结果，浏览器的创建、搜索、错误返回及关闭均留在 Worker。没有新增规划模型或另一套 Agent 循环。

```mermaid
flowchart LR
 A[原聊天与真实父调用] --> B[宿主准备查询和原素材关键词]
 B --> C[Worker 浏览器搜索]
 C --> D[原始结果或真实错误]
 D --> E[宿主结算并生成原素材卡]
 E --> F[原聊天循环选择下一步]
 F --> B
```

## 改动与恢复边界

- 旧聊天与新端口共用查询准备和结果投影：查询空白整理、选区标题兜底、原高优先素材关键词、固定 count=10；标题、URL、站点、摘要及来源字段保持原语义。空查询不启动浏览器；没有来源时不编造结果。
- `researchContext` 冻结 `selectionTitle`、`userMaterialQueryTerms` 和影响原工具描述的 `searchConfigured`；`worker.research` 当前严格限定 `material.gather/none`。宿主工厂核对原 schema、版本和真实账号，不携带浏览器执行闭包。
- `prepareChatResearch` 只收 callId，查询由原模型已确认调用和冻结上下文决定。`settleChatResearch` 只收严格原始结果/错误观察，拒绝非法协议 URL、携带账号密码 URL、额外伪造卡片字段；宿主按原投影生成卡片与摘要证据，不能当作已读全文。
- prepare/start/settle 受原执行租约、授权与停止控制；已确认结算 ACK 丢失只重发同一结算并回读，不重新搜索。started/unknown 没有被改成可盲目重跑，仍需对账。每次工具独立记账，预算不重置。
- 同一聊天内相同有效查询复用成功观察并返回副本，错误不缓存；正常结束、异常与进程退出均关闭浏览器资源。按需加载原浏览器执行器，不给普通生成新增浏览器启动。
- 真实入口声明 `chat.research`，调度器和运行器在模型前检查能力。原装配缺搜索端口时返回明确 `no_evidence`，可基于已有资料继续，不进入无法改变冻结配置的等待循环。

独立只读审查发现，最初转换遗漏 `browser_runtime_unavailable`，会让用户修复浏览器后仍再次等待。已将该标记限定为观察协议白名单并保留到宿主结果。实际数据库回归验证 waiting_user → 用户 resume → checkpoint 认可原阻断 ID → 新模型新工具调用成功；旧调用回读而不重搜。普通权限拒绝没有被统一改为可认可。

## 当场验证

- 原查询与卡片投影的缺实现红测：`chat-research-red.log`。本文件不把审查发现的恢复问题冒充当场历史红测。
- 原工具、聊天 runner 和共享准备：360 passed / 3 files。
- 运行时、搜索协议、查询缓存、资源关闭与真实浏览器：47 passed / 5 files。
- 真实 Chromium 测试使用固定 HTML 传输替身：百度空结果 → Bing 页面解析出带 URL 的结果 → 聊天观察结算 → 关闭连接。浏览器和解析器真实；网络传输和结算端口是替身，未访问真实搜索站，不能当作商业上游或全链数据库验收。
- 后端定向回归：21 passed / 3 files。真实独立 Worker 的空查询及未装配场景、真实账本的查询绑定、非法结果拒绝、取消、结果未知、结算幂等及用户恢复路径都已验证。浏览器修复恢复测试走真实数据库与服务，但没有声称真实搜索站已修复。
- 独立进程能力与搜索服务组合：16 passed / 2 files；最终搜索文件复测 **5 passed**，见 `chat-research-process-final.log`。以上存在重叠覆盖，不相加虚报总数。
- contract 11 passed / 3 files；backend、ai-worker、frontend 类型检查结果见对应原始日志。
- 测试修正包括补齐 mock 的实际第三个调用参数、明确测试结果的 TypeScript 字面量；没有修改产品输入来迁就断言。
- 独立只读 `/root/worker_review` 复核恢复标记、失败不缓存、结果副本和资源关闭后未发现新 blocker；审查者未运行测试。

## 完整入口仍未完成

完整真实聊天装配保留全部冻结工具，新增搜索配置和宿主后，未接工具由 11 类降为 10 类：`topic.generate`、`script.draft`、`publish.package`、`cover.generate`、`knowledge.distill`、`calibration.diagnose`、`material.screenshot`、`web.read`、`local.read`、`material.generate`。旅程仍 FAIL，模型请求为 0；没有删掉未迁工具来通过测试。

正式 `/api/chat` 尚未切换。T-915 的全部 R-05 迁移、旧路径退役、同条件至少 30 个性能样本、真实商业模型和 macOS/Windows 安装包验收仍需继续；没有 taskctl complete、push、部署、安装或改写用户业务数据。

工程检查：pmem sync 已运行；reconcile 仍 **211 errors / 1 warning**，不声明全绿；boundary 剩余 **5** 条既有违规；orphan **0 errors / 100 warnings**。精确 write-set preflight 与代码 diff 检查通过。原始日志末尾空行原样保留；Git 提交钩子是否执行不替代上述实际验证。
