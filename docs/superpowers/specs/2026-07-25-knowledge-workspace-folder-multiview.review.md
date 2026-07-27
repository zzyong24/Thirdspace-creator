# T-519 PLAN 独立评审

- `review_mode`: `cross-model-independent`
- `model`: `gpt-5.6-sol`
- `round`: `1`
- `verdict`: `CONCERNS`
- `finding_counts`: `blocker=0, major=8, minor=0`

## 原始 JSON

```json
{
  "verdict": "CONCERNS",
  "summary": "方向与 CreatorOS 的本地优先、账号隔离、AI 采纳门和诚实状态原则一致，旧 .doc 与扫描 PDF OCR 也已按 T-525 owner、触发条件及当前 unsupported/no_text 行为完成合法显式 deferral；但 RAT 证据、抽取状态唯一真相、引用中原件删除语义、仓内事实证据和可执行验收仍有 major 缺口。",
  "findings": [
    {
      "severity": "major",
      "category": "value-viability",
      "where": "§4.4「五大风险与 RAT」的“可行性”“依赖”两行",
      "issue": "两行只写了将来要做的“三格式本地 RAT + refresh/restart”和“20 文件格式语料 RAT”，没有回填样本、运行结果或由结果得到的裁决；而 §4.6 pre-mortem #1 又把“上传成功但 AI 实际没读到”列为核心死因。PRODUCT_SPEC 的 value/viability Pass 锚点要求致命且便宜可验的风险已检验并回填，当前文本仍是检验计划，不是证据。",
      "suggestion": "在 PLAN 通过前回填最小 RAT 的日期、样本构成、执行方式、PDF 文本层/DOCX/Markdown 结果、refresh/restart 结果及失败分类；20 文件依赖 RAT 若尚未完成，明确已有结果、剩余验证和进入后续 Gate 的判定条件，不能把未运行的检验写成支持可行性的证据。"
    },
    {
      "severity": "major",
      "category": "approach",
      "where": "§1“原文件、抽取状态、知识原子、引用和关系各有唯一真相”；§8 ENT-KNW-03 与 ENT-KNW-08",
      "issue": "SPEC 声称抽取状态有唯一真相，但 ENT-KNW-03 KnowledgeDocumentVersion 含 `extract status/coverage`，ENT-KNW-08 Asset/AssetFile 又含 `extractedText、extractStatus`，没有说明哪一处是 canonical、另一处是投影还是如何原子同步。另一个 agent 可据此实现两套可漂移状态，直接违背本 SPEC 的唯一真相目标及宪法 BR-04 的可重建投影原则。",
      "suggestion": "在 PLAN 中明确抽取文本、parser 元数据、status、coverage 各自的唯一 owner；若 Knowledge 只保存读模型/快照，写明来源、刷新规则、幂等键和漂移时的裁决顺序，并让实体表与 FLOW-KNW-01 使用同一口径。"
    },
    {
      "severity": "major",
      "category": "approach",
      "where": "§5 FR-KNW-13 与 §15 AC-KNW-08",
      "issue": "FR-KNW-13 要求删除原文件前“二次确认并检查引用”，AC-KNW-08 又允许“被阻断或二次确认”，因此实现者可以把“有引用但二次确认后硬删”判为合格；这与宪法 BR-03“对象文件在引用归零后 GC”冲突，也会使同一 AC 要求仍可解释的历史 Context Manifest 失去原件依据。",
      "suggestion": "把有引用时的行为定死：引用未归零不得硬删 bytes；二次确认最多用于归档、从文件夹移除或进入待 GC 状态。明确何时引用视为归零、历史 manifest/source link 的保留方式，以及真正 GC 的验收条件。"
    },
    {
      "severity": "major",
      "category": "reinvent-wheel",
      "where": "§11「现成方案 / OSS 调研」的 DOCX / Mammoth 行",
      "issue": "该行断言“仓内已用”，但证据列没有仓内 file:line 或 codegraph 查询，只给出对官方能力的概述。按不造轮子量规，仓内已有实现断言必须可定位，当前无法复核将要复用的是哪一处集成及其真实边界。",
      "suggestion": "补充 Mammoth 在仓内的 import、调用和错误处理对应 file:line（或可复现 codegraph 查询），并把官方 `.docx`/sanitization 边界链接到具体裁决。"
    },
    {
      "severity": "major",
      "category": "reinvent-wheel",
      "where": "§11「现成方案 / OSS 调研」的“二进制/对象存储 / 仓内 Assets service”行",
      "issue": "该行把覆盖度判为 full，并声称已有 createUpload/complete/get bytes，但只引用整个 `backend/src/modules/assets/assets.service.ts`，没有 file:line 或 codegraph 证据。量规要求每条“X 已存在”断言可精确复核，当前证据不足以确认 complete、读取与 ownership 边界真的覆盖本方案。",
      "suggestion": "为 createUpload、complete、读取 bytes 及 ownership 守卫分别补 file:line 或 codegraph 查询结果，并据此说明 full 判定覆盖了什么、仍缺什么。"
    },
    {
      "severity": "major",
      "category": "reinvent-wheel",
      "where": "§12「现网事实」的“Knowledge contract 没有 folder/document 实体”行",
      "issue": "“没有实现”只引用了两个完整文件，没有 file:line，也没有 codegraph 无命中或 grep 空结果；这正是量规要求提供反证搜索的负断言，当前不足以排除别处已有资源、operation 或同义实体。",
      "suggestion": "记录可复现的反证搜索：查询范围、关键词/符号（folder、document 及可能同义名）和空结果；同时给出两个 contract 文件现有资源/operation 边界的精确行号。"
    },
    {
      "severity": "major",
      "category": "traceability",
      "where": "§5 FR-KNW-08「文档预览与出处」与 §15「验收与成功信号」",
      "issue": "FR-KNW-08 要求原文件名、大小、版本、抽取覆盖、来源、文件夹、知识原子、项目引用，以及安全文本预览和原件下载，但 AC-KNW-01～08 没有一项完整验证这些字段与降级路径。该 FR 因而无法落到明确测试，另一个 agent 可以遗漏出处或下载仍宣称验收通过。",
      "suggestion": "新增或扩展一个 AC，逐项验证详情字段、PDF/Word 无法保真时的安全文本预览、原件下载、sanitize/权限失败回显，并在后续 traceability matrix 映射 FR-KNW-08 → operation → test。"
    },
    {
      "severity": "major",
      "category": "completeness",
      "where": "§15 AC-KNW-07（关联 §6 NFR-KNW-06）",
      "issue": "AC-KNW-07 只要求 tree 根和当前目录“达到性能预算”，但本 SPEC 未指定这里采用宪法的普通本地读 P95 ≤500ms、组合页 P95 ≤1 秒，还是其他预算，也未写测量环境和分页条件。该模糊验收无法被客观判定，违反完整性量规对未量化性能措辞的要求。",
      "suggestion": "把 AC-KNW-07 改成可测阈值：明确 10,000 文档数据分布、根/当前目录页大小、冷/热缓存条件、P95 指标和阈值，并显式引用适用的宪法 NFR-PERFORMANCE 条款。"
    }
  ]
}
```

