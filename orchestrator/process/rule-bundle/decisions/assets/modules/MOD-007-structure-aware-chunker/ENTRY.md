---
id: MOD-007
kind: module
title: 结构感知文档分块
problem_tag: [chunking, rag, text-processing]
when_to_use: 将有序解析段落按预算合并，并需要字符重叠或按结构标记切开。
when_not_to_use: 需要语义嵌入切点、输入无序，或不能接受启发式词元估计时。
keywords: [chunking, sliding-window, overlap, rag, token-budget, structure-aware, naive_merge, text-splitter]
status: active
verified: true
tier: distilled-verified
winner: true
provenance:
  source: C
  origin_repo: infiniflow/ragflow
  origin_commit: bf41d35729872088273b5b1a8b6d8f9822cb5fd9
  content_hash: rewrite
license: Apache-2.0
files: [files/chunker.mjs, example/portable-slice.mjs]
example: ./example/example.test.ts
---

# 结构感知文档分块

`chunkSections` 支持贪心合并和结构标记硬切分；跨块重叠按字符保留。位置标签随块附加，极短片段可去除噪声标签。

参数包括 `chunkTokenNum`、`delimiter`、`overlappedPercent` 和 `countTokens`。内置 `estimateTokens` 仅作预算启发式，不能作为模型计费的精确数量；需要精确一致时注入实际分词器。

测试覆盖预算分块、尾部重叠、零重叠、位置标签、结构标记和空输入。

## 来源与验证

来源仓库、提交和许可证保留在元数据中；改写不自动免除许可证义务，集成前核对实际代码和项目要求。状态及历史验证记录不代表在当前项目已经验证。

在资产目录运行：

```bash
node --test --experimental-strip-types example/example.test.ts
```
