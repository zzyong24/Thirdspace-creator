---
name: creatoros-cli
description: Use when a CreatorOS user wants an Agent to inspect accounts, projects, content-radar creators or videos, extract or retry transcripts, read the latest script, combine CreatorOS with a writing Skill, manage assets or production tasks, wait for asynchronous work, or save an approved candidate through the installed creatoros CLI. Also use for CLI discovery, authorization, account isolation, version conflicts, and recovery on macOS or Windows.
---

# CreatorOS CLI

Operate the user's installed CreatorOS through its public CLI. Treat CreatorOS as the authority for accounts, projects, current versions, assets, tasks, candidates, and saved results. Treat a writing Skill as a content generator only.

## Required references

- Read [references/cli.md](references/cli.md) before invoking `creatoros` or advising installation, authorization, recovery, or platform paths.
- Also read [references/content-radar.md](references/content-radar.md) before adding or syncing a content-radar creator, reading creator/video titles or full transcripts, retrying transcription, or finding videos without a complete transcript.
- Also read [references/writing-skill-bridge.md](references/writing-skill-bridge.md) before combining this Skill with any writing, copywriting, research, or rewriting Skill.

## Non-negotiable boundaries

- Use only the installed `creatoros` command and public operations it reports. Never connect to the database, private routes, browser state, connection files, credential stores, or CreatorOS internal source code.
- Discover the command for the current OS user. Never reuse a path copied from a developer, another user, or an earlier conversation.
- Run `operations list` and `operations describe <operation>` dynamically. Never assume a copied operation inventory or remembered schema is current.
- Every platform-account-scoped CLI call must carry the explicitly selected real `accountId`. Never use the saved default account for automation.
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

If the desktop app is closed, start it and recheck. CreatorOS remembers the access preference; do not request repeat authorization from a user who has already enabled access. For CONNECTION_EXPIRED, follow the normal restart recovery in the reference and preserve original task IDs. Ask the user to enable access only when public status explicitly shows that access is disabled. Resume authorized work once status succeeds.

### 2. Discover capabilities

Run `creatoros operations list`. Before every selected operation, run `creatoros operations describe <operation>` and use the returned input schema, output schema, effect, confirmation policy, and current contract version.

Use the fixed CLI conveniences `accounts list`, `tasks get`, and `tasks wait` only as documented in the reference. Do not invent flags or operation names.

### 3. Lock workspace and project context

List the accounts and relevant projects visible to the authorized user.

- Continue automatically only when the result is unique or the user has explicitly named a uniquely identifiable account/project in the current request.
- When more than one result is plausible, show concise choices and wait for the user to select. Do not pick the first, newest, or similarly named item.
- Bind the chosen workspace (`groupId`, with nullable `accountId`) and `projectId` to every read, candidate, write, task wait, confirmation, and read-back in this run.
- Stop if any response belongs to a different workspace, parent project, or explicitly chosen platform account.

### 4. Read current truth

Read the selected project, its positioning, relevant sources/assets, current production state, and the current script/output through dynamically described read operations.

The current saved script version is the highest-priority content context. Do not treat a prior chat message, earlier draft, research note, cached candidate, or old task result as the latest script. Record at least:

```text
groupId, accountId (nullable for a group), projectId, outputId, artifactId, baseVersionId,
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

Describe the write or confirm operation again. Use the exact schema and explicit workspace flags from the reference (`--group` for a shared group; `--account` additionally for a platform target), `--apply`, a stable idempotency key, and `--confirm-impact` when the reported policy requires it. Reuse the same idempotency key when recovering an uncertain response.

### 7. Wait and prove completion

When a call returns a `taskId`, record its account and request ID. Use the same task ID for `tasks get` or `tasks wait`. A timeout or interrupted terminal does not cancel the backend job and must not trigger a replacement task.

项目等待规范：`tasks wait --timeout` 的显式正超时最短 120 秒，省略表示持续观察。两分钟是下限，不是转录或生成的总预算；等待结束保留原 taskId 和账号，不取消后台任务、不重建重复任务。`--poll-interval` 是轮询间隔，不放大到两分钟。

On success, read back and report the current version ID/version, account, project, output/artifact, preserved source or asset associations that the public contract exposes, and current production state. State unknown fields honestly. Do not automatically start image, storyboard, render, or publish work; wait for a separate explicit user request.

## Error posture

- Missing command: guide installation/access; do not search the whole disk or edit PATH.
- Desktop unavailable or connection expired: recover startup/connection through the reference; preserve existing authorization. Explicitly disabled access: guide in-app access, then recheck.
- Multiple accounts/projects: ask the user to select.
- Schema error: re-run `operations describe`; do not guess extra fields.
- Connection loss after submission: query the original request/task or replay the same idempotency key; never create a duplicate.
- Failed, cancelled, unknown, or awaiting-confirmation task: report the real state and IDs; do not call it complete or auto-resubmit.
- Version conflict: preserve the candidate, show the conflict, and require a fresh candidate or deterministic rebind.

Keep explanations concise and user-facing. Include request/task IDs when available so CreatorOS support can trace a failure.

## 账号组与原账号入口

当前用户已确认以账号组作为共享创作工作区。对其已授权的读写和恢复，保留本会话授权，不因旧安装审计的“账号专用”描述再次要求选择虚假账号；此说明不代替当前安装版能力发现和实际验收。

- 先 `groups list` 读取真实组；只有组唯一或用户明确指定时自动绑定，否则展示选择。自动化显式传同一 `--group <groupId>`，不自动采用 `groups current` 或保存默认。
- 纯组创作可以没有平台账号，此时 `accountId` 为 NULL，省略 `--account`；组 ID 不能填进 account 字段。平台筛选不会改变共享草稿、项目或素材的组归属。
- 项目、output、artifact 与保存版本仍须沿公开回读核对真实父关系。选中组不替代目标实体权限；任务、候选和未知回执沿提交时冻结的组、父根、版本、请求 ID 与幂等键恢复，不按当前平台筛选重新签名或新建。
- 平台登录、采集、发布等账号目标继续使用真实 `--account`，并核对目标确实属于所选组。没有目标账号时让用户明确选择，不能取首个账号或造账号。
- `operations describe` 现有 schema、effect、confirmation、asyncTask/idempotency 与 contractVersion 是动态事实；不要杜撰 `workspaceScope` 输出字段。只有安装版实际回读的终态与保存版本才是完成证据。

详细命令和恢复示例见 [references/cli.md](references/cli.md)。