## 作者处理记录（Round 1 findings）

日期：2026-07-25。以下处理均已回写 PRODUCT SPEC，等待独立 Round 2 复评：

1. **接受 RAT 缺口**：新增
   `docs/research/2026-07-25-t519-document-extraction-rat.md`。真实最小 PDF 文本层、DOCX、
   Markdown 离线抽取通过，损坏 PDF/DOCX 明确失败，runner 13/13 通过；真实 DB refresh、
   冷重启、Node 25、复杂语料继续明确为 CONTRACT/BUILD 硬 Gate，不补写 PASS。RAT 额外发现
   非法 UTF-8 会被 `TextDecoder` 静默替换，SPEC 已要求严格失败。
2. **接受唯一真相问题**：`AssetFile` 明确为 extractedText、extractStatus、coverage、
   parser/version 的唯一可变真相；KnowledgeDocumentVersion 只保存不可变历史指纹/解析器快照，
   页面投影漂移时从 Assets service port 重建。
3. **接受删除歧义**：任何当前/历史 source link、Context Manifest、项目/素材或 document version
   引用未归零时，硬删 bytes 必须阻断；二次确认只能归档/解除目录关联。引用归零后才可进入
   Assets GC。
4. **接受 Mammoth 证据问题**：补充
   `frontend/src/server/persistence-client.ts:4618-4623` 和 `frontend/package.json:65`。
5. **接受 Assets 证据与覆盖度问题**：覆盖度从 `full` 改为 `partial`，精确列出 ownership/bytes、
   extraction update、createUpload、complete/head/checksum 行号，明确仍缺 document 编排。
6. **接受负断言证据问题**：记录 contract 两文件的精确 `rg` 查询、0 命中结果及现有资源/
   operation 行号。
