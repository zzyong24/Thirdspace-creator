'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),cp=require('node:child_process');
const hash=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const inventory=p=>fs.readdirSync(p,{withFileTypes:true}).flatMap(x=>x.isDirectory()?inventory(path.join(p,x.name)):[path.join(p,x.name)]).sort();
function verify(manifest,{runtime=false}={}){
 const errors=[];const root=fs.realpathSync(manifest.sourceRoot);
 if(cp.execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim()!==manifest.candidate)errors.push('candidate HEAD drift');
 for(const f of manifest.productFiles??[])if(f.absent?fs.existsSync(path.join(root,f.path)):hash(path.join(root,f.path))!==f.sha256)errors.push('product '+f.path);
 for(const f of manifest.sourceFiles??[])if(hash(path.join(root,f.path))!==f.sha256)errors.push('test/driver '+f.path);
 if(runtime){const own=fs.realpathSync(manifest.runtimeRoot);for(const f of manifest.productFiles??[])if(f.absent?fs.existsSync(path.join(own,f.path)):hash(path.join(own,f.path))!==f.sha256)errors.push('runtime product '+f.path);for(const f of manifest.workerBundles??[]){const p=fs.realpathSync(path.join(own,f.path));if(!p.startsWith(own+path.sep)||hash(p)!==f.sha256)errors.push('Worker '+f.path);}for(const l of manifest.workspaceLinks??[]){const p=fs.realpathSync(path.join(own,l.path));if(p!==path.join(own,l.target)||!p.startsWith(own+path.sep))errors.push('workspace link '+l.path);}for(const f of manifest.runtimeTests??[])if(hash(path.join(own,f.path))!==f.sha256)errors.push('runtime tests '+f.path);}
 if(errors.length)throw Error(JSON.stringify(errors));return {errors,phase:runtime?'runtime':'source',at:new Date().toISOString()};
}
module.exports={hash,inventory,verify};
if(require.main===module){const m=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));process.stdout.write(JSON.stringify(verify(m,{runtime:process.argv.includes('--runtime')}))+'\n');}
