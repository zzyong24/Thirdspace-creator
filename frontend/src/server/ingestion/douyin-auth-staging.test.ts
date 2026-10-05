// [T-330] staging 登录态目录 helpers 单测 —— **真文件系统**(os.tmpdir 下 mkdtemp)验搬移/
// 清理语义,不 mock fs:搬移是本修复的关键副作用(登录态归位),假 fs 验不出 rename 语义。
import { mkdtemp, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import nodePath from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  adoptDouyinStagingDir,
  createDouyinStagingToken,
  discardDouyinStagingDir,
  douyinStagingDirFor,
} from "./douyin-auth-staging";

let base: string;

beforeEach(async () => {
  base = await mkdtemp(nodePath.join(tmpdir(), "douyin-auth-staging-"));
});
afterEach(async () => {
  await rm(base, { recursive: true, force: true });
});

const exists = async (p: string): Promise<boolean> =>
  (await stat(p).catch(() => null)) !== null;

describe("createDouyinStagingToken / douyinStagingDirFor", () => {
  it("token 恒为 16 位 hex,映射到 base 下 `_staging-<token>` 目录", () => {
    const token = createDouyinStagingToken();
    expect(token).toMatch(/^[0-9a-f]{16}$/);
    expect(douyinStagingDirFor(base, token)).toBe(
      nodePath.join(base, `_staging-${token}`),
    );
  });

  it("两次生成的 token 不同(随机,staging 目录不互撞)", () => {
    expect(createDouyinStagingToken()).not.toBe(createDouyinStagingToken());
  });

  it("非法 token(路径注入/空/大小写/长度不符)一律拒绝", () => {
    for (const bad of ["../evil", "", "acct-1", "ABCDEF0123456789", "0123456789abcde", "0123456789abcdef0"]) {
      expect(() => douyinStagingDirFor(base, bad)).toThrow(/非法/);
    }
  });
});

describe("adoptDouyinStagingDir — staging 搬到正式目录", () => {
  it("整目录搬移(含子目录),成功后 staging 不复存在", async () => {
    const token = createDouyinStagingToken();
    const staging = douyinStagingDirFor(base, token);
    await mkdir(nodePath.join(staging, "Default"), { recursive: true });
    await writeFile(nodePath.join(staging, "Default", "Cookies"), "new-session");
    const target = nodePath.join(base, "acct-new");

    await adoptDouyinStagingDir(staging, target);

    expect(await exists(staging)).toBe(false);
    expect(
      await readFile(nodePath.join(target, "Default", "Cookies"), "utf8"),
    ).toBe("new-session");
  });

  it("目标已存在(同号重扫)→ 旧登录态被整树替换,不残留旧文件", async () => {
    const token = createDouyinStagingToken();
    const staging = douyinStagingDirFor(base, token);
    await mkdir(staging, { recursive: true });
    await writeFile(nodePath.join(staging, "Cookies"), "fresh");
    const target = nodePath.join(base, "acct-1");
    await mkdir(target, { recursive: true });
    await writeFile(nodePath.join(target, "Cookies"), "stale");
    await writeFile(nodePath.join(target, "old-only-file"), "leftover");

    await adoptDouyinStagingDir(staging, target);

    expect(await readFile(nodePath.join(target, "Cookies"), "utf8")).toBe("fresh");
    // 旧目录整树删除后搬入 → 旧独有文件不残留(半新半旧 profile 会让 Chromium 状态错乱)。
    expect(await exists(nodePath.join(target, "old-only-file"))).toBe(false);
    expect(await exists(staging)).toBe(false);
  });

  it("目标父目录不存在也能搬(自动 mkdir -p)", async () => {
    const token = createDouyinStagingToken();
    const staging = douyinStagingDirFor(base, token);
    await mkdir(staging, { recursive: true });
    await writeFile(nodePath.join(staging, "Cookies"), "x");
    const target = nodePath.join(base, "deep", "nested", "acct-2");

    await adoptDouyinStagingDir(staging, target);
    expect(await readFile(nodePath.join(target, "Cookies"), "utf8")).toBe("x");
  });

  it("staging 不存在 → 诚实抛错(没有可归位的登录态,绝不假装成功)", async () => {
    const staging = douyinStagingDirFor(base, createDouyinStagingToken());
    await expect(
      adoptDouyinStagingDir(staging, nodePath.join(base, "acct-x")),
    ).rejects.toThrow(/staging 登录态目录不存在/);
  });

  it("非 staging 形态的源目录 → 拒绝(纵深防御,防误搬正式号目录)", async () => {
    const notStaging = nodePath.join(base, "acct-1");
    await mkdir(notStaging, { recursive: true });
    await expect(
      adoptDouyinStagingDir(notStaging, nodePath.join(base, "acct-2")),
    ).rejects.toThrow(/非 staging 目录/);
  });
});

