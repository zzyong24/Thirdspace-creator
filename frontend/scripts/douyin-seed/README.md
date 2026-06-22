# Douyin real-data seed

Generates `src/fixtures/douyin-real.ts` — the user's REAL Douyin catalog (58
published works) + real creator-center metrics + fan portrait.

**Sources** (frozen JSON snapshots in this dir):
- `videos.json` — per-video metrics, exported from `~/.hermes/douyin_stats.db`
  (`video_stats`, latest snapshot per title+publish_date).
- `account.json` — follower history (`account_stats`).
- `works8.json` — extracted creative content (script / quotes / hashtags) for the
  8 works that have full vault material under `04-项目/内容创作/创作`.

**Regenerate:**
```bash
node scripts/douyin-seed/generate.mjs src/fixtures/douyin-real.ts
```
To refresh from the live DB, re-export `videos.json` / `account.json` from
`douyin_stats.db`, then re-run. Do NOT hand-edit `douyin-real.ts`.
