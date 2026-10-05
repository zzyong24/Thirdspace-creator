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

const STAGING_PREFIX = "_staging-";
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
 * - 首选 fs.rename(原子、同设备快),EXDEV(跨设备/跨卷)回退 cp -r + rm。
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
  await rm(targetDir, { recursive: true, force: true });
  await mkdir(nodePath.dirname(targetDir), { recursive: true });
  try {
    await rename(stagingDir, targetDir);
  } catch (err) {
    // 跨设备(EXDEV)rename 不支持 → copy+rm 回退;其余错误原样抛(诚实失败)。
    if ((err as NodeJS.ErrnoException)?.code !== "EXDEV") throw err;
    await cp(stagingDir, targetDir, { recursive: true });
    await rm(stagingDir, { recursive: true, force: true });
  }
}

/** 丢弃 staging 登录态(失败路径清理)。幂等:目录不存在也安静通过(force)。 */
export async function discardDouyinStagingDir(stagingDir: string): Promise<void> {
  assertStagingDir(stagingDir);
  await rm(stagingDir, { recursive: true, force: true });
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
  if(target){if(!stage)await rename(row.targetDir,stagingDir);else await rm(row.targetDir,{recursive:true,force:true});}
  await rename(row.backupDir,row.targetDir);
 }else if(!row.hadTarget&&target){if(!stage)await rename(row.targetDir,stagingDir);else await rm(row.targetDir,{recursive:true,force:true});}
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
 try{if(row.hadTarget)await rename(targetDir,backupDir);await adoptDouyinStagingDir(stagingDir,targetDir);}
 catch(error){await rollbackProfile();throw error;}
 return {rollbackProfile,finalizeProfile:async()=>{if(finished)return;if(row.hadTarget)await rm(backupDir,{recursive:true,force:true});await rm(stagingDir+'.adoption.json',{force:true});finished=true;}};
}
