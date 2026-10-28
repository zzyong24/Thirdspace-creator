// [T-330] 抖音「扫码绑定新号」staging 登录态目录 —— 纯 fs/path/crypto 叶子模块。
//
// 为什么要 staging:旧链绑新号时 loginDouyin 落在当前号(或 _default)的持久 profile,里面
// 已有旧号 sessionid → douyin-cdp loginDouyin 首轮 isLoggedIn 即 true 直接 return,二维码
// 根本不出现,永远"登进"旧号。修法 = 绑新号先在全新空目录扫码(必出二维码),身份确认后再
// 搬到 `.auth/douyin/<accountId>` 正式目录;任何失败路径整目录丢弃(诚实:绝不把无主登录态
// 默默挂到 _default/旧号)。
//
// 设计约束:
// - **零 playwright/douyin-cdp 依赖**:persistence-client 静态 import 本模块不破 douyin-cdp
//   的懒加载改造([T-326 B-04]);
// - token 是组合根发给 service 的**不透明句柄**(service 不碰路径),此处白名单校验
//   (16 位 hex)防路径注入 —— stagingKey 永远拼不出 `../` 或别的号目录;
// - staging 目录名带 `_staging-` 前缀,与 `<accountId>`/`_default` 同级但形态可辨,
//   discard 侧再验前缀(纵深防御:绝不误删正式登录态目录)。

import { randomBytes } from "node:crypto";
import { cp, mkdir, rename, rm, stat,readFile,writeFile } from "node:fs/promises";
import nodePath from "node:path";
import { setTimeout as delay } from "node:timers/promises";

const STAGING_PREFIX = "_staging-";
// Windows 上刚退出的 Chromium 子进程、杀毒或索引服务会短暂持有 profile 内文件句柄，
// 此时目录 rename 报 EPERM/EACCES/EBUSY；同一卷上稍后重试通常即可成功。
const LOCKED_RENAME_CODES = new Set(["EPERM", "EACCES", "EBUSY", "ENOTEMPTY"]);
const RENAME_RETRY_DELAYS_MS = [100, 250, 500, 1_000, 2_000, 3_000, 3_000];
const RM_OPTIONS = { recursive: true, force: true, maxRetries: 5, retryDelay: 200 } as const;
// Chromium 运行期独占的锁文件，残留进程持有时无法读取；新进程启动会重建，复制时跳过。
const CHROMIUM_RUNTIME_LOCKS = new Set(["lockfile", "SingletonLock", "SingletonCookie", "SingletonSocket"]);

/**
 * 目录搬移：首选 rename；句柄占用类错误按退避重试，仍失败或跨卷(EXDEV)时复制后删源。
 * 目标路径必须不存在(调用方先删除或先移走)，复制不与旧目录合并。
 */
async function moveDirectory(source: string, target: string): Promise<void> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      await rename(source, target);
      return;
    } catch (err) {
      const code = (err as NodeJS.ErrnoException)?.code ?? "";
      if (code === "EXDEV") break;
      if (!LOCKED_RENAME_CODES.has(code)) throw err;
      const wait = RENAME_RETRY_DELAYS_MS[attempt];
      if (wait === undefined) break;
      await delay(wait);
    }
  }
  try {
    await cp(source, target, {
      recursive: true,
      errorOnExist: true,
      force: false,
      filter: (from) => !CHROMIUM_RUNTIME_LOCKS.has(nodePath.basename(from)),
    });
  } catch (err) {
    // 半份复制品会被回滚逻辑误认作完整目录，必须删掉，源目录保持原样。
    await rm(target, RM_OPTIONS).catch(() => undefined);
    throw err;
  }
  await rm(source, RM_OPTIONS).catch((err: NodeJS.ErrnoException) => {
    // 复制品已完整；源里只剩被残留进程锁住的文件时不让整个登录失败。
    if (!LOCKED_RENAME_CODES.has(err?.code ?? "")) throw err;
  });
}
// token = randomBytes(8).hex → 恒 16 位小写 hex。白名单严校验(不满足直接抛,防注入)。
const TOKEN_RE = /^[0-9a-f]{16}$/;

/** 生成一次绑定流程的 staging token(16 位 hex,不透明句柄)。 */
export function createDouyinStagingToken(): string {
  return randomBytes(8).toString("hex");
}

/**
 * token → staging 目录(`<base>/_staging-<token>`,与各号正式目录同级)。
 * token 不满足 16 位 hex 白名单 → 抛错(防路径注入;service 只会回传我们发的 token,
 * 走到这就是编程错误/伪造输入,诚实拒绝)。
 */
export function douyinStagingDirFor(baseDir: string, token: string): string {
  if (!TOKEN_RE.test(token)) {
    throw new Error(`非法的抖音 staging token:${JSON.stringify(token)}`);
  }
  return nodePath.join(baseDir, `${STAGING_PREFIX}${token}`);
}

/** 纵深防御:确认路径确实是 staging 形态(basename 带前缀),防误操作正式号目录。 */
function assertStagingDir(dir: string): void {
  if (!nodePath.basename(dir).startsWith(STAGING_PREFIX)) {
    throw new Error(`非 staging 目录,拒绝操作:${dir}`);
  }
}

