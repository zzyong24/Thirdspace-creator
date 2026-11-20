# T-1491 项目转写文章只保留成稿正文

用户要求只修复项目转写生成的文章夹带模型思考的问题。仓库内未找到《最终功能对齐方案》，沿用现有已确认的项目转写、脚本和文章候选流程。

正文不得携带模型的思考标签、推理段落和生成过程说明。保持逐字稿中的真实原话、现有调用参数、工件版本、文章预览、采纳和导出。改动限于确认发生泄漏的转写整理及由脚本生成文章的提示词、正文处理和针对性验证。

使用中文音频实际转写，覆盖较长思考混进模型文本的情况，核对后处理、正文读回、文章候选、采纳和导出。记录真实模型和受控故障样本各自覆盖的路径。

## 定位与处理

逐字稿后处理已经要求模型在 `correctedText` 内只填整理稿，但原保真检查允许少量增字，在较长原稿上会接受模型加入的思考。增加显式思考包装检查，命中时走原有回退，保留识别原文。公众号文章生成的提示词给出创作和审读顺序，输出校验此前只检查字段和真实引用。项目脚本来源的文章候选在业务校验阶段处理这些文本，联合生成在文章候选形成及采纳证明核验时使用同一投影。预览、版本与导出读取的是同一份文章结果。

## 改动文件

- 思考包装、逐字稿校验与回归涉及 `ai-worker/src/runtime/generated-reasoning.ts`、`ai-worker/src/runtime/transcript-postprocess.ts`、`ai-worker/src/runtime/transcript-postprocess.test.ts`。
- 脚本来源文章提示词、候选投影与回归涉及 `ai-worker/src/prompt/templates/wechat-article-draft.ts`、`ai-worker/src/runtime/wechat-article-candidate.ts`、`ai-worker/src/runtime/wechat-article-candidate.test.ts`、`backend/src/modules/articles/articles.worker.integration.test.ts`。
- 联合创作文章投影、采纳证明与回归涉及 `backend/src/application/generation/work-creation-root.ts`、`backend/src/modules/ai/work-candidate-source.service.ts`、`backend/src/application/generation/work-candidate-adoption.integration.test.ts`、`backend/src/modules/ai/work-creation-chat.integration.test.ts`。
- 任务记录涉及 `BACKLOG.md`、`orchestrator/events.ndjson`、`PROJECT.md` 和本 SPEC。

## 实际验收

- 46 秒中文合成音频讲图书馆预约取书。本地 Whisper 实际识别，将识别结果保存为项目脚本。使用现有桌面数据库中的独立验收身份，由公开接口发起原文章候选，独立 Worker 实际请求一次本地可控模型端点。响应包含长思考块、未加标签的过程前缀和正式正文。
- 浏览器显示的是清理后的候选。用原采纳按钮保存，读回正式版本的段落与候选一致。浏览器实际下载 NoteRelay 的 HTML。逐项检查下载文件原始 HTML 与可见文本，确认思考标签和模型过程说明均已去掉，音频里的实际引语仍可见。
- Worker、转写后处理、文章生成、联合创作、采纳和前端入口的聚焦回归通过。验证使用本地可控文章模型响应覆盖故障，未验证线上供应商是否会自然复现。
- `reconcile --profile quick --read-only` 报告已有 T-1434 的网页验收收据与旅程契约哈希不一致。该契约与记录均未触达，边界和本任务聚焦验证通过。

> 收到取书通知后，先核对取书地点，再确认截止时间。到馆出示取书码，即可带走已登记的图书。
