# T-788 BUILD Gate — Windows 素材文件定位跨平台修复

- 日期：2026-08-12
- 任务：T-788
- Gate：TDD + 跨平台执行计划 + 素材中心交互回归
- 结论：PASS（代码与自动回归）；Windows 最终安装物真机回执待下一次出包时完成

## 修复范围

- 保留原有用户/账号归属、storage root containment、symlink realpath 复查与项目目录创建行为。
- 只替换安全路径验证之后的系统启动层：`planRevealTarget` 负责平台决策，`launchRevealPlan` 负责
  spawn/exit 完成语义。
- 素材中心的按钮、成功和失败提示统一使用“文件管理器”中性文案。

## platform_execution_matrix

| 目标 | OS | command/API | shell-free argv/path | completion | user copy |
| --- | --- | --- | --- | --- | --- |
| 素材文件 | win32 | `explorer.exe` | 单一参数 `/select,<absolute path>`；覆盖空格与中文 | spawn | 打开位置 / 文件管理器 |
| 项目目录 | win32 | `explorer.exe` | 目录绝对路径独立 argv | spawn | 文件管理器 |
| 素材文件 | darwin | `open` | `-R`, absolute path | exit | 文件管理器 |
| 项目目录 | darwin | `open` | absolute path | exit | 文件管理器 |
| 素材文件 | linux | `xdg-open` | 文件父目录 | exit | 文件管理器 |
| 项目目录 | linux | `xdg-open` | 目录路径 | exit | 文件管理器 |
| 任意目标 | 其他 | 不执行 | — | 明确抛错 | 通用失败提示 |

## RED 证据

首次运行新增测试：

- `reveal/plan.test.ts` 因 `./plan` 不存在而失败；
- 素材交互测试期望 `aria-label="在文件管理器中显示"`，实际仍为 `在 Finder 显示`；
- 汇总：2 个测试文件失败，原有 10 项通过。

## GREEN 证据

```text
pnpm --dir frontend exec vitest run \
  src/app/api/v1/local/local-reveal-security.test.ts \
  src/app/api/v1/local/reveal-logs/plan.test.ts \
  src/app/api/v1/local/reveal-logs/launcher.test.ts \
  src/app/api/v1/local/reveal/plan.test.ts \
  src/app/api/v1/local/reveal/route.contract.test.ts \
  src/features/assets/assets-interactions.test.tsx \
  src/features/assets/assets-page.test.tsx

7 files passed · 50 tests passed
```

- `pnpm --dir frontend exec tsc --noEmit --pretty false`：PASS。
- 改动文件 ESLint：0 error。
- `lessonctl audit`：LED-022 已绑定同 ID 可执行守卫；其余提示为既有旧生命周期债务。
- `reconcile.mjs`：LED-022 guard holds；项目总结果仍为 7 errors / 8 warnings，分别来自既有
  BACKLOG runaway、旧 review/frontend receipt 漂移和 LED-018 浏览器交付复发，不属于 T-788 验收范围，
  未写成全局全绿。

## 诚实边界

当前环境是 macOS，无法把 Windows Explorer 窗口真实弹出作为本次证据。代码缺陷、参数计划、route
接线和 launcher 完成语义已经自动验证；下一次 Windows 正式/渠道出包仍须用最终安装物点击一个含中文
和空格路径的素材，确认 Explorer 打开并选中该文件，才能形成 SHIP 物理回执。
