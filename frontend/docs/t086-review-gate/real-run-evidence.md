# T-086 稿面审核门 —— 真机验证证据(dev :3000)

> 项目 `project-8639205b-417`(脚本 v2,2609 字)。登录 zyongzhu@creatoros.local。
> 默认模型 MiniMax-M3(未配 script.review 专用行 → 报告标注「非专用审核模型」)。

## 1. 触发 → 后台 dispatch → 落报告(端到端真链路)

稿面「编导文案审核」卡点「审核」→ `scriptReviews.trigger` 起 `ai_tasks(task_type=script.review)`
→ **composition-root dispatch(persistence-client `dispatchScriptReview`)** 后台跑 L1 lint + L2 语义审
→ 落 `script_review_reports` 一行(绑 artifactVersion=2)。

DB 实测(ai_tasks):`status=succeeded`(4s 内完成,无 error_message)。
DB 实测(script_review_reports):

```
verdict = risk
model_label = MiniMax-M3(非专用审核模型——建议在设置中配置豆包等审核模型)
lint_findings = 1 条   llm_findings = 4 条
artifact_version = 2
```

> 修复要点:审核门 op 经注入 AI 端口直起任务,不经 ai transport 的 `ai.tasks.create` 拦截,
> 故 `reviewGateService.createTask` 起任务后必须显式接入后台 `dispatchScriptReview`(否则任务只
> queued 不执行)。已在 persistence-client 建 forward-declared dispatcher + 两条起任务路径共用。

## 2. 报告面板渲染(稿面首屏 initialReport,server 读)

```
编导文案审核 · 重新审核
有风险 · 命中 5 条 · 脚本 v2 · 稿已改动,建议重审
文案整体为AI工程化技术分享,无明显违禁内容,但存在「L1漏报」的语义级风险:含未明示出处的网课逐字稿二次创作…
⚠ 审核模型:MiniMax-M3(非专用审核模型——建议在设置中配置豆包等审核模型)

L1 变现  营销词  · 主源 Tier2 营销/变现敏感词(易判广告);辅源 §2:变现→实操/跑通/落地  → 产生价值  [应用改写]
L2 手里22个网课逐字稿… warn 知识产权/搬运  · …  → 在视频中补充一句来源说明…  [应用改写]
L2 吐出了一本3580行28000字的书 warn 无依据断言/夸大  · …  → 加入限定语…  [应用改写]
L2 结合了2026年最新的行业数据 warn 无依据断言  · …  → 改为「结合了近期公开资料梳理而成」…  [应用改写]
L2 …mii max token plan 额度直接烧去了65% info 无依据断言  · …  → 可保留…  [应用改写]
```

每条 finding 的 quote 均为脚本原文子串(runner 侧 `script.text.includes(quote)` 过滤幻觉命中)。

## 3. 软门(SPEC [gate-F1],不阻断)

发布区(登记已发布/先盲预测 旁)显 **「合规审核未通过(有风险)」+「先去审核」** 内联提示,
但两动作按钮不 disabled —— operations 不阻断,人出判断。

## 4. 改写建议确认门(SPEC §3 铁律:绝不自动改稿)

点 L1「变现」的「应用改写」→ 单点替换「变现」→「产生价值」→ `createArtifactVersion` 落 **v3**:

```
v3  change_summary = 应用审核改写:「变现」→「产生价值」   content: 「变现」→「产生价值」已替换,原文其余保留
```

DB 实测 v3:`产生价值` present、`变现` replaced(单点替换,非重写全文)。UI 出「已应用 · 撤销」。

点「撤销」→ `restoreArtifact` 落 **v4「restore v2」** 并把 current_version 指向它:

```
v4  restore v2   content: 「变现」ORIGINAL_RESTORED、「产生价值」REWRITE_GONE
```

全程无任何 AI 直写稿件路径:改写只在用户显式点击时,经 append-only 版本链发生,可撤销。

## 结论

稿面审核门主案(软门)+ 结构化报告 + 非专用模型诚实标注 + 改写确认门(应用/撤销)
+ 规则库管理面/文案审核模型卡(设置页)全部真机跑通。截图见本目录同名 PNG(浏览器抓取)。
