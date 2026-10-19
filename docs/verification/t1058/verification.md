# T-1058 调研交付记录

## 范围与结果

本任务只读调研用户确认的组合配置方向、ACP/MCP、Codex 内置图片、WorkBuddy 官方能力与现有源码接点。产品代码、激活验证、渠道模型路由及工具执行链没有在本轮修改。未进行真实 Agent 登录/连接、模型生成、浏览器或运行时探针；没有把官方源码 mock、协议广告或旧测试当作实机验收。

交付包括 [主报告](research.md)、[协议附件](protocol-research.md)、[WorkBuddy 附件](workbuddy-research.md)、[设置附件](settings-research.md) 和 [来源元数据](source-manifest.json)。方案候选不等于未来实施合同已过审。

## 当场检查

| 检查 | 本轮实际结果 |
| --- | --- |
| SPEC 独立准入 | round 2，`PASS[REV:b690a11a2e4a]`，范围限定只读研究；原回执保留。 |
| 技能版本 | 项目与安装技能均为 3.27.2。 |
| 技能 selfcheck | exit 0；仅检查流程包自身完整性和自测，不是 CreatorOS 产品验收。[日志](orchestrator-selfcheck.log)。 |
| T1058 governance preflight | exit 0，精确研究 write_set；没有生产文件放行。[记录复核](record-review.json) 独立核对第四条审核原文登记的单文件与 SHA 一致、机制新增 0、无实施授权。 |
| `git diff --check` | exit 0。未追踪的新文档另在暂存后再次检查。 |
| `research-gate audit` | exit 0；T1044/T1057 仍有效暂停，未借本报告清除原研究阻断。 |
| `reviewctl audit` | exit 1；19 项他任务过期/待审问题，无 T1058 项。[日志](review-audit.log)；同类全局欠债沿 T1015/T916 等原任务保留。 |
| `pmem sync` | exit 0，PROJECT 已刷新；既有物理边界剩余 5。 |
| 研究交付独立复核 | [交付审核](delivery-review.md) findings=[]；核对主报告 SHA、三条精确只读登记及 19 组来源摘要。只覆盖研究内容，不表示真实连接或实施通过；检查运行记录由主会话据当场输出登记。 |
| 全仓 reconcile | exit 1，35 errors / 1 warning；与 T1056 已记录基线逐项比较新增 0、消失 0。[日志](reconcile.log)、[比较](reconcile-comparison.json)。属于范围外既有欠债，T1015/T1026/T1027/T916 等根因任务保持；本研究检查和独立内容审核已通过，不将全仓登记为通过。 |

流程 selfcheck 和 reconcile 的自检不代替模型、界面或跨应用真机验证。

## 词汇门与历史证据

governance guard 把评审引用的英文产品激活权限词归入操作系统签名类，将来源清单及交付审核引用的既有语言项目文件名归入语言工具链类。既定研究未引入这些机制。按 Scope Budget Gate 和 DEC-T1058-01，仅为两份原样 SPEC 评审文件、来源元数据及原样交付审核的准确 SHA256 登记机制新增 0；没有修改通用门卫、借用其它任务 grant、登记生产通配路径或删除历史证据。内容独立审核核对前三条，另一个独立记录审核核对第四条。

其余文档将实现语言引用写明为既有桌面宿主，未变更事实或产品范围。原 SPEC 的准入重审有真实 round 2 回执。

## 尚未验证

Codex 原生图片的真实回执导入、维护桥与随包版本兼容、有效权限配置、WorkBuddy 云端取消/恢复及本机接法、合法旧码渠道配置补发、上游额度/凭据及组合切换、冻结任务兼容均未实施和实测。上述空缺已列入调研结论，不能登记为产品 PASS。

## 提交边界

此工作树含多项历史混合 WIP。仅提交本任务研究文档；共享 BACKLOG、决策、进度与事件链更新保留当前工作树，不把不相关历史实施改动纳入本研究提交，不重写全局事件哈希链。

研究文件已逐项暂存，`git diff --cached --check` exit 0。本地 commit exit 0；Git 提示 `Can't find lefthook in PATH`，未称仓库提交 hook 已运行。研究准入、精确范围检查、来源与独立复核及全局对账结果均按上述真实命令另行记录。

首次登记时沿用的“验收=待验”会让 taskctl 要求 UI journey report；本任务没有前端旅程合同或运行时/UI 实施，故将该元数据校准为“—”。研究交付以真实独立审核和来源/治理证据完成；没有伪造 UI 报告，也没有修改任何实施任务的验收要求。任务完成状态仍只能经 taskctl 更新并留事件。