7. **接受 FR-KNW-08 验收缺口**：新增 AC-KNW-09，覆盖详情字段、安全预览、受控下载以及
   sanitize/缺文件/越权失败。
8. **接受性能口径缺口**：AC-KNW-07 固定 100×100 文档、页大小 100、冷/热条件与 30 次样本，
   使用宪法普通读 P95 ≤500ms、组合首屏 P95 ≤1s；Windows 仍是非承诺候选证据。

---

# Round 2 独立复评

- `review_mode`: `homogeneous-fresh-context`
- `model`: `Codex 独立子上下文（服务端具体型号不可见）`
- `round`: `2`
- `verdict`: `CONCERNS`
- `finding_counts`: `blocker=0, major=7, minor=0`
- `warning`: 本轮是同族新上下文复评，不冒充跨家族 Gate；结论只代表独立证据复核。

## Round 1 八项关闭复核

| Round 1 finding | 复核结论 | Round 2 证据 |
| --- | --- | --- |
| 1. RAT 只有计划、没有结果 | **CLOSED** | `docs/research/2026-07-25-t519-document-extraction-rat.md` 已记录生成样本、依赖版本、真实输出、runner 13/13 和明确 NOT VERIFIED。SPEC §4.4 只宣称最小格式 RAT，通过文字没有把 refresh/restart、Node 25 或真实 DB 写成 PASS。 |
| 2. 抽取状态双真相 | **PARTIALLY CLOSED** | FR-KNW-05、FLOW-KNW-01、ENT-KNW-03/08 已把当前可变抽取事实归 Assets；但 ENT-KNW-02 仍有未定义的 `status`，且 SPEC 的 `ready/no_text` 与现网 `done/failed` 未定义 canonical 映射；历史引用的不可变抽取内容也尚未闭合，见 R2-M1/R2-M2。 |
| 3. 有引用时可被二次确认硬删 | **CLOSED** | FR-KNW-13 与 AC-KNW-08 已明确：任一当前/历史引用未归零时 bytes 硬删必须阻断，二次确认不能越过阻断；与宪法 BR-03 一致。 |
| 4. Mammoth 仓内证据不精确 | **CLOSED** | SPEC §11 精确引用 `frontend/src/server/persistence-client.ts:4618-4623` 与 `frontend/package.json:65`，并明确当前只取 raw text，不把 HTML sanitization 冒充已有。 |
| 5. Assets 证据不精确且覆盖度过高 | **CLOSED（原 finding）** | SPEC §11 已降为 `partial`，所列 ownership、bytes、extraction update、createUpload、complete/head/checksum 行号均可复核；但另有既存版本接口未纳入调研，作为新问题 R2-M4。 |
| 6. “没有 folder/document”负断言无反证 | **CLOSED** | 本轮复跑 `rg -n "KnowledgeFolder|KnowledgeDocument|folder|document" contract/src/resources/knowledge.ts contract/src/operations/knowledge.ts`，退出码为 1、0 命中；SPEC 也记录了查询与现有边界行号。 |
| 7. FR-KNW-08 无可执行验收 | **CLOSED** | AC-KNW-09 已逐项覆盖详情字段、安全文本预览、受控下载以及 sanitize/缺文件/越权失败。 |
| 8. 性能 AC 不可测 | **PARTIALLY CLOSED** | 数量、分页和阈值已补齐，但冷缓存没有样本数，所谓“macOS 基线机”在宪法和仓内文档中没有硬件/存储定义，P95 仍不可复现，见 R2-M3。 |

## Round 2 结构化 findings