/**
 * 把 staging 登录态**搬**到该号正式目录(身份已确认后调用):
 * - staging 不存在/不是目录 → 抛错(诚实:没有可归位的登录态,绝不假装成功);
 * - 目标已存在 → 先整树删除再搬(同号重扫 = 登录态更新,旧 profile 被替换);
 * - 首选 fs.rename(原子、同设备快);Windows 句柄占用(EPERM/EBUSY 等)退避重试,
 *   仍失败或跨卷(EXDEV)时回退 cp -r + rm。
 * 成功后 staging 目录不复存在(rename 移走 / copy 后删除)。
 */
export async function adoptDouyinStagingDir(
  stagingDir: string,
  targetDir: string,
): Promise<void> {
  assertStagingDir(stagingDir);
  const st = await stat(stagingDir).catch(() => null);
  if (!st?.isDirectory()) {
    throw new Error(`staging 登录态目录不存在,无法归位:${stagingDir}`);
  }
  await rm(targetDir, RM_OPTIONS);
  await mkdir(nodePath.dirname(targetDir), { recursive: true });
  await moveDirectory(stagingDir, targetDir);
}

/** 丢弃 staging 登录态(失败路径清理)。幂等:目录不存在也安静通过(force)。 */
export async function discardDouyinStagingDir(stagingDir: string): Promise<void> {
  assertStagingDir(stagingDir);
  await rm(stagingDir, RM_OPTIONS);
}

interface BindingAdoptionRecord {version:1;stagingDir:string;targetDir:string;backupDir:string;hadTarget:boolean;userId?:string;runId?:string;}
export async function readDouyinBindingAdoption(stagingDir:string):Promise<BindingAdoptionRecord|null>{
 assertStagingDir(stagingDir);const filename=stagingDir+'.adoption.json';let text:string;
 try{text=await readFile(filename,'utf8');}catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT')return null;throw error;}
 const row=JSON.parse(text) as BindingAdoptionRecord;
 const parent=nodePath.dirname(nodePath.resolve(stagingDir));
 if(row.version!==1||row.stagingDir!==stagingDir||typeof row.targetDir!=='string'||nodePath.dirname(nodePath.resolve(row.targetDir))!==parent||nodePath.basename(row.targetDir).startsWith('_')||row.backupDir!==row.targetDir+'.binding-backup-'+nodePath.basename(stagingDir).slice(STAGING_PREFIX.length)||typeof row.hadTarget!=='boolean')throw new Error('绑定目录恢复记录无效，保留原文件');
 return row;
}
/** 在原绑定run和两个目录的真实宿主租约下恢复；目录路径由read校验。 */
export async function rollbackDouyinBindingAdoption(stagingDir:string):Promise<void>{
 const row=await readDouyinBindingAdoption(stagingDir);if(!row)return;
 const backup=await stat(row.backupDir).catch(()=>null),target=await stat(row.targetDir).catch(()=>null),stage=await stat(stagingDir).catch(()=>null);
 if(backup){
  if(target){if(!stage)await moveDirectory(row.targetDir,stagingDir);else await rm(row.targetDir,RM_OPTIONS);}
  await moveDirectory(row.backupDir,row.targetDir);
 }else if(!row.hadTarget&&target){if(!stage)await moveDirectory(row.targetDir,stagingDir);else await rm(row.targetDir,RM_OPTIONS);}
 else if(row.hadTarget&&!stage&&target)throw new Error('原登录态备份缺失，无法证明安全恢复，请保留目录核对');
 await rm(stagingDir+'.adoption.json',{force:true});
}
/** 登录态更新保留旧目录和恢复记录，完整DB事务成功后才能删除备份。 */
export async function prepareDouyinStagingAdoption(stagingDir:string,targetDir:string,owner?:{userId:string;runId:string}){
 assertStagingDir(stagingDir);
 if(nodePath.dirname(nodePath.resolve(stagingDir))!==nodePath.dirname(nodePath.resolve(targetDir))||nodePath.basename(targetDir).startsWith('_'))throw new Error('正式账号目录不在当前登录目录根');
 const staged=await stat(stagingDir).catch(()=>null);if(!staged?.isDirectory())throw new Error('扫码登录目录不存在');
 const backupDir=targetDir+'.binding-backup-'+nodePath.basename(stagingDir).slice(STAGING_PREFIX.length);
 if(await stat(backupDir).catch(()=>null)||await stat(stagingDir+'.adoption.json').catch(()=>null))throw new Error('上次登录态备份尚未处理，不能覆盖');
 const row:BindingAdoptionRecord={version:1,stagingDir,targetDir,backupDir,hadTarget:!!(await stat(targetDir).catch(()=>null)),...owner};
 await writeFile(stagingDir+'.adoption.json',JSON.stringify(row),{mode:0o600});let finished=false;
 const rollbackProfile=async()=>{if(finished)return;await rollbackDouyinBindingAdoption(stagingDir);finished=true;};
 try{if(row.hadTarget)await moveDirectory(targetDir,backupDir);await adoptDouyinStagingDir(stagingDir,targetDir);}
 catch(error){await rollbackProfile();throw error;}
 return {rollbackProfile,finalizeProfile:async()=>{if(finished)return;if(row.hadTarget)await rm(backupDir,RM_OPTIONS);await rm(stagingDir+'.adoption.json',{force:true});finished=true;}};
}
