# T-575 / T-076-CREATOR 独立评审记录

## Round 1 — 2026-07-27

- `review_mode`：`cross-family`
- 模型：`gpt-5.6-sol`
- 隔离：`codex exec -s read-only`，只输入评审量规、`docs/产品定位.md` 与被审 SPEC
- Verdict：`FAIL`
- Blocker：2

```json
{
  "verdict": "FAIL",
  "summary": "SPEC 同时违反产品宪法的问题反馈出网边界，并将已确认的权益领取闭环缩减为永久禁用的占位接缝，当前不得进入 BUILD。",
  "findings": [
    {
      "severity": "blocker",
      "category": "fit-positioning",
      "where": "§1 流程图、FR-575-05～07、TEST-575-03、§9 灰度步骤",
      "issue": "SPEC 要求 CreatorOS 将 summary、description 和 reproductionSteps 经本机 route 直接 POST 给 Growth，并展示“反馈已收到”。这与宪法 P-04“问题反馈不建设应用内上传链”以及 NFR-PRIVACY“应用本身不上传描述、截图或日志”直接冲突；流程图同时声称“不上传用户内容”，也与正文上传用户填写的问题内容自相矛盾。",
      "suggestion": "按现行宪法删除应用内直接提交、feedbackContextToken 和成功回执链，只保留本地预览、复制文字以及打开签名 bugFeedbackUrl 的手动流程；如果用户确实决定改变该边界，必须先通过显式 DEC 和人的确认修改产品宪法，再重新提交 SPEC 审核。"
    },
    {
      "severity": "blocker",
      "category": "scope-reduction",
      "where": "§1 目标第 1 项、FR-575-03～04、§7 FR-575-04、TEST-575-02/05、§11 第 5 项",
      "issue": "已确认任务要求接通“激活或领取已经购买的产品权益”，但当前交付只实现始终返回 disabled、fetch/invoke=0 且不显示领取按钮的本地接缝；真正的 production provider、lookup/consume、UI 开启和真实联调被推到 exact wire 到达之后。§11 又声明该外部阻断不妨碍完成本仓 disabled adapter，形成以占位接缝替代权益领取闭环的范围缩水。",
      "suggestion": "明确 T-575 在 AM canonical contract、真实 provider、领取 UI、正负 fixture 和跨系统联调全部完成前只能保持 BLOCKED/未完成；disabled adapter 只能作为任务内部步骤，不能作为任务完成证据。若要从 T-575 移除真实领取，必须先取得人的显式范围变更确认并同步修改 BACKLOG、FR、验收标准和追踪关系。"
    }
  ]
}
```

逐条处置：

| Finding | 裁决 | 处理 |
| --- | --- | --- |
| F1 与宪法冲突 | 接受 | 用户本次明确授权“用户确认后向 Growth `bugFeedbackUrl` 提交文字”，属于产品出网边界变更；更新 P-04/NFR-PRIVACY 并登记 DEC-TSL-001。仍禁止自动日志、附件、截图、激活码、token、手机号及其他用户内容 |
| F2 claim 范围缩水 | 接受 | disabled adapter 只作为内部安全步骤；AM canonical、真实 provider、UI、三仓 fixture、真实跨系统联调未闭环时，T-575 必须保持 blocked/未完成，不能作为交付证据 |

Round 1 结论保留为 FAIL；完成最小修订后进入 Round 2，期间不 BUILD。

## Round 2 — 2026-07-27

- `review_mode`：`cross-family`
- 模型：`gpt-5.6-sol`
- 隔离：新的 `codex exec -s read-only` 上下文，只输入评审量规、最新产品定位与最新 SPEC
- Verdict：`FAIL`
- Blocker：2；Major：1

