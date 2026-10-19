# T1252 收集范围与短 socket 工具窄复

结论：PASS_TOOL_COLLECTION_SCOPE_AND_SHORT_SOCKET_ONLY，候选无新增发现。新工具 7cb1b561、binding 978bd845 和 HANDOFF 3b74aedc 精确绑定；ROOT 另行授权运行。

PT002 的最小修复已闭合：Vite 合并后只覆盖 test.include 为私有唯一文件，list/run 再传精确文件参数。原 base 的插件、环境、setup 与其他配置保留。

```mermaid
flowchart LR
 A[原 base 合并] --> B[明确覆盖唯一 include]
 B --> C[CLI 精确文件参数]
 C --> D[原三个名字和正文核验]
```

新自有根在 /private/tmp 使用短前缀，每个阶段在启动前核未来 cw-32hex/workbench.sock 的 UTF8 字节数小于 104，与原 Rust 实际 bind 门一致。首轮未到 Native，故这个检查属于启动前缺口闭合，不能称已有 Native 红。

本次完整数组比较仅 launcher 一项变化，installed 与 browser 清单无差异；12 交接工件 SHA 全部相符。原 240 秒 collect、170.4M 完整外层、三个正文、生成器、原 D 与新出生任务 D 均不变。未再执行第二次 2.46GB 逐流核验；此前实际核验和首轮后验保留。

首轮 83BEID 的真实 collect 失败和 0 正文结果不改。审查人没有启动 launcher、服务器或用例。