```json
{
  "verdict": "CONCERNS",
  "summary": "Round 1 的 RAT、删除阻断、仓内证据和详情验收大部分已经真实关闭，且 RAT 对 Node 版本、持久化与复杂语料限制没有过度宣称；但 canonical 状态词、历史抽取不可变性、性能测量、既有 Assets 版本接口、外部文件不可信边界、RAT 后续 Gate 追踪和跨视图实体身份仍有可导致不同实现者做出不同系统的 major 缺口。",
  "findings": [
    {
      "severity": "major",
      "category": "completeness",
      "where": "§5 FR-KNW-05、§7 FLOW-KNW-01、§8 ENT-KNW-02/08 与 RAT §4/§6",
      "issue": "SPEC 要求 UI 状态 `uploading/extracting/ready/failed/no_text/unsupported`，现网 runner 实际写 `done/failed/unsupported`，空文本也写 `failed`（`material-extract-runner.ts:197-216`）；同时 ENT-KNW-02 仍保留一个没有枚举和语义说明的 `status`。虽然 AssetFile 已被指定为当前抽取真相，但没有定义 canonical 持久枚举、`done→ready` 是否只是 UI 映射、`failed→no_text` 如何区分，以及 KnowledgeDocument.status 是否仅为 active/archived 生命周期。另一个 agent 仍可能落两套状态或把同一个状态词用于两种生命周期。",
      "suggestion": "在 PLAN 明确两套互不混用的状态：KnowledgeDocument 生命周期枚举与 AssetFile extraction 枚举；给出 canonical 持久值和 UI 映射，并要求扫描无文本、解析异常、排队、运行中分别有确定转移。ENT-KNW-02 应改成有枚举的 lifecycleStatus（或删除歧义字段），所有抽取状态只从 AssetFile 投影。"
    },
    {
      "severity": "major",
      "category": "approach",
      "where": "§5 FR-KNW-07/12、§7 FLOW-KNW-01/04/05、§8 ENT-KNW-03/07/08 与 HARD-KNW-04",
      "issue": "KnowledgeDocumentVersion 只保存 extractionFingerprint/parserVersion 元数据快照，而实际 extractedText 仍是 AssetFile 上的可变字段。若同一 AssetFile 重跑新 parser 或上传新 file 后旧任务迟到，历史 source range / chunk 与 ContextManifest 无法仅靠指纹还原当时文本。现网 runner 只携 `assetId`，`getAssetBytes` 和 `updateFileExtraction` 也按 assetId 操作当前/最后一个文件（`material-extract-runner.ts:137-145,212-216`；`assets.service.ts:377-401`），存在旧版本任务读写新版本的竞态。当前模型因此还不能兑现“版本变化不改写历史 manifest”。",
      "suggestion": "把 CONTRACT 必须守住的不变量前置写清：抽取任务固定 `assetFileId + checksum`，条件回写同一 file；任何会改变被引用文本的重抽取产生新的不可变 extraction revision 或新的 document version，不覆盖历史内容；SourceLink/ContextManifest 固定到可按版本读取的抽取产物。补 by-file/version bytes/text 读取与迟到任务 CAS 验收。"
    },
    {
      "severity": "major",
      "category": "completeness",
      "where": "§15 AC-KNW-07",
      "issue": "AC 已给 10,000 条分布、页大小和阈值，但“应用重启后的冷缓存和连续 30 次热缓存”只明确了热缓存 30 次，冷缓存没有可计算 P95 的样本数；“当前正式支持的 macOS 基线机”也没有 CPU、内存、磁盘和运行模式定义，仓内没有另一处基线机条款可引用。不同机器/不同计时边界会得到不可比较结果。",
      "suggestion": "固定可复现的基线机配置和 release/dev 运行模式；冷、热各规定至少 30 个独立样本（冷样本每次重启并清楚说明缓存重置），定义从请求发出到当前目录可交互的计时边界，再计算 P95。"
    },
    {
      "severity": "major",
      "category": "reinvent-wheel",
      "where": "§11「二进制/对象存储」与 §12「现网事实」（关联 FR-KNW-07）",
      "issue": "调研列了 createUpload/complete/get bytes，却漏掉仓内已经存在的版本入口：`contract/src/operations/assets.ts:77-84` 的 `assets.files.create` 和 `backend/src/modules/assets/assets.service.ts:587-617` 的 `addAssetFile` 会插入 AssetFile 并推进 currentFileId。这正是文档“新版本/另存”方案必须采用、扩展或明确拒绝的既有轮子；不评估它，也没有说明它只收 storageKey、如何与 upload ownership 会话配合，实施者可能再造一套版本写入或误用不受控 storageKey。",
      "suggestion": "在 OSS/现网事实中补上 `assets.files.create/addAssetFile`，逐项裁决复用或扩展；同时记录现有 `getAssetBytes` 取 files 末项而 `getDownloadUrl` 优先 currentFileId 的差异，并把按 assetFileId 的版本读取、上传会话归属和 current 指针 CAS 作为 CONTRACT 缺口。"
    },
    {
      "severity": "major",
      "category": "fit-positioning",
      "where": "§5 FR-KNW-09/10/12、§6 NFR-KNW-03/04 与 §7 FLOW-KNW-04/05",
      "issue": "宪法 R-COPILOT 明确要求“外部网页/文件标为不可信数据”，但本 SPEC 只约束宏、脚本、MIME 和预览 sanitize，没有要求抽取后的文件/URL 文本在进入 AI 提炼、关系建议或检索上下文时保持 untrusted 标记并与 system/tool 指令隔离。恶意文档中的提示词仍可能被当成 Agent 指令；人类采纳门不能替代工具调用和上下文污染的信任边界。",
      "suggestion": "增加 untrusted-content NFR 与验收：所有上传文件/URL 文本带来源和不可信标签，以数据边界封装进入模型；不得提升为 system/developer/tool 指令，不得因文档内容扩大工具白名单；加入含 prompt injection 文本的负向测试，确认只产可审候选且无工具副作用。"
    },
    {
      "severity": "major",
      "category": "traceability",
      "where": "§4.4「依赖」行、`docs/research/2026-07-25-t519-document-extraction-rat.md` §6 与 §15 AC-KNW-03/04",
      "issue": "RAT 正确地把 Node 25、20 文件复杂语料、真实 DB/object storage 冷重启和接近 20MB 的内存/清理列为后续硬 Gate，SPEC §4.4 也写“未完成不得宣称格式链路全绿”；但 AC 只列格式终态和重启幂等，没有把 20 文件 corpus、Node 25、20MB 峰值内存/失败清理映射为验收。实现者可只跑最小三样本与 mock runner 仍声称所有 AC 通过。",
      "suggestion": "把 RAT §6 的 release-blocking 条目映射到 AC/HARD/PKG：固定 20 文件 corpus 分类、Node 25 正式组合根、真实 DB+对象存储冷重启、近 20MB 峰值预算与失败清理；明确哪些是 CONTRACT 判定、哪些是 BUILD/SHIP 测试及对应证据文件。"
    },
    {
      "severity": "major",
      "category": "approach",
      "where": "§3 SC-KNW-04、§5 FR-KNW-11、§8 ENT-KNW-02/05/06 与 §9 IA-KNW-03/04/06",
      "issue": "SC-KNW-04/FR-KNW-11 要求 folder document、graph node、atlas card、all row 共享“同一 item ID 与详情”，但领域模型明确 KnowledgeDocument 与 KnowledgeItem 是不同实体；现有 graph/atlas 以 KnowledgeItem（另含 project anchor）为节点，而文件夹主面以 KnowledgeDocument 为主。SPEC 没说明图/地图是否加入 document node，也没定义 document 详情与其多个已采纳 item 之间的选择语义，因此“同一 ID/同一详情”在当前实体模型下无法一致实现。",
      "suggestion": "定义跨视图 selection identity（例如 `{kind: document|knowledgeItem|project, id}`）和详情路由：同一 KnowledgeItem 在 graph/atlas/all 复用同一 item ID；folder 中的 document 打开 document 详情，再通过 source links 跳到其 item。若图要显示 document，显式新增节点类型与边，而不是把 documentId/knowledgeItemId 混成一个 ID。"
    }
  ]
}
```

