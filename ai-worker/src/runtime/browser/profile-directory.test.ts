import { afterEach, expect, it } from 'vitest';
import { mkdtemp, mkdir, rm, symlink, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, win32 } from 'node:path';
import { douyinProfileDirectory, resolveDouyinProfileIdentity } from './profile-directory';
const owned: string[] = [];
afterEach(async () => { for (const path of owned.splice(0)) await rm(path, { recursive: true, force: true }); });
async function temporary() { const root = await mkdtemp(join(tmpdir(), 'creatoros-profile-path-')); owned.push(root); return root; }
it('保持账号目录及空账号的_default路径，拒绝路径表达式', () => {
  expect(douyinProfileDirectory('/isolated/auth', 'acct-1')).toBe('/isolated/auth/acct-1');
  expect(douyinProfileDirectory('/isolated/auth', null)).toBe('/isolated/auth/_default');
  for (const id of ['', '.', '..', '../other', 'a/b', 'a\\b', 'C:other', 'bad\0id', 'name.', 'name '])
    expect(() => douyinProfileDirectory('/isolated/auth', id)).toThrow();
  expect(douyinProfileDirectory('C:\\User Data\\auth', 'acct-1', win32)).toBe('C:\\User Data\\auth\\acct-1');
});
it('目录未创建时只读解析；创建后身份保持不变', async () => {
  const root = await temporary(), base = join(root, 'not-created', 'auth');
  const before = await resolveDouyinProfileIdentity(base, 'acct-1');
  await expect(stat(base)).rejects.toMatchObject({ code: 'ENOENT' });
  await mkdir(join(base, 'acct-1'), { recursive: true });
  expect(await resolveDouyinProfileIdentity(base, 'acct-1')).toEqual(before);
  expect(before.profileKey).toMatch(/^[a-f0-9]{64}$/);
});
it('配置根目录的符号链接与真实根得到同一身份；账号之间保持独立', async () => {
  const root = await temporary(), base = join(root, 'auth'), alias = join(root, 'alias');
  await mkdir(base); await symlink(base, alias, 'dir');
  expect(await resolveDouyinProfileIdentity(alias, 'acct-1')).toEqual(await resolveDouyinProfileIdentity(base, 'acct-1'));
  expect((await resolveDouyinProfileIdentity(base, 'acct-2')).profileKey).not.toBe((await resolveDouyinProfileIdentity(base, 'acct-1')).profileKey);
});
it('账号目录链接到另一个账号或根外，均不得授权使用', async () => {
  const root = await temporary(), base = join(root, 'auth');await mkdir(join(base, 'other'), { recursive: true });
  await symlink(join(base, 'other'), join(base, 'alias'), 'dir');
  await symlink(root, join(base, 'outside'), 'dir');
  await expect(resolveDouyinProfileIdentity(base, 'alias')).rejects.toThrow();
  await expect(resolveDouyinProfileIdentity(base, 'outside')).rejects.toThrow();
});
it('悬空符号链接不是尚未创建的合法目录', async () => {
  const root = await temporary(), base = join(root, 'auth');await mkdir(base);
  await symlink(join(root, 'missing'), join(base, 'broken'), 'dir');
  await expect(resolveDouyinProfileIdentity(base, 'broken')).rejects.toThrow();
});
it('取消不降级成默认账号路径，也不创建任何目录', async () => {
  const root = await temporary(), controller = new AbortController(), reason = new Error('停止');controller.abort(reason);
  await expect(resolveDouyinProfileIdentity(join(root, 'never-created'), 'acct-1', controller.signal)).rejects.toBe(reason);
  await expect(stat(join(root, 'never-created'))).rejects.toMatchObject({ code: 'ENOENT' });
});