```json
{
  "verdict": "FAIL",
  "summary": "方向与三系统权威边界基本正确，但当前规格仍允许在核心领取契约缺失时先做局部 BUILD，且反馈降级入口和出网字段与产品宪法存在冲突，尚不能通过实施门。",
  "findings": [
    {
      "severity": "blocker",
      "category": "scope-reduction",
      "where": "§4.1、FR-575-03、FR-575-04、§7.1、§12「进入 BUILD 前必须」",
      "issue": "任务确认范围包含真实权益领取闭环，但 AM canonical contract、route、fixture 和 endpoint 均缺失；规格却允许先实现零出网 disabled adapter，并且 §12 的 BUILD 前置条件没有要求 HARD-575-001 先关闭。这实际形成“核心能力暂不接线、先交局部接缝”的执行授权。即使文中承诺不把 T-575 标为完成，也仍违反范围缩水锚点，并使另一个 agent 无法按当前 SPEC 一次完成 FR-575-04。",
      "suggestion": "在 HARD-575-001 关闭前将整个 T-575 保持 BLOCKED，不进入 BUILD；把 Growth/AM canonical exact contract、三仓 fixture 和 claim contract 独立评审列为 BUILD 的硬前置条件。若确实要先交 disabled adapter，必须由用户显式确认范围变更并修改任务承诺，不能在本 SPEC 内把它作为先行实现切片。"
    },
    {
      "severity": "blocker",
      "category": "fit-positioning",
      "where": "FR-575-06「任一门关闭时」及 §9 灰度/回滚",
      "issue": "宪法 P-04 明确规定：签名 runtime 缺少 bugFeedbackUrl 或反馈服务未通过 health/灰度门时，应退到 CreatorOS 内置的官方飞书反馈表。SPEC 却要求保留当前 bugFeedbackUrl 供手动提交；该地址可能是 Growth 的 POST 收件服务，而且紧急回滚将其置 null 后也不存在可打开的入口。这既可能把服务 API 当网页打开，也无法满足宪法规定的内置降级路径。",
      "suggestion": "将 DEC-FDB-003 的内置官方飞书表定义为独立、固定的手动降级入口；任一直接提交门关闭、服务不健康或签名地址缺失时只展示该入口、复制文字和日志文件夹操作。Growth 收件 API URL 不得作为浏览器手动入口；补充 null、API URL、表单 URL及服务降级测试。"
    },
    {
      "severity": "major",
      "category": "fit-positioning",
      "where": "FR-575-05「Web UI 只发送……appVersion/osName/locale」",
      "issue": "宪法 P-04/NFR-PRIVACY 将反馈出网载荷限定为用户已预览并确认的纯文字问题内容，禁止自动上传其他用户内容。SPEC 额外自动发送 appVersion/osName/locale，但没有规定这些字段必须进入可见预览并由用户确认，因此扩大了已确认的出网数据边界。",
      "suggestion": "最小修改是从提交 body 删除这三个自动字段；如确属已确认需求，则将其转换为弹窗中明确可见、可编辑或可取消的文字，并确保用户点击发送前已预览确认，同时补 closed-body 与未确认不出网测试。"
    }
  ]
}
```

逐条处置：

| Finding | 裁决 | 处理 |
| --- | --- | --- |
| F1 局部 BUILD 仍构成范围缩水 | 接受 | 主调度随后明确：AM provisional contract/descriptor/fixture 尚未 PASS，Creator 只修 consumer 设计，必须等 AM PASS 后逐字复制最终字节才进入任何 BUILD；§12 将 HARD-575-001 改为全 BUILD 前置 |
| F2 手动表单与 API path 混淆 | 接受 | `bugFeedbackUrl` 明确只作为 Growth 官方网页表单；direct submit 固定取其 origin 加 `/api/v2/product-feedback`，API path 永不当网页打开；null/非法/health 不通过时保留独立内置飞书 accepted-risk 降级，但不冒充 Growth inbox 闭环 |
| F3 自动诊断字段未确认 | 接受 | 上游 closed body 必填 `appVersion/osName/locale`，不能单边删除；改为在“高级诊断”折叠区可见并纳入本次确认，未确认零出网，同时更新 P-04/NFR-PRIVACY 与测试 |

Round 2 结论保留为 FAIL。上游状态已从“无 contract”变化为“provisional exact 已落盘但
review-pending”，当前只修订文档，不 BUILD；Round 3 只评审最新 consumer 设计和完整 Gate。

### Round 2 后主调度补充（未构成新评审）

主调度发现原“Growth 浏览器 owner API 瞬时返回 claimToken”仍有终端断链：Creator 没有获批的
deep-link、本机可信 IPC 或安全 clipboard，而 query/fragment/clipboard 均被禁止。Growth 因此把
provisional consumer 入口收敛为 API-210..212 device authorization + S256 PKCE。

Creator SPEC 已据此改为：

1. Creator 生成 verifier/challenge 并创建短期 session，只展示 user code 与打开固定 Growth 网页；
2. 用户在 Growth 登录态完成 ownership、CSRF 和 reauth；Creator 不调用 browser approve API；
3. device secret/verifier 只在内存或 OS 安全临时区，API-212 approved no-store 的 claimToken
   只在调用栈内瞬时进入 AM consume；
4. 成功只保存 AM Ed25519 验签授权事实与既有 code，所有 session secret 立即清除；
5. Growth API-210..212 与 AM 最终 fixture 均 PASS 前继续禁止 BUILD。

以上只是对 Round 2 finding 的后续设计修订，不能写成 Round 3 PASS。

### Round 2 后主调度恢复补充（未构成新评审）

AM final exact contract 已 Round 2 PASS，Creator 已逐字复制最终 descriptor/fixture，并以 SHA 与
`cmp` pin。主调度随后确认“AM 已完成 consume、Creator 尚未原子落盘”存在崩溃窗口，统一采用
Creator 侧 OS protected pending-consume journal：

1. API-212 launch 到达后、首次调用 AM 前，native 原子写入并读回核对
   `claimToken/consumePath/requestId/nonce/绑定语义摘要`；
2. journal 使用独立 OS 原生凭据条目，禁止普通文件、数据库、URL、剪贴板、日志、crash report、
   APM 或遥测，也不得使用现有 master-key 的普通文件 fallback；
3. AM API-AM-019 已锁同 requestId+同 consume digest exact replay，重启必须复用原 token、
   requestId 与 nonce；
4. 只有 `.license` 原子 replace 成功且读后验真才删 journal；网络失败、响应丢失、验签失败或
   本地落盘失败均保留 journal；
