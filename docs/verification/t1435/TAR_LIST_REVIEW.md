# 归档目录缓冲修复独立复核

实际失败：run 41473263553，Windows 最终 tar 已生成，AppleDouble 目录读取返回 exit null、空 stderr。旧实现 stdout maxBuffer=64MiB。真实 tar >64MiB 目录红测复现同样错误；修复后安全目录通过，末尾污染、Finder、坏归档和不存在的 tar 仍拒绝。

独立评审：review_ci_signing 前审与后审均无阻塞。核对独占 wx+ 0600 fd、仓库外临时目录、有限 stderr、error/status/signal 失败先于签名、StringDecoder 与跨块/末尾行、坏项仅限样本但扫描全部、finally 关闭和删除。Windows 实际 fd 与系统 tar 仍需新流水线证明。

验证：六组 110 测试通过；timeout-policy/verify.mjs exit 0。签名根、104B 协议、公证与安装验收规则未改。Mac 前轮完整成功且本地 DMG hash/hdiutil 已记录；不能代替新候选 Windows 验收。
