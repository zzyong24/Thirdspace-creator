# SPEC Review — current

- Task: T-859
- Verdict: PASS
- Round: 1/3 (initial)
- Spec receipt: e5be057cd675
- Review receipt: eea836a09361

## 当前有效问题

当前无未销账问题。

已销账：—

```spec-review-state
{
  "schema": "spec-review-state/v2",
  "task_id": "T-859",
  "cycle": 3,
  "round": 1,
  "max_rounds": 3,
  "review_kind": "initial",
  "verdict": "PASS",
  "summary": "T-859 当前全文真实独立初审结论 PASS，未发现阻断规格缺陷。审核者 /root/t1408_pi_diagnosis 未编写本次 T-1415 SPEC、T-859 当前 SPEC 或 T-1414 的 AGENTS 实施改动；本轮仅写审核证据，不写控制面。已读取 T-1415 任务包 §1–5、§7–9，写前核对 §6 和精确授权；读完 T-1415 SPEC、当前 T-859 全文、当前 AGENTS、T-902 全文、DEC-VIDEO-056 原决定及适用 evidence/product-integrity 规则。精确模型身份未核实，不作异构模型声明。\n\n绑定 SPEC docs/superpowers/specs/2026-08-16-portrait-material-pip-smooth-transition.md，SHA-256=e5be057cd6751965e3f6827fa5529c9fc93c599624eab18443188c55597210f5；绑定宪法 AGENTS.md，SHA-256=cfc103d1f2772a3c373005e48191ce1990c73d237e52464f5f16084da51571e9。T-902 引用文件 SHA-256=b48369f7bcdaaafa73cc7fc8fe6dd056f363ef7e63d5673948a5772a42da680a。reviewctl context T-859 已实际读取，previous_round=1、previous_verdict=PASS、changed_line_refs=[]；当前 SPEC 未变，变化来自 T-1414 恢复既有完整可用性规则后的 AGENTS。该情况必须由主线程在 T-1415 规格通过后消费新的精确 typed 一次周期授权；本 JSON 的 initial 是当前全文独立审核，不是旧收据改哈希或原轮 recheck。本轮未调用 record/new-cycle。\n\n已完整核对 T-859 全部三条 canonical event 的原 packet：7ecee4ad256bec363dddb460304a16a51a24a24969514e3ef8a383562b0244cd、db0d70797f340d98150f2e44928f4c5ea3e4b2a74bd750d340c4a161d4e032ee、7cdc1d24e012d6bfe3493e9a31d4a09a0184d5aadf468cdb4ec8bd380853dc10；三轮 findings 均为空，不存在待销账原 finding。第一轮关于动态内容独占的旧摘要只属历史，不作为当前人物可见性依据；当前顶部纠偏、FR-859-1/2、§3.2/3.3 和 AC-859-1/3 已以 T-902 与 DEC-VIDEO-056 的后继用户确认收敛。原 events/旧宪法 SHA/验收事实须完整保留。\n\n人物与 PiP 合同核查：portrait 且有真实人物时，card 和非 overlay B-roll 始终保留同一 #th 节点、固定左下位置、同一时间轴；模型或旧候选 hidden 不再拥有最终执行权。连续素材或卡片只切内容，不反复全屏/PiP 弹跳；结束回到同一全幅几何。overlay 不升级为主视觉，横屏维持原主视觉切走策略，visualOnly 或合法无人物模式不伪造真人；损坏输入仍受既有结构校验约束。与 T-902 §2–4 及 DEC-VIDEO-056 一致，没有恢复被用户否定的竖屏 hidden fallback。\n\n可用性与边界核查：FR-859-3 区分真实白底和无内容空帧，预加载、旧/新/静态承接层覆盖画布与有限转场不改 beat 语义时间窗。§5 对无法绑定的 B-roll 跳过单个问题素材并保留有效视觉，对未解码首帧保留旧层，对碰撞先调整舞台/安全边距或回退安全基础布局；人物固定左下及字幕安全区不能被挤占，只有输入损坏、归属错误或所有安全输出均不可用才允许整单失败。结合 FR-859-1 完整 contain 与 T-902 可读安全区，舞台调整不构成任意裁掉素材可读区域或隐藏真人的授权。该恢复顺序符合 AGENTS 新恢复的完整关键链路规则，未新增必须 hard-fail 的审美门。AI 仅决定素材/内容/时点，代码仅落实真实引用、几何、安全和用户确认偏好；不新增存储、供应商、第二渲染链或跨层直连。\n\n验收覆盖核查：AC-859-1 要求真实 1080×1920、连续两段素材、动态内容、回位，并覆盖横/方/竖素材与碰撞降级；AC-859-2 要求四类交接边界逐帧、真实资源 ID/hash、MP4 和密集接触表，不能以素材真实白底误判空白；AC-859-3 明确 schema/runner 保留、portrait/landscape/visualOnly、旧候选、同节点连续 PiP、无 hidden tween、预加载与安全降级的红测/回归；AC-859-4 复用 T-858 真实人物、录屏、动态内容和字幕，由独立 reviewer 审看，用户预览确认后方可应用整片。AGENTS 要求的旧版成功样例、完整公共调用链和全部受判断影响输入族回归继续适用，孤立 helper/几何单测不得替代这些验收；T-859 没有豁免该要求或把局部预览声明为发布验收。\n\n本审核只签当前规格与恢复后的完整规则一致。未运行产品测试、渲染、业务 CLI 或真实模型请求，未验证现有实现/媒体产物，未补签 TDD 红测、样片、用户确认、整片或 full 通过。既有真实验收尚未完成须如实保留，不能由本次 PASS 或 T-1415 控制面收口覆盖。",
  "spec_path": "docs/superpowers/specs/2026-08-16-portrait-material-pip-smooth-transition.md",
  "spec_sha256": "e5be057cd6751965e3f6827fa5529c9fc93c599624eab18443188c55597210f5",
  "constitution_path": "AGENTS.md",
  "constitution_sha256": "cfc103d1f2772a3c373005e48191ce1990c73d237e52464f5f16084da51571e9",
  "review_path": "docs/superpowers/specs/2026-08-16-portrait-material-pip-smooth-transition.review.md",
  "review_mode": "homogeneous",
  "model": "inherited-session-model",
  "policy": "convergent-review/v2",
  "cycle_authorization": {
    "schema": "review-cycle-capability-consumption/v1",
    "decision_id": "DEC-141502",
    "nonce": "t1415-a53747dc-9b00-4cd5-b22e-6d30eeb8dbcd",
    "task_id": "T-859",
    "previous_event_hash": "7cdc1d24e012d6bfe3493e9a31d4a09a0184d5aadf468cdb4ec8bd380853dc10",
    "allowed_change_ids": [
      "T859-EXISTING-CRITICAL-PATH-RULE-RESTORED"
    ],
    "max_uses": 1
  },
  "latest_event_hash": "0eeeae12e1b948ddd37d54bd4824008a476e8ec110e8f3606353fb9fb30b6e07",
  "open_findings": [],
  "resolved_findings": [],
  "receipt": "eea836a09361"
}
```
