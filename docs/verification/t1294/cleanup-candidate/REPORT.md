# T1294/T1295 本会话清理候选（只读，未删除）

本轮精确列出 **12 个交付后可清理候选，现存逻辑文件/目录字节合计 212,741,129B（约 202.89MiB）**。这不是已经释放的空间，也不保证等量物理磁盘回收。16 个旧 T1295 静态临时目录已不存在。当前扫描没有发现应立即删除的在用目录；这里只给 Root 交付后串行清理清单。

| 精确路径 | 当前字节 | 类别 |
| --- | ---: | --- |
| `/private/var/folders/0f/yn6rgq1j2lj2n8_868n28jzc0000gn/T/t1294-browser-ELJKLy` | 54,098,181 | old-browser-db-media-auth-cache |
| `/private/var/folders/0f/yn6rgq1j2lj2n8_868n28jzc0000gn/T/t1294-browser-aXr6zo` | 51,040,713 | old-browser-db-media-auth-cache |
| `/private/var/folders/0f/yn6rgq1j2lj2n8_868n28jzc0000gn/T/t1294-browser-rAtSDq` | 47,430,081 | old-browser-db-media-auth-cache |
| `/private/var/folders/0f/yn6rgq1j2lj2n8_868n28jzc0000gn/T/t1294-browser-urUnNR` | 42,122,087 | old-browser-db-media-auth-cache |
| `/private/var/folders/0f/yn6rgq1j2lj2n8_868n28jzc0000gn/T/t1294-zero-turn-v2-j16_wtfx` | 39,764 | zero-turn-owned-temp |
| `/private/var/folders/0f/yn6rgq1j2lj2n8_868n28jzc0000gn/T/t1294-same-session32-qz3pl6i7` | 436 | zero-turn-owned-temp |
| `/private/var/folders/0f/yn6rgq1j2lj2n8_868n28jzc0000gn/T/t1294-same-session32-9uc3huim` | 35,694 | zero-turn-owned-temp |
| `/tmp/t1295-csp-QRbm5a` | 561,082 | old-owned-static-native-temp |
| `/tmp/t1295-csp-RB270A` | 561,082 | old-owned-static-native-temp |
| `/Users/zyongzhu/Workbase/Thirdspace-creator/docs/verification/t1294/worker-rpc-tap/normal-bundle.before-diagnostic.cjs` | 5,614,496 | restored-diagnostic-bundle-copy |
| `/Users/zyongzhu/Workbase/Thirdspace-creator/docs/verification/t1294/worker-rpc-tap/execution-worker.diagnostic.candidate.cjs` | 5,617,476 | restored-diagnostic-bundle-copy |
| `/Users/zyongzhu/Workbase/Thirdspace-creator/docs/verification/t1294/worker-rpc-tap/execution-worker.diagnostic-phase.candidate.cjs` | 5,620,037 | restored-diagnostic-bundle-copy |

所有现存目录都从本轮 binding/owner 的具体路径取得，没有在 `/tmp` 或 HOME 做泛扫。目录 task 为 T-1294/T-1295，UID=501，nonce 非空；实际 owner 字节摘要、nonce、相关 PID 当前不在用、旧 port connection refused、`lsof +D` exit1/0句柄/无stderr 均记录于 `INVENTORY.json`。三个 bundle 文件分别也做了精确文件 lsof 检查，无打开句柄，UID501、无symlink，均>=5,000,000B且Git未跟踪。小型 `NORMAL_RESTORED.json` 保留了当时正常build恢复 f65897… 与诊断tap移除的事实；不能拿这个历史恢复摘要冒充当前新build。

两个旧 static temp 的 owner 原始文本是 compact JSON，而 evidence owner 是 pretty JSON，所以原始摘要不同。最初清单保守 KEEP，已保留 `INVENTORY_INITIAL.json`。随后真实核验完整解析 owner 对象全部字段完全相同（不只挑task/nonce），源片摘要也与原 binding 完全相同，才加入候选。当前 runtime owner 的准确字节摘要已锁在清单；Root实际删除前应匹配这个摘要，不能只比较名字。

需明确保留的边界：

- 当前 `prepared-c9038acd34aa82d8`、端口52121及其 ownedRoot `/private/var/folders/0f/yn6rgq1j2lj2n8_868n28jzc0000gn/T/t1294-browser-EmPRHI`，以及此后任何新 Root 服务；不扫描其DB/cache/媒体、不停止。
- 当前 reconcile 在跑的测试目录、Main共享 `.next` 和未逐项归属的其它缓存不在清单。
- `/Applications`、真实HOME/Codex认证及状态、全部用户库/密钥/原始媒体，一律不在清单。
- 全部截图、MP4验收证据、原失败、日志/receipt/owner/closure/hash/source-snapshot/diff等证据保留；这里只例外列出三份可由原source+build/diff再生成的大bundle副本。
- 最新安装包和旧安装包备份均保留到新包核验；没有盘点或加入任何包路径。

特别依赖：旧 `/t1294-browser-rAtSDq` 的 marker 仍被 T1295 strict runner 固定 binding 引用。尽管当前端口/进程已关闭且本轮两个视口完成，**Root须先确认不再计划执行该严格入口，再删除这个旧root**；否则会真实破坏后续owned准入。当前清单所有候选都仅为“交付后且无后续消费者依赖”才可删，不是立即执行许可。

repeatability-v1 原记录实际复用了59136 owned root，不额外虚构一个新临时根；其 docs/source-snapshot/PID缺席证据全部保留。repeatability-v2与same-session32的临时根均有一致owner/关闭记录；prelaunch32只剩436B owner，保留其未执行SDK的原失败证据，允许Root只清剩余temp marker。

```mermaid
flowchart LR
 A[精确历史binding路径] --> B[marker/UID/nonce/摘要匹配]
 B --> C[PID/端口/句柄当前无在用]
 C --> D[Root确认交付后无后续依赖]
 D --> E[逐路径清理候选]
```

`inventory.py` 是只读盘点脚本，没有删除/kill/服务请求实现。原始观察时间见JSON；PID和端口事实只是该时点的观察，Root正式清理前必须再核一次。`DELETE_CANDIDATES.json` 为结构化清单，不是执行器。生产、控制与测试源0写；本轮 deletedBytes=0。
