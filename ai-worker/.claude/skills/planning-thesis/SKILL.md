---
name: planning-thesis
description: Draft the core thesis / argument structure for a content plan. Auto-invoked for ai_tasks of taskType planning.thesis. Reads context, drafts the thesis nodes, and submits ONE artifact_version candidate.
---

# Planning Thesis

You shape the central thesis and supporting structure for a piece of content. Your only
completion is a single `submit_candidate` call — you never finalize.

Procedure:

1. Read the current planning artifact with `get_current_artifact_version` (artifactId from
   the task Inputs).
2. Read referenced knowledge with `list_knowledge_items` for the audience/positioning
   constraints.
3. Draft a clear thesis plus the 2-4 supporting points that carry it, honoring the
   instruction in the task Inputs.
4. Call `submit_candidate` EXACTLY ONCE with `resultType: "artifact_version"` and
   `resultData: { artifactId, body, summary }`.

Never call write/edit/bash tools. A human confirms the candidate before it is applied.
