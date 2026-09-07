import path from 'node:path';
import { realpath, lstat, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';

type PathOperations = Pick<typeof path, 'resolve' | 'relative' | 'isAbsolute' | 'join'>;
export class BrowserProfilePathError extends Error {
  readonly code = 'BROWSER_PROFILE_PATH_INVALID';
  constructor() { super('浏览器登录目录无效或指向了其他账号目录'); this.name = 'BrowserProfilePathError'; }
}

/** 只校验目录协议，不代替 backend 对真实账号与当前用户的归属检查。 */
export function douyinProfileDirectory(base: string, accountId?: string | null, paths: PathOperations = path): string {
  const segment = accountId ?? '_default';
  // SEMANTIC_BOUNDARY_ALLOW: 文件名边界与跨平台路径协议检查，不进行账号或内容语义选择。
  if (!segment || segment === '.' || segment === '..' || /[<>:"/\\|?*\x00-\x1f]/.test(segment) || /[. ]$/.test(segment))
    throw new BrowserProfilePathError();
  const root = paths.resolve(base), directory = paths.resolve(root, segment), relative = paths.relative(root, directory);
  if (!relative || (relative === '..' || relative.startsWith('../') || relative.startsWith('..\\')) || paths.isAbsolute(relative)) throw new BrowserProfilePathError();
  return directory;
}

/** 读取最近存在的真实祖先；缺失目录不创建，悬空链接不当成空目录。 */
async function canonicalDirectory(directory: string, signal?: AbortSignal): Promise<string> {
  signal?.throwIfAborted();
  try {
    const resolved = await realpath(directory);
    signal?.throwIfAborted();
    if (!(await stat(resolved)).isDirectory()) throw new BrowserProfilePathError();
    signal?.throwIfAborted();
    return resolved;
  } catch (error) {
    signal?.throwIfAborted();
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    // realpath 失败但目录项存在，包含悬空链接，不能沿链接静默逃到别处。
    const entry = await lstat(directory).catch((failure: NodeJS.ErrnoException) => {
      if (failure.code !== 'ENOENT') throw failure;
      return null;
    });
    signal?.throwIfAborted();
    if (entry) throw new BrowserProfilePathError();
    const parent = path.dirname(directory);
    if (parent === directory) throw new BrowserProfilePathError();
    return path.join(await canonicalDirectory(parent, signal), path.basename(directory));
  }
}

/** 宿主在真实账号归属校验后调用；返回可供同一资源租约使用的规范路径摘要。 */
export async function resolveDouyinProfileIdentity(base: string, accountId?: string | null, signal?: AbortSignal) {
  signal?.throwIfAborted();
  const directory = douyinProfileDirectory(base, accountId);
  const canonicalRoot = await canonicalDirectory(path.resolve(base), signal);
  const canonicalProfile = await canonicalDirectory(directory, signal);
  const expected = path.join(canonicalRoot, accountId ?? '_default');
  const normalize = (value: string) => process.platform === 'win32' ? value.toLowerCase() : value;
  // 允许配置根目录本身为别名；账号子目录不能借链接改指另一个账号或根外目录。
  if (normalize(canonicalProfile) !== normalize(expected)) throw new BrowserProfilePathError();
  signal?.throwIfAborted();
  return {
    authDir: canonicalProfile,
    profileKey: createHash('sha256').update('creatoros-browser-profile\0').update(normalize(canonicalProfile)).digest('hex'),
  };
}
