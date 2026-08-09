# CreatorOS V1.0 候选发布评审

> 任务：T-728
> 日期：2026-08-08（America/Los_Angeles）
> 当前裁决：**候选 Gate 进行中；生产发布 NO-GO**

### Release scope

- 仅包含 2026-08-08 历史 working-tree 快照中已获用户确认的改动，以及本轮发现的发布阻断修复。
- 正式收口 Activity `config-access-ticket-v3`、Growth 签名 bundle、长期受管模型 Keyring、ASR 短时
  lease 和 Growth 用户额度入口。
- 桌面产品版本统一到 `1.0.0`，并收口 macOS Developer ID/公证/staple/Gatekeeper/真启动 workflow。
- 不把所有开放 BACKLOG 需求并入 V1；不创建 tag/Release，不分发安装包，不改生产更新口径，不放量。

### Artifacts reviewed

- 上游真相：`BACKLOG.md` T-728、
  `docs/superpowers/specs/2026-08-08-creatoros-v1-release-candidate.md`、`PROJECT.md`、
  `PROJECT_CONTEXT.md`、`orchestrator/ARTIFACT_MANIFEST.yaml`、
  `orchestrator/SYSTEM_ARCHITECTURE.md`。
- 集成证据：`INTEGRATION_REPORT.md`、`docs/RELEASE_NOTES_V1.0.0.md`、
  `.github/workflows/desktop-release.yml`、`orchestrator/evidence/T-728-dirty-worktree-inventory.md`。
- 历史回执保持 append-only；T-722 当前回执为 `PASS:98600ee0109a`，未改写旧 receipt。
- 独立上线审计将归档为 `docs/research/2026-08-08-creatoros-v1-prelaunch-audit.md`。

### Verification evidence

- `contract`：typecheck PASS；147/147 测试 PASS。
- `ai-worker`：typecheck PASS；333/333 测试 PASS。
- `backend`：typecheck PASS；221 文件 PASS、2 skipped；2765 测试 PASS、4 skipped。
- `frontend`：typecheck PASS；317 文件 PASS；2896 测试 PASS、1 todo；Next.js production build PASS。
- 桌面脚本：242/242 PASS；Rust：155 PASS、1 个 live Growth/AM 测试 ignored。
- 版本面 `frontend/package.json`、`tauri.conf.json`、`Cargo.toml`、`Cargo.lock` 均为 `1.0.0`。
- boundary/orphan/review/reconcile/prelaunch 结果待本轮最终 Gate 回填；未回填前不宣称发布门全绿。

### Open risks

- **High — Windows 未签名**：未接 Authenticode/Azure Trusted Signing，Windows 只能作为 unsigned
  候选边界，不能宣称双平台正式就绪。
- **High — macOS 成品回执缺失**：workflow 已失败关闭，但本轮没有 Developer ID 凭据驱动的 V1.0
  DMG、公证/staple/Gatekeeper 和安装版真启动实物证据。
- **High — 门禁历史债**：前端全仓 lint 为 62 errors / 164 warnings（T-729）；orchestrator 全量流程
  测试 92 通过、28 失败（T-730）。候选聚焦测试通过，但正式发布是否接受这些风险尚未获用户确认。
- **High — J-142 未做真实经济联调**：没有全新一次性测试码，也没有用户对真实 5 CNY/OmniHi Key
  创建的再次确认。
- 独立 prelaunch audit 尚未给出终局；其 Blocker/High 可能提高本评审风险等级。

### Deferred work

- T-729：恢复前端生产源码 ESLint 零错误门。
- T-730：补齐 orchestrator 缺失夹具并恢复全量 process 测试基线。
- Windows 代码签名、真实安装版跨系统 E2E、正式 J-142 经济联调均不在未经再次确认的自动执行范围。
- 其余开放产品需求继续留在 BACKLOG，未混入 V1 范围承诺。

### Rollback or recovery notes

- 原主仓脏 checkout 未被 reset/checkout 覆盖；候选在独立 worktree 整理。
- 仓库外恢复目录 `/Users/zyongzhu/.codex/creatoros-v1-recovery.WdNj0F` 包含 unstaged diff、空 staged
  diff、untracked tar、完整清单、SHA-256 和排除的临时产物，可用于逐项恢复。
- 候选合并前会重新 fetch `origin/main` 并用正常 merge 处理；禁止 force-push。正式发布前仍可按候选
  提交边界回滚，且不会修改生产 Activity 版本指针。

### Approval decision

- **代码候选**：待 boundary/orphan/review/reconcile 与独立 prelaunch audit 完成后决定是否可合并推送。
- **生产发布**：当前明确 **NO-GO**。没有用户最终确认，不创建 `v1.0.0` tag、GitHub Release，
  不上传/分发安装包，不改 Activity/渠道公告，不正式放量。
- **J-142**：当前未完成。若用户希望本轮执行，必须先提供专用全新一次性测试码并确认允许产生真实
  5 CNY 额度与 OmniHi Key；共享码不允许使用。

### Follow-up triggers

- 独立 prelaunch audit Blocker=0 且 High 全部有任务归属后，才可申请候选 Gate 结论。
- 候选合入并推送后，向用户报告 main/candidate SHA 与完整证据，触发最终发布确认点。
- 只有收到明确最终确认，才可另起任务创建 tag/Release、构建与分发安装包、更新生产 Activity 或放量。
