import assert from "node:assert/strict";
import {
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import test from "node:test";

const here = dirname(fileURLToPath(import.meta.url));
const sourceScript = join(here, "pmem.mjs");

const backlog = `# 测试看板

## 活动任务

| ID | 任务 | 状态 | 审核 | 文档 | 一句话 |
|---|---|---|---|---|---|
| T-900 | 真实待办 | 📋 免审 | — | — | 应显示 |
| T-901 | 真实进行中 | 🔨 免审 | — | — | 应显示 |
| T-904 S2 | 带子阶段的真实待办 | 📋 免审 | — | — | 应显示 |
| T-902 | 已暂停 | ⏸️ 免审 | — | — | 不进入自动队列 |
| T-903 | 已完成 | ✅ 免审 | — | — | 不进入自动队列 |
`;

async function makeFixture() {
  const root = await mkdtemp(join(tmpdir(), "creatoros-pmem-"));
  const processDir = join(root, "orchestrator", "process");
  await mkdir(processDir, { recursive: true });
  await copyFile(sourceScript, join(processDir, "pmem.mjs"));
  await writeFile(join(root, "BACKLOG.md"), backlog, "utf8");
  await writeFile(
    join(root, "orchestrator", "TASK_LEDGER.jsonl"),
    `${JSON.stringify({
      id: "T-007",
      phase: "P2",
      title: "陈旧第二真相",
      status: "open",
    })}\n`,
    "utf8",
  );
  return {
    root,
    script: join(processDir, "pmem.mjs"),
    ledger: join(root, "orchestrator", "TASK_LEDGER.jsonl"),
  };
}

function run(script, args) {
  return spawnSync(process.execPath, [script, ...args], {
    encoding: "utf8",
  });
}

test("tasks 只展示 BACKLOG 中可执行的待办与进行中任务", async () => {
  const fixture = await makeFixture();
  try {
    const result = run(fixture.script, ["tasks"]);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /T-900.*真实待办/);
    assert.match(result.stdout, /T-901.*真实进行中/);
    assert.match(result.stdout, /T-904 S2.*带子阶段的真实待办/);
    assert.doesNotMatch(result.stdout, /T-007|T-902|T-903/);
    assert.match(result.stdout, /BACKLOG\.md 单一真相/);
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test("add/set 不再写 legacy TASK_LEDGER", async () => {
  const fixture = await makeFixture();
  try {
    const before = await readFile(fixture.ledger, "utf8");
    for (const args of [
      ["add", "不能写第二真相"],
      ["set", "T-007", "done"],
    ]) {
      const result = run(fixture.script, args);
      assert.notEqual(result.status, 0);
      assert.match(`${result.stdout}\n${result.stderr}`, /BACKLOG\.md 是唯一任务真相/);
    }
    assert.equal(await readFile(fixture.ledger, "utf8"), before);
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test("sync 生成的 PROJECT 开放任务来自 BACKLOG，不再引用 legacy ledger", async () => {
  const fixture = await makeFixture();
  try {
    const result = run(fixture.script, ["sync"]);
    assert.equal(result.status, 0, result.stderr);
    const project = await readFile(join(fixture.root, "PROJECT.md"), "utf8");
    assert.match(project, /T-900.*真实待办/);
    assert.match(project, /T-901.*真实进行中/);
    assert.match(project, /T-904 S2.*带子阶段的真实待办/);
    assert.doesNotMatch(project, /T-007|T-902|T-903/);
    assert.doesNotMatch(project, /\n\n$/, "生成文件只保留一个 EOF 换行，避免每次 sync 制造空白漂移");
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});
