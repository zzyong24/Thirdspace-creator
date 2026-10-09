# 研究原三项库存装配恢复候选（待主控裁决）

唯一代码写集仍是 `backend/src/modules/ai-runtime/agentic-research-worker.integration.test.ts`；不改Worker、生产预算、scope guard或terminal映射。传输观察驱动已按前次授权实施，原三项在真实供应商模型可见片段之后继续跑，三项目前仍FAIL。完整原RED保留于 `backend-research-visible-observer-first-three.log`。

## 当前实际根因

maxCalls20原场景沿完整研究、真实候选与正常确认入口到知识落库，被0121 `record_workspace_grant_use`拒绝：`GROUP_RESOURCE_SCOPE_CONFLICT:引用账号组不存在`。原ctx的research-account只是字符串，未用公开PlatformAccount.createAccount创建本人真实测试账号与配套legacy组。0114会给知识条目stamp为grp_legacy_research-account，0121必须核该组归属；本测试未造该父对象，不是guard应放宽。T1022 §3.2要求账号/组归属由服务端验证，legacy只允许原账号对应的历史范围，不能假账号或NULL全域。

maxCalls10/8原场景实际execution.status均succeeded，原expect均partial。真实executionBudget为 `{policy:"continuous",maxCalls:null,maxTokens:null,deadlineMs:60000}`。prepare明确从spec.params.maxSteps/maxTokens冻结显式限制；旧deps.budget不再默认限制新自主任务。T923“持续执行与边界”/“实现契约补充”及DEC-RUNTIME-059明确新任务取消默认整项固定次数/Token上限，用户显式限制仍生效。原params={}导致题名与deps里的10/8不构成用户明确限制，因此真实模型执行6/5请求直至交付，原5/4请求和partial断言不满足。此处不直接改expected为succeeded。

## 精确最小候选

1. 用当前公开 `../platform-account` 的createPlatformAccountService，在同PGlite测试DB、同research-worker用户、无账号ctx创建正常本地测试账号（固定受控platform/handle，无秘密）。采用返回id构造原account-only研究ctx；公开创建会调用registerAccount产生正确legacy组及membership。保本人/原scope，不能注入null group绕组，不直接插不存在账号或关trigger。
2. 把原场景声明的20/10/8次数与100000 tokens通过当前既有spec.params `{maxSteps:maxCalls,maxTokens:budget.maxTokens}`传给prepare。明确这是测试输入装配迁移：原三个业务意图与预算数值、6/5/4请求、succeeded/partial/partial、完整账本/原op/自修复/首尾全文/隐私/重复采纳均原样保持，不称input JSON逐字不变。补断言实际executionBudget准确continuous并保显式maxCalls/token及60000期限。
3. 只授权后实施；保先前原3FAIL和明确的新入力差异。完整原46库存及新增观察驱动18另计；后台tsc与必要相关真实采纳/冻结预算回归。若实际partial仍不符，继续FAIL，不换terminal期望/预算/timeout凑绿。

正常操作者已有合法本人账号与明确本轮次数限制，研究取得同来源连续完整正文及候选，随后本人确认进入知识库；失败沿原任务与回执恢复，不换账号/重复写入。此处只本地合成供应商与隔离测试库，不证明实际网站账户、付费模型或安装版用户验收。


## 后续窄授权与实际结果

前文待裁决状态是应用前历史。主控后来已完整读两份独立报告与f1823b...准确patch，授权本唯一test两处装配+冻结预算断言；先结束并保存旧输入完整64的61P3F，再精确apply。原3实际3P，原46+18完整64P、后台tsc0，详RESEARCH_CURRENT_FIXTURE_RECOVERY_RESULT.md及结果JSON。input JSON确有明确上述2处变化，原业务库存/expected/期限/guard保持；不冒实现新母范围或安装版验收。
