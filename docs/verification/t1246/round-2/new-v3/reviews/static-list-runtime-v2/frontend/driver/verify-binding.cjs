'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),cp=require('node:child_process');
const hash=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const inventory=p=>fs.readdirSync(p,{withFileTypes:true}).flatMap(x=>x.isDirectory()?inventory(path.join(p,x.name)):[path.join(p,x.name)]).sort();
const git=(root,args)=>cp.execFileSync('git',args,{cwd:root,encoding:'utf8',timeout:120000});
const productInventory=(root,roots)=>[...new Set(git(root,['ls-files','--cached','--others','--exclude-standard','--',...roots]).trim().split('\n').filter(Boolean))].sort();
function verify(manifest,{runtime=false}={}){
 const errors=[],root=fs.realpathSync(manifest.sourceRoot);
 const check=(base,files,label)=>{for(const f of files??[]){const p=path.join(base,f.path);try{if(f.absent?fs.existsSync(p):!fs.existsSync(p)||hash(p)!==f.sha256)errors.push(label+' '+f.path);}catch(e){errors.push(label+' '+f.path+': '+e.message);}}};
 const exact=(base,dir,files,label)=>{const expected=(files??[]).map(f=>f.path).sort(),actual=inventory(path.join(base,dir)).map(p=>path.relative(base,p));if(JSON.stringify(actual)!==JSON.stringify(expected))errors.push(label+' exact inventory drift');check(base,files,label);};
 if(manifest.candidate&&git(root,['rev-parse','HEAD']).trim()!==manifest.candidate)errors.push('candidate HEAD drift');
 check(root,manifest.productFiles,'product');check(root,manifest.legacy253Sources,'original253');
 if(manifest.productRoots&&JSON.stringify(productInventory(root,manifest.productRoots))!==JSON.stringify(manifest.productFiles.filter(f=>!f.absent).map(f=>f.path).sort()))errors.push('product full inventory drift');
 check(root,manifest.sourceFiles,'test/driver');check(root,manifest.additionalReadonlyTestInputs,'additional original full body');
 for(const group of manifest.exactSourceInventories??[])exact(root,group.root,group.files,'source '+group.root);
 check('/',manifest.pgTools?.map(t=>({path:t.path,sha256:t.sha256})),'PG executable');check('/',manifest.fixtureTools?.map(t=>({path:t.path,sha256:t.sha256})),'fixture executable');
 if(manifest.nodeSha256&&hash(process.execPath)!==manifest.nodeSha256)errors.push('Node executable drift');
 if(manifest.sourceManifestPath&&hash(manifest.sourceManifestPath)!==manifest.sourceManifestSha256)errors.push('reviewed source manifest drift');
 if(runtime){const own=fs.realpathSync(manifest.runtimeRoot);check(own,manifest.productFiles,'runtime product');check(own,manifest.legacy253Sources,'runtime original253');
  for(const f of manifest.workerBundles??[]){try{const p=fs.realpathSync(path.join(own,f.path));if(!p.startsWith(own+path.sep)||hash(p)!==f.sha256)errors.push('Worker '+f.path);}catch(e){errors.push('Worker missing '+f.path);}}
  for(const l of manifest.workspaceLinks??[]){try{const p=fs.realpathSync(path.join(own,l.path));if(p!==path.join(own,l.target)||!p.startsWith(own+path.sep))errors.push('workspace link '+l.path);}catch(e){errors.push('workspace link missing '+l.path);}}
  exact(own,path.relative(own,manifest.runtimeTestRoot),manifest.runtimeTests,'runtime tests');exact(own,path.relative(own,manifest.runtimeDriverRoot),manifest.runtimeDriverFiles,'runtime driver');
  for(const [p,digest,label]of [[manifest.officialExecutable,manifest.officialExecutableSha256,'official binary'],[manifest.privateExecutable,manifest.privateExecutableSha256,'private binary'],[manifest.videoFixture,manifest.videoFixtureSha256,'video fixture'],[manifest.packageReceiptPath,manifest.packageReceiptSha256,'package receipt']])if(!p||!digest||hash(p)!==digest)errors.push(label+' drift');
  if(!fs.realpathSync(manifest.privateExecutable).startsWith(own+path.sep))errors.push('private executable outside owned runtime');
 }
 if(errors.length)throw Error(JSON.stringify(errors));return {errors,phase:runtime?'runtime':'source',at:new Date().toISOString()};
}
module.exports={hash,inventory,verify,productInventory};
if(require.main===module){const m=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));process.stdout.write(JSON.stringify(verify(m,{runtime:process.argv.includes('--runtime')}))+'\n');}
