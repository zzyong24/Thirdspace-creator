---
name: packaging-creatoros-release
description: Use when the user asks to build, package, prepare, or inspect official CreatorOS desktop installers, including 本地包、正式包、官方包、v1.0、macOS DMG、Windows setup、GitHub Actions、Apple 签名或公证；不用于渠道包或白标包。
---

# CreatorOS 官方打包

## 核心原则

把打包视为代码冻结期。只合并已经获得用户批准并已提交的代码、执行基本安全预检、调用现有打包入口和核验产物。

**打包期间严禁修改产品代码、交互、视觉、测试断言、构建脚本、workflow 或文档来消除失败。** 任一步失败都停止并报告；需要修复时退出本 Skill，先取得用户对独立代码任务的明确同意，完成并提交后再重新进入打包。

## 先确认授权边界

区分以下动作，不相互推定授权：

| 动作 | 所需授权 |
| --- | --- |
| 本地快速官方包 | 用户要求本地打包 |
| 合并、推送、触发正式双平台构建 | 用户明确要求正式打包 |
| 创建版本 tag、GitHub Release、上传或公开分发 | 用户对发布动作再次明确确认 |
| 修改 Activity/Growth 版本、下载地址或向真实用户放量 | 用户对生产变更再次明确确认 |

未获后一项授权时，只产出并下载 GitHub Actions artifacts，不创建 tag 或 Release，不改生产配置。

## 冻结检查

在任何构建前执行：

1. 用 `git status --porcelain=v1` 证明工作树干净，用 `git diff --check` 证明无冲突标记或空白错误。
2. 记录当前分支和精确 `HEAD`；只接受已经提交且属于用户批准范围的候选。发现未提交文件、未合并路径或范围不明的提交时停止。
3. 核对 `frontend/package.json`、`frontend/src-tauri/tauri.conf.json`、`frontend/src-tauri/Cargo.toml` 与 `frontend/src-tauri/Cargo.lock` 的版本完全一致，并等于用户指定版本。
4. 检查候选相对 `origin/main` 的提交和文件清单，确认没有私钥、token、密码、激活码或渠道清单进入提交。不得读取或打印 GitHub Secrets 的值。
5. 只运行打包相关基本测试，不运行视觉校验，也不借打包触发全量产品改造：

   ```bash
   pnpm -C frontend exec vitest run \
     scripts/desktop/package-local.test.mjs \
     scripts/desktop/desktop-release-workflow.test.mjs \
     scripts/desktop/notarize.test.mjs \
     scripts/desktop/tauri-signing-config.test.mjs
   ```

预检失败即停止。禁止 `apply_patch`、自动修复、放宽检查或改测试洗绿。

## 本地快速官方包

只运行仓库固定入口：

```bash
pnpm -C frontend desktop:package-local
```

本地包不要求 Apple 公证。完成后报告规范产物路径、SHA-256、`hdiutil verify` 结果，以及本机安装和真实启动结果。不得把本地 ad-hoc 签名包描述为已公证正式包。

## 正式双平台官方包

1. 执行 `git fetch origin`，再次确认冻结检查通过。
2. 若 `origin/main` 是候选 `HEAD` 的祖先，以非强推方式把候选快进到 `main`。若已分叉，只允许普通合并 `origin/main`；出现冲突立即停止，不在打包阶段解决冲突或改代码。
3. 推送候选分支和 `main`，禁止 force-push。重新 fetch，并证明 `origin/main` 等于候选 SHA。
4. 从 `main` 手动触发现有正式 workflow 的双平台矩阵：

   ```bash
   gh workflow run desktop-release.yml --ref main -f only=all
   ```

5. 持续跟踪同一 run。失败时保留 run URL、失败 job 和原始日志摘要并停止，不修改代码自救。
6. 成功后下载 artifacts 到独立目录，计算每个安装包 SHA-256。

正式成功必须同时有以下证据：

- macOS job 成功，且日志证明 Developer ID 签名、Apple notarization、staple、Gatekeeper、DMG 内应用校验和真启动均通过。
- Windows job 成功，且日志证明 NSIS 真安装、主页面真启动和卸载清理通过。
- artifacts 同时包含用户可安装的 macOS `.dmg` 与 Windows `setup.exe`。
- Windows 没有 Authenticode 时明确写“Windows 未签名（用户已接受）”，不得暗示已签名。

## 禁止事项

- 不运行视觉校验，不改视觉。
- 不把官方包转成渠道包，不设置渠道 manifest 或白标环境。
- 不使用 `git reset --hard`、覆盖式 checkout、force-push 或删除用户改动。
- 不因“只是安全增强”“顺手修一下”“不修就发不了”而越权改代码；这些理由都意味着停止并向用户报告。
- 不把 workflow 定义存在当成公证成功；只认当前候选 SHA 对应 run 的真实日志和产物。

## 交付回报

精确报告候选 SHA、`main` SHA、GitHub run URL、四项基本测试、macOS 公证链、Windows 未签名边界、两个安装包路径和 SHA-256。另列未执行事项：tag、GitHub Release、公开分发、Activity/Growth 更新和真实用户放量。
