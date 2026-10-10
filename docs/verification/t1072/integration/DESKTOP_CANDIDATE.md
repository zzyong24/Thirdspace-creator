# 桌面候选包准备事实

公开资源盘点：[desktop-candidate-readiness.json](desktop-candidate-readiness.json)，仅当前隔离树，绑定源码提交。Node25与cargo可用；Worker构建文件与图标存在，Tauri sidecar压缩包及外部启动二进制尚缺。此前原生lib使用空resources/externalBin override仅为测试，不是桌面包构建。

正常候选驱动为当前树 `frontend/scripts/desktop/package.mjs`，先校验 canonical `creatoros`、构建环境和T535匹配Ed25519签名seed/sidecar公钥，再执行sidecar closure、Tauri、产物硬化和公开manifest。以显式空环境调用真实 `validateVerdictKeyMaterial({})` 返回 `missing-signing-key`；没有读取用户已有密钥、OS凭据或安装版，未以Lab授权公钥冒构建密钥。

`package-local.mjs`会读取用户 `~/.creatoros` 密钥且默认替换并启动 `/Applications/CreatorOS.app`，不符合当前授权，因此未执行。候选包后续应只在本树target产出，独立合法构建材料准备好后可运行标准pipeline；不得复制Downloads、安装、启动或替换用户安装版。本轮未构建正式APP/DMG，不记正式包PASS；真实Mac/Windows双机UAT继续待验。
