import assert from "node:assert/strict";
import {
  chmod,
  mkdtemp,
  mkdir,
  readFile,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import test from "node:test";

const here = dirname(fileURLToPath(import.meta.url));
const script = resolve(here, "reset-creatoros-local.mjs");

const relativeFileTargets = [
  "Library/Application Support/cloud.aitongban.creatoros",
  "CreatorOS",
  "Library/Caches/cloud.aitongban.creatoros",
  "Library/WebKit/cloud.aitongban.creatoros",
  "Library/HTTPStorages/cloud.aitongban.creatoros",
  "Library/Saved Application State/cloud.aitongban.creatoros.savedState",
  "Library/Cookies/cloud.aitongban.creatoros.binarycookies",
  "Library/Containers/cloud.aitongban.creatoros",
];

async function exists(path) {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

async function writeExecutable(path, source) {
  await writeFile(path, source, "utf8");
  await chmod(path, 0o755);
}

async function makeFixture({
  running = false,
  systemItemsMissing = false,
} = {}) {
  const root = await mkdtemp(join(tmpdir(), "creatoros-reset-cli-"));
  const home = join(root, "home");
  const bin = join(root, "bin");
  const commandLog = join(root, "commands.log");
  await mkdir(home, { recursive: true });
  await mkdir(bin, { recursive: true });
  for (const relative of relativeFileTargets) {
    const target = join(home, relative);
    if (relative.endsWith(".binarycookies")) {
      await mkdir(dirname(target), { recursive: true });
      await writeFile(target, "cookie", "utf8");
    } else {
      await mkdir(target, { recursive: true });
      await writeFile(join(target, "marker.txt"), relative, "utf8");
    }
  }
  const outside = join(home, "Documents", "must-stay.txt");
  await mkdir(dirname(outside), { recursive: true });
  await writeFile(outside, "keep", "utf8");

  const trash = join(bin, "trash");
  const defaults = join(bin, "defaults");
  const security = join(bin, "security");
  const pgrep = join(bin, "pgrep");
  await writeExecutable(
    trash,
    `#!/bin/sh
printf 'trash:%s\\n' "$*" >> "$CREATOROS_RESET_TEST_COMMAND_LOG"
for target in "$@"; do
  rm -rf -- "$target"
done
`,
  );
  await writeExecutable(
    defaults,
    `#!/bin/sh
printf 'defaults:%s\\n' "$*" >> "$CREATOROS_RESET_TEST_COMMAND_LOG"
if [ "$1" = "read" ] || [ "${systemItemsMissing ? "1" : "0"}" = "1" ]; then
  printf 'Domain (%s) not found. Defaults have not been changed.\\n' "$2" >&2
  exit 1
fi
exit 0
`,
  );
  await writeExecutable(
    security,
    `#!/bin/sh
printf 'security:%s\\n' "$*" >> "$CREATOROS_RESET_TEST_COMMAND_LOG"
if [ "$1" = "find-generic-password" ] || [ "${systemItemsMissing ? "1" : "0"}" = "1" ]; then
  printf 'The specified item could not be found in the keychain.\\n' >&2
  exit 44
fi
exit 0
`,
  );
  await writeExecutable(
    pgrep,
    running
      ? `#!/bin/sh
printf '923 /Applications/CreatorOS.app/Contents/MacOS/CreatorOS\\n'
exit 0
`
      : `#!/bin/sh
exit 1
`,
  );

  return {
    root,
    home,
    outside,
    commandLog,
    env: {
      ...process.env,
      HOME: home,
      CREATOROS_RESET_TEST_MODE: "1",
      CREATOROS_RESET_HOME_OVERRIDE: home,
      CREATOROS_RESET_TEST_COMMAND_LOG: commandLog,
      CREATOROS_RESET_TRASH_BIN: trash,
      CREATOROS_RESET_DEFAULTS_BIN: defaults,
      CREATOROS_RESET_SECURITY_BIN: security,
      CREATOROS_RESET_PGREP_BIN: pgrep,
    },
  };
}

function run(args, env) {
  return spawnSync(process.execPath, [script, ...args], {
    env,
    encoding: "utf8",
  });
}

test("默认 dry-run：列出完整白名单，但不修改文件或系统凭据", async () => {
  const fixture = await makeFixture();
  try {
    const result = run([], fixture.env);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /DRY-RUN/);
    assert.match(result.stdout, /Application Support\/cloud\.aitongban\.creatoros/);
    assert.match(result.stdout, /CreatorOS/);
    assert.match(result.stdout, /com\.creatoros\.desktop.*master-key/s);
    assert.match(
      result.stdout,
      /com\.creatoros\.desktop\.entitlement-consume.*pending-consume-v1/s,
    );
    for (const relative of relativeFileTargets) {
      assert.equal(await exists(join(fixture.home, relative)), true, relative);
    }
    assert.equal(await exists(fixture.outside), true);
    assert.equal(await exists(fixture.commandLog), false);
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test("--execute --yes：只清 CreatorOS 白名单并删除两条本机凭据", async () => {
  const fixture = await makeFixture();
  try {
    const result = run(["--execute", "--yes"], fixture.env);
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
    assert.match(result.stdout, /本机 CreatorOS 已恢复为未激活的首次启动状态/);
    for (const relative of relativeFileTargets) {
      assert.equal(await exists(join(fixture.home, relative)), false, relative);
    }
    assert.equal(await readFile(fixture.outside, "utf8"), "keep");

    const commands = await readFile(fixture.commandLog, "utf8");
    assert.match(
      commands,
      /defaults:delete cloud\.aitongban\.creatoros\.license/,
    );
    assert.match(commands, /defaults:delete cloud\.aitongban\.creatoros/);
    assert.match(
      commands,
      /security:delete-generic-password -s com\.creatoros\.desktop -a master-key/,
    );
    assert.match(
      commands,
      /security:delete-generic-password -s com\.creatoros\.desktop\.entitlement-consume -a pending-consume-v1/,
    );
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test("CreatorOS 仍运行时拒绝执行，不产生部分清理", async () => {
  const fixture = await makeFixture({ running: true });
  try {
    const result = run(["--execute", "--yes"], fixture.env);
    assert.notEqual(result.status, 0);
    assert.match(`${result.stdout}\n${result.stderr}`, /CreatorOS 仍在运行/);
    for (const relative of relativeFileTargets) {
      assert.equal(await exists(join(fixture.home, relative)), true, relative);
    }
    assert.equal(await exists(fixture.commandLog), false);
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test("Preferences 和 Keychain 已不存在时仍可重复执行", async () => {
  const fixture = await makeFixture({ systemItemsMissing: true });
  try {
    const result = run(["--execute", "--yes"], fixture.env);
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
    assert.match(result.stdout, /本机 CreatorOS 已恢复为未激活的首次启动状态/);
    assert.equal(await exists(fixture.outside), true);
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test("测试 HOME 覆盖也必须是安全的绝对子目录", async () => {
  const fixture = await makeFixture();
  try {
    const result = run(["--execute", "--yes"], {
      ...fixture.env,
      CREATOROS_RESET_HOME_OVERRIDE: "/",
    });
    assert.notEqual(result.status, 0);
    assert.match(`${result.stdout}\n${result.stderr}`, /拒绝使用不安全的 HOME/);
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});
