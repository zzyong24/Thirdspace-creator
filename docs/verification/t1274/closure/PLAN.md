# T1274 / T1275 / T1276 严格收尾准备

2026-10-14。本目录是按 [CLOSURE_AUDIT](../CLOSURE_AUDIT.md) 准备的合同、报告草案与只读取证脚本，**没有执行浏览器、模型、ASR、保存、采纳或测试**。报告保持 `incomplete`，运行身份、时间、退出码及可见文案均为空；草案应被严格验证器拒绝。合同的真实文件摘要只说明草案内容，不说明发生过执行。

## 实际阻断与运行前提

[最近只读审计](watched-paths-audit-after-drafts.json)发生于10:15:58 UTC，读取HEAD `5c8ea3cf88ac2740047c637061f4c7cdd04cf3ca`，不是验收运行绑定。

| 范围 | watched_paths | dirty行数 | 清洁性 |
|---|---:|---:|---|
| T1274 | 66 | 21 | 不清洁 |
| T1275 | 18 | 7 | 不清洁 |
| T1276 | 15 | 5 | 不清洁 |

三者均包含尚未跟踪的本目录 `fresh-readonly.cjs` 与 `witnesses.json` 两项。其余为实际相关生产/合同/工具/测试路径；没有改成无关token路径绕过门禁。前一次审计另存 `watched-paths-audit.json`。共享文件由主会话协调收敛，不丢弃其他人的修改。本目录未修改任务状态、allowlist或任何全局配置。

主会话已结束3919服务（exit0），最终build/reconcile正在执行。实际运行前须主会话确认适用最终门的真实结果、相关源码及脚本已稳定提交、watched范围干净，并启动与实际源码一致的私有服务。不能用旧进程或旧构建代表新提交。T1285原CAS请求已有[真实恢复报告](../../t1285/public-cas-recovery/REPORT.md)，本目录不再重发其apply或恢复请求。

## 拟执行命令

以下命令和verify_key仅供主会话登记正式allowlist，当前未登记、未执行。taskctl complete会再执行verify命令，故这里只允许可重复的只读检查。

| 任务 | 拟verify_key | 命令 |
|---|---|---|
| T1274 | `t1274:closure-readonly` | `node docs/verification/t1274/closure/fresh-readonly.cjs T-1274` |
| T1275 | `t1275:closure-readonly` | `node docs/verification/t1274/closure/fresh-readonly.cjs T-1275` |
| T1276 | `t1276:closure-readonly` | `node docs/verification/t1274/closure/fresh-readonly.cjs T-1276` |

先人工读脚本与固定见证清单，再由主会话选运行窗口。每次实际请求、导航、断言和结果观察至少120秒；外层应覆盖串行RPC、两视口导航/文案/媒体观察与清理，建议每条命令预留90分钟总外层且持续读取进程输出，不使用120秒总外层覆盖所有串行步骤。脚本未调用生成型任务，不续期任何旧持久任务。三个命令串行，避免再次制造共享浏览器/CPU负担。

## 新鲜只读步骤及禁止边界

1. 启动前读取HEAD和合同所有literal watched路径状态；dirty立即退出，不启动浏览器、不产运行PASS。
2. 从正式公共接口读output261与source19完整DTO，并逐字段比较已发生的预期读回；读已采纳版本/原request回执、已有source探针、真实原模型消息/候选digest/task执行ID。这里读取的是原事实，不重新调用模型或propose。
3. 新Chrome上下文各打开1366×900及390×844真实工作区，查看已采纳工程、原候选卡和原作品；保存实际页面/iframe可见文案及截图。所有check_ids仅表示该共同工作区的表面取证关联，**不表示截图重新执行了所有AC逻辑**。
4. 读取已有登记成片asset122的真实下载URL，在独立只读证据播放器加载/播放并保存媒体尺寸、时长与时间前进。该播放器不是产品UI候选预览，不伪称本轮新渲染/导出或产品播放按钮验收；这些操作的真实产品证据保留原目录。
5. 浏览器网络仅放行明示只读dispatch及GET/HEAD/OPTIONS；chat POST、非清单operation和其它API写入尝试阻断并令本轮失败。不点击保存、采纳、恢复、渲染，不发ASR。允许的operation需按真实失败再审查，不能为了绿灯放行写接口。
6. 结束时再次完整比较两作品DTO、核HEAD不变且watched清洁；所有路径finally关闭自有浏览器，保存network、blocked-actions、cleanup、原始RESULT与visible-copy。仅产生 `PASS_READONLY_OBSERVATIONS_ONLY` 或真实FAIL，不自动生成任务PASS报告。

