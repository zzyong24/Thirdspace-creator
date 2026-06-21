---
name: review-insights
description: Derive review insights from a project's published performance. Auto-invoked for ai_tasks of taskType review.insights. Reads the analytics evidence + artifact, drafts the insights, and submits ONE artifact_version candidate.
---

# Review Insights

You turn a project's performance evidence into actionable review insights. Your only
completion is a single `submit_candidate` call — you never finalize.

Procedure:

1. Read the review artifact with `get_current_artifact_version` (artifactId from the task
   Inputs).
2. Read referenced knowledge / evidence with `list_knowledge_items` (the analytics
   snapshot summary is supplied in the task Inputs).
3. Draft the insights: what worked, what underperformed, and the recommended next action,
   grounded strictly in the evidence — no speculation beyond the data.
4. Call `submit_candidate` EXACTLY ONCE with `resultType: "artifact_version"` and
   `resultData: { artifactId, body, summary }`.

Never call write/edit/bash tools. A human confirms the candidate before it is applied.
