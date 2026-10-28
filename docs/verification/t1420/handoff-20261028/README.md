# T-1420 接手证据 · 2026-10-28

结论：阶段 0 完成；阶段 1 的代码已应用并完成本地检查，但审核链冲突尚未安全解决，cherry-pick 未结束。T-1420 已通过 taskctl 标记为 ⏸️，不是完成或安装态验收通过。

## 阶段 0：保全与基线

- 仓库：`/Users/masx/Projects/Thirdspace-creator`。
- 原分支 `fix/t1409-douyin-login-free` 的 19 项工作区改动保存为 `t1409-local-before-handoff-20261028`，stash SHA `470bda512507ef4321d9739cb803af8bb392464d`。未删除或应用这个 stash。
- main 已快进到 `6033bdd51e6996cfe80eb041661a2b1a4f15a5b0`；新分支为 `codex/t1420-graphic-post`。
- 原本地分支、`codex/cos-ux-closure`、旧 stash 和标签保留。没有合并 cos-ux-closure，没有推送、PR、发布、安装或改依赖/构建配置。

## 阶段 1：已应用的 WIP 内容

来源 `b1f0272412bd44612ba370b10127418a3ce77d6e`，不是本轮重新实现：

- 图文主工作台使用独立配文和逐页真实图片/未生成占位，支持选页与画面想法。
- 恢复逐页生图、预览采纳、未知结果提示；原图和独立配文导出，旧文字排版入口折叠保留。
- 提示词明确小红书独立配文与真实文生图；后端过滤内部恢复字段，未知生成结果传递明确错误码。
- 保留 main 的 DEC-142801 新编号，同时保留 T-1420 的 DEC-142002。未把 WIP 中无关 T-1418 任务范围变更带入本轮工作区；ARTIFACT_MANIFEST 保留 main 原样。
- 本轮未新增产品代码修补，未改测试断言。收尾的 git diff --check HEAD 发现 WIP 新测试文件多余的末尾空行，本轮仅删除该空行；不影响测试逻辑，也不是为回归凑通过。现有 WIP 中自带的产品与测试修改仍在工作区。

## 实际执行的检查

| 检查 | 结果 | 证据 |
|---|---|---|
| contract、ai-worker、backend、frontend 类型检查 | 4/4 通过 | typecheck.log.gz |
| graphic-image-pages、graphic-post-results、graphic-post-workbench | 48/48 通过 | frontend-target.log.gz |
| creative-results 集成、graphic-post-media.adapter | 29/29 通过 | backend-target.log.gz |
| graphic-post-text、chatbox-turn 提示词 | 2/2 通过 | worker-target.log.gz |
| 旧稿兼容：script-first-content、projection、noterelay-editor、native-bundle | 补回原始样本后 52/52 通过（首次 50 通过、2 缺样本失败） | frontend-compatibility-restored.log.gz；首次日志保留 |
| boundary-scan | 通过，无新增违规；保留 5 条既有基线违规 | boundaries.log.gz |
| timeout-policy | 授权目录下通过；首次因沙箱不允许写测试缓存失败 | timeout-policy-authorized.log.gz、timeout-policy.log.gz |
| git diff --check | 通过 | 收尾再次执行并保存日志 |

这些是源码类型检查、组件和本地集成回归。测试没有实际调用外部模型，不证明真实模型、安装包或完整 UI 旅程通过。没有伪造本轮 RED→GREEN；首次定向检查就是通过。

## 阻塞 1：main 的审核链在本次接手前已经损坏

直接读取 Git 中的 main 提交，而非冲突后的文件，按 reviewctl 相同 stable JSON 算法核对：447 个事件中 23 条 event_hash 不匹配，另有第 447 行 previous_event_hash 断链。WIP 提交中的 447 个事件原链完整。逐行证据见 baseline-review-audit.json，脚本见 audit-baseline.mjs。

