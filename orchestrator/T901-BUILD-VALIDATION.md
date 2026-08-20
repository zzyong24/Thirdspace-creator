# T-901 构建与本地安装验收

日期：2026-08-19
代码候选：`06edc48df79eb108894a6f0fb22ff597dbfa0704`

## 用户问题与修复结论

真实任务在 HyperFrames、faststart 和 ffprobe 结构校验完成后，仅因平均视频码率
`2890kbps < 5000kbps` 被 `BITRATE_BELOW_MIN` 取消。修复后：

- codec、尺寸、fps、像素格式、BT.709、时长和探针有效性继续失败关闭；
- 平均码率低于建议值返回 `status=warning` 与
  `warningCode=BITRATE_BELOW_RECOMMENDED`；
- 步骤日志明确提示码率低于建议值，但任务继续成功并保留 `out/final.mp4`；
- 不新增二次编码，不为追求固定数字重复压缩结构合格的画面。

## TDD 与工程验证

- RED：新回归首先稳定得到旧错误
  `BITRATE_BELOW_MIN: actualKbps=3250, minimumKbps=5000, targetKbps=10000`。
- GREEN：
  `pnpm --dir backend exec vitest run src/modules/execution/video-render/executor.test.ts src/modules/execution/video-render/template.test.ts`
  → 2 文件、104 测试通过。
- `pnpm --dir backend typecheck` → 通过。
- `node --test orchestrator/process/critical-path-availability-rule.test.mjs` → 1/1 通过。
- `node orchestrator/process/boundary-scan.mjs` → 无新增架构违规，既有基线 5 条。
- `node orchestrator/process/orphan-scan.mjs` → 0 error，追踪链双向完整。
- `node orchestrator/process/semantic-boundary-scan.mjs` → 通过。
- `node orchestrator/process/test-integrity.mjs` → 0 error；新增测试与断言未削弱既有门。
- 打包预检四组测试 → 4 文件、42 测试通过。

## 本地 macOS 包

- 固定入口：`pnpm -C frontend desktop:package-local`
- 版本：package / Tauri / Cargo / Cargo.lock 均为 `1.1.0`。
- 产物：`/Users/zyongzhu/Downloads/CreatorOS-1.1.0.dmg`
- SHA-256：`f77fb67a1a5f3e162683d8d1cd17abd533b7789d4eb59ad98ed2b4a440bbd830`
- `hdiutil verify`：VALID。
- 最终 `.app`：`codesign --verify --deep --strict` 通过（本地 ad-hoc 签名）。
- 安装与启动：已替换 `/Applications/CreatorOS.app`，版本 `1.1.0`，主进程 PID `9735`。
- 边界：本地包未配置 Developer ID 与 Apple 公证凭据，因此不是已公证正式分发包。

## 全局流程检查边界

`reconcile.mjs` 本轮确认 orphan、architecture、knowledge 与 LED-043 守卫均通过，但最终仍因仓库已有
98 条历史 review/frontend receipt 欠账退出 1；其中包括旧任务 SPEC 链接缺失、旧 strict BACKLOG
无验收列及先前 receipt watched paths 漂移。它们不由 T-901 引入，也不影响上述聚焦测试与本地包构建，
本记录不把全局 reconcile 写成全绿。
