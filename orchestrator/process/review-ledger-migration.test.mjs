import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { buildLedgerMigration, verifyMigrationProvenance } from "./review-ledger-migration.mjs";

const sha = (value) => createHash("sha256").update(value).digest("hex");
function stable(value) {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}
function seal(body) { return { ...body, event_hash: sha(stable(body)) }; }
function reseal(events) {
  let previous = "";
  return events.map(({ event_hash, ...body }) => {
    const event = seal({ ...body, previous_event_hash: previous });
    previous = event.event_hash;
    return event;
  });
}
function event(task, previous, extra = {}) {
  return seal({ schema: "spec-review-event/v2", task_id: task, cycle: 1, round: 1,
    review_kind: "initial", verdict: "PASS", spec_path: `docs/${task}.md`,
    review_path: `docs/${task}.review.md`, constitution_path: "docs/constitution.md",
    spec_sha256: sha(task), constitution_sha256: sha("constitution"), model: "fixture-reviewer",
    review_mode: "homogeneous", recorded_at: "2026-10-28T00:00:00.000Z",
    packet: { schema: "spec-review-round/v2", review_kind: "initial", summary: "原始结论", findings: [] },
    previous_event_hash: previous, cycle_authorization: null, ...extra });
}
const lines = (events) => `${events.map((entry) => JSON.stringify(entry)).join("\n")}\n`;
function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ledger-migration-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, "orchestrator"));
  fs.mkdirSync(path.join(root, "docs", "archive"), { recursive: true });
  const common = event("T-100", "");
  const base = [common, event("T-400", common.event_hash)];
  const first = event("T-102", common.event_hash, { cycle: 2, cycle_authorization: {
    schema: "review-cycle-capability-consumption/v1", task_id: "T-102", decision_id: "DEC-102",
    nonce: "already-consumed", previous_event_hash: common.event_hash, max_uses: 1, allowed_change_ids: ["approved-change"] },
  });
  const incoming = [common, first, event("T-102", first.event_hash, { cycle: 2, round: 2, review_kind: "recheck" })];
  // The base uses noncanonical JSON spacing: its bytes must survive the migration.
  const baseRaw = `${base.map((entry) => JSON.stringify(entry).replaceAll('\":', '\": ')).join("\n")}\n`;
  const sourceRaw = { base: baseRaw, incoming: lines(incoming), damaged: "damaged: not JSON\n" };
  const manifestPath = "docs/migration.json";
  const manifest = { schema: "review-ledger-migration/v1", id: "test-recovery", authorized_by: "DEC-900",
    created_at: "2026-10-28T00:00:00.000Z", expected_ledger_sha256: sha(sourceRaw.damaged),
    task_mappings: [{ source_task_id: "T-102", target_task_id: "T-202", source_spec_path: "docs/T-102.md", spec_path: "docs/T-202.md",
      source_review_path: "docs/T-102.review.md", review_path: "docs/T-202.review.md" }],
  };
  for (const [index, name] of ["base", "incoming", "damaged"].entries()) {
    manifest[name] = { commit: String(index + 1).repeat(40), path: `docs/archive/${name}.ndjson`, sha256: sha(sourceRaw[name]) };
    fs.writeFileSync(path.join(root, manifest[name].path), sourceRaw[name]);
  }
  const save = ({ authorize = true, status = "active", owner = "user" } = {}) => {
    const text = `${JSON.stringify(manifest, null, 2)}\n`;
    fs.writeFileSync(path.join(root, manifestPath), text);
    if (authorize) fs.writeFileSync(path.join(root, "orchestrator/DECISION_LOG.md"),
      `# Decisions\n\n\`\`\`text\nID: DEC-900\nAuthorization-Kind: review-ledger-migration\nManifest-Path: ${manifestPath}\nManifest-SHA256: ${sha(text)}\nOwner: ${owner}\nStatus: ${status}\n\`\`\`\n`);
  };
  save();
  return { root, manifestPath, manifest, base, incoming, sourceRaw, save,
    build: (options = {}) => buildLedgerMigration({ root, manifestPath, ...options }),
    verify: (events) => verifyMigrationProvenance({ root, events }),
  };
}

