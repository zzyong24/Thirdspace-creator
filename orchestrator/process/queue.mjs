#!/usr/bin/env node
// Decision-queue consumer. The async decision queue = DECISION_LOG.md entries whose Status is
// `needs-user-confirmation`. An autonomous agent that hits a scope-envelope decision appends a
// DEC, sets the vertical's blocked_reason, and CONTINUES other verticals; the human clears the
// queue here in one batch instead of being interrupted per-decision.
//
//   node orchestrator/process/queue.mjs            # list OPEN decisions, grouped A/B/C
//   node orchestrator/process/queue.mjs resolve DEC-017   # flip one to resolved
// After resolve, clear that vertical's blocked_reason in progress.json so `generate` re-queues it.
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ORCH = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DECLOG = resolve(ORCH, "DECISION_LOG.md");
const [cmd, arg] = process.argv.slice(2);

if (!existsSync(DECLOG)) {
  console.error("queue: no DECISION_LOG.md found");
  process.exit(2);
}
const text = readFileSync(DECLOG, "utf8");

// A/B/C impact grade (mirrors workflows/_COMMON.md Question Budget): A = changes behavior/security/
// contract/release (must ask); B = has a default; C = inferable.
function grade(body) {
  if (/security|data.ownership|contract|release|product direction|\bIA\b/i.test(body)) return "A";
  if (/default/i.test(body)) return "B";
  return "C";
}

// Parse DEC blocks (both `## DEC-NNN ...` prose and `ID: DEC-NNN` fenced forms).
const open = [
  ...text.matchAll(/(DEC-\d+)\b([\s\S]*?)(?=\n#{1,3}\s*DEC-|\nID:\s*DEC-|\n```|$)/g),
]
  .map((m) => ({ id: m[1], body: m[2] }))
  .filter((d) => /Status:\s*needs-user-confirmation/i.test(d.body));

if (cmd === "resolve" && arg) {
  const re = new RegExp(`(${arg}\\b[\\s\\S]*?Status:\\s*)needs-user-confirmation`, "i");
  if (!re.test(text)) {
    console.error(`queue: no OPEN ${arg} (needs-user-confirmation) found`);
    process.exit(1);
  }
  writeFileSync(DECLOG, text.replace(re, "$1resolved"));
  console.log(`✓ ${arg} → resolved. Now clear its blocked_reason in progress.json to re-queue the vertical.`);
  process.exit(0);
}

if (!open.length) {
  console.log("✓ decision queue empty (no needs-user-confirmation DECs).");
  process.exit(0);
}
console.log(`▶ ${open.length} open decision(s) — batch-review:`);
for (const g of ["A", "B", "C"]) {
  for (const d of open.filter((x) => grade(x.body) === g)) {
    const blocked = (d.body.match(/blocked[_ ]?reason[^\n]*/i) || [""])[0].trim();
    console.log(`  [${g}] ${d.id}${blocked ? `  — ${blocked}` : ""}`);
  }
}
console.log("\nresolve: node orchestrator/process/queue.mjs resolve <DEC-id>");
