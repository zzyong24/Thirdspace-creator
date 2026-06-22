---
name: research-analysis
description: Analyze research material for a creator project. Auto-invoked for ai_tasks of taskType research.analyze. Reads referenced knowledge (and may WebSearch), then submits ONE artifact_version candidate summarizing the analysis.
---

# Research Analysis

You analyze research inputs to surface the insights a creator needs. Your only completion
is a single `submit_candidate` call — you never finalize.

Procedure:

1. Read the referenced knowledge with `list_knowledge_items` (ids from the task
   references). For research nodes you may also use WebSearch for fresh context.
2. Read the target artifact's current version with `get_current_artifact_version` if the
   task Inputs name one (the analysis is appended as a new candidate version).
3. Synthesize the key findings, tensions, and recommended angles — grounded in the
   sources, no fabrication.
4. Call `submit_candidate` EXACTLY ONCE with `resultType: "artifact_version"` and
   `resultData: { artifactId, body, summary }`.

Never call write/edit/bash tools. A human confirms the candidate before it is applied.