test("合法原链确定性合并，基础字节和全部原字段保留，损坏原件只校验固定hash", (t) => {
  const f = fixture(t), before = fs.readFileSync(path.join(f.root, f.manifestPath));
  const first = f.build(), second = f.build();
  assert.deepEqual(first, second);
  assert(first.ledgerText.startsWith(f.sourceRaw.base));
  assert.equal(first.events.length, 4);
  assert.deepEqual(first.events.slice(0, 2), f.base);
  assert.deepEqual(first.events[2].cycle_authorization, f.incoming[1].cycle_authorization);
  assert.deepEqual(first.events[2].packet, f.incoming[1].packet);
  assert.equal(first.events[2].model, "fixture-reviewer");
  assert.equal(first.events[2].task_id, "T-202");
  assert.equal(first.events[2].spec_sha256, f.incoming[1].spec_sha256);
  assert.deepEqual(first.events[2].migration, { schema: "review-ledger-import/v1", manifest_path: f.manifestPath,
    manifest_sha256: sha(before), source_event_hash: f.incoming[1].event_hash, source_index: 1 });
  assert.deepEqual(first.sourcePaths, [f.manifest.base.path, f.manifest.incoming.path, f.manifest.damaged.path]);
  assert.deepEqual(f.verify(first.events), []);
  assert.deepEqual(fs.readFileSync(path.join(f.root, f.manifestPath)), before);
});

test("无迁移授权的普通链不引入额外限制，迁移后允许正常review追加", (t) => {
  const f = fixture(t), migrated = f.build();
  const normal = event("T-999", migrated.events.at(-1).event_hash);
  assert.deepEqual(f.verify([...migrated.events, normal]), []);
  fs.unlinkSync(path.join(f.root, "orchestrator/DECISION_LOG.md"));
  assert.deepEqual(f.verify(f.base), []);
  assert.notEqual(f.verify(migrated.events).length, 0);
});

test("实际ledgerText必须保留基础原始字节，重排JSON键或空白也拒绝", (t) => {
  const f = fixture(t), migration = f.build();
  const verify = (ledgerText) => verifyMigrationProvenance({ root: f.root, events: migration.events, ledgerText });
  assert.deepEqual(verify(migration.ledgerText), []);
  assert.notEqual(verify(lines(migration.events)).length, 0);
  const reordered = migration.events.map((entry) => Object.fromEntries(Object.entries(entry).reverse()));
  assert.notEqual(verify(lines(reordered)).length, 0);
  assert.notEqual(verify(`${migration.ledgerText}${JSON.stringify(event("T-999", migration.events.at(-1).event_hash))}\n`).length, 0);
});

test("来源或损坏原件字节变化即拒绝", (t) => {
  for (const name of ["base", "incoming", "damaged"]) {
    const f = fixture(t);
    fs.appendFileSync(path.join(f.root, f.manifest[name].path), " ");
    assert.throws(() => f.build(), /sha256|hash/i, name);
  }
});

test("原链断链与伪造内容即便更新archive hash并重新授权manifest仍拒绝", (t) => {
  for (const mutation of ["hash", "link"]) {
    const f = fixture(t), changed = structuredClone(f.incoming);
    if (mutation === "hash") changed[1].packet.summary = "伪造审核";
    else changed[1] = seal({ ...changed[1], previous_event_hash: "0".repeat(64), event_hash: undefined });
    const raw = lines(changed);
    fs.writeFileSync(path.join(f.root, f.manifest.incoming.path), raw);
    f.manifest.incoming.sha256 = sha(raw); f.save();
    assert.throws(() => f.build(), /hash|chain|链/i);
  }
});

test("manifest篡改、未知字段、未授权或撤销授权拒绝", (t) => {
  const f = fixture(t);
  f.manifest.task_mappings[0].target_task_id = "T-666"; f.save({ authorize: false });
  assert.throws(() => f.build(), /授权|authorization|manifest.*hash|sha256/i);
  for (const options of [{ status: "revoked" }, { owner: "agent" }]) {
    const g = fixture(t); g.save(options); assert.throws(() => g.build(), /授权|active|user|owner|status/i);
  }
  for (const where of ["root", "source", "mapping"]) {
    const g = fixture(t);
    (where === "root" ? g.manifest : where === "source" ? g.manifest.base : g.manifest.task_mappings[0]).unknown = true;
    g.save(); assert.throws(() => g.build(), /未知|unknown/i);
  }
});

test("不存在的来源映射、重复或合流映射、与base不同源ID冲突拒绝", (t) => {
  const mutations = [
    (m) => { m.task_mappings[0].source_task_id = "T-999"; },
    (m) => { m.task_mappings[0].source_spec_path = "docs/fake.md"; },
    (m) => { m.task_mappings.push({ ...m.task_mappings[0] }); },
    (m) => { m.task_mappings[0].target_task_id = "T-400"; },
  ];
  for (const mutate of mutations) { const f = fixture(t); mutate(f.manifest); f.save(); assert.throws(() => f.build(), /mapping|映射|冲突|collision/i); }
});

