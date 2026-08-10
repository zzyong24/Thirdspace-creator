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

async function makeFixture({
  running = false,
  systemItemsMissing = false,
  channel = false,
  platform = "darwin",
} = {}) {
  const root = await mkdtemp(join(tmpdir(), "creatoros-activation-reset-"));
  const home = join(root, "home");
  const bin = join(root, "bin");
  const repo = join(root, "repo");
  const commandLog = join(root, "commands.log");
  const credentialState = join(root, "credential.state");
  const channelAppId = "com.example.partnerai";
  const selectedAppId = channel ? channelAppId : appId;
  const windowsAppDataRoot = join(home, "AppData", "Roaming");
  const appData = platform === "win32"
    ? join(windowsAppDataRoot, selectedAppId)
    : join(home, "Library", "Application Support", selectedAppId);
  const contentRoot = join(home, "CreatorOS");
  const homeSeen = join(home, ".creatoros-seen");
  await mkdir(appData, { recursive: true });
  await mkdir(bin, { recursive: true });
  await mkdir(contentRoot, { recursive: true });

  let packageManifest;
  if (channel) {
    const packageDir = join(repo, "frontend", "branding", "packages", "partner-ai");
    packageManifest = "frontend/branding/packages/partner-ai/package.json";
    await mkdir(packageDir, { recursive: true });
    await writeFile(join(packageDir, "package.json"), JSON.stringify({
      schema: "creatoros-desktop-package/v1",
      packageRef: "partner-ai",
      displayName: "伙伴AI",
      binaryName: "PartnerAI",
      appIdentifier: channelAppId,
      keychainService: "com.example.partnerai.desktop",
      windowsUpgradeCode: "11111111-2222-4333-8444-555555555555",
    }), "utf8");
    await writeFile(join(packageDir, "identity.lock.json"), JSON.stringify({
      schema: "creatoros-package-identity-lock/v1",
      packageRef: "partner-ai",
      appIdentifier: channelAppId,
      keychainService: "com.example.partnerai.desktop",
      windowsUpgradeCode: "11111111-2222-4333-8444-555555555555",
    }), "utf8");
  }

  for (const name of activationFiles) {
    await writeFile(join(appData, name), `activation:${name}`, "utf8");
  }
  if (platform === "win32") {
    await writeFile(homeSeen, "activation:last-seen", "utf8");
    if (!systemItemsMissing) {
      await writeFile(credentialState, "present", "utf8");
    }
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
  const powershell = join(bin, "powershell");
  const tasklist = join(bin, "tasklist");
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
  await writeExecutable(
    tasklist,
    running
      ? `#!/bin/sh
printf '"CreatorOS.exe","923","Console","1","42,000 K"\n'
exit 0
`
      : `#!/bin/sh
exit 0
`,
  );
  await writeExecutable(
    powershell,
    `#!/bin/sh
printf 'powershell:%s action=%s target=%s recycle_count=%s\n' "$*" "$CREATOROS_ACTIVATION_RESET_WIN_CREDENTIAL_ACTION" "$CREATOROS_ACTIVATION_RESET_WIN_CREDENTIAL_TARGET" "$CREATOROS_ACTIVATION_RESET_WIN_RECYCLE_COUNT" >> "$CREATOROS_ACTIVATION_RESET_TEST_COMMAND_LOG"
action="$CREATOROS_ACTIVATION_RESET_WIN_CREDENTIAL_ACTION"
if [ "$action" = 'delete' ]; then
  if [ -f "$CREATOROS_ACTIVATION_RESET_TEST_CREDENTIAL_STATE" ]; then
    rm -f -- "$CREATOROS_ACTIVATION_RESET_TEST_CREDENTIAL_STATE"
    exit 0
  fi
  exit 44
fi
if [ "$action" = 'exists' ]; then
  if [ -f "$CREATOROS_ACTIVATION_RESET_TEST_CREDENTIAL_STATE" ]; then exit 0; fi
  exit 44
fi
for index in 0 1 2 3; do
  eval "target=\\$CREATOROS_ACTIVATION_RESET_WIN_RECYCLE_PATH_$index"
  if [ -f "$target" ]; then rm -f -- "$target"; fi
done
exit 0
`,
  );

  return {
    root,
    home,
    appData,
    contentRoot,
    homeSeen,
    commandLog,
    env: {
      ...process.env,
      CREATOROS_ACTIVATION_RESET_TEST_MODE: "1",
      CREATOROS_ACTIVATION_RESET_HOME_OVERRIDE: home,
      CREATOROS_ACTIVATION_RESET_APPDATA_OVERRIDE: windowsAppDataRoot,
      CREATOROS_ACTIVATION_RESET_REPO_OVERRIDE: repo,
      CREATOROS_ACTIVATION_RESET_PLATFORM_OVERRIDE: platform,
      CREATOROS_ACTIVATION_RESET_TEST_COMMAND_LOG: commandLog,
      CREATOROS_ACTIVATION_RESET_TEST_CREDENTIAL_STATE: credentialState,
      CREATOROS_ACTIVATION_RESET_TRASH_BIN: trash,
      CREATOROS_ACTIVATION_RESET_DEFAULTS_BIN: defaults,
      CREATOROS_ACTIVATION_RESET_SECURITY_BIN: security,
      CREATOROS_ACTIVATION_RESET_PGREP_BIN: pgrep,
      CREATOROS_ACTIVATION_RESET_POWERSHELL_BIN: powershell,
      CREATOROS_ACTIVATION_RESET_TASKLIST_BIN: tasklist,
    },
    packageManifest,
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
    assert.match(result.stdout, /仅重置激活码（macOS · DRY-RUN）/);
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

test("渠道包只清理锁定身份自己的激活态，不触碰官方系统项", async () => {
  const fixture = await makeFixture({ channel: true });
  try {
    const result = run(
      ["--package-manifest", fixture.packageManifest, "--execute", "--yes"],
      fixture.env,
    );
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
    assert.match(result.stdout, /伙伴AI/);
    for (const name of activationFiles) {
      assert.equal(await exists(join(fixture.appData, name)), false, name);
    }
    for (const name of protectedAppData) {
      assert.equal(await exists(join(fixture.appData, name)), true, name);
    }
    const commands = await readFile(fixture.commandLog, "utf8");
    assert.match(commands, /defaults:delete com\.example\.partnerai\.license/);
    assert.doesNotMatch(commands, /cloud\.aitongban\.creatoros/);
    assert.doesNotMatch(commands, /com\.creatoros\.desktop\.entitlement-consume/);
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test("渠道身份锁与 manifest 不一致时拒绝执行且不产生部分清理", async () => {
  const fixture = await makeFixture({ channel: true });
  try {
    const lockPath = join(
      fixture.root,
      "repo/frontend/branding/packages/partner-ai/identity.lock.json",
    );
    const lock = JSON.parse(await readFile(lockPath, "utf8"));
    lock.appIdentifier = "com.example.tampered";
    await writeFile(lockPath, JSON.stringify(lock), "utf8");
    const result = run(
      ["--package-manifest", fixture.packageManifest, "--execute", "--yes"],
      fixture.env,
    );
    assert.notEqual(result.status, 0);
    assert.match(`${result.stdout}\n${result.stderr}`, /身份锁不一致/);
    for (const name of activationFiles) {
      assert.equal(await exists(join(fixture.appData, name)), true, name);
    }
    assert.equal(await exists(fixture.commandLog), false);
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test("拒绝仓库渠道目录以外的 package manifest", async () => {
  const fixture = await makeFixture({ channel: true });
  try {
    const result = run(
      ["--package-manifest", "../outside/package.json", "--execute", "--yes"],
      fixture.env,
    );
    assert.notEqual(result.status, 0);
    assert.match(`${result.stdout}\n${result.stderr}`, /渠道包目录外/);
    for (const name of activationFiles) {
      assert.equal(await exists(join(fixture.appData, name)), true, name);
    }
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test("Windows 只清官方本机激活态并保留业务数据与机器身份", async () => {
  const fixture = await makeFixture({ platform: "win32" });
  try {
    const result = run(["--execute", "--yes"], fixture.env);
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
    assert.match(result.stdout, /Windows/);
    for (const name of activationFiles) {
      assert.equal(await exists(join(fixture.appData, name)), false, name);
    }
    assert.equal(await exists(fixture.homeSeen), false, ".creatoros-seen");
    for (const name of protectedAppData) {
      assert.equal(await exists(join(fixture.appData, name)), true, name);
    }
    assert.equal(await exists(join(fixture.contentRoot, "project.txt")), true);
    const commands = await readFile(fixture.commandLog, "utf8");
    assert.match(commands, /pending-consume-v1\.com\.creatoros\.desktop\.entitlement-consume/);
    assert.doesNotMatch(commands, /defaults:|security:|trash:/);
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test("Windows 检测到 CreatorOS 运行时拒绝执行且不产生部分清理", async () => {
  const fixture = await makeFixture({ platform: "win32", running: true });
  try {
    const result = run(["--execute", "--yes"], fixture.env);
    assert.notEqual(result.status, 0);
    assert.match(`${result.stdout}\n${result.stderr}`, /CreatorOS 仍在运行/);
    for (const name of activationFiles) {
      assert.equal(await exists(join(fixture.appData, name)), true, name);
    }
    assert.equal(await exists(fixture.homeSeen), true, ".creatoros-seen");
    for (const name of protectedAppData) {
      assert.equal(await exists(join(fixture.appData, name)), true, name);
    }
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test("Windows 激活系统项已不存在时可幂等执行", async () => {
  const fixture = await makeFixture({ platform: "win32", systemItemsMissing: true });
  try {
    const result = run(["--execute", "--yes"], fixture.env);
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
    assert.equal(await exists(join(fixture.contentRoot, "project.txt")), true);
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test("Windows 拒绝越过官方 CreatorOS 范围清理渠道包", async () => {
  const fixture = await makeFixture({ platform: "win32", channel: true });
  try {
    const result = run(
      ["--package-manifest", fixture.packageManifest, "--execute", "--yes"],
      fixture.env,
    );
    assert.notEqual(result.status, 0);
    assert.match(`${result.stdout}\n${result.stderr}`, /只支持官方 CreatorOS/);
    for (const name of activationFiles) {
      assert.equal(await exists(join(fixture.appData, name)), true, name);
    }
    assert.equal(await exists(fixture.homeSeen), true, ".creatoros-seen");
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test("离线重置脚本不包含激活服务器地址或网络调用", async () => {
  const source = await readFile(script, "utf8");
  assert.doesNotMatch(source, /https?:\/\//i);
  assert.doesNotMatch(source, /license\.aitongban\.cloud/i);
  assert.doesNotMatch(source, /node:(?:http|https|net|tls)|\bfetch\s*\(|Invoke-WebRequest|curl\b/i);
});