describe("discardDouyinStagingDir — 失败路径清理", () => {
  it("整树删除 staging;目录不存在幂等安静通过", async () => {
    const token = createDouyinStagingToken();
    const staging = douyinStagingDirFor(base, token);
    await mkdir(nodePath.join(staging, "Default"), { recursive: true });
    await writeFile(nodePath.join(staging, "Default", "Cookies"), "half-done");

    await discardDouyinStagingDir(staging);
    expect(await exists(staging)).toBe(false);
    // 幂等:再删一次不抛。
    await expect(discardDouyinStagingDir(staging)).resolves.toBeUndefined();
  });

  it("非 staging 形态目录 → 拒绝删除(绝不误删正式登录态)", async () => {
    const real = nodePath.join(base, "acct-1");
    await mkdir(real, { recursive: true });
    await expect(discardDouyinStagingDir(real)).rejects.toThrow(/非 staging 目录/);
    expect(await exists(real)).toBe(true);
  });
});

describe('账号组绑定的登录目录事务回执',()=>{
 it('数据库提交失败时恢复原登录态，重试仍有完整staging',async()=>{
  const {prepareDouyinStagingAdoption}=await import('./douyin-auth-staging');
  const stage=douyinStagingDirFor(base,createDouyinStagingToken()),target=nodePath.join(base,'acct-original');
  await mkdir(stage);await writeFile(nodePath.join(stage,'Cookies'),'new-login');await mkdir(target);await writeFile(nodePath.join(target,'Cookies'),'original-login');
  const receipt=await prepareDouyinStagingAdoption(stage,target);
  expect(await readFile(nodePath.join(target,'Cookies'),'utf8')).toBe('new-login');
  await receipt.rollbackProfile();
  expect(await readFile(nodePath.join(target,'Cookies'),'utf8')).toBe('original-login');
  expect(await readFile(nodePath.join(stage,'Cookies'),'utf8')).toBe('new-login');
  await receipt.rollbackProfile();
 });
 it('事务成功后才删除备份，新账号回滚不留下正式目录',async()=>{
  const {prepareDouyinStagingAdoption}=await import('./douyin-auth-staging');
  const stage=douyinStagingDirFor(base,createDouyinStagingToken()),target=nodePath.join(base,'acct-new');await mkdir(stage);await writeFile(nodePath.join(stage,'Cookies'),'verified');
  const first=await prepareDouyinStagingAdoption(stage,target);await first.rollbackProfile();expect(await exists(target)).toBe(false);
  const second=await prepareDouyinStagingAdoption(stage,target);await second.finalizeProfile();await second.finalizeProfile();expect(await readFile(nodePath.join(target,'Cookies'),'utf8')).toBe('verified');
 });
});
it('进程中断后从持久恢复记录找回原登录态，不依赖内存receipt',async()=>{
 const {prepareDouyinStagingAdoption,readDouyinBindingAdoption,rollbackDouyinBindingAdoption}=await import('./douyin-auth-staging');
 const stage=douyinStagingDirFor(base,createDouyinStagingToken()),target=nodePath.join(base,'acct-persisted');await mkdir(stage);await writeFile(nodePath.join(stage,'Cookies'),'verified-new');await mkdir(target);await writeFile(nodePath.join(target,'Cookies'),'original');
 await prepareDouyinStagingAdoption(stage,target,{userId:'owner',runId:'run-real'});
 expect(await readDouyinBindingAdoption(stage)).toMatchObject({userId:'owner',runId:'run-real',hadTarget:true});
 await rollbackDouyinBindingAdoption(stage);expect(await readFile(nodePath.join(target,'Cookies'),'utf8')).toBe('original');expect(await readDouyinBindingAdoption(stage)).toBeNull();await rollbackDouyinBindingAdoption(stage);
});
it('恢复文件不能指向其它目录根',async()=>{
 const {readDouyinBindingAdoption}=await import('./douyin-auth-staging');const stage=douyinStagingDirFor(base,createDouyinStagingToken());await writeFile(stage+'.adoption.json',JSON.stringify({version:1,stagingDir:stage,targetDir:nodePath.join(base,'..','victim'),backupDir:'victim',hadTarget:true}));await expect(readDouyinBindingAdoption(stage)).rejects.toThrow('恢复记录无效');
});
