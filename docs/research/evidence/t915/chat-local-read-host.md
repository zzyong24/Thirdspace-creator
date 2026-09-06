# T-915 本地读取宿主提取与取消修复

本批把本地文件读取和授权判定从 `frontend/src/server/persistence-client.ts` 提取至 `backend/src/modules/ai-runtime/local-read-host.ts`。前端继续注入原用户级授权表，不新建授权存储，不改变目录授权与一次授权的归属。装配文件净减少 226 行。

```mermaid
flowchart LR
  CHAT[现有聊天读取入口] --> HOST[后端本地读取宿主]
  HOST --> CHECK[路径与敏感文件检查]
  CHECK --> QUEUE[同一用户与真实路径串行]
  QUEUE --> GRANT[重新查询现有授权]
  GRANT --> FS[读取文件或目录]
  FS --> CANCEL[检查取消]
  CANCEL --> DONE[消费一次授权并返回]
```

用户点击停止后不再收到晚到正文，也不会因这次未完成读取失去一次授权。同一路径的两个请求不能同时消费一次授权。排队请求取消可以立即结束，其占位仍等前一个真实读取结束，第三个请求不能抢跑。异步执行前固定用户、路径与取消信号，防调用方修改对象而换用户。

## 本次实际验证

- `chat-local-read-host-red.log`：正式 `getChatRuntime().readLocalFile` 装配入口，预先取消仍返回正文，1 项失败（测试配置自动重试两次）。
- `chat-local-read-host-concurrency-red.log`：8 项中 2 项失败，分别为并发一次授权返回两个文件、异步期间用户对象变更导致读错授权上下文。
- `chat-local-read-host-queue-red.log`：9 项中 1 项失败，排队取消仍停留 waiting。
- `chat-local-read-host-backend-green.log`：42 项通过，包含宿主、名称搜索与本地读取安全检查；目录、唯一命中、多候选、敏感路径、符号链接、二进制、大小限制、用户隔离均覆盖。
- `chat-local-read-host-frontend-final.log`：正式装配读取与原授权表共 10 项通过。仅临时文件与内存数据库，不访问用户内容，不调用真实模型。
- `chat-local-read-host-types.log`：后端与前端类型检查。
- 独立只读复审发现并确认修复队列取消缺口；审查者未运行测试，不作为独立测试通过证据。
- `pmem sync` 已运行；`chat-local-read-host-reconcile.log` 实测仍为 211 errors／1 warning，与本批前基线相同，范围与复杂度检查通过。独立 boundary scan 无新增、剩余 5 条；orphan scan 为 0 errors／100 warnings。全局对账仍失败，不标记 T-915 完成。

## 尚未完成的边界

本批未接通 `local.read` 的持久工具账本，也未切换正式聊天到 Worker。成功读取后消费一次授权与持久回执之间仍需设计落地：未知结果不可补发授权或盲目重读，不能用当前进程互斥冒充重启恢复。审批判定仍沿原接口，不宣称审批取消已接通。

原有 stat 与 readFile 之间的路径／文件增长竞态未在本批解决；现有 1 MiB 门依赖读前 stat，不能宣称句柄绑定或实际读入量已得到完整限制。真实 macOS 测试不冒充 Windows 安装包验收。整项 T-915 的工具迁移、正式入口、性能样本与双平台验收仍继续。
