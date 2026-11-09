import {spawnSync} from 'node:child_process';
import {existsSync,mkdirSync,mkdtempSync,readFileSync,renameSync,rmSync,copyFileSync} from 'node:fs';
import {join} from 'node:path';import {createHash,randomUUID} from 'node:crypto';
import {downloadGithubReleaseAsset} from './github-release-asset.mjs';
// 对齐锁定tauri-cli-v2.11.4的nsis/mod.rs；不替换bundler、不变更版本或摘要。
export const NSIS_REQUIRED_FILES=['makensis.exe','Bin/makensis.exe','Stubs/lzma-x86-unicode','Stubs/lzma_solid-x86-unicode','Plugins/x86-unicode/additional/nsis_tauri_utils.dll','Include/MUI2.nsh','Include/FileFunc.nsh','Include/x64.nsh','Include/nsDialogs.nsh','Include/WinMessages.nsh','Include/Win/COM.nsh','Include/Win/Propkey.nsh','Include/Win/RestartManager.nsh'];
const PLUGIN_SHA1='75197fee3c6a814fe035788d1c34ead39349b860';
const defaultVerifyPlugin=path=>createHash('sha1').update(readFileSync(path)).digest('hex')===PLUGIN_SHA1;
const defaultExtract=(archive,destination)=>{const r=spawnSync(process.platform==='win32'?'tar.exe':'tar',['-xf',archive,'-C',destination],{stdio:'pipe',shell:false,timeout:240_000});if(r.status!==0)throw Error('原生ZIP解压未完成');};
/** 原NSIS目录的可选预备；任何未就绪结果交回原bundler的下载/摘要校验，不阻断旧合法构建。 */
export function prepareNsisTools({platform=process.platform,cliVersion,cacheDirectory=process.env.LOCALAPPDATA?join(process.env.LOCALAPPDATA,'tauri'):undefined}={}, {download=downloadGithubReleaseAsset,extract=defaultExtract,verifyPlugin=defaultVerifyPlugin,logger=console.log,cleanup=rmSync}={}){
 if(platform!=='win32'||cliVersion!=='2.11.4'||!cacheDirectory)return {ready:false,reason:'bundler-default'};
 const target=join(cacheDirectory,'NSIS'),plugin='Plugins/x86-unicode/additional/nsis_tauri_utils.dll';
 const ready=dir=>{try{return NSIS_REQUIRED_FILES.every(p=>existsSync(join(dir,p)))&&verifyPlugin(join(dir,plugin));}catch{return false;}};
 if(ready(target))return {ready:true,source:'existing'};
 let temp,backup,phase="准备临时目录";
 try{
  mkdirSync(cacheDirectory,{recursive:true});temp=mkdtempSync(join(cacheDirectory,'.creatoros-nsis-'));
  const archive=join(temp,'nsis.zip'),dll=join(temp,'nsis_tauri_utils.dll');
  phase="下载NSIS";download({repository:'tauri-apps/binary-releases',tag:'nsis-3.11',asset:'nsis-3.11.zip',outputPath:archive,expectedSize:2361546,expectedSha1:'ef7ff767e5cbd9edd22add3a32c9b8f4500bb10d',expectedSha256:'c7d27f780ddb6cffb4730138cd1591e841f4b7edb155856901cdf5f214394fa1'});
  phase="下载插件";download({repository:'tauri-apps/nsis-tauri-utils',tag:'nsis_tauri_utils-v0.5.3',asset:'nsis_tauri_utils.dll',outputPath:dll,expectedSha1:PLUGIN_SHA1});
  phase="解压并校验工具";extract(archive,temp);const prepared=join(temp,'nsis-3.11');mkdirSync(join(prepared,'Plugins/x86-unicode/additional'),{recursive:true});copyFileSync(dll,join(prepared,plugin));
  if(!ready(prepared))throw Error('工具文件尚未通过校验');
  if(existsSync(target)){backup=join(cacheDirectory,'.creatoros-nsis-previous-'+randomUUID());renameSync(target,backup);}
  try{renameSync(prepared,target);}catch(error){if(backup&&!existsSync(target)){renameSync(backup,target);backup=undefined;}throw error;}
  logger('[build-assets] 原NSIS工具目录已通过固定摘要与完整文件校验。');return {ready:true,source:'verified-download'};
 }catch{logger(`[build-assets] NSIS预备${phase}未就绪，交回原构建工具继续校验与下载。`);return {ready:false,reason:'bundler-default',phase};}
 finally{for(const path of [temp,backup&&ready(target)?backup:undefined])if(path){try{cleanup(path,{recursive:true,force:true});}catch{logger('[build-assets] 临时工具目录暂未清理，原构建流程继续。');}}}
}
