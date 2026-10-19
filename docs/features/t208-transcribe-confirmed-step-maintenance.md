# T-208 已确认转录结果的步骤维护

## 操作者、结果与来源

已有账号和组的创作者持有原冻结作品列表与转录任务，取得已保存稿件和原任务步骤中的分类计数、后处理结果，交给原稿编辑流程。原 artifact/version 与步骤 API 支持按原归属回读；回放沿原 receipt，不重复 ASR、模型、版本或步骤。步骤 API 验证不能替代安装版、主 UI 或线上 UAT；Automations 详情的步骤读取与 Copilot 终态不轮询限制如实保留。

本轮依据 Root DEC-199、`docs/contracts/T-208-transcribe-confirmed-step-maintenance.md`，用户“全部落地并完成所有功能测试验收”的既有授权，及独立提案报告 `docs/build/T-188-validation/completion/t208-independent-proposal-review.md`。修复原 T-243 图集分类汇总、档案 T-357 逐字稿后处理步骤说明及 T-1070 FR-1070-02 / AC-1070-02、03 的实现遗漏。精确提案 diff SHA256 为 `776d633b4501b01d18cb8c2aa1a33327caf1801628c1f65c8c36a6c8f8f43eae`。审核栏 — 表示此次既有批准行为维护不新开正式周期，不借旧 PASS 或冒充当前正式审核收据。

## 准确实施边界

唯一生产文件 `backend/src/modules/execution/execution-transcribe-workflow.service.ts`：原 store 仅 saved 回执增加已冻结并完整深相等核验的 applied/reason 说明；原 complete 在原 running、完整 receipt、无待确认调用守卫后，从冻结输入列表位置统计五类真实 receipt，在原 settlement 事务内写现有 ai_task_steps 汇总。reason 是严格判别 union 的非空字符串，不是 enum；不从异常正文或 Worker 自报正文推导。

仅两份原测试：`backend/src/modules/ai-runtime/transcribe-runner.test.ts` 与 `backend/src/modules/execution/transcribe-postprocess.integration.test.ts`。原 30 / 170 输入与断言不改，#8 合法性及 #1/#4/partial、其它 fixture 问题不夹带修复。新增真实 Host 冻结说明、原列表五类计数、PK 幂等、事务插入失败恢复及原 guard 反例。

保 owner/workspace/原顺序、fence、租约、调用账本、正文、费用与所有状态/wire。原非 failed receipt 回放与终态 complete 提前返回不变，不补历史说明。summary 初代 ID 保留 `transcribe:<executionTaskId>:summary`，后续合法领取代追加 `:attempt:<锁内真实attempt>`。新 summary stepNo 为 max(原冻结列表长度, 本业务任务最高历史 stepNo)+1，排在旧步骤之后；原 store 编号不改。表只以 id 主键幂等，不宣称 stepNo 唯一。合法额外 receipt 不纳入原批计数，畸形额外条目仍 strict 拒绝；重复原列表位置不偷偷去重。

deadline admission 拒绝新保存；合法已确认全部 receipt 且仍 running 的到期 settlement 保原结算语义，不新增 deadline 终态限制。unknown/未结算/取消与归属冲突保持拒绝，不重发。实际插入失败回滚本事务；恢复后仍原键调用，无新供应商请求。

治理仅本任务新行/ID/DEC、taskctl events、modules 新绑定、生成 T-208 context、本 SPEC 与 `docs/verification/t208/**`；Root 仅 t208-* 报告。既有 Mother、AGENTS、引擎、T915 dirty/旧审核链与 capability 不改，不新建 review 周期。

## 验证与交接

Node 25.9.0 先跑原 #3/#9 两标题 RED；准确应用已审 diff 后补有意义回归并 GREEN。运行原30、原170五文件及 postprocess/ledger/worker 库存、backend typecheck、boundary 和原 reconcile；保持原 timeout、maxWorkers=1、retry=0，不删除案例或调终态。日志目录0700、文件0600，不输出秘密；原其它 FAIL 单列，整体 T188 不因此通过。失败恢复与撤销仅本任务准确 diff，保原数据/日志/其它 dirty；不生产 DB、浏览器、安装、外部供应商调用或发布。

```mermaid
flowchart LR
 A[Host已确认的原回执] --> B[原事务保存工件与步骤]
 B --> C[原步骤按归属回读]
 C --> D[分类计数及后处理说明交给稿件编辑]
```

控制面补充：主控2026-10-09准许只新增 T208 progress binding；旧任务/stage/统计原字节与对象保留，首次 context compile exit2 缺 binding 原证据保留，不整仓重生成。

## 本轮恢复RED（修正候选未应用）

初版固定summary ID在原failed→公开retry queued→同execution claim新attempt→真实Host保存全部结果 succeeded之后，仍只保旧failed汇总。已在原postprocess integration实际复现1FAIL，之前原稿/版本/账本/期限/同代回放全部断言通过；T208不得complete/提交。Root t208-summary-attempt-recovery-proposal.diff 为summary-only未应用候选，待主控和独立复核准确准入后才能改producer：初代ID保原样，后续仅锁内真实attempt后缀；新summary排全部历史steps后，原store编号及paid operationKey/所有wire不变，不借T213其它范围。此段记录真实缺口，不宣称候选已实施或新审核PASS。

本轮Root核真实retry RED与唯一summary-only候选后精确准入补丁SHA256 `3d4c1e750443f03c4afbd6d07d7045970fb0d7cd62b72b0d972552cc398f6bdc`（Host545dc7…→324745…）；这是原公开retry恢复链的新增步骤遗漏修正。真实attempt2 CHECK插入故障必须同事务保原两表/receipt/历史，移除精确故障后原键恢复，同代终态重读零新增。原deadline、unknown/cancel/fence及原paid key不变。实施后重新实际跑受影响库存与适用原门，旧初版GREEN与新增恢复RED分开保留，不用静态准入冒完成。

## 本轮后端工程交付结果与后续

主控独立核最终三源码、完整 diff 与全部 28 份证据 SHA 后准许仅三代码及本 SPEC 的窄提交。最终实际聚焦 22PASS/0FAIL；原30为21PASS/9FAIL，原170为161PASS/9FAIL，新增Worker1PASS单列；相关10文件原113+新Host19共132PASS，backend typecheck exit0。boundary exit1，原reconcile exit1（22ERROR/1WARN/64OK），其它9个失败及工程门原错误完整保留；不以专项通过放行全功能。

初版 summary retry RED 已转 GREEN，attempt2 实际 CHECK 故障回滚、去准确故障后原键恢复和同代终态回放均通过；旧 Mother/AGENTS/T915链及旧控制全文/对象保护通过。详细来源、命令、原始输出、源码及日志 SHA 见 Root `docs/build/T-188-validation/completion/t208-final-verification.md/.json` 与本仓 `docs/verification/t208/final-*`。

T208 保持🔨，不执行 taskctl complete。此次为后端维护工程交付；真实主入口/UAT闭环由T214继续，后续仍需验证原操作者取得结果、返回/刷新与失败恢复，不能以步骤表回读替代。T210尚未准入应用；T213未应用；不push、部署或开启新review周期。