## Round 2 结论

本轮没有发现 scope reduction blocker：旧 `.doc` 与扫描 PDF OCR 仍按 T-525、触发条件和当前
`unsupported/no_text` 行为完成了显式后续登记；Windows 也没有被冒充为正式支持平台。

RAT 可以继续作为 **PLAN 可行性证据**，但不能被用作 CONTRACT/BUILD 通过证据。当前建议保持
`CONCERNS`：先处理 R2-M1～M7，再做最多一轮独立复评；在处理记录与人的裁决落盘前，不应把
T-519 PLAN 标为 `PASS` 或进入实现。

## 作者处理记录（Round 2 findings）

日期：2026-07-25。已回写 PRODUCT SPEC，等待 Round 3 独立复评：

1. **接受状态词歧义**：拆成 `KnowledgeDocument.lifecycleStatus=active|archived` 与
   `AssetExtractionRevision.status=pending|running|done|failed|no_text|unsupported`；
   UI `uploading/extracting/ready` 只作明确映射，Knowledge 不保存第二套抽取状态。
2. **接受历史抽取/迟到任务竞态**：新增 immutable `AssetExtractionRevision`；task 固定
   `assetFileId+sourceChecksum`，by-file 读写并以 expected pointer/revision CAS；document version、
   SourceLink、ContextManifest 固定 extractionRevision，重抽取不覆盖历史全文。
3. **接受性能复现缺口**：基线固定 Apple M1/8 GiB/内置 SSD/macOS 14+/release sidecar；
   冷、热各 30 个样本，冷样本每次新进程且明确不伪称清 OS page cache；计时到首屏可键盘交互。
