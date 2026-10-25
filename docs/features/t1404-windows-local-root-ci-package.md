# T-1404 使用既有更新根和 Actions 构建新版 Windows 包

用户于 2026-10-25 提供现有 update-root PEM 文件并要求重新打包到本机，随后确认 verdict 密钥已配置在 GitHub Actions。目标代码为 T-1403 修复提交 `3d741fc95a37929a1a5f9d89f5f5f326d75f6ff0`；不合并 main、不创建 tag/Release、不修改渠道更新地址。本任务独立构建分支只修改打包编排与公开回执，不改变产品运行逻辑、既有信任根或授权守卫。

## 实施与文件边界

复用官方 Windows production closure 与 signed capsule 的 prepare、verify、adopt、verifyAdopted 函数，以及 package.mjs / sign-sidecar.mjs。保留历史 T-247 acquire 的旧分支锁；本任务增加明确绑定当前仓库、分支、workflow、成功 run、artifact ID/摘要、准确源码 SHA 和公开签名提交的传输校验，不借用旧回执。已有 desktop-release.yml 在独立构建分支改为手动两阶段、仅 Actions artifact 的 Windows 构建，不改变 main 工作流。

prepare 在 Windows runner 使用已有公开构建根制作唯一未签 capsule。下载后本机核对 ZIP 摘要、源码、成员清单、BLAKE3 和公钥身份，再由官方专用 sign-sidecar 进程读取用户提供的既有根私钥，产生 104 字节公开签名。私钥不上传、不复制进源码、不进入日志、环境转储或交付包。只提交公开签名和非秘密回执。

package 在公开签名提交上调度，但 checkout prepare 的准确源码 SHA；核对 artifact 的实际字节和签名回执，官方验签并采用同一 tar 后，使用 CI 既有 verdict seed 编译匹配桌面壳。构建日志只输出步骤状态和公开摘要；不导出或下载 CI secret 值。未配置 Windows Authenticode 证书时如实交付未签安装器，不将 sidecar 根签名等同于 Authenticode。

允许修改 `.github/workflows/desktop-release.yml`、`tools/windows-closure-rat/flow-package-*`、本 SPEC、BACKLOG 和 `docs/build/t1404/**` 公开回执。另允许仅修正 `tools/windows-closure-rat/signed-sidecar-capsule.test.mjs` 的 T-1375 acquire 请求预算测试夹具：通过 `fileURLToPath` 使用本仓 `frontend/src-tauri/target/` 内的独占跨平台路径，保持真实 HTTP401 断言和原生产逻辑，不跳过测试。其他产品源文件不在此任务范围。

## 验收与数据保全

先对新增传输绑定运行真实负例/正例测试，再检查 YAML 和官方 capsule 回归。记录实际 run/commit/artifact ID、SHA256、大小、验签结果和构建结果。安装包生成与 UI/模型验收分开；未产生或未执行的结果不填 PASS。下载成品后检查摘要、包身份和签名状态，保全原安装与数据后再安装/启动复验。已有 quick 对账 27 errors/18 warnings 和原生/真实模型尚未复验的边界不因打包自动关闭。

用户已明确跳过缺失的 product-to-code-orchestrator 技能。若本任务 manifest binding 仍缺，依 AGENTS fallback 使用此 SPEC 与 BACKLOG 留证，不伪造 context compiler 或前置 Gate 通过。
