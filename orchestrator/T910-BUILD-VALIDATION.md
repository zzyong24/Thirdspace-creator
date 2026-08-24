# T-910 构建验收记录

## 结论

CreatorOS CLI 已覆盖内容雷达的完整公开闭环：显式绑定账号、新增或定位博主、补采作品、读取指定或全部作品的真实标题和完整逐字稿、提交单条补跑，以及找出缺稿作品后逐条补跑。全程复用公开 contract、公开任务系统和 CLI 回读，不读取数据库或私有接口。

```mermaid
flowchart LR
  A["显式选择账号"] --> B["解析并查重博主"]
  B --> C["新增或补采作品"]
  C --> D["分页获取全部视频"]
  D --> E["逐条回读标题和完整逐字稿"]
  E --> F["分类缺稿状态"]
  F --> G["逐条提交、等待并回读"]
```

## 能力对应

| 用户目标 | 公开 CLI operation | 完成依据 |
| --- | --- | --- |
| 新增、定位博主 | `intelligence.sources.previewProfile/create/list` | 同一真实账号下精确查重并回读 source |
| 获取、补采博主作品 | `intelligence.runs.start/list/get` | 等待同一个任务，随后回读 run 与 items |
| 获取指定或全部作品 | `intelligence.items.list/get` | 按 `meta.total` 遍历全部分页，以稳定 item ID 去重 |
| 提取标题与完整逐字稿 | `intelligence.items.get` | `item.title`；`transcript.status=done` 且正文去空白后非空 |
| 单条逐字稿补跑 | `intelligence.transcripts.enqueue` | 单 item 幂等提交、等待原 task、再次回读正文 |
| 查出缺稿并逐个跑 | `items.list/get` + `transcripts.enqueue` | 区分未提取、处理中、失败/受阻和异常空正文，只对可提交项串行处理 |

## 真实只读验证

- 本机安装版 `creatoros 0.1.0` 可连接桌面端，当前真实账号为 `acct-ae1a8346-9`。
- 公开 `sources.list` 可回读内容雷达博主；公开 `items.list(sourceId=...)` 可回读该博主作品的真实标题与转写状态。
- 公开 `items.get` 已回读作品 `intelligence-item-ef05e816-20434`，标题为“从AI耳机，看未来智能硬件的趋势...”，逐字稿状态为 `done`，正文长度 1728。
- 本次没有新增真实博主，也没有向真实作品提交转写任务；写入链路由 contract、CLI policy 和测试验证，避免未经用户指定目标就修改线上数据。

## 修复与防回归

- 修复 CLI 丢弃列表分页元数据的问题。现在 `call` 会保留 contract 的 `meta.page/pageSize/total`，自动化可以证明是否真正取全。
- 新增公开内容雷达操作手册，明确完整逐字稿判定、分页终止、博主查重、运行中任务续接、失败分类、串行补跑与幂等规则。
- Skill 改前压力测试为 RED：新 Agent 无法可靠组合真实 operation，也无法证明全量。改后同一场景复测 GREEN，消除了重复任务、误称全量和误判完整逐字稿的高风险歧义。
- 公开 Skill 包 SHA-256：`6c6b826be9e2b92998dfd432021413d16a8ecb521049ab23a9d408fd606dfa51`。

## 自动化证据

- `mcp-server` 类型检查：通过。
- `mcp-server` 测试：38/38 通过。
- 内容雷达 contract 与 CLI policy：10/10 通过。
- 内容雷达 backend contract、service、source-sync runner、transcript runner：43/43 通过。
- 产品流程引擎测试：21/21 通过。
- CLI runtime 构建及内置 `accounts.list` 冒烟：通过。
- 公开 Skill 源目录与重新解压后的 ZIP：结构、敏感信息和内容雷达规则校验均通过。
- 物理边界扫描：无新增违规；语义边界扫描通过。

## 已知的范围外状态

- 通用 MCP 冒烟的 `projects.list` 在没有显式账号时返回 `AccountRequiredError`。这是既有脚本未绑定账号，与本任务要求的“自动化必须显式账号”一致；本任务的 runtime 构建内置冒烟和目标测试均已通过。
- 全局 `reconcile` 仍被大量既有流程欠账阻断，包括旧模块缺少 autonomous write-set/verify、历史 review/frontend receipt 漂移，以及 T-905 的非法验收值“待确认”。这些错误均不在 T-910 写集内；本任务没有修改或掩盖它们。
- 修复已进入源码和公开 Skill 包；当前 `/Applications` 内已安装的桌面包没有在本任务中重新打包替换。
