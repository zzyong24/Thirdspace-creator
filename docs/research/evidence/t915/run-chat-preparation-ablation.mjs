import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
import {writeFileSync} from 'node:fs';
import path from 'node:path';
const root=process.cwd(),require=createRequire(path.join(root,'ai-worker/package.json')),{build}=require('esbuild');
const commit='438ae928',files=execFileSync('git',['diff-tree','--no-commit-id','--name-only','-r',commit],{encoding:'utf8'}).trim().split('\n').filter(p=>p.endsWith('.ts')&&!p.includes('.test.'));
const prior=new Map();
for(const file of files){try{prior.set(path.join(root,file),execFileSync('git',['show',`${commit}^:${file}`],{encoding:'utf8',stdio:['ignore','pipe','ignore']}));}catch{}}
async function run(restore){
 const result=await build({entryPoints:['backend/src/modules/ai-runtime/chat-turn-preparation.ts'],bundle:true,platform:'node',target:'node24',format:'esm',write:false,metafile:true,treeShaking:true,plugins:[{name:'controlled-chat-ablation',setup(b){
  b.onResolve({filter:/^[^./]/},args=>args.path.startsWith('@creatoros/')?undefined:{path:args.path,external:true});
  if(restore){b.onResolve({filter:/^\./},args=>{const base=path.resolve(args.resolveDir,args.path);for(const candidate of [base,base+'.ts',path.join(base,'index.ts')])if(prior.has(candidate))return {path:candidate};});b.onLoad({filter:/\.ts$/},args=>prior.has(args.path)?{contents:prior.get(args.path),loader:'ts',resolveDir:path.dirname(args.path)}:undefined);}
 }}],logLevel:'silent'});
 return {outputBytes:result.outputFiles[0].contents.length,inputModules:Object.keys(result.metafile.inputs).length,modules:Object.entries(result.metafile.outputs).flatMap(([,o])=>Object.entries(o.inputs).map(([p,v])=>({path:p,bytesInOutput:v.bytesInOutput})))};
}
const before=await run(true),after=await run(false);
const report={method:{scope:'同一工作树双构建，仅通过内存覆盖撤销聊天准备拆分提交作为对照，不改文件',ablationCommit:commit,restoredFiles:[...prior.keys()].map(p=>path.relative(root,p)),entryPoint:'backend/src/modules/ai-runtime/chat-turn-preparation.ts',treeShaking:true,platform:'node',target:'node24',format:'esm',thirdParty:'external',appExecuted:false,providerCalled:false},before,after,delta:{outputBytes:after.outputBytes-before.outputBytes,inputModules:after.inputModules-before.inputModules}};
writeFileSync('docs/research/evidence/t915/chat-preparation-ablation.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({before:before.outputBytes,after:after.outputBytes,beforeModules:before.inputModules,afterModules:after.inputModules,delta:report.delta}));
