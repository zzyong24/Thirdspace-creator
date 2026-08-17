---
name: creatoros-cli
description: Use when a CreatorOS user wants an Agent to inspect accounts or projects, read the latest script, combine CreatorOS with the user's own writing Skill, revise a full draft or one segment, manage assets or production tasks, wait for asynchronous work, or save an approved candidate through the installed creatoros CLI. Also use for CreatorOS CLI discovery, authorization, account isolation, version conflicts, and recovery on macOS or Windows.
---

# CreatorOS CLI

Operate the user's installed CreatorOS through its public CLI. Treat CreatorOS as the authority for accounts, projects, current versions, assets, tasks, candidates, and saved results. Treat a writing Skill as a content generator only.

## Required references

- Read [references/cli.md](references/cli.md) before invoking `creatoros` or advising installation, authorization, recovery, or platform paths.
- Also read [references/writing-skill-bridge.md](references/writing-skill-bridge.md) before combining this Skill with any writing, copywriting, research, or rewriting Skill.

## Non-negotiable boundaries

- Use only the installed `creatoros` command and public operations it reports. Never connect to the database, private routes, browser state, connection files, credential stores, or CreatorOS internal source code.
- Discover the command for the current OS user. Never reuse a path copied from a developer, another user, or an earlier conversation.
- Run `operations list` and `operations describe <operation>` dynamically. Never assume a copied operation inventory or remembered schema is current.
- Every account-scoped CLI call must carry the explicitly selected real `accountId`. Never use the saved default account for automation.
- Read operations may run when needed. A write, model call, import, publish, delete, login, collection, generation, or confirmation requires the user's explicit current intent and the CLI's required execution flags.
- AI output is a candidate. Do not save it until the user sees the proposed result and explicitly asks to adopt, save, or apply it.
- Never claim success from submission, queueing, or candidate generation. Claim success only after the saved object and its current version can be read back.

## Workflow

### 1. Resolve and verify the CLI

Follow the platform discovery algorithm in `references/cli.md`. Cache the resolved command only for the current Agent session. Verify both `--version` and `help` return JSON with `ok: true` before doing business work.

Then run:

```text
creatoros status
creatoros access status
```

If the desktop app is closed or access is missing or expired, stop business calls and give the exact in-app authorization guidance from the reference. Recheck only after the user has enabled access.

### 2. Discover capabilities

Run `creatoros operations list`. Before every selected operation, run `creatoros operations describe <operation>` and use the returned input schema, output schema, effect, confirmation policy, and current contract version.

Use the fixed CLI conveniences `accounts list`, `tasks get`, and `tasks wait` only as documented in the reference. Do not invent flags or operation names.

### 3. Lock account and project context

List the accounts and relevant projects visible to the authorized user.

- Continue automatically only when the result is unique or the user has explicitly named a uniquely identifiable account/project in the current request.
- When more than one result is plausible, show concise choices and wait for the user to select. Do not pick the first, newest, or similarly named item.
- Bind the chosen `accountId` and `projectId` to every read, candidate, write, task wait, confirmation, and read-back in this run.
- Stop if any response belongs to a different account or project.

### 4. Read current truth

Read the selected project, its positioning, relevant sources/assets, current production state, and the current script/output through dynamically described read operations.

The current saved script version is the highest-priority content context. Do not treat a prior chat message, earlier draft, research note, cached candidate, or old task result as the latest script. Record at least:

```text
accountId, projectId, outputId, artifactId, baseVersionId,
positioning, currentScript, relevantSources, currentAssets,
currentProductionState, userRequest
```

If a required ID or current version cannot be read, say what is missing and stop before writing.

### 5. Produce a candidate

For CreatorOS native generation, create the task using the current described schema, wait on the returned task ID, then fetch and display the resulting candidate.

For a user writing Skill, follow `references/writing-skill-bridge.md`. Give it frozen context, not credentials or write authority. Preserve its output as an in-session candidate and show:

- the proposed full draft or exact local replacement;
- what changed and why;
- factual uncertainties or missing sources;
- the bound account, project, and base version.

Ask for confirmation. A request to “generate,” “rewrite,” or “show me” is not permission to save.

### 6. Apply only the approved result

Immediately before writing, read the current version again.

- Full draft: if the base version changed, stop and regenerate or ask the user to resolve the conflict.
- Local patch: use a stable block ID plus unchanged original text, or an exact original excerpt that is still unique. If it moved ambiguously, changed, disappeared, or repeats, stop. Never fuzzy-match and never fall back to overwriting the full draft.

Describe the write or confirm operation again. Use the exact schema and explicit `--account`, `--apply`, a stable idempotency key, and `--confirm-impact` when the reported policy requires it. Reuse the same idempotency key when recovering an uncertain response.

### 7. Wait and prove completion

When a call returns a `taskId`, record its account and request ID. Use the same task ID for `tasks get` or `tasks wait`. A timeout or interrupted terminal does not cancel the backend job and must not trigger a replacement task.

On success, read back and report the current version ID/version, account, project, output/artifact, preserved source or asset associations that the public contract exposes, and current production state. State unknown fields honestly. Do not automatically start image, storyboard, render, or publish work; wait for a separate explicit user request.

## Error posture

- Missing command: guide installation/access; do not search the whole disk or edit PATH.
- Unauthorized or desktop unavailable: stop, guide in-app access, then recheck.
- Multiple accounts/projects: ask the user to select.
- Schema error: re-run `operations describe`; do not guess extra fields.
- Connection loss after submission: query the original request/task or replay the same idempotency key; never create a duplicate.
- Failed, cancelled, unknown, or awaiting-confirmation task: report the real state and IDs; do not call it complete or auto-resubmit.
- Version conflict: preserve the candidate, show the conflict, and require a fresh candidate or deterministic rebind.

Keep explanations concise and user-facing. Include request/task IDs when available so CreatorOS support can trace a failure.
