# T-1417 安装与受限 CLI 对照独立复核

审核者 `/root/t1408_contract_review`，2026-10-25。实际二进制与数据摘要核对截至 12:46:24 UTC。结论：本轮固定候选安装及 T-1417 限定两次预算诊断具备匹配的真实证据，未发现结论与回执矛盾。8192 的业务失败正是诊断观测结果，不是被改写为模型成功。此结论不表示官方 Pi 聊天恢复、T-1408 全部门通过或允许推送；任务控制面收尾另以主线程真实终态为准。

本次沿用已读 T-1417 任务包与 SPEC，写前边界仍仅为本报告。只读原始 CLI 收据、已有数据保全快照、构建/安装证据，以及非秘密安装产物签名和哈希。没有读取密钥、连接文件、用户数据库或用户项目内容，没有发真实请求、调用 CLI 业务、启动浏览器、重建、安装、修改源码/配置/状态或推送。数据快照核对只提取项目 ID、组实体/成员与来源选择进行比较，不复述项目内容。

## 构建与安装身份

`package-freeze.json`、`build-state.json`、`package.receipt.json` 与安装 proof 均绑定 `b4e174a8433e21f75bbc6b2f69b2e065855b7698`。原命令是外盘干净候选的 `pnpm -C frontend desktop:package-local`；打包预检四个文件 58 PASS，receipt code=0、5814 ms、进程组关闭且无残留。实际打包 receipt code=0、1023524 ms、signal=null、未触发预算或 outerAbort、closed=true、remaining=[]，自然结束。

已读日志中的 rust-objcopy/libLLVM SIGABRT 告警，它发生于去除调试信息；完整构建随后成功生成 .app 和 DMG。警告仍保留，不能描述成无告警。额外冒烟、TLS 和产物质量扫描未运行；本地 ad-hoc 不等于 Developer ID、公证或发布验收。

本审核实际重新计算安装主程序、sidecar、外盘构建包相同文件、旧应用备份和用户 Downloads DMG 的 SHA，结果与 proof 精确相符：

| 产物 | SHA-256 |
| --- | --- |
| 已安装及外盘构建 `Contents/MacOS/CreatorOS` | `96b98302102b82e5d5e353d6d8712b99bbdd2630d037f852702fd3b9c3f77c42` |
| 已安装及外盘构建 `Contents/Resources/sidecar.tar.gz` | `4bf8f2ba28f7e13bbc49a070af8bbb13f491e53bc379a49de751b31058af9645` |
| `/Users/zyongzhu/Downloads/CreatorOS-1.2.0.dmg`，847655233 字节 | `ca1e93cfad09577c193ea6599703bc7c234899416ff2217bcdeb6d7806e89ebf` |
| 旧备份主程序 | `856ac0b35d4dabb2fc159fe9338a9402b26a84225209c57c2164f63684b3ecdb` |
| 旧备份 sidecar | `7c7c92df1b487392c9b4649a6d30d7c4f5dd6994b2f5ebb06ab579c7081b440b` |

实际只读 `codesign --verify --deep --strict --verbose=2 /Applications/CreatorOS.app` 通过；display 显示 arm64、adhoc/runtime、TeamIdentifier 未设置。`005-status.json` 在安装后真实记录 mode=installed、connected=true、creatoros 产品与正确 packageId；本次没有重新发连通请求。安装后的公开 schema 回执已包含 textOutputLimit，证明 CLI 读到了新预算契约，而不只是旧版本文件名。

## 两次真实结果及恢复

`RESULT.md` 与 `installed-summary.json` 的安装、数据、comparison 字段均与原件一致，所列三个 probe 收据 SHA 和退出码逐一匹配。

| 原始回执 | 实际输入与窗口 | 传输 / 进程 | 模型业务结果 |
| --- | --- | --- | --- |
| `020-probe-128.json` | copilot.assist，textOutputLimit=128，12:38:15.834648 UTC，15.588990 秒 | exitCode=0，response.ok=true | data.ok=true；已收到最小测试请求流式回复 |
| `022-probe-8192.json` | copilot.assist，textOutputLimit=8192，12:38:31.793056 UTC，2.392250 秒 | exitCode=0，response.ok=true | data.ok=false；固定 HTTP 402 支付/权益拒绝提示 |

两次均使用已确认的“月明水清深”组、公开 settings.models.test、--apply 和不同幂等键，provider/model 为 channel-managed。小预算结束后才开始大预算；两次只是有限文本探针，没有开启正式聊天、原任务恢复或工具调用。`response.error=null` 与顶层 ok=true 说明操作调用成功返回业务结果，绝不能覆盖 data.ok=false。原始请求分别为 req-a057fe81-191、req-a057fe81-198，可用于后续不泄密的关联核因。

原路由 revision=75，官方写入 expectedRevision=75 后回读为 76；测试后 precheck 仍为 76，恢复写入 expectedRevision=76 后回读为 77。只临时把 text 从 codex 切到 official，其他来源未变；最终 choices 与初始全字段相等。`routing-state.json` 与恢复回执一致，CAS 没有盲写覆盖。凭据元数据回执只含服务标识、hasSecret 与 updatedAt，没有秘密值；记录了本轮实际元数据，不据此推定余额或供应商内部路由。

