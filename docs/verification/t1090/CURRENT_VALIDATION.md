# T1090 当前验证

原回放缺陷已按原可信task冻结ID恢复实际消息，旧摘要/权限/lease/fence和回执校验保留；四产品路径及一个新增测试字节见[evidence.json](evidence.json)。

真实RED新增21例5FAIL/16PASS，五项均实际source冲突；修复后五文件139PASS，原completion60例不改断言或fixture时钟。backend/frontend类型与boundary/semantic/orphan均exit0。静态独审PASS，完整Worker两文件8PASS（134.307秒），reconcile与安装仍待实际终态，不签任务完成或全功能。

原b75与当前60例59PASS/1FAIL证据保留，不能把修复后的PASS追记成原GREEN。时间扰动测试仅操作合成后续行的createdAt，原冻结ID/digest/payload/正文/回执不变，正向零重复写；16负向族仍拒绝并保持调用前后行集合一致。

```mermaid
flowchart LR
 A[可信原历史ID] --> B[当前真实消息按原顺序恢复]
 B --> C[原摘要 归属 租约 回执校验]
 C --> D[原ID继续或回放 零重复写]
```
