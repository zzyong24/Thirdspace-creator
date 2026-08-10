# T-753 渠道 GitHub 打包 Skill RED 基线

日期：2026-08-10
基线：`main@cefa4f5fe1313a929297eb67b36344253ad58166`

## 压力场景

用户要求未来 N 个已登记渠道都能从 GitHub 手动构建双平台正式包：macOS 必须 Developer ID
签名与公证，Windows 暂可未签名；只上传 Actions artifact，不得修改官方 workflow、创建 Release、
更新 Growth/CDN 或放量。

## 未升级 Skill 的真实失败

只读代理使用当时的 `.agents/skills/packaging-creatoros-channel/SKILL.md` 与仓库入口后停止，原因：

- 仓库只有官方 `.github/workflows/desktop-release.yml`，它不接收 `packageRef`，强行触发只会产出官方 CreatorOS；
- 旧 Skill 只有本地 `desktop:package-channel` 命令，没有 GitHub 触发、跟踪和停止点；
- `package-channel.mjs --mode release` 没有自行强制正式 profile；
- `attestation.stable.signed` 由 `mode === "release"` 直接推导，不是真实签名结果；
- 没有按 manifest 动态验收 macOS app/identifier 与 Windows binary；
- 旧规则把 Windows 签名当作强 Gate，无法表达用户本轮明确接受的“未签名但如实标注”边界。

因此基线代理拒绝运行 `gh workflow run desktop-release.yml`，结论为“不能无歧义完成”。这份失败记录
只证明 Skill/发布基础设施缺口，不冒充构建或安装证据。

代码 RED 命令：

```text
pnpm -C frontend exec vitest run scripts/desktop/channel-package-workflow.test.mjs
FAIL：ENOENT，缺 .github/workflows/channel-package.yml（1 failed suite，0 tests）
```

## GREEN 前向测试

同一只读代理加载升级后的 Skill 后能无歧义给出：渠道目录提交/identity lock/双端 plan-only 检查、
`gh workflow run channel-package.yml --ref main -f package_ref=zhisu-ai -f only=all`、按候选 SHA 锁定
同一 run、macOS 签名公证 Gate、Windows `unsigned-accepted-risk` 真安装/启动/卸载 Gate，以及只到
Actions artifact 的停止点。代理仍正确阻止“未提交 workflow 直接触发”，说明 Skill 没有把文档能力
误当成远端已生效能力。
