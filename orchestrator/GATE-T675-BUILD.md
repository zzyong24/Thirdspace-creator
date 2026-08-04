# T-675 Windows 生产闭包默认发布与本地安装包验收

## 结论

Windows 正式发布已恢复为 2026-07-26 验证过的生产闭包思路，并收敛成正式发布与 RAT 共用的
唯一构建入口。默认流水线不再把完整 `node_modules` 复制进安装包；安装包只有在真实安装、首次
启动主页面加载和主动卸载全部通过后才允许上传。

```text
Next 生产构建 → NCC/依赖闭包 → 分层 runtime → 真实功能冒烟
       → Tauri/NSIS 安装器 → 真安装 → 真首启 → 真卸载 → 上传
```

## 正式流水线证据

- GitHub Actions：<https://github.com/zzyong24/Thirdspace-creator/actions/runs/30885893152>
- 验证提交：`25c019c75e6369cad0452ca3547bc408e7d98b4e`
- 结果：成功，Windows build job 24 分 21 秒。
- 安装包：`CreatorOS_0.2.1-beta.3_x64-setup.exe`
- 安装包大小：474,935,501 bytes（约 453 MiB，低于 600 MB Gate）。
- SHA-256：`fee064888038a88cd537f4757ea9d8bda6d3fd830dd0e5dd1c419b180e87a5ba`
- 安装耗时：21,206 ms。
- 首次启动并加载主页面：28,154 ms。
- 安装后 runtime：3,054 个文件；`node_modules` 目录 0；链接/重解析点 0。
- 卸载 Gate：通过。

## 运行时能力证据

生产闭包真实冒烟通过：Zod v3/v4、OpenTelemetry、S3、PGlite、Xenova/Sharp、Pi、
HyperFrames CLI、ffmpeg、ffprobe、随包 Chromium、HyperFrames 真渲染、Next 主页面和
Windows stdin 关闭哨兵。闭包共 3,046 个文件，未包含 `node_modules`。

本轮额外修复了 Windows 下 HyperFrames 仅靠 `PATH` 偶发找不到随包 ffmpeg/ffprobe 的问题：
业务渲染和闭包验收都改为传入已经验证的绝对路径，不以绕过或假冒烟替代真实渲染。

## 本地交付

- 安装包：`/Users/zyongzhu/Downloads/CreatorOS-Windows-production-closure-30885893152/CreatorOS_0.2.1-beta.3_x64-setup.exe`
- 流水线原始证据：`/Users/zyongzhu/Downloads/CreatorOS-Windows-production-closure-30885893152/evidence/`

## 自动化回归

- `node --test tools/windows-closure-rat/build-production-closure.test.mjs`：5/5 通过。
- `pnpm -C backend exec vitest run src/modules/execution/video-render/executor.test.ts src/modules/execution/child-env.test.ts`：11/11 通过。
- `pnpm -C backend exec tsc --noEmit`：通过。
- `pnpm -C frontend exec tsc --noEmit`：通过。
- `git diff --check`：通过。

## 全局审计说明

`reconcile` 的边界、孤儿、知识回归等实现 Gate 均已通过；全局收敛仍报告既有任务
T-656/T-653/T-645/T-642/T-635 的旧评审回执，以及 T-668/T-663 的前端回执失效。T-675
自身的评审回执也绑定了评审时的
SPEC 哈希 `2bdf96fcfa79`，而当前已提交 SPEC 哈希为 `0707d05c5baf`，因此诚实记录为“回执过期”，
不把它补拍成 PASS。上述审计记录不改变本页列出的真实 Windows 构建、安装、首启、卸载与功能
冒烟证据。