4. **接受既有版本入口遗漏**：调研与现网事实补入
   `assets.files.create`/`addAssetFile`，明确扩展而非再造；raw storageKey、upload ownership、
   `getAssetBytes` 与 currentFileId 差异、CAS/by-file 都进入 CONTRACT 缺口。
5. **接受不可信内容缺口**：新增 NFR-KNW-11 与 AC-KNW-11；文件/URL 始终作为 untrusted 数据块，
   不得改变 system/tool policy 或触发写/付费工具，prompt-injection fixture 的副作用调用必须为 0。
6. **接受 RAT Gate 追踪缺口**：新增 HARD-KNW-06 与 AC-KNW-12，固定 Node 25、20 文件 corpus、
   真实 object storage+file PGlite 冷重启、近 20 MiB 峰值 RSS 增量 ≤512 MiB 和失败无残留。
7. **接受跨视图实体身份矛盾**：定义
   `{kind:document|knowledge_item|project,id}` selection；document 与 KnowledgeItem 保持不同
   详情和 ID，只经 SourceLink 双向导航；图若加入文档必须使用显式 typed node/edge。

---

# Round 3 最终独立复评

- `review_mode`: `homogeneous-fresh-context`
- `model`: `Codex 独立子上下文（服务端具体型号不可见）`
- `round`: `3`
- `verdict`: `CONCERNS`
- `finding_counts`: `blocker=0, major=3, minor=1`
- `warning`: 本轮是同族新上下文最终复评，不冒充跨家族 Gate；结论来自对 SPEC、完整评审历史、
  产品宪法、RAT 与现网代码的独立交叉核验。

## 复核证据

- 全文复核 PRODUCT SPEC、Round 1/2 findings 与作者处理记录、
  `docs/research/2026-07-25-t519-document-extraction-rat.md`。
- 产品边界复核：`docs/产品定位.md:27-37,59-64,289-303,323-337,358-365,387-393,462-481`。
- 现网抽取/版本链复核：
  `backend/src/modules/ai-runtime/material-extract-runner.ts:130-216`、
  `backend/src/modules/assets/assets.service.ts:355-401,404-508,587-617`、
  `contract/src/operations/assets.ts:77-84`、
  `frontend/src/server/persistence-client.ts:4582-4629`。
- 现网跨视图实体复核：
  `frontend/src/features/knowledge/knowledge-data.ts:401-421`、
  `frontend/src/features/knowledge/knowledge-interactive-region.tsx:311-317,418-455`、
  `frontend/src/features/knowledge/knowledge-page.tsx:102-107`。
- 2026-07-25 复跑：
  `pnpm --filter @creatoros/backend exec vitest run src/modules/ai-runtime/material-extract-runner.test.ts`
  为 `1 file / 13 tests passed`；运行时是 Node `v22.22.2`，同时出现仓库要求 Node
  `>=25 <26` 的 engine warning，因此只印证最小 RAT，不替代 AC-KNW-12。
- 反证搜索复跑：
  `rg -n "KnowledgeFolder|KnowledgeDocument|folder|document" contract/src/resources/knowledge.ts contract/src/operations/knowledge.ts`
  为 0 命中。

## Round 2 七项关闭复核

| Round 2 finding | Round 3 结论 | 证据与裁决 |
| --- | --- | --- |
| R2-M1 canonical 状态词与生命周期混用 | **PARTIALLY CLOSED** | `KnowledgeDocument.lifecycleStatus`、UI 映射和 extraction 枚举已经拆开；但 `AssetExtractionRevision` 同时被定义为“创建后不可变”和 `pending→running→终态` 的状态载体，仍无法形成单一可执行状态机，见 R3-M1。 |
| R2-M2 历史抽取内容与迟到任务竞态 | **PARTIALLY CLOSED** | `assetFileId+sourceChecksum`、by-file 读写、expected-pointer CAS、document/source/context 固定 extraction revision 已补；但 revision 的创建/推进语义仍与“不可变”冲突，且 FR-KNW-13 的“等价版本迁移”可改写历史锚语义，见 R3-M1/R3-M3。 |
| R2-M3 性能验收不可复现 | **CLOSED** | AC-KNW-07 已固定 Apple M1、8 GiB、内置 SSD、macOS 14+、release sidecar、100×100 数据、页大小 100、冷/热各 30 样本、计时边界和 P95 阈值，并诚实说明不清 OS page cache。 |
| R2-M4 漏掉 `assets.files.create/addAssetFile` | **CLOSED** | §11/§12 已引用精确代码行，裁决为扩展现有入口；raw `storageKey`、upload ownership、`currentFileId`/末项差异、by-file 与 CAS 均明确进入 CONTRACT 缺口。 |
| R2-M5 外部文件不可信边界缺失 | **CLOSED** | NFR-KNW-11 与 AC-KNW-11 已要求 provenance、`trust=untrusted`、system/tool policy 隔离和写/付费副作用为 0，符合宪法 R-COPILOT/NFR-SECURITY。 |
| R2-M6 Node 25/corpus/restart/memory 未追踪 | **CLOSED** | HARD-KNW-06 与 AC-KNW-12 已固定 20 文件 corpus、Node 25、正式组合根、真实 object storage + file PGlite 冷重启、RSS 增量上限与失败清理；并明确最小 RAT 不可替代。 |
| R2-M7 跨视图实体身份不明确 | **PARTIALLY CLOSED** | document 与 KnowledgeItem 已使用 typed selection 分离；但既有“全部”视图的 experience 实体被 union 漏掉，project 虽入 union 却无详情路由与验收，见 R3-M2。 |

