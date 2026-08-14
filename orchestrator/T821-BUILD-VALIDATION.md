# T-821 构建与验收记录

日期：2026-08-13

## 用户结果

- 网页读取明确需要登录时，“去网站登录保管库”会直达设置中的对应卡片，不再只落到设置首页。
- 网站返回 HTTP 拒绝时，错误卡不再暴露 `alternates`、`web.read` 等内部恢复说明。
- 错误卡明确说明“页面可能已下架，也可能需要登录或额外权限”，显示简短 HTTP 状态，并提供“前往网站登录”。
- 登录只是建议，不承诺一定恢复；登录后仍失败时建议换来源，且明确不会根据未读到的原文编造内容。
- 缺少 URL 等输入错误不会错误引导用户登录。

## TDD 证据

红测：

```text
pnpm --dir frontend exec vitest run \
  src/features/copilot/chat-web-read-card.test.tsx \
  src/features/settings/settings-interactive-region.test.tsx

结果：3 项新增场景失败，分别证明旧实现只有 /settings、错误卡仍暴露内部长文、设置页没有保管库定位锚点。
```

绿测：

```text
frontend：2 files / 55 tests passed
backend：1 file / 206 tests passed
关联对话与路由：2 files / 92 tests passed
frontend typecheck：PASS
backend typecheck：PASS
boundary-scan：0 新增违规（5 条既有基线）
semantic-boundary-scan：PASS
git diff --check：PASS
```

## 真实界面状态

本轮尝试启动源码开发服务做真实浏览器走查，但项目的桌面壳授权守卫会拒绝脱离 CreatorOS Rust 壳的独立启动；当前已安装应用也不包含本轮源码改动。因此没有用旧安装包或组件测试冒充真实界面 PASS。

任务保持 `待验`；待桌面开发态或下一本地包完成真实界面验收后，才能由任务工具写入正式 PASS 收据。

全局 `reconcile` 本轮仍因看板超限、历史评审收据漂移和其他任务的既有前端收据漂移失败；本任务聚焦测试、类型检查与边界检查均通过，但不把局部绿色冒充全局绿色。