本轮尝试保留 main 审核链，使用官方 reviewctl record 导入 WIP 既有评审（明确标记为旧评审导入，不是本轮新独立评审）。工具在校验已有链时返回 exit 1，未登记新事件。不能直接拼接两个分支的事件，也没有修改历史哈希或跳过验证。

原 WIP 的 T-1420 事件、审核快照和拟导入审核包分别保存在 source-review-event.json、source-review-snapshot.md、import-review-packet.json；最后一个文件是未成功登记的输入，不是新的 PASS 证据。工作区审核链保持 main 原样，当前审核快照/回执也保持 main 旧版本，因此不得用它们声称新 SPEC 已获得当前主线有效审核。

DECISION_LOG 的文本冲突已解决。review-events.ndjson 仍保留 Git 未合并状态以显式阻止错误提交，cherry-pick 不可直接 continue。HEAD 仍是 main 基线，尚无本轮新提交。

建议下一步单独处理主线审核完整性：保留两个分支原件，按 Git 历史核对变动来源，恢复可验证历史并使用带来源证明的迁移保留 main 的新任务编号；通过 reviewctl audit 后再导入 T-1420 原审核并完成 cherry-pick。该修复会涉及 T-1420 之外任务的审核记录或迁移工具，需先确定扩大范围。

## 原阻塞 2 已解除：真实样本补齐，兼容测试 52/52 通过

用户于 2026-10-28 将两个原始文件放入 Downloads，本轮按其要求原样补入测试读取目录：

- docs/verification/t1302/acceptance/runs/final-t1304-t1305/a/creation-article-actual-source.json
- docs/verification/t1302/acceptance/runs/final-t1304-t1305/a/editor-article-actual-source.json

下载原件保留；JSON 结构及测试所需四行下划线字段完整。复制前后与测试后 SHA-256 一致，见 fixture-restoration.json。没有合成样本，没有修改或跳过测试断言。样本仅补入本机工作区，未提交或推送。

北京时间 2026-10-28 18:06 重跑此前同一组四个兼容测试文件，结果为 52 passed / 0 failed，exit 0。证据见 frontend-compatibility-restored.json 与 frontend-compatibility-restored.log.gz。首次缺样本失败日志继续保留为历史证据；该阻塞已解除，不代表真实安装版界面和导出问题已通过。

## 本机账号与真实验收更新（2026-10-28）

用户已明确：本机账号组「1」与抖音账号「我是谁」正确；「月明水清深」属于朱志勇的电脑。先前仅核对到账号差异，将其列为疑点不准确。该差异不是本机验收阻塞，不据仓库旧账号文字切换用户。

用户本次授权「允许本次最小验收，使用现有额度」。已通过公开 CLI 创建独立测试作品，完成保存、两页 AI 规划，以及两张真实图片生成、预览、采纳、精确版本/文件回读。未覆盖原有业务作品，未发布、充值或自动重试。初次预检的 installed-projects.png / installed-preflight.json 仅保留为创建测试作品前的历史记录，不能用其证明当前没有测试作品。

重新验收仍有失败：正文候选仅为 `...`，未采纳；组批响应泄漏内部 requestId 导致校验报错，已沿原任务恢复而未重试生成；两图为方图且场景细节不完全一致；原生安装版仍显示旧排版和来源许可/发布交付入口，重新组织内容按钮仍禁用。实际导出 ZIP 是三张排版 PNG，缺失生成原图与独立配文，两个内容页还漏掉预览中的图片。

完整过程、真实任务/版本/文件哈希见 [本机账号1重新验收](reverify-report.md)，证据清单见 reverify-evidence-manifest.json。最终版本为 artifactversion-2ddab0cc-4065。当前源码分支未运行于此安装版；真实图片链路通过不能替代本分支新界面验收。实际扣费明细尚未核实。本轮没有新增产品代码修补或改测试断言。

## 后续操作边界

阶段 2–5 尚未开始。先解决上述阶段 1 阻塞并形成验收证据，再继续；推送、开 PR、合 main 或发布均未执行。所有任务状态改动使用 taskctl。
