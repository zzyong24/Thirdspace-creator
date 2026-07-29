# T-565 Runtime 少文件化 RAT 证据

> 日期：2026-07-27
> 范围：本地 macOS arm64 已组装 sidecar；不冒充 Windows/NTFS 证据
> 目的：在 Product Gate 前验证“高置信生产冗余可删除”以及动态依赖仍能真实运行。

## 1. 输入

- runtime：`frontend/src-tauri/sidecar`
- Node：sidecar 自带 `server.app/Contents/MacOS/creatoros-server`，v25.9.0
- 基线：26,381 个普通文件、692 个符号链接、1,121,903,925 bytes
- 执行副本：`cp -cR` 创建的 `/tmp/creatoros-t565-rat.IMnMAm/sidecar`
- 仓库原 runtime 未被修改。

## 2. RAT-565-01：确定性 prune

机器规则：

- 删除 `*.map`；
- 删除 `*.d.ts`、`*.d.mts`、`*.d.cts`；
- 删除 README 与 test/tests/testing/fixture/fixtures/example/examples/docs 目录内文件；
- 永久保留 LICENSE/LICENCE/NOTICE/COPYING/COPYRIGHT/AUTHORS；
- 不按 `*.ts` 全局删除，不删除普通 JS/JSON，不删除 native/WASM。

实现与测试：

- `frontend/scripts/desktop/runtime-prune-rat.mjs`
- `frontend/scripts/desktop/runtime-prune-rat.test.mjs`
- `pnpm exec vitest run scripts/desktop/runtime-prune-rat.test.mjs
  scripts/desktop/runtime-inventory.test.mjs`
- 结果：2 个测试文件、7 个测试全部通过。

真实 inventory/prune：

```text
source-map        3,907 files   76,404,009 bytes
type-declaration  4,898 files   26,685,188 bytes
documentation       421 files    2,502,551 bytes
test-fixture         775 files    7,502,860 bytes
合计              10,001 entries 113,094,608 bytes
```

应用后：

```text
普通文件 26,381 → 16,381（-37.91%）
符号链接 692 → 691
总字节 1,121,903,925 → 1,008,809,317（-10.08%）
missing=0
```

结论：首个“文件数至少下降 30%”假设成立；但 16,381 仍高于正式目标 5,000，后续必须做
JS/JSON production closure bundle，不能把本次 prune 冒充最终方案。

## 3. RAT-565-02：真实 runtime smoke

全部命令都在 prune 后副本执行，并使用随包 Node/runtime：

| 能力 | 真实动作 | 结果 |
|---|---|---|
| Next | `require("next")` | PASS |
| PGlite | 创建内存库、执行 `select 1`、关闭 | PASS |
| Pi | 动态导入 `pi-coding-agent/dist/core/sdk.js` 并检查 exports | PASS |
| Playwright/Chromium | 用生产同款 bundled Chromium executable 启动浏览器、创建页面、校验 title、关闭 | PASS |
| Xenova/ONNX/sharp | `require("@xenova/transformers")`，校验 `pipeline` 与 `env`；连带 native load | PASS |
| HyperFrames | 随包 Node 执行 `dist/cli.js --help` | PASS |
| ffmpeg/ffprobe | 随包二进制执行 `-version` | PASS |
| 完整 Next sidecar | production smoke bypass 下启动 `server.js`，出现固定 startup sentinel | PASS |
| 主 HTML | `GET http://127.0.0.1:43165/` 返回 HTTP 200、64,784 bytes、title=CreatorOS | PASS |
| 退出清理 | SIGINT 后 lifecycle flush PGlite 并退出 | PASS |

过程中的三次 harness 修正如实保留：

1. 首次 one-liner 未 export `RAT_ROOT`，在进入产品代码前失败；
2. 首次 PGlite 定位把 scoped 目录误当包，改为
   `.next/node_modules/@electric-sql/pglite-*` 后通过；
3. 裸 `chromium.launch()` 会寻找未随包交付的 `chromium_headless_shell`。CreatorOS 生产代码本就
   通过 bundled Chromium 扫描器显式传 `executablePath`；按该真实路径执行后通过。该事实也说明
   后续 bundle smoke 必须调用生产 resolver，不能只测 Playwright 默认值。

## 4. Gate 结论

- RAT-565-01：PASS，但只证明第一阶段 prune，不证明最终 ≤5,000。
- RAT-565-02：PASS；已覆盖 SPEC 列出的动态依赖与实际 Next 主页面。
- RAT-565-03/04：PENDING，需要 Windows 原生环境/付费 runner 的另行授权。
- 当前允许重新送 Product SPEC 独立评审；不允许据此宣称 Windows 安装器或正式发布已完成。
