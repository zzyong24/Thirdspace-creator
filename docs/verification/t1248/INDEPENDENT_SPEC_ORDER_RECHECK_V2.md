# T-1248 第三轮最新候选窄独复

结论：**PASS_SPEC_ORDER_AND_UNKNOWN_CLOSURE_ONLY**。SPEC仍a815，两树逐字一致。严格packet `spec-review-order-recheck-v2.json`保REV-001/002原冻结字段，新增真实unknown-only选例新证据REV-003并在原STRICT合同范围销账。前版报告/packet不覆盖。

最新精确候选：host `512966ce…`、hosttest `1ec1beb…`、root integration `44c031…`。除了去新增global order门，host只把同完整matcher移至空definition早返回前，保持scope先核；normal非system空子集仍{}，unknown-only显式拒绝，4owner调用0。合法whitelist次序与真实stored reverse冻结digest门保持，root owner.adopt0与receipt0/领域数据/call保护保留。两test附带类型窄修使用真实Partial owner引用、真实JSON wire参数与合法worker.web-read漂移，无原断言删除。

保原wholefirst341/1/3、临时second343/0/3（旧spy前）及unknown-only选例1FAIL/exit1。unknown选例回执未列完整source前后SHA，未补造。审查人未修改产品、未执行测试或record；新版全量/legacy4/ownedPG/Gate仍待formal准入后真实验证，不签模型/App/全功能。
