# T-763 BUILD 证据：渠道 ASR 短时租约与可恢复 operation

> 结论：CreatorOS 与 Growth 的本地合同、实现和聚焦回归通过；本轮没有使用真实渠道码、
> 没有申请真实 Qwen token、没有产生扣费，也没有部署、打包或发布。真实经济事实联调仍须
> 用户另行提供一次性测试码并在当次明确确认。

## 已实现结果

- `per_request` ASR 不再读取 CreatorOS 本机长期受管密钥；解析阶段只取得已验签的服务规格。
- 每次真实转写先建立非敏感 operation，冻结输入指纹、来源、触发事实、服务权威摘要、时长和
  字节数；同一 operation 重试复用同一幂等键，输入或权威变化时失败关闭。
- 同一来源同一时刻只允许一条活跃 operation；只有显式的新任务/请求事实才会形成新的操作。
- 短时 token 只在 provider 回调边界申请和使用，不进入数据库、普通缓存、Web、查询参数或日志。
- CreatorOS 区分未签发、provider 状态未知、已释放、已扣费过期和 provider 调用失败；响应丢失
  使用原幂等键向 Growth 查询，不再以新键重复申请。
- Growth T-144 将 ASR 权威统一为 Activity `config-access-ticket-v3`，同键重放返回仍有效的原
  token，或返回不含秘密的精确终态与扣费事实。

## 本轮验证

| 范围 | 结果 |
| --- | --- |
| CreatorOS 前端聚焦测试 | `14 passed` |
| CreatorOS 后端聚焦测试 | `52 passed` |
| CreatorOS 前后端 typecheck | PASS |
| CreatorOS 目标文件 lint | `0 errors`，保留 3 条既有未使用参数 warning |
| CreatorOS boundary | PASS；0 新增，5 条基线内 |
| CreatorOS orphan | `0 errors`，既有 warning 保留 |
| CreatorOS test-integrity | PASS；仅 coverage 配置 warning |
| Growth 聚焦测试 | `43 passed`，1 条依赖库弃用 warning |
| Growth boundary / orphan / test-integrity | PASS / `0 errors` / PASS |
| 两仓 `git diff --check` | PASS |

## 未冒充为通过的全局门

- CreatorOS `reconcile` 仍有 4 个与 T-763 无关的既有红项：T-731 review/路径漂移、T-729 和
  T-727 receipt 失效；本任务没有篡改历史收据洗绿。
- Growth `reconcile` 仍有 4 个并行历史任务红项：T-142、T-140、T-138 review receipt 漂移，
  以及 T-143 验收列值不合法；本任务没有接管或重写这些并行任务工件。
- Growth 仓库没有 `orchestrator/process/pmem.mjs`，因此未伪造该命令的成功证据。
