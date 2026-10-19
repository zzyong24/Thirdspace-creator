# T-1257 本地签名安装包交付记录

用户已明确“只做本地签名，不提交 Apple”。来源是本机当前安装的 CreatorOS 1.2.0（arm64），安装来源的 Git 提交未知；当前源码 HEAD 不能代签本包来源。

产物：`/Users/zyongzhu/Downloads/CreatorOS-1.2.0-local-signed-20261012/CreatorOS-1.2.0-macOS-arm64-local-signed.dmg`，842788980 字节（约804MiB）。

SHA256：`044f0720d326822158186351aae1155c8d8c2df9c6ef0e4559d6e52376e26eb5`。

## 当场核验

- 原安装签名在复制前通过 deep/strict 验证；原安装未替换、未重启。
- 应用副本及DMG使用 Developer ID Application: zhu zyong (2K9D3QH3YJ) 签名，严格签名核验通过。
- DMG `hdiutil verify` VALID；只读挂载后包内应用再次通过 deep/strict 签名验证。
- 版本/标识/Applications快捷入口正确，两个Mach-O全部文件内有数据section哈希与原安装相同；签名区域正常变化。sidecar归档与其它非签名资源SHA256保持一致；原安装所有文件在完成检查时保持原SHA。
- 基本打包测试4文件45例通过，见 basic-tests.log；该测试结果只证明当前打包工具，不扩写成原安装产品全量验收。
- Apple公证：用户明确不执行；不声称Gatekeeper公证准入。
- 独立安装和首次启动未执行：原生App数据路径按标识共享，未为了验证启动第二个同库进程。仅签名和镜像核验通过，不能扩写成全功能首次启动验收。
- 输出目录附安装说明与SHA256SUMS；临时签名副本和挂载目录已清理。

## 项目收尾

pmem sync已成功；完整reconcile已启动，但其后进入范围外产品回归，按打包技能“只运行打包相关基本测试”停止本次所属进程；结果为未完成，绝不签为PASS。记录见reconcile-stopped.json。既有全局欠债由T-1204负责；本次没有产品代码变更，制品专属验收均已通过，不扩写全局全绿。
