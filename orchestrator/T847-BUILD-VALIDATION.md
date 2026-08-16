# T-847 Windows CLI runtime 闭包修复验证

## 失败证据

- 正式流水线：`31942889066`
- 冻结候选：`b2223718f155df2ee5944fc30474891a5c045105`
- macOS：构建、Developer ID、公证/staple、Gatekeeper、DMG 内应用和真启动通过。
- Windows：`release.mjs → tauri build → beforeBuildCommand` 失败；完整性门禁报告缺
  `frontend/cli/creatoros.cjs` 与 `cli/node.exe`，因此未生成 `setup.exe`。

## 根因与修复

Windows 少文件 production closure 绕过 full `build-sidecar.mjs`，但
`prepare-packaged-runtime.mjs` 只复制 Next/runtime 分层闭包，没有生成 T-843 的 CLI bundle，
也没有为 CLI 保留 Node。第一次 closure 冒烟不消费 CLI；Tauri 二次执行 `beforeBuildCommand`
准备最终 tarball 时，正式完整性门禁才发现缺失并阻断。

修复后 full build 与 production closure 共用 `creatoros-cli-runtime.mjs`：

- CLI bundle 仍由 `mcp-server/scripts/build-runtime.mjs` 从正式 contract 构建；
- Windows CLI Node 复制自本轮 closure 的 `creatoros-server.exe`，不读取 runner 上另一份 Node；
- staging 完成后继续执行原 `assertCreatorOsCliRuntime`，不放宽门禁；
- packaged runtime summary 记录 CLI bundle/Node 路径与字节数；
- 正式 Windows job 在安装后检查两个文件，首次启动后真实执行 `creatoros.cmd --help`，
  并把 `cliHelpVerified=true` 写入正式包证据。

## 本地验证

- TDD 红：新 closure 测试 2 项失败（缺 helper、prepare 路径未 staging）。
- TDD 绿：聚焦测试 12/12。
- desktop 打包/签名测试：5 文件、61/61。
- Windows closure 全套：17/17。
- MCP/CLI：36/36，typecheck 通过；实际 bundle 执行 `--help` 返回 `ok: true`。
- Rust CLI launcher：3/3。
- frontend typecheck 通过。
- boundary：无新增违规（基线 5）；semantic boundary 通过；`git diff --check` 通过。

## 待官方双端验证

修复提交并冻结后重新运行 `desktop-release.yml only=all`。只有 macOS 与 Windows job 均成功、
两个安装包均下载并完成 SHA-256，T-847/T-846 才可完成；不创建 tag、Release 或公开分发。

## 冻结候选正式流水线结果（阻断）

- 正式流水线：`31944755771`
- 冻结候选：`893db761b156c38387159c76daf3194bdc93bcf5`
- macOS：全链成功，包括 Developer ID、公证/staple、Gatekeeper、可搬运 sidecar、DMG 内应用
  和真启动/主页面加载。已下载
  `/Users/zyongzhu/Downloads/CreatorOS-v1.1.0-build-31944755771/desktop-darwin-aarch64/CreatorOS_1.1.0_aarch64.dmg`，
  SHA-256 为 `ad3ff2342c5fc5065262d92a36c1c3029b929b60d47ef93b9b3342009ee8387c`。
- Windows：production closure、release 全链、tarball 门、Chromium 门、安装期 runtime、updater、
  setup 收集与 NSIS 真安装均通过；随包闭包证据显示 CLI bundle `645036` 字节、CLI Node
  `95618048` 字节。安装后 CreatorOS 已完成主页面加载，CLI 文件与 launcher 均存在，
  `creatoros.cmd --help` 退出码为 `0` 并返回结构化 JSON usage。
- 阻断发生在 Windows 首启门的输出断言：workflow 要求帮助文本包含中文
  `用法: creatoros`，实际正式 CLI 合法返回 JSON 字段
  `"usage": "creatoros status | ..."`，于是错误抛出
  `[T-847] CreatorOS CLI --help 未返回预期帮助`。这不是 CLI 启动失败，但它使随后 Windows
  主动卸载门和安装包上传被跳过，因此本轮不能视为双端发布验收成功。
- GitHub 仅留下 Windows closure/身份非发布证据，没有可下载的 Windows setup；未创建 tag、
  Release、公开下载或 Activity/Growth 变更。按冻结规则，本轮结束后只记录阻断，不在同一候选
  中临时修改或静默重跑。
