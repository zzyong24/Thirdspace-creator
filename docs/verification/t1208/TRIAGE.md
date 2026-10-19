# T-1208 失败复核记录（进行中）

## 已确认并修复：没有视频作品的项目无法进入剪辑备料

T-1207 的 [剪辑恢复用例](../t1207/E2E-CASE-INDEX.md) 进入制作页时没有创建视频作品。浏览器一直只显示“正在恢复当前剪辑工作台…”，因此粗剪视频上传入口不可达。原因是共享会话宿主只接管已有 `outputId` 的作品，但入口组件在宿主存在时无条件显示恢复态。

现在只有当前项目已有视频作品时才等待共享会话接管。没有 `outputId` 时，入口直接打开普通备料工作台，使新项目可以上传粗剪视频并继续制作。改动位于 [production-editor-entry.tsx](../../../frontend/src/features/production/production-editor-entry.tsx)，回归覆盖见 [production-editor-entry.test.tsx](../../../frontend/src/features/production/production-editor-entry.test.tsx) 和 [production-empty-workbench.spec.ts](../../../frontend/tests/e2e/production-empty-workbench.spec.ts)。

验证记录：

- 先添加组件回归并确认旧代码失败：空作品下只能找到“正在恢复当前剪辑工作台…”，找不到备料入口。
- `pnpm --dir frontend exec vitest run src/features/production/production-editor-entry.test.tsx`：4 项通过。
- `CREATOROS_TEST_PORT=3924 pnpm --dir frontend exec playwright test --project=e2e tests/e2e/production-empty-workbench.spec.ts --workers=1 --retries=0 --output ../docs/verification/t1208/production-empty-workbench-recheck-output --trace retain-on-failure`：1 项通过。用例通过隔离公开接口创建账号和空视频项目，打开剪辑备料、截图，并真实上传仓库中的中性 MP4 样本。
- [空作品剪辑页截图](no-video-output-workbench.png) 展示无需已有视频作品即可到达的上传与备料流程。

对原 `ai-reliability-recovery` 浏览器旅程的复跑也通过了页面进入及视频、SRT 上传；之后停在该用例对无效字幕任务状态的断言：预期 `cancelled`，服务实际返回 `failed`。这属于另一个待复核项，本次没有改动其断言或任务语义。

T-1207 的全量截图与首次失败记录保持原样。T-1208 仍在进行中，其余尚未逐例定因的功能失败不在本记录中标作已修复或环境问题。
