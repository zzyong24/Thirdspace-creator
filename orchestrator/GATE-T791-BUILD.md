# T-791 BUILD Gate — `script.draft` 资料驱动生成链

日期：2026-08-12
状态：PASS（本地包能力范围）

## 用户结果

- 用户在项目 Copilot 中粘贴长文、杂乱资料、已有文案，或添加 TXT / Markdown / 已确定性抽取的 PDF、DOCX 后，可直接要求“基于这些写”“基于这篇润色”。
- `generate` 不再只收到主题和 2,000 字符 `extraBrief`：模型只选择 opaque `sourceRefs`，宿主从已经持久化的消息和已验归属附件恢复完整正文，再按用户选择顺序冻结 `sourceType/sourceId/charCount/sha256/body` 进入 `ai_tasks.input_data`。
- runner 调用前重新校验顺序、字符数、完整标记和 SHA-256；任一来源失效、截断、为空、重复或合计超过 200,000 字符时整次失败，不静默跳过。
- 本轮 `instruction` 与完整资料以独立数据块进入 `script.draft v9`，明确高于旧 Brief、旧定位措辞与历史建议；资料内看似命令的文字仍只作为用户数据。
- “一字不改”继续走既有 `verbatim` 精确恢复，不调用写稿模型；普通无资料写稿仍可用。
- 日志与候选结果只记录来源元数据和 hash，不回写来源正文；候选仍需用户采纳才追加稿面版本。

## RED → GREEN

RED 首次执行：

```text
backend chat-tools / script-runner: 3 个新断言失败
frontend script-draft-task-input: 1 个新断言失败
证实 generate 会丢 instruction/sourceRefs，runner 收不到完整资料。
```

GREEN：

```text
backend focused: 3 files / 339 tests PASS
frontend focused: 2 files / 52 tests PASS
ai-worker focused: 3 files / 28 tests PASS
ai-worker / backend / frontend typecheck: PASS
semantic-boundary-scan: PASS
boundary-scan: 0 新增违规（既有基线 5）
orphan-scan: 0 error（既有 100 warnings）
```

## 边界

- 没有新增页面、数据表、迁移或第二文档库；复用现有会话消息、附件资产、`ai_tasks.input_data`、异步 runner 和候选采纳门。
- 当前本地包的资料容量门采用 16 份、合计 200,000 字符的保守上界；超过时在任务创建前拒绝。未在本轮引入超大文档分块检索或摘要替代全文。