按驱动源码与本轮全部 call 回执清单，业务操作仅为账号组读取、来源 get/put、凭据元数据 list、两次 settings.models.test；没有恢复任务、付款、钱包、额度页或正式聊天操作。因此支持本轮 protectedOriginalRecoveryUsed=false，不能将此声明扩大成对其他时段所有操作的审计。

## 数据与证据状态

独立比较 `data-before-install.json` 和 `data-after-install.json`：前后 66 个项目 ID 精确相同；组实体整体相同，5 个成员数组完全相同；来源 choices 相同，revision 按上述 CAS 从 75 到 77。该结果与 data-preservation 摘要一致，证明本安装/诊断窗口所读公开清单和组状态保全；它不是用户数据库全部内容、附件和文件字节的完整备份证明。

implementation-results 中保存的 RED/GREEN、首轮 typecheck 退出 2、修正后 typecheck 退出 0、timeout 与 boundary 退出 0，其八份日志 SHA 全部与实物相符。102 项定向测试及原失败均保留，未将首轮 TS2571 消除成不存在。较早 code-review 中的静态待完成状态是当时观察，本轮新增终态记录补齐这些已执行命令；本审核没有重新执行。

主线程的 pmem/reconcile 收尾尚不由本报告判定完成，也不代替 taskctl 状态或临时构建工作树清理。RESULT 所说“限定诊断验收已完成”应限定为本节已发生的安装和两次功能实验，不扩大为 T-1408 聊天恢复、一次全新 full PASS 或发布通过。尚未完成的官方三轮与其他原门继续有效。

## 是否足以改变正式聊天预算

不足以直接修改正式普通聊天的 8192 或创作目标的 32768。当前对照在相同公开 capability 与官方选择窗口，固定最小 prompt 下只改变输出上限，确实加强了“请求预算与拒绝相关”的证据；但每档只有一次、顺序固定，公开结果不揭示供应商的额度预留算法、实际余额、动态限制或内部路由。仅有一次凭据元数据快照，也不能单凭它证明供应商侧所有条件完全恒定。

尤其 128 成功只证明首个非空正文/思考到达，不能证明 128 足够完成正式聊天、长答案、工具调用或创作稿件。直接把正式预算降到 128 会改变已承诺的功能和输出完整性，可能把当前可诊断的拒绝变成截断/不完整内容，不能作为已证实的根因修复。

应继续 T-1408 已有修复授权内的核因：先结合这两个请求关联号、既有安全错误分类、正式请求编译与供应商权威限制说明，确认实际拒绝字段及适用边界；仍不查询用户已豁免的额度页或读取秘密。若确需新增在线对照，应先把问题、固定变量、有限次数和停止条件写入后续诊断合同并独评，不将 T-1417 已执行完的两次额度变成无限重试。只有明确约束后，才评审兼顾合法输出长度/上下文/工具的最小修复；完整官方三轮仍必须真实通过。

## 核心原件 SHA-256

| 文件 | SHA-256 |
| --- | --- |
| `docs/verification/t1417/package-freeze.json` | `7e85d6ae05b719f651e1829dd746e6b8ed64f4ccb799111aedcfbb814362111a` |
| `docs/verification/t1417/preflight.receipt.json` | `c29563a524d88da07c1f9bf503d673b71e9eab8aea24ee20c2a76bd1ba2b96d8` |
| `docs/verification/t1417/package.receipt.json` | `c6b146b1d32453549730075efc95b2a54e3f17eeaea14352c9f30b25a637b941` |
| `docs/verification/t1417/installation-proof.json` | `b9c2f661d1697e2339b32c7c477dc22a7068382b40eed15794e8973bf43148c9` |
| `docs/verification/t1417/data-preservation.json` | `bb2525f8c38fc291048567771a8be21b8ac08643dc6dc035b8b2bf2387d8cb5b` |
| `docs/verification/t1417/installed-summary.json` | `a6b2fb5f5345f78876910bab0a131e5ea1b69dd873a7bd004d2d6ba8a76e299f` |
| `docs/verification/t1417/RESULT.md` | `d8bdc6404509b7988efbca1395ed4190127e7fd57d4981f2262621f71aed2727` |
| `docs/verification/t1417/implementation-results.json` | `beb4f8eccaae2ff331e8c8ac51048cf27841f22bc40b9491497f90ddf8befbde` |
| `docs/verification/t1417/installed-cli/020-probe-128.json` | `e1baeda7a31ea156cb2e2e0a8e074955001da95d9369d6c5b1d6718df1ba5925` |
| `docs/verification/t1417/installed-cli/022-probe-8192.json` | `746a263887c531490e44a8f94ab78fd2997900660913fd2b019978e5d93f6357` |
| `docs/verification/t1417/installed-cli/028-restore-readback.json` | `e390fe4edaec7d076349b565ad19049e949a391b64bf8695bff80c370bc81ece` |
