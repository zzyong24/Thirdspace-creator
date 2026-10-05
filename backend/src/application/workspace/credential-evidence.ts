import {lstat} from 'node:fs/promises';
import path from 'node:path';
/** 只确认旧安装账号独立profile存在凭据文件，不读cookie内容、不启动浏览器、不声称当前仍已登录。 */
export async function hasLegacyDouyinCredentialEvidence(authorizedProfile:string):Promise<boolean>{
 for(const relative of ['Default/Network/Cookies','Default/Cookies','Network/Cookies','Cookies']){
  const row=await lstat(path.join(authorizedProfile,relative)).catch(()=>null);
  if(row?.isFile()&&row.size>0)return true;
 }
 return false;
}
