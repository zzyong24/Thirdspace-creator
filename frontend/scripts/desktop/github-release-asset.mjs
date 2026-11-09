// 构建期同源资源恢复；不参与用户任务或运行时凭据。
import {spawnSync} from 'node:child_process';
import {mkdirSync,readFileSync,statSync,renameSync,rmSync} from 'node:fs';
import {dirname} from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
const ATTEMPT_MS=240_000,TOTAL_MS=900_000,MIN_ATTEMPT_MS=120_000;
class DownloadError extends Error {constructor(message,transient=false){super(message);this.transient=transient;}}
const hash=(bytes,algorithm)=>createHash(algorithm).update(bytes).digest('hex');
/** SEMANTIC_BOUNDARY_ALLOW: 固定资源ID/来源、状态码、字节数与摘要的机械校验。 */
export function downloadGithubReleaseAsset({repository,tag,asset,outputPath,expectedSize,expectedSha1,expectedSha256,token=process.env.GH_TOKEN??process.env.GITHUB_TOKEN},{spawn=spawnSync,now=Date.now,logger=console.log,cleanup=rmSync}={}){
 if(!/^[\w.-]+\/[\w.-]+$/.test(repository)||!tag||!asset||/[\r\n/\\]/.test(asset))throw new DownloadError('构建资源标识不合法');
 const primary=`https://github.com/${repository}/releases/download/${encodeURIComponent(tag)}/${encodeURIComponent(asset)}`;
 const metadataUrl=`https://api.github.com/repos/${repository}/releases/tags/${encodeURIComponent(tag)}`;
 const stamp=randomUUID(),stage=`${outputPath}.download-${stamp}.part`,metadataPath=`${outputPath}.metadata-${stamp}.json`,started=now();
 mkdirSync(dirname(outputPath),{recursive:true});
 const request=(url,path,accept)=>{
  const remaining=TOTAL_MS-(now()-started);if(remaining<MIN_ATTEMPT_MS)throw new DownloadError('构建资源下载总预算已用尽');
  const budget=Math.min(ATTEMPT_MS,remaining);let config='';
  if(accept)config+=`header = "Accept: ${accept}"\n`;
  // curl读取stdin配置，避免凭据进入进程argv；不使用location-trusted，跨主机跳转不转发授权。
  if(accept&&token){if(!/^[A-Za-z0-9_.-]+$/.test(token))throw new DownloadError('构建凭据格式无效');config+=`header = "Authorization: Bearer ${token}"\n`;}
  const args=['--config','-','--silent','--show-error','--fail','--location','--proto','=https','--proto-redir','=https','--connect-timeout','120','--max-time',String(Math.floor(budget/1000)),'--retry','1','--retry-delay','2','--retry-all-errors','--retry-max-time',String(Math.floor(budget/1000)),'-o',path,'--write-out','%{http_code}',url];
  const result=spawn('curl',args,{input:config,encoding:'utf8',timeout:budget,shell:false,maxBuffer:1024*1024});
  const http=Number(String(result.stdout??'').trim());
  if(result.status!==0||!Number.isInteger(http)||http<200||http>=300){const transient=http===408||http===429||(http>=500&&http<600)||(!http&&result.status!==22);throw new DownloadError(`官方构建资源下载未完成（HTTP ${http||0}，curl ${result.status??'终止'}）`,transient);}
  if(!statSync(path).isFile()||statSync(path).size===0)throw new DownloadError('官方构建资源为空');
 };
 const verify=(path,metadata)=>{
  const bytes=readFileSync(path);
  for(const size of [expectedSize,metadata?.size])if(size!==undefined&&bytes.length!==size)throw new DownloadError('构建资源长度不匹配');
  if(expectedSha1&&hash(bytes,'sha1')!==expectedSha1.toLowerCase())throw new DownloadError('构建资源SHA1不匹配');
  if(expectedSha256&&hash(bytes,'sha256')!==expectedSha256.toLowerCase())throw new DownloadError('构建资源SHA256不匹配');
  if(metadata?.digest!=null){if(!/^sha256:[a-f0-9]{64}$/i.test(metadata.digest)||'sha256:'+hash(bytes,'sha256')!==metadata.digest.toLowerCase())throw new DownloadError('官方资源摘要不匹配');}
 };
 try{
  let source='release';
  try{request(primary,stage);}
  catch(error){
   if(!(error instanceof DownloadError)||!error.transient)throw error;
   rmSync(stage,{force:true});logger('[build-assets] 主地址暂时不可用，核对同一官方资源接口。');
   request(metadataUrl,metadataPath,'application/vnd.github+json');
   if(statSync(metadataPath).size>2*1024*1024)throw new DownloadError('官方资源描述过大');
   const release=JSON.parse(readFileSync(metadataPath,'utf8')),matches=Array.isArray(release.assets)?release.assets.filter(item=>item.name===asset):[];
   if(release.tag_name!==tag||matches.length!==1)throw new DownloadError('官方资源版本或名称不匹配');
   const item=matches[0];
   if(!Number.isSafeInteger(item.id)||item.id<=0||!Number.isSafeInteger(item.size)||item.size<=0||item.url!==`https://api.github.com/repos/${repository}/releases/assets/${item.id}`||item.browser_download_url!==primary)throw new DownloadError('官方资源来源或长度无效');
   if(expectedSize!==undefined&&item.size!==expectedSize)throw new DownloadError('官方资源长度与固定值不匹配');
   request(item.url,stage,'application/octet-stream');verify(stage,item);source='api';
  }
  verify(stage);renameSync(stage,outputPath);return {path:outputPath,source};
 }finally{for(const file of [stage,metadataPath]){try{cleanup(file,{force:true});}catch{logger('[build-assets] 临时文件暂未清理，已验证资源仍可使用。');}}}
}
