# Playwright Bytecode and Public Update Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复安装版 Playwright 页内函数无法序列化的问题，并把检查更新从授权服务迁到官网公开静态版本文件。

**Architecture:** 打包保护层识别必须保留 `Function.prototype.toString()` 源码的浏览器序列化 API；命中后只做 rename-only，且跳过 Bytenode。更新检查留在前端薄封装中，读取官网静态 `latest.json`，只采纳版本与说明，下载地址固定为官网，完全不向授权域名发送数据。

**Tech Stack:** JavaScript/Vitest、TypeScript/Vitest、Playwright、javascript-obfuscator、Bytenode、Tauri API。

---

### Task 1: Playwright 序列化保护门

**Files:**
- Modify: `frontend/scripts/desktop/obfuscate.mjs`
- Modify: `frontend/scripts/desktop/obfuscate.test.mjs`
- Modify: `frontend/scripts/desktop/bytecode.mjs`
- Create: `frontend/scripts/desktop/bytecode.test.mjs`

- [x] **Step 1: 写失败测试**

新增覆盖 `evaluate`、`evaluateHandle`、`evaluateAll`、`$eval`、`$$eval`、`waitForFunction`、`addInitScript` 的识别测试；断言命中 chunk 必须选 `rename-only`，且 `shouldBytecode()` 返回 false。

```js
expect(requiresSerializableFunctionSource("page.evaluate(() => 'ok')")).toBe(true);
expect(pickPreset("page.evaluate(() => 'ok')", "chunks/x.js")).toBe("rename-only");
expect(shouldBytecode("page.evaluate(() => 'ok')", "chunks/x.js")).toBe(false);
```

- [x] **Step 2: 运行红灯**

Run: `pnpm --dir frontend exec vitest run scripts/desktop/obfuscate.test.mjs scripts/desktop/bytecode.test.mjs`

Expected: FAIL，因为识别函数与字节码排除尚未实现。

- [x] **Step 3: 实现最小保护门**

```js
export function requiresSerializableFunctionSource(code) {
  return /\.(?:evaluate|evaluateAll|evaluateHandle|waitForFunction|addInitScript)\s*\(|\.\$\$?eval\s*\(/.test(code);
}
```

`pickPreset()` 命中时优先返回 `rename-only`；`shouldBytecode()` 命中时直接返回 false。

- [x] **Step 4: 跑绿灯并扫描产物**

Run: `pnpm --dir frontend exec vitest run scripts/desktop/obfuscate.test.mjs scripts/desktop/bytecode.test.mjs`

Expected: PASS；并用 `rg` 确认所有生产源码中的上述调用均被规则覆盖。

### Task 2: 官网公开版本检查

**Files:**
- Modify: `frontend/src/lib/desktop-updater.ts`
- Modify: `frontend/src/lib/desktop-updater.test.ts`
- Modify: `frontend/src/features/settings/check-update-card.test.tsx`

- [x] **Step 1: 写失败测试**

桌面态 mock `getVersion()` 与 `fetch()`，断言仅 GET `https://creatoros.aitongban.cloud/updates/latest.json`、不调用 `license_latest_version` IPC，并把下载地址固定为 `https://creatoros.aitongban.cloud/`。

```ts
expect(fetch).toHaveBeenCalledWith(OFFICIAL_UPDATE_MANIFEST_URL, {
  method: "GET",
  cache: "no-store",
});
expect(mockInvoke).not.toHaveBeenCalledWith("license_latest_version");
```

- [x] **Step 2: 运行红灯**

Run: `pnpm --dir frontend exec vitest run src/lib/desktop-updater.test.ts`

Expected: FAIL，因为当前实现仍调用授权 IPC。

- [x] **Step 3: 实现公开静态源与版本比较**

```ts
export const OFFICIAL_UPDATE_MANIFEST_URL =
  "https://creatoros.aitongban.cloud/updates/latest.json";
export const OFFICIAL_DOWNLOAD_URL = "https://creatoros.aitongban.cloud/";
```

只读取 manifest 的 `version`/`notes`；忽略其中任意 URL，当前版本从 Tauri `getVersion()` 获取，语义版本在本地比较。

- [x] **Step 4: 跑绿灯与 UI 回归**

Run: `pnpm --dir frontend exec vitest run src/lib/desktop-updater.test.ts src/features/settings/check-update-card.test.tsx`

Expected: PASS；失败响应仍显示可读错误，不泄技术串。

### Task 3: 综合验证与收口

**Files:**
- Modify: `BACKLOG.md`
- Modify: `docs/superpowers/plans/2026-07-21-playwright-bytecode-public-update-plan.md`

- [x] **Step 1: 运行 TypeScript/ESLint/Rust 回归**

Run: `pnpm --dir frontend run typecheck` 与定向 ESLint。全库 `pnpm --dir frontend run lint`
仍会扫描已打包 sidecar/.next 产物及历史源码，当前基线为 966 errors；本次设置文件与
`HEAD` 对比均为相同 11 errors/3 warnings，本次其余改动文件定向 ESLint 为 0 errors。

Run: `cargo test --lib` in `frontend/src-tauri`

Expected: 全绿。

- [x] **Step 2: 运行打包规则级验证**

对真实 `.next/server/chunks` 扫描：含浏览器序列化 API 的 chunk 必须全部判为 rename-only 且 `shouldBytecode=false`；普通业务 chunk 仍保持字节码保护。

- [x] **Step 3: 跑架构门卫与 diff 检查**

Run: `node orchestrator/process/boundary-scan.mjs`

Run: `git diff --check && git status --short`

Expected: 不新增边界违规，diff 无空白错误。

- [x] **Step 4: 更新台账并提交**

把 T-459 标为代码完成并记录验证证据；只提交本任务文件，不触发收费 GitHub Actions。
