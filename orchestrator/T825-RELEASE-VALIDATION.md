# T-825 CreatorOS 标准版 v1.1 双平台发布候选验证

> 日期：2026-08-13（America/Los_Angeles）
> 候选提交：`c17564ef8ea718b5c5fd4abf0915e089d141d4d4`
> GitHub Actions：`desktop-release` run `31760776711`
> 版本：`1.1.0`

## 结果

- 官方 `only=all` 双平台流水线成功；macOS 与 Windows build job 均为 `success`。
- macOS 通过 Developer ID 签名、公证、staple、Gatekeeper、sidecar 搬运签名和真启动主页面。
- 下载后的 DMG 再次通过 `hdiutil verify`、`stapler validate` 与 Gatekeeper；Gatekeeper 来源为
  `Notarized Developer ID`。
- Windows 通过 NSIS 真安装、已安装 GUI 真启动到主页面，以及官方卸载器清理 runtime 和安装目录。
- Windows 当前没有 Authenticode 证书，安装包如实标记为未签名 accepted risk；updater 制品签名门
  与本次安装/启动/卸载门均已通过。
- 按用户本次授权边界，没有创建 tag、GitHub Release，没有修改公开下载地址或向真实用户放量。

## 本机交付文件

- macOS：`/Users/zyongzhu/Downloads/CreatorOS-v1.1.0-build-31760776711/macos/CreatorOS_1.1.0_aarch64.dmg`
  - 大小：449 MiB（Finder 显示）
  - SHA-256：`f604b90278b1e7582ab9aa5a6992b8a1e95c43dfd7e94e490994bc8f46174dd5`
- Windows：`/Users/zyongzhu/Downloads/CreatorOS-v1.1.0-build-31760776711/windows/CreatorOS_1.1.0_x64-setup.exe`
  - 大小：454 MiB（Finder 显示）
  - SHA-256：`2cef32bc4c579e2105b02312dc14e88d2d5995e3381037c295cc3b397e20065b`

## 发布前固定预检

发布冻结工作树干净，`frontend/package.json`、Tauri 配置、Cargo manifest 与 lock 四处版本均为
`1.1.0`。固定四个发布测试文件共 41 项通过：

- `scripts/desktop/package-local.test.mjs`
- `scripts/desktop/desktop-release-workflow.test.mjs`
- `scripts/desktop/notarize.test.mjs`
- `scripts/desktop/tauri-signing-config.test.mjs`

候选相对 `origin/main` 的高置信密钥模式扫描只命中 `data-slot="task-*"` 的字符串误报，未发现真实
密钥；发布前已用普通合并吸收远端 README 活动图更新，并非强推。触发时 `origin/main`、候选分支
和构建 SHA 三者均精确等于 `c17564ef`。

## 明示风险与全局门卫

- 用户把“先打包给用户使用”提升为当前最高顺序，因此 T-823、T-821、T-819、T-816 尚缺后续
  真实用户验收；本候选只带入已有实现和构建验证，没有把未形成 SPEC 的 T-824 双 Skill 方案、
  或明确暂缓的 T-820/T-814 新需求临时塞入发布包。
- 发布专项门全部通过。全局 `reconcile` 仍因 BACKLOG 体积超限、T-770/T-765/T-746 旧评审 hash、
  以及多项历史 frontend receipt 在后续代码变化后失效而失败；这些不是本次安装包构建、签名、
  公证、安装或启动门失败，未冒充全局全绿。
