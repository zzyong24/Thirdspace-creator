# T-1058 研究交付独立复核

复核日期：2026-10-04。结论：**已审阅的研究正文与附件无阻断问题，findings=[]。** 此结论只覆盖研究交付的事实、范围与证据表述；不批准未来实施合同，不表示真实连接、生图、激活迁移或产品验收 PASS。

## 已核对的交付与事实

只读审阅 `docs/verification/t1058/research.md`、`protocol-research.md`、`workbuddy-research.md`、`settings-research.md`、当前 SPEC、DEC-T1058-01 与对应复杂度登记。主报告当前 SHA-256 为 `66b89510a801ea7fc6803d876a7b9b2dc6d951b877d5d54be03e67148a6572f2`。协议附件与本独立研究原稿内容一致。抽查现有 MCP、Codex host/native turn、渠道设置卡、选择路由/存储、任务 authority 及凭据恢复源码；未运行产品测试、模型、Agent、浏览器自动化或连接探针，未改仓库。

| 检查项 | 实际核对结果 |
|---|---|
| ACP / MCP 方向 | 主报告正确区分 CreatorOS ACP client→Agent、Agent MCP client→CreatorOS；会话能力协商与项目数据所有权分开。底层下载、Whisper、ffmpeg 继续原 owner，没有恢复 T1057 全命令迁入 Codex 的旧假设。 |
| WorkBuddy / CodeBuddy | 腾讯官方 ACP 页面明确 `codebuddy --acp` 对应 CodeBuddy Code。WorkBuddy 官方 Open API 快照有 tasks 的 ACP link/token、GET SSE/POST JSON-RPC 和 session/load(task_id)；连接器快照明确 WorkBuddy 调接入方 MCP/CLI。报告没有冒称 WorkBuddy 桌面存在同名本地 ACP 命令。 |
| WorkBuddy 限制 | 主报告把云端取消、MCP 注入、模型选择和本地助理会话隔离保留待核验；官方出现 cancelled 终态不能证明 session/cancel 已公开。localassistant 的公开 URL 是 workbuddy.cn 的 Open API，报告没有声称已经有 CreatorOS 的本机回环直连。 |
| 认证方向与许可 | WorkBuddy 应用调用 OAuth 与 MCP 连接器 OAuth 分开；client_secret 不可塞进桌面包。社区私有 Gateway 与许可证未知明确保留。公开文档/tap 的许可没有被推成运行时再分发许可。 |
| Codex 文本/生图 | 官方图片文档支持 `$imagegen`、内置 gpt-image-2 与 Codex 用量；0.159.3 扩展源码有 provider 条件。现产品仍关闭 image_generation/code_mode，native-turn 只收文本。桥 v2.1.1 的图片事件、路径投影与当前产品资产导入缺口已区分，未把 mock/fixture 或 README 当成真机成功。 |
| MCP 工具权限 | 当前 mcp-server 的全 contract→dispatch 面与内部任务冻结 none/proposal 窄面明确区分。主报告不建议把整份 CLI 权限直接给内部 ACP，也不伪造聊天来源套取非聊天任务权限。原归属、候选采用、CAS 和 execution_tasks 保留。 |
| 项目绑定 | get_active_project 作为应用自定义工具说明正确；没有宣称 CreatorOS 已实现。同一任务绑定 app 实例、账号、project/output 与版本，前台/标题不能授权或改投，模型快照不能替代执行时当前真值。 |
| 全部合法旧码 | SPEC、DEC 和主报告均把所有仍合法旧码取得渠道配置作为用户已确认范围。待合同是签发/映射方式、真实额度和上游版本，不重新询问相同产品授权，不让客户端伪造 channelRef 或放宽验签。 |
| 配置可切回与账号 | 设置源码确实存在渠道自动接管、托管缺失能力 pending；渠道选择存储键为 userId/scopeId/serviceId，没有 accountId。报告没有误称当前已账号隔离或当前已自由组合。 |
| 旧冻结任务 / 未知回执 | 实际 authority 冻结整个 scope/payload 摘要，worker 比对失败拒绝解析；报告把细化标为后续合同，没有删除校验。切换仅影响新任务，旧任务/unknown 不静默换引擎重发，真正撤权仍阻止对应调用。原合法上传、保存、无图写稿与 ASR 降级在未来验收清单保留。 |

WorkBuddy 官网三页本次 web 工具未返回正文，故独立核对已归档官方 openapi/connector HTML 与文本；`source-records.json` 标记它们为后续证据重取，未伪造首次读取时间。原文/文本摘要均逐项重新计算匹配。CodeBuddy 官方 ACP/扩展页与 OpenAI 图片说明本次可直接读取。此处没有声称用户安装版本、真实授权 scopes、线上额度或运行时能力已验证。

## 三条零机制登记与 DEC

实际 `orchestrator/COMPLEXITY_LEDGER.json` 有以下三条 T1058 登记，都是单文件、精确哈希、in-budget：

| 文件 | 实际 SHA-256 与登记一致 |
|---|---|
| docs/features/t1058-composable-agent-model-research.review.md | 34c0051c1b7d8445520806ed45fe41e42d1866cbe4d37cd64dfb1b02bf970a47 |
| docs/verification/t1058/spec-review-round-2.json | ecd3ef2615d638f4484c5e189b3fbb3a7e74f5a1a366c916a09bea8b9e0749e1 |
| docs/verification/t1058/source-manifest.json | 8cfa9bae6ba573412d0315a1c566efea71d94522941bf39173fe964bb7a92704 |

前两条分类 os_signing，实际内容只是原样评审回执中引用旧激活权限术语；没有运行时或操作系统签名实施。reason 明确机制新增0，acceptance 明确不批准签名机制、未来合同、真实连接或产品验收。第三条分类 language_toolchain，实际清单只是公开源码的 Cargo.toml 文件名/URL/摘要等元数据；reason 明确未安装、运行、引入或修改工具链，acceptance 不授权工具链/运行时实施。没有生产路径通配登记。

DEC-T1058-01 正确记录用户方向纠正、研究范围以及不授予免费额度/第三方订阅，保留 T1057 暂停与失败历史；同时明确词法条目仅解释研究引用。第三条也引用该只读研究决定，没有扩大产品范围。已读 guard 依据 task/file/hash 匹配条目；这些登记不能沿用到不同文件或内容变更。因此本次词汇处理没有给实际 OS 签名或语言工具链实施放行。

## 归档边界

补充独立核对已归档 source-manifest.json：固定源码 commit/URL、快照路径、HTTP/抓取说明均有记录；未记录首次时间的内容如实声明，不补造时间。重新读取全部已列本地快照并核算19组摘要，均匹配，没有缺失或摘要冲突。其余官方来源仅逐项链接、没有完整快照的事实也明确说明。

verification.md 当前尚未落盘，仍按委派说明视为正在归档；没有把相应治理命令记为已独立核验或 PASS。正式治理记录仍应在实际归档后核验。任何未发生的真实集成、产品测试或许可确认继续保持未验证。
