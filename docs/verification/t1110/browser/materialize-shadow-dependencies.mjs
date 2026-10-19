// 候选：仅供隔离shadow准备器调用。此文件本轮未执行clone或Next。
import {execFileSync} from 'node:child_process';
import {mkdirSync,readdirSync,lstatSync,readlinkSync,realpathSync,readFileSync,writeFileSync,existsSync} from 'node:fs';
import {join,relative,isAbsolute,dirname,basename,resolve} from 'node:path';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
const sha=value=>createHash('sha256').update(value).digest('hex');
const caches=new Set(['.vite','.vite-temp']);
const packageDirs=['frontend','backend','contract','ai-worker'];
const within=(root,path)=>path===root||path.startsWith(root+'/');
function inventory(repo,roots,{shadow=false,originalRepo}={}) {
 const rows=[],shims=[];let files=0,links=0,bytes=0;
 for(const entry of roots){
  const walk=(path)=>{
   const s=lstatSync(path),rel=relative(repo,path);
   if(s.isSymbolicLink()){
    const target=readlinkSync(path),real=realpathSync(path);
    if(isAbsolute(target)||!within(repo,real))throw Error(`依赖链接逃出${shadow?'shadow':'source'}根：${rel}`);
    rows.push([rel,'link',target]);links++;return;
   }
   if(s.isDirectory()){for(const child of readdirSync(path).sort())walk(join(path,child));return;}
   if(!s.isFile())throw Error(`依赖含未支持的文件类型：${rel}`);
   rows.push([rel,'file',s.size,s.mode,s.mtimeMs,s.ctimeMs,s.dev,s.ino]);files++;bytes+=s.size;
   if(shadow){
    const from=join(originalRepo,rel),source=lstatSync(from);
    if(source.dev===s.dev&&source.ino===s.ino)throw Error(`不能使用共享硬链接依赖：${rel}`);
   }
   if(basename(dirname(path))==='.bin')shims.push(path);
  };walk(entry);
 }
 return {files,links,bytes,treeMetadataSha256:sha(JSON.stringify(rows)),shims};
}
export function materializeShadowDependencies({repo,shadow}) {
 if(process.platform!=='darwin')throw Error('此候选只使用本机已核实的macOS /bin/cp -cRpP；其他平台须另审');
 const source=realpathSync(repo),destination=realpathSync(shadow);
 if(within(source,destination)||!basename(dirname(destination)).startsWith('creatoros-t1110-shadow-'))throw Error('仅可写prepare-next创建的隔离临时shadow');
 const store=join(source,'node_modules/.pnpm');
 const rootMetadata=[];
 for(const name of readdirSync(join(source,'node_modules')).sort()){
  if(name==='.pnpm'||caches.has(name))continue;
  if(!['.modules.yaml','.pnpm-workspace-state-v1.json'].includes(name)||!lstatSync(join(source,'node_modules',name)).isFile())throw Error(`root node_modules结构已变化，须重新审核：${name}`);
  rootMetadata.push(join(source,'node_modules',name));
 }
 const sourceRoots=[store,...rootMetadata,...packageDirs.flatMap(dir=>readdirSync(join(source,dir,'node_modules')).filter(name=>!caches.has(name)).sort().map(name=>join(source,dir,'node_modules',name)))];
 const before=inventory(source,sourceRoots);
 const witnesses=['pnpm-lock.yaml','frontend/node_modules/next/package.json',...rootMetadata.map(path=>relative(source,path))];
 const beforeWitness=witnesses.map(path=>({path,sha256:sha(readFileSync(join(source,path)))}));
 // 五个串行cp命令，每个完整预算120000ms；不install，不hardlink，不追随symlink。
 const cloneCommands=[];
 mkdirSync(join(destination,'node_modules'),{recursive:true});
 if(existsSync(join(destination,'node_modules/.pnpm')))throw Error('shadow依赖目标已存在，禁止覆盖');
 execFileSync('/bin/cp',['-cRpP',store,join(destination,'node_modules/.pnpm')],{timeout:120000});
 cloneCommands.push({scope:'node_modules/.pnpm',timeoutMs:120000});
 for(const dir of packageDirs){
  const from=join(source,dir,'node_modules'),to=join(destination,dir,'node_modules');
  if(existsSync(to))throw Error(`shadow依赖目标已存在：${dir}`);
  mkdirSync(to,{recursive:true});
  const entries=readdirSync(from).filter(name=>!caches.has(name)).sort();
  if(!entries.length)throw Error(`缺少必要已安装依赖：${dir}`);
  execFileSync('/bin/cp',['-cRpP',...entries.map(name=>join(from,name)),to],{timeout:120000});
  cloneCommands.push({scope:`${dir}/node_modules (excluding .vite/.vite-temp)`,timeoutMs:120000});
 }
 const rebased=[];
 const rebase=path=>{
  const beforeText=readFileSync(path,'utf8');
  if(beforeText.includes('\0'))throw Error(`不能把二进制依赖当启动shim：${relative(destination,path)}`);
  let after=beforeText;
  for(const prefix of new Set([resolve(repo),source]))after=after.replaceAll(prefix,destination);
  if(after!==beforeText){writeFileSync(path,after);rebased.push({path:relative(destination,path),beforeSha256:sha(beforeText),afterSha256:sha(after)});}
 };
 for(const path of rootMetadata){const to=join(destination,relative(source,path));writeFileSync(to,readFileSync(path),{mode:lstatSync(path).mode});rebase(to);}
 const shadowRoots=sourceRoots.map(path=>join(destination,relative(source,path)));
 const initial=inventory(destination,shadowRoots,{shadow:true,originalRepo:source});
 for(const path of initial.shims)rebase(path);
 const verified=inventory(destination,shadowRoots,{shadow:true,originalRepo:source});
 for(const path of verified.shims){const text=readFileSync(path,'utf8');for(const prefix of new Set([resolve(repo),source]))if(text.includes(prefix))throw Error(`启动shim仍引用原工作树：${relative(destination,path)}`);}
 // 仅解析包位置，不加载Next/业务模块，也不启动服务。
 const nextPackage=createRequire(join(destination,'frontend/src/app/__t1110-resolution-probe.cjs')).resolve('next/package.json');
 const nextReal=realpathSync(nextPackage);
 if(!within(destination,nextReal))throw Error('Next解析仍逃出shadow根');
 if(sha(readFileSync(nextReal))!==beforeWitness.find(item=>item.path==='frontend/node_modules/next/package.json').sha256)throw Error('shadow Next package与原安装不一致');
 for(const name of packageDirs)for(const scope of ['frontend','backend','ai-worker']){
  const path=join(destination,scope,'node_modules/@creatoros',name);
  if(existsSync(path)&&realpathSync(path)!==join(destination,name))throw Error(`workspace package未指向shadow：${relative(destination,path)}`);
 }
 const after=inventory(source,sourceRoots),afterWitness=witnesses.map(path=>({path,sha256:sha(readFileSync(join(source,path)))}));
 if(before.treeMetadataSha256!==after.treeMetadataSha256||JSON.stringify(beforeWitness)!==JSON.stringify(afterWitness))throw Error('准备期间源安装依赖发生变更，不能用于固定源码验收');
 const compact=({shims,...value})=>({...value,binShimCount:shims.length});
 return {schema:'t1110-shadow-dependencies/v1',strategy:'macOS cp -cRpP; clonefile when supported, independent normal copy fallback; relative links preserved',cloneCommands,excludedRootCaches:[...caches],sourceBefore:compact(before),sourceAfter:compact(after),sourceWitnessBefore:beforeWitness,sourceWitnessAfter:afterWitness,shadow:compact(verified),nextPackage:nextReal,nextVersion:JSON.parse(readFileSync(nextReal,'utf8')).version,rebasedFiles:rebased,hardlinksSharedWithSource:false,externalResolvedSymlinks:0,noInstall:true,noProductConfigInjection:true,evidenceScope:'依赖位置/独立inode/源码保留检查；不等于Turbopack页面编译或Chrome旅程通过'};
}
