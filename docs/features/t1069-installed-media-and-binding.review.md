# SPEC Review — current

- Task: T-1069
- Verdict: PASS
- Round: 1/3 (initial)
- Spec receipt: 0363fa6014a1
- Review receipt: 19bad8ef6f93

## 当前有效问题

当前无未销账问题。

已销账：—

```spec-review-state
{
  "schema": "spec-review-state/v2",
  "task_id": "T-1069",
  "cycle": 2,
  "round": 1,
  "max_rounds": 3,
  "review_kind": "initial",
  "verdict": "PASS",
  "summary": "T-1069 当前完整 SPEC（含组内平台登录、统一视觉选择器全部 13 入口、同作品活会话与离开保护、视频导入可用性及性能合同、精确实现/验证/原生交付写集、公共操作归属及两轮稳定宿主补充）独立首轮完整静态审核通过，findings=[]。本轮亦核对实际 Tab 丢稿根因与精确容器补充（T1069-STABLE-SHELL-HOST）。SPEC docs/features/t1069-installed-media-and-binding.md SHA256=0363fa6014a11328af557cf01f3a1f3151ff524ac6b0cbb95acaff4d4983327d；constitution docs/产品定位.md SHA256=86bc2c8add6a01ebf5b2ecf9de05d448770ca14a4e0bdbbf376fffc6387e3800。已核对完整 SPEC、产品宪法、项目记忆、3.27.4 技能与项目版本、实际 AppShell/PageScrollArea/共享 ScrollArea、ShellRouter/ProjectVideoSessionHost、creation-workspace-scope 和 frontend/tests/e2e/t1069-media-tab-session.spec.ts；同时核对本地验收根 t1069-tests/media-tab-public-name-edit.log 与 media-tab-layout-red 的真实失败记录。日志实际止于原 native root.isConnected=false 的断言，前置两个中性视频导入、未保存状态、加入时间轴及工程名编辑已执行；后续保存/刷新尚未在该次运行验证。现 AppShell 的 contentFill 分支改变 PageScrollArea 与直接 div 的组件祖先树，ShellRouter 虽在 WorkspaceInitializationBoundary 外持有唯一 Host，仍会随该祖先更换销毁，补充指出的根因与真实源码、RED 相符。仅新增 frontend/src/components/shell/app-shell.tsx 与 app-shell.test.tsx 两条精确路径，始终保留同一 PageScrollArea/ScrollArea viewport/内容 div，用 CSS 切换滚动与尺寸，可在现有组件 API 内实现，无需改共享 ScrollArea、路由、业务层、API、数据库或原归属合同。实施时 CSS 必须仅命中外层直接 viewport、Radix 直接内容包装层及直接 scrollbar，覆盖其实际 overflow 样式；填满模式恢复满高/min-h-0 并把滚动留给原工作台内部，普通模式保留页面滚动，不可把嵌套素材/时间轴滚动一并禁用。此为实现检查点，不新增产品范围。现有真实 group/account scope 由 creationScopeKey 与冻结 Session owner 管理，补充不改变它；实际项目/作品可见性、未知意图恢复、切组迟到隔离、单引擎及 dispose 顺序继续按原合同验证，不能由固定外层树推定已正确。新测试要求真实 PageScrollArea/ScrollArea 的双向 contentFill 切换，检验 mount 数、DOM 身份及本地未保存状态；原公共导入/时间轴/Tab 返回/正式 revision 不增加/保存/刷新断言继续保留，不得弱化已失败的 isConnected 检查。普通页与填满页真实滚动、目标视口、200% 和原 purple/tokens 视觉基线继续验证。全部原 13 素材入口、精确 file 引用与模板全链、assets.search 公共 SQL/typed client、组绑定事务和实际用户登录、导入进度/性能/恢复、LED-047/LED-053、boundary/orphan、native 源与 bundle 核验、完整 reconcile 与真实安装验收均未减少。与宪法可恢复、真实证据、人工确认、数据归属、单一写者及可用性原则一致。本 PASS 仅表示当前完整 SPEC 及两文件补充方案和精确范围可实施，未修改产品/控制面，未运行新测试，不代签实现、性能提速、视觉/滚动或安装包验收，也不把该次 RED 之后未执行的保存刷新补拍为 PASS。",
  "spec_path": "docs/features/t1069-installed-media-and-binding.md",
  "spec_sha256": "0363fa6014a11328af557cf01f3a1f3151ff524ac6b0cbb95acaff4d4983327d",
  "constitution_path": "docs/产品定位.md",
  "constitution_sha256": "86bc2c8add6a01ebf5b2ecf9de05d448770ca14a4e0bdbbf376fffc6387e3800",
  "review_path": "docs/features/t1069-installed-media-and-binding.review.md",
  "review_mode": "subagent",
  "model": "Codex（当前继承模型，未额外指定）",
  "policy": "convergent-review/v2",
  "cycle_authorization": {
    "schema": "review-cycle-capability-consumption/v1",
    "decision_id": "DEC-106901",
    "nonce": "376c98a7-c028-4c25-9488-0eeaf6abc17c",
    "task_id": "T-1069",
    "previous_event_hash": "9b40a0f7efe230388fe440aaec5a77518a3961363104f4cfaf20a4dd9b3b3f41",
    "allowed_change_ids": [
      "T1069-STABLE-SHELL-HOST"
    ],
    "max_uses": 1
  },
  "latest_event_hash": "5ddc5a54dc000d5f23ee09d095de76fdc2d46418c5a6702f652ce634afaaf654",
  "open_findings": [],
  "resolved_findings": [],
  "receipt": "19bad8ef6f93"
}
```