5. API-212 响应后、journal 写前崩溃时 AM 尚未被调用，可以新建 session/reissue；
6. 该决策已写入 consumer CONTRACT、SPEC、DEC、影响清单与 TEST-575-02，Round 3 必须审查其
   authority、secret persistence 例外和 kill-point fault-injection 完整性。

Growth API-210..212 仍未最终 PASS，因此本补充只关闭恢复方案的契约分歧，不放行 BUILD。

## Round 3 — 2026-07-27

- `review_mode`：`cross-family`
- 模型：`gpt-5.6-sol`
- 隔离：新的 `codex exec -s read-only` 上下文；只输入评审量规、产品定位、最新主 SPEC、最新
  Creator consumer CONTRACT 与 AM final descriptor/fixture，不输入 Round 1/2 结论
- Verdict：`CONCERNS`
- Blocker：0；Major：2；Minor：0

```json
{
  "verdict": "CONCERNS",
  "summary": "Creator consumer CONTRACT 对 AM exact replay、受保护 journal 和 BUILD 阻断的总体方向自洽，但反馈放行门与宪法不一致，且 journal 清理恢复仍有可能丢失唯一重放凭据的歧义。",
  "findings": [
    {
      "severity": "major",
      "category": "fit-positioning",
      "where": "主 SPEC §5 FR-575-06「双门放行与回滚」及 §9 灰度顺序",
      "issue": "宪法 P-04 明确要求“签名地址与服务能力都可用时才允许纯文字直提”，但 FR-575-06 把可用条件严格定义成包级开关和签名 origin 两道门，Growth/AM health/readiness 只出现在降级描述和人工灰度步骤中，没有进入运行时放行判定。这会出现两道门均开、服务能力已经降级或未通过 health 门，但客户端仍渲染发送按钮并发起 POST 的状态，与宪法及本 SPEC 自己“Growth health 未过时使用手动降级”的文字冲突。",
      "suggestion": "mitigate（最小修改）：将已确认的服务 capability/readiness 明确列为第三道 fail-closed 门，定义其可信来源、缓存/失效语义和不可用时的 UI 状态；补测试证明 readiness 缺失、过期或 degraded 时 POST=0、发送按钮不可用并进入既有手动降级。不要新增通用健康平台。"
    },
    {
      "severity": "major",
      "category": "completeness",
      "where": "Creator consumer CONTRACT §4.2 pending-consume journal、§8“已领取但本地无成功快照”及 §9 `.license` 写成功但 journal delete 失败测试",
      "issue": "契约要求 `attempted` journal 在结果未知时必须保留并 exact replay，但同时写了“取消、session 过期且 AM 明确签名返回未消费终态”时清理临时状态，没有给出按 `prepared/attempted` 与具体 AM 错误码划分的唯一删除规则；`.license` 已写成功但 journal 删除失败后的重启路径也没有明确规定必须先用原 request exact replay 重新取得签名成功响应，再据此核对本地快照。journal 本身不保存成功响应中的 activationCode/expiry 等事实，因此仅凭现存 `.license` 无法证明它对应当前 journal。实现者可能在用户取消、TTL 到期或看到一个既有 `.license` 时错误删除唯一 claimToken，导致 AM 已消费但本机授权未可靠收敛。",
      "suggestion": "mitigate（数据丢失风险）：增加一张规范状态表，逐项规定 `prepared`、`attempted` 在 cancel、TTL、每个签名 AM 终态、网络未知和本地落盘状态下是否允许删除。明确 `attempted` 只可在①原 request exact replay 后得到并验签成功且 `.license` 读后与该响应一致，或②AM 签名证明该 claim 确实未消费且可安全重新领取时删除；其余情况一律保留。补 cancel-attempted、TTL-attempted、旧 `.license` 共存和 delete-failure 重启的 fault-injection 测试。"
    }
  ]
}
```

逐条处置：

| Finding | 裁决 | 处理 |
| --- | --- | --- |
| F1 feedback runtime readiness 未进入放行门 | 接受并形成上游阻断 | FR-575-06 改为三门；readiness 必须有 authenticated、未过期、closed 的 exact 来源，不从 URL、历史成功、telemetry 或 UI 推断。现有 Growth/AM 工件只有部署侧 readiness，无法由 Creator 单边补 shape/TTL，登记 HARD-575-003；未关闭前 direct submit 固定 disabled、POST=0，保留手动降级 |
| F2 journal 删除条件歧义 | 接受并回写 | consumer CONTRACT §4.2 增加 `prepared/attempted × cancel/TTL/签名终态/网络未知/本地落盘` closed 状态表；`.license` 已写但删除失败也必须先 exact replay、验签 success 并逐字段核对后才补删。TEST-575-02 增加对应 fault-injection |

Round 3 没有 blocker，但 F1 需要 Growth/AM 增补 exact wire，不能由 Creator 单边宣称已处理完毕；
因此保留 `CONCERNS` 和 BUILD freeze。按 spec-reviewer 的三轮上限不再启动 Round 4；上游
HARD-575-001/003 收敛后应作为新的 contract revision 重新进入门禁，而不是继续原地磨审。
