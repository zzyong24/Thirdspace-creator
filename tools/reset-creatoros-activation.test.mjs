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
const script = resolve(here, "reset-creatoros-activation.mjs");
const appId = "cloud.aitongban.creatoros";
const activationFiles = [
  ".license",
  ".license-seen",
  ".channel-model-config",
];
const protectedAppData = ["db", ".auth", "logs", "machine-id", ".master-key"];

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

async function makeFixture({ running = false, systemItemsMissing = false } = {}) {
  const root = await mkdtemp(join(tmpdir(), "creatoros-activation-reset-"));
  const home = join(root, "home");
  const bin = join(root, "bin");
  const commandLog = join(root, "commands.log");
  const appData = join(home, "Library", "Application Support", appId);
  const contentRoot = join(home, "CreatorOS");
  await mkdir(appData, { recursive: true });
  await mkdir(bin, { recursive: true });
  await mkdir(contentRoot, { recursive: true });

  for (const name of activationFiles) {
    await writeFile(join(appData, name), `activation:${name}`, "utf8");
  }
  for (const name of protectedAppData) {
    const path = join(appData, name);
    if (name.startsWith("." ) || name === "machine-id") {
      await writeFile(path, `keep:${name}`, "utf8");
    } else {
      await mkdir(path, { recursive: true });
      await writeFile(join(path, "keep.txt"), `keep:${name}`, "utf8");
    }
  }
  await writeFile(join(contentRoot, "project.txt"), "must stay", "utf8");

  const trash = join(bin, "trash");
  const defaults = join(bin, "defaults");
  const security = join(bin, "security");
  const pgrep = join(bin, "pgrep");
  await writeExecutable(
    trash,
    `#!/bin/sh
printf 'trash:%s\\n' "$*" >> "$CREATOROS_ACTIVATION_RESET_TEST_COMMAND_LOG"
for target in "$@"; do rm -f -- "$target"; done
`,
  );
  await writeExecutable(
    defaults,
    `#!/bin/sh
printf 'defaults:%s\\n' "$*" >> "$CREATOROS_ACTIVATION_RESET_TEST_COMMAND_LOG"
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
printf 'security:%s\\n' "$*" >> "$CREATOROS_ACTIVATION_RESET_TEST_COMMAND_LOG"
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
    appData,
    contentRoot,
    commandLog,
    env: {
      ...process.env,
      CREATOROS_ACTIVATION_RESET_TEST_MODE: "1",
      CREATOROS_ACTIVATION_RESET_HOME_OVERRIDE: home,
      CREATOROS_ACTIVATION_RESET_TEST_COMMAND_LOG: commandLog,
      CREATOROS_ACTIVATION_RESET_TRASH_BIN: trash,
      CREATOROS_ACTIVATION_RESET_DEFAULTS_BIN: defaults,
      CREATOROS_ACTIVATION_RESET_SECURITY_BIN: security,
      CREATOROS_ACTIVATION_RESET_PGREP_BIN: pgrep,
    },
  };
}

function run(args, env) {
  return spawnSync(process.execPath, [script, ...args], {
    env,
    encoding: "utf8",
  });
}

test("dry-run 只列激活白名单，不修改任何数据", async () => {
  const fixture = await makeFixture();
  try {
    const result = run([], fixture.env);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /仅重置激活码（DRY-RUN）/);
    assert.match(result.stdout, /明确保留/);
    for (const name of [...activationFiles, ...protectedAppData]) {
      assert.equal(await exists(join(fixture.appData, name)), true, name);
    }
    assert.equal(await exists(join(fixture.contentRoot, "project.txt")), true);
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});
test("execute 只移除激活态，完整保留内容、数据库、登录态和 master key", async () => {
  const fixture = await makeFixture();
  try {
    const result = run(["--execute", "--yes"], fixture.env);
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
    assert.match(result.stdout, /当前本机激活码已退出/);
    for (const name of activationFiles) {
      assert.equal(await exists(join(fixture.appData, name)), false, name);
    }
    for (const name of protectedAppData) {
      assert.equal(await exists(join(fixture.appData, name)), true, name);
    }
    assert.equal(
      await readFile(join(fixture.contentRoot, "project.txt"), "utf8"),
      "must stay",
    );
    const commands = await readFile(fixture.commandLog, "utf8");
    assert.match(commands, /defaults:delete cloud\.aitongban\.creatoros\.license/);
    assert.doesNotMatch(commands, /defaults:delete cloud\.aitongban\.creatoros\n/);
    assert.match(
      commands,
      /security:delete-generic-password -s com\.creatoros\.desktop\.entitlement-consume -a pending-consume-v1/,
    );
    assert.doesNotMatch(commands, /master-key/);
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test("CreatorOS 运行中拒绝执行，不产生部分重置", async () => {
  const fixture = await makeFixture({ running: true });
  try {
    const result = run(["--execute", "--yes"], fixture.env);
    assert.notEqual(result.status, 0);
    assert.match(`${result.stdout}\n${result.stderr}`, /CreatorOS 仍在运行/);
    for (const name of [...activationFiles, ...protectedAppData]) {
      assert.equal(await exists(join(fixture.appData, name)), true, name);
    }
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test("激活系统项已不存在时可幂等执行", async () => {
  const fixture = await makeFixture({ systemItemsMissing: true });
  try {
    const result = run(["--execute", "--yes"], fixture.env);
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
    assert.equal(await exists(join(fixture.contentRoot, "project.txt")), true);
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});