## Round 3 结构化 findings

```json
{
  "verdict": "CONCERNS",
  "summary": "方案已真实关闭性能复现、既有 Assets 版本入口、不可信内容、Node 25 语料 Gate 与显式 deferral 等 Round 2 缺口，且没有 Windows 冒充或旧 DOC/OCR 静默缩水；但抽取 revision 的不可变状态机、跨视图完整实体联合，以及历史引用下“等价版本迁移”的删除语义仍有三项 major 二义，当前不能 PASS。",
  "findings": [
    {
      "severity": "major",
      "category": "approach",
      "where": "§5 FR-KNW-05/07、§6 NFR-KNW-05、§7 FLOW-KNW-01、§8 ENT-KNW-08/09",
      "issue": "ENT-KNW-09 把 AssetExtractionRevision 定义为“创建后不可变”，FR-KNW-07 也要求结果写成 immutable revision；但 FR-KNW-05 又把 pending/running/done/failed/no_text/unsupported 全部放进这个 revision.status，UI 要实时读取 pending/running，FLOW-KNW-01 却写成抽取后才创建 revision 并 CAS 推进指针。一个对象若创建后不可变就不能从 pending 变 running/终态；若原地更新 status 又不再是不可变 revision。当前没有独立 ExtractionTask 状态真相，也没有规定每次状态转移都新建 append-only revision，因此实现者只能在“可恢复进度”和“历史不可变”之间任选其一。",
      "suggestion": "在 PLAN 定死一种模型：推荐把可变 task（queued/running/terminal、taskId、进度、错误）与仅在终态生成的 immutable AssetExtractionRevision 分离；AssetFile.currentExtractionRevisionId 只 CAS 指向终态 revision，UI 的 extracting 从 task port 读取。若坚持全 append-only，则须写明每次状态转移新建记录、parent/attempt/idempotency 键、当前指针和终态晋升规则。两种方案都要明确 failed/no_text/unsupported、迟到 task 和 documentVersion 创建时点，禁止原地修改历史全文 revision。"
    },
    {
      "severity": "major",
      "category": "completeness",
      "where": "§5 FR-KNW-11/14、§8 ENT-KNW-10、§9 IA-KNW-03/05/06、§15 AC-KNW-10",
      "issue": "typed selection 只列 document|knowledge_item|project，但 IA-KNW-05 明确要求“全部”继续混排现有经验；现网 `knowledge-data.ts:401-421` 的行真实带 `origin=\"experience\"`，`knowledge-interactive-region.tsx:311-317,448-455` 也走独立只读经验详情。遗漏 experience 会迫使实现者把经验 ID 冒充 knowledge_item、丢掉既有经验行，或继续保留未类型化 selectedId，均与 FR-KNW-14 的 all 不退化冲突。同时 project 虽在 union 中，现有 graph 确有 project anchor（`knowledge-page.tsx:102-107`），但 SPEC/AC 没定义 project selection 打开什么或如何处理同字符串 ID。",
      "suggestion": "把 selection 定义扩成覆盖所有仍保留的业务类型（至少 document、knowledge_item、experience、project），逐类写明详情路由/只读行为和允许出现的视图；若要移除经验混排则必须走用户确认的范围变更。扩充 AC-KNW-10，以相同字符串 ID fixture 验证四类都不会误开另一实体，graph project、all experience 和 source-link 导航都有确定结果。"
    },
    {
      "severity": "major",
      "category": "approach",
      "where": "§5 FR-KNW-07/13、§7 FLOW-KNW-05、§8 ENT-KNW-03/04/07/09、§15 AC-KNW-05/08",
      "issue": "FR-KNW-07 与 FLOW-KNW-05 要求旧 SourceLink/ContextManifest 永远固定旧 documentVersion/extractionRevision，版本变化不得改写历史；FR-KNW-13 却允许把当前与历史引用“显式迁移到另一仍保留的等价版本”后硬删，而“等价”没有 checksum/text identity 定义，也没说明迁移是否会改写历史 manifest/source link。实现者可把内容不同的新版本人工判为等价并重写历史锚，仍满足现有文字，却破坏 cited 证据；反过来若历史锚保持不变，它按 FR-KNW-13 又仍是未归零引用，GC 条件无法成立。",
      "suggestion": "禁止改写历史 SourceLink/ContextManifest 的业务锚；把“迁移”等价严格限定为 byte-identical sourceChecksum 且 extraction text checksum 相同的存储去重/搬迁，旧 version/revision ID 通过不可变 relocation/tombstone 仍可解析，并保留审计。任何内容不相同、checksum 不可证或仅语义近似的版本都不得解除引用或硬删 bytes；在 AC-KNW-08 加负向测试。"
    },
    {
      "severity": "minor",
      "category": "traceability",
      "where": "§5 FR-KNW-02、§3 SC-KNW-02、§15 AC-KNW-01/02",
      "issue": "SC-KNW-02 覆盖新建/改名/拖动与 CAS 冲突，AC-KNW-02 覆盖账号隔离，但 FR-KNW-02 还承诺排序、归档、禁止 parent 环和只读智能节点；这些行为没有明确进入任一 AC。当前不是架构阻断，但会让实现者遗漏一部分文件夹规则后仍声称验收完成。",
      "suggestion": "补一条 folder-tree AC，逐项断言 create/rename/move/sort/archive、环和跨账号 parent 被拒、全部/最近/未归档不可写，以及 CAS 冲突有可恢复回显。"
    }
  ]
}
```

## Round 3 最终裁决

- **已关闭且不再构成 finding**：最小 RAT 的诚实边界、性能复现、Mammoth/Assets 精确证据、
  `assets.files.create/addAssetFile` 复用、untrusted-content 隔离、Node 25/20 文件/冷重启/
  memory Gate、Windows 非承诺口径、旧 `.doc`/OCR → T-525 的显式 deferral。
- **无 scope-reduction blocker**：T-519 仍完整承诺用户确认的 PDF 文本层、DOCX、Markdown、
  URL/文本导入、真实文件夹和四视图；T-525 的 owner、触发条件及当前
  `unsupported/no_text` 行为均可追踪。
- **最终 verdict 为 `CONCERNS`**：`blocker=0, major=3, minor=1`。按 Gate 规则，只有
  blocker=0 且 major=0 才能 PASS；R3-M1～M3 未被处理/裁决前，不应把 T-519 PLAN 标为
  `PASS` 或进入 CONTRACT/实现。本文件已到第 3 轮上限，后续应由主 Agent 与用户裁决并回到
  PLAN 修正，不应继续用同质重试掩盖语义缺口。

## 作者处理记录（Round 3 findings；三轮 STOP）

日期：2026-07-25。三项 major 与一项 minor 已回写 PRODUCT SPEC，但依流程不追加第四轮、
不把 PLAN 伪写为 PASS：

1. 把可恢复、可变的 `AssetExtractionTask` 与只在
   `done/no_text/unsupported` 终态一次创建的 immutable `AssetExtractionRevision` 拆开；
   `failed` 不创建 revision，迟到 task 只能结束自身 attempt，CAS 失败不得推进 current pointer。
2. selection union 补齐 `experience`，并为 document/knowledge_item/experience/project 四类
   写明详情或只读路由；同字符串 ID fixture 必须保持类型隔离。
3. 删除“人工等价迁移历史引用”语义；历史 SourceLink/ContextManifest 锚永不改写。只有
   source 与抽取文本 checksum 都相同才可做底层去重/搬迁，旧 ID 仍须经不可变
   relocation/tombstone 解析；内容不同、不可证或语义近似都不能解除引用。
4. 新增 folder tree 验收，覆盖排序、归档、环/跨账号 parent 拒绝、虚拟节点只读与 CAS 冲突恢复。

当前裁决：Round 3 的已知规格矛盾已修订，但三轮最终 verdict 仍为 `CONCERNS`。T-519 保持
PLAN Gate 未通过、禁止进入 CONTRACT/BUILD，等待人的 Gate 裁决或后续明确授权的复评重开。