test("来源共同前缀和完整并集必须可验证", (t) => {
  const f = fixture(t), changed = [event("T-555", "")];
  const raw = lines(changed); fs.writeFileSync(path.join(f.root, f.manifest.incoming.path), raw);
  f.manifest.incoming.sha256 = sha(raw); f.manifest.task_mappings = []; f.save();
  assert.throws(() => f.build(), /前缀|prefix/i);
});

test("全部来源和目标路径拒绝遍历、绝对路径与symlink逃逸", (t) => {
  for (const unsafe of ["../outside.ndjson", "/tmp/outside.ndjson", "docs/../outside.ndjson", "docs\\outside.ndjson"]) {
    const f = fixture(t); f.manifest.base.path = unsafe; f.save(); assert.throws(() => f.build(), /路径|path|root|escape/i);
    const g = fixture(t); g.manifest.task_mappings[0].review_path = unsafe; g.save(); assert.throws(() => g.build(), /路径|path|root|escape/i);
  }
  const f = fixture(t), outside = fs.mkdtempSync(path.join(os.tmpdir(), "migration-outside-"));
  t.after(() => fs.rmSync(outside, { recursive: true, force: true }));
  fs.symlinkSync(outside, path.join(f.root, "docs", "escape"));
  f.manifest.task_mappings[0].review_path = "docs/escape/new.review.md"; f.save();
  assert.throws(() => f.build(), /路径|symlink|escape|root/i);
});

test("导入任意原字段或来源元数据被篡改并重算整链hash仍拒绝", (t) => {
  for (const mutate of [
    (e) => { e.packet.summary = "假结论"; },
    (e) => { e.cycle_authorization.nonce = "reusable-nonce"; },
    (e) => { e.model = "fake-reviewer"; },
    (e) => { e.verdict = "FAIL"; },
    (e) => { e.spec_sha256 = sha("new-spec"); },
    (e) => { e.migration.source_index = 2; },
    (e) => { e.migration.unknown = true; },
    (e) => { e.migration.schema = "unknown-migration/v1"; },
  ]) {
    const f = fixture(t), changed = structuredClone(f.build().events); mutate(changed[2]);
    assert.notEqual(f.verify(reseal(changed)).length, 0);
  }
});

test("导入缺失、重复、错序、整批删除和基础篡改重算hash后仍拒绝", (t) => {
  for (const mutate of [
    (e) => e.splice(2, 1), (e) => e.splice(2, 0, structuredClone(e[2])),
    (e) => { [e[2], e[3]] = [e[3], e[2]]; }, (e) => e.splice(2),
    (e) => { e[0].packet.summary = "改写基础历史"; },
  ]) { const f = fixture(t), changed = structuredClone(f.build().events); mutate(changed); assert.notEqual(f.verify(reseal(changed)).length, 0); }
});

test("撤销已使用授权或删除来源后，已有导入不再可校验", (t) => {
  const f = fixture(t), events = f.build().events;
  f.save({ status: "revoked" }); assert.notEqual(f.verify(events).length, 0);
  f.save(); fs.unlinkSync(path.join(f.root, f.manifest.base.path)); assert.notEqual(f.verify(events).length, 0);
});

test("apply可校验Git原始blob，常规audit不要求Git历史可用", (t) => {
  const f = fixture(t);
  const git = (...args) => execFileSync("git", args, { cwd: f.root, encoding: "utf8", timeout: 120000, stdio: ["ignore", "pipe", "pipe"] }).trim();
  git("init", "--quiet");
  for (const name of ["base", "incoming", "damaged"]) {
    fs.writeFileSync(path.join(f.root, "orchestrator/review-events.ndjson"), f.sourceRaw[name]);
    git("add", "orchestrator/review-events.ndjson");
    git("-c", "user.name=Migration test", "-c", "user.email=migration@example.invalid", "commit", "--quiet", "-m", name);
    f.manifest[name].commit = git("rev-parse", "HEAD");
  }
  f.save(); const migration = f.build({ verifyGitSources: true });
  const originalCommit = f.manifest.base.commit;
  f.manifest.base.commit = f.manifest.incoming.commit; f.save();
  assert.throws(() => f.build({ verifyGitSources: true }), /blob.*不一致/);
  f.manifest.base.commit = originalCommit; f.save();
  fs.rmSync(path.join(f.root, ".git"), { recursive: true, force: true });
  assert.deepEqual(f.verify(migration.events), []);
  assert.throws(() => f.build({ verifyGitSources: true }), /git|Git|commit|来源/);
});