若服务/媒体/旧记录已消失，保留真实失败并停止，不能新建候选、换输出、补写历史对象或重新跑原生成。`witnesses.json` 的固定身份从真实证据读取，不能为通过断言而静默改期望值。

## 历史证据与本轮边界

| 合同检查 | 已发生证据 | 新鲜只读能证明的部分 / 不重演部分 |
|---|---|---|
| T1274 AC01/02 | public-families、speech-word-preview、final-gap-walkthrough | 工程/候选/来源仍可读取；不重演词删、纠错、歧义和批量错误提交 |
| T1274 AC03 | model-acceptance、model-reorder-clone、final-gap-walkthrough | 原模型消息、候选digest与task来源对应、已采纳版本和回执、UI卡片可见；不发新模型、不重演dirty竞争 |
| T1274 AC04 | public-families三族预览与apply、final-gap-walkthrough受控404 | 原丰富工程仍完整；不重演404、渲染或采纳 |
| T1274 AC05 | cli-mcp、final-ui-states、T1285/public-cas-recovery | 原版本/回执读取与零写；不把顺序只读升级为新的并发/CAS/ACK恢复覆盖 |
| T1274 AC06 | browser-closure、legacy-public-render、T1281/public-families、T1284/public-legacy-caption、T1283/rough-public-new | 已登记成片仍可真实播放、原来源与工程可读；不重演ASR、粗剪、V1/V2渲染、历史恢复或采用成片 |
| T1274 AC07 | final-ui-states、final-gap-walkthrough、三轮视觉报告 | 两视口工作区/候选新截图和真实文案；本命令不再做200%/故障/长文/权限族，沿其原发生证据引用 |
| T1274 AC08 | 各实际来源/边界/类型/build/timeout/LED/reconcile日志 | 当前只读运行身份与完整DTO不变；Gate仍引用各自实际新日志，不把此脚本代替构建或边界检查 |
| T1275 AC01～05 | ../browser-closure/result.json、../e2e-closure.txt及T1275/RESULT.md逐项证据 | 现有私有服务下读、UI和媒体；不冒称重新完成隔离启动/公共propose/apply/原测试进程收尾 |
| T1276 AC01～04 | T1276/RESULT.md、原request恢复/probe与偏好冻结日志 | 新鲜读取已有source SHA、已采纳版本和回执；原SnlZk2临时根已不存在，原request恢复、错组与Codex冻结改Pi均保原实际证据，不假造新HEAD重演 |

上述“已发生”仍按各报告自己的执行身份计数。严格报告中的 `checks` 与 `coverage` 目前全部unknown。未来不能仅因本只读脚本exit0就把表中所有历史故障状态改成当前HEAD PASS；须逐项明确旧证据是否满足合同、当前修改是否需要补测。若strict要求某项必须当前运行发生而这里只有历史证据，该项继续unknown并保留缺口，不缩减合同伪造通过。

## 真实回执生成规则

运行后才填写实际commit、observed_at、runtime、exit_code、输出路径和视口结果；逐项关联证据。visible_copy必须是本轮未脱敏改写的真实页面文本，引用文件完整SHA256并与报告commit一致。内部ID泄露若被copy_guard发现，应保真失败，不能过滤原文骗门禁。合同SHA按正式合同全文计算前12位；若合同改动，报告摘要随之重算，但不补写执行事实。

原始脚本输出不是机器可签的frontend-validation PASS。只有全部适用检查/条件均有充分证据、无未销缺陷、watch前后干净且HEAD不变，才由主会话形成正式报告并实际运行strict验证。历史视觉6.5→7.7→8.2与第三轮上下文复用局限继续披露；人类听感签字false不新增未要求的人工审批。全局T1204错误及其最新reconcile状态按主会话真实日志保留，不由本目录签全局绿。
