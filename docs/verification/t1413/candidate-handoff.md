# T-1413 冻结实现与候选交接

本轮修复必需参考封面被静默降为纯文生成的问题：可信宿主冻结参考约束，执行端拒绝缺失、空白、不可读或模型不支持的参考；保留旧普通封面、Codex 原 30 MiB 限制和父取消原因。六项 lesson 的旧测试引用已迁到当前正式链。

39 个精确文件共 1169 项聚焦测试通过，零跳过、零重试。生产行为红测为封面 9 失败 / 13 通过，最终相关 25 项通过；其它 fixture 和测试类型修正保留原记录，不冒充生产红测。代码与逐文件名册见 implementation-freeze.json、coverage-index.json，独立终审见 independent-code-review.md。

root 在同一冻结源码上串行执行原八组 timeout-policy 与完整五工作区 typecheck：前者退出 0，耗时 48636 ms；后者退出 0，耗时 177424 ms。两者均正常关闭、无剩余自有进程、源码哈希未变。typecheck 仅该子进程显式使用任务规定的 NODE_OPTIONS=--max-old-space-size=6144；完整 full 不继承此值。完整输出和原字节 gzip 映射见 root-validation/。

现仅为提交候选，尚未运行组合 full、打包安装这份新封面源码。官方图片幂等资格与正向恢复仍未验，asset-worker-run.ts 生产逐字未改；unknown 安全测试不代表线上恢复通过。官方 Pi 正式对话的 HTTP 402 仍未通过。用户跳过的是额度页面验收，不能据此把上述失败写为已解决。本轮不推送。

远端本次 fetch 得到 3a110457ac4c9cb0c2d1289bb427a95f652c38eb，仅修改两张 README 活动 SVG；会在候选提交后普通合并，保留双方提交历史。
