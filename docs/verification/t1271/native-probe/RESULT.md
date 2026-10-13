# T-1271 原生 Codex 0.159.3 隔离协议探针

实际执行时间：2026-10-13 16:06:41—16:06:42（北京时间）。脚本退出0，两个独占app-server均正常退出0。状态记为`OBSERVED_EPHEMERAL_NO_TURN_BOUNDARY`，这是无模型回合下的真实观测，不是安装版或已完成模型对话的全链路PASS。

采用与项目`resolveBundledCodex`相同的包定位顺序：核`@openai/codex/package.json`为0.159.3，再按当前darwin/arm64平台包定位vendor binary并真实执行`--version`。binary SHA256：`4d210f7c5a18fd0386434df23b5bdbb8c0e7257d3e8a2b30b0769c8bbe99a878`。协议schema由该binary的`app-server generate-json-schema --experimental`实际生成，原文件与哈希见本目录。

| 当场实际检查 | 结果 |
| --- | --- |
| `thread/start`发送`ephemeral:true`、`approvalPolicy:never`、`sandbox:read-only`、空environments/tools | 成功；响应thread.ephemeral=true、path=null、turns=0、networkAccess=false |
| 同进程`thread/read(includeTurns:false)`读临时thread | 成功 |
| 同进程`thread/list`含全部schema支持的sourceKinds与全部provider | 不列临时thread |
| 创建临时thread后遍历本次独占CODEX_HOME | 无rollout JSONL |
| 原进程关闭，新相同配置进程`thread/list` | 不列临时thread |
| 新进程`thread/read`临时thread | -32600，`thread not loaded` |
| 新进程`thread/resume`临时thread | -32600，`no rollout found` |
| 无turn的`ephemeral:false`负对照 | 响应ephemeral=false，给出非空sessions/rollout路径；同进程可read。但实际文件未落盘、list也不列，重启后也不能read |

最后一项限制了证明强度：空持久thread本身也没有可列出的历史，因此“临时thread未出现在列表”不能单独证明完成对话时与持久thread的行为差异。本任务授权探针没有模型turn，未为补负对照发起模型请求。当前证据确实证明0.159.3接受临时参数、响应不同的持久化标志/路径、会话在原进程存在且退出后不能从rollout恢复；未证明真实模型结果、个人Desktop历史界面或已安装CreatorOS改动生效。

所有进程使用本次`mkdtemp`的独占CODEX_HOME和空cwd，HOME维持真实环境值。没有读取/复制真实auth、token、个人session、用户数据库或在用App，没有`turn/start`、模型提示词和业务工具调用。RPC结果仅保留白名单字段、错误码及独占thread错误文本，stderr仅计字节数，不保存account/config/完整provider日志。独占目录里会生成SQLite、installation_id和随包系统技能等运行状态，这不是“零落盘”承诺；检查结论只针对session rollout。

单次RPC正期限120秒，独立外层1800秒，覆盖本探针完整串行RPC及清理；正常退出前先关闭stdin，5秒清理宽限后SIGTERM、10秒SIGKILL仅用于结束本次独占进程。实际本次无需强杀。

复跑命令（会创建新的独占临时目录，不访问真实CODEX_HOME）：

```bash
node docs/verification/t1271/native-probe/probe.mjs
```

机器证据：[result.json](result.json)，脚本：[probe.mjs](probe.mjs)，schema来源与哈希：[schema-manifest.json](schema-manifest.json)。未修改生产源码、ALLOWED集合、SPEC或任何安装/登录设置。

```mermaid
flowchart LR
 A[独占配置 空工作目录] --> B[创建临时thread 无模型turn]
 B --> C[原进程可读 无rollout路径]
 C --> D[正常关闭原进程]
 D --> E[新进程原thread不可恢复]
```
