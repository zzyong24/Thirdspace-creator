const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),cp=require('node:child_process');
const e='/Users/zyongzhu/.codex/worktrees/integrated-dev-acceptance/Thirdspace-creator/docs/verification/t1246/unit-first';
const unit='/Users/zyongzhu/.codex/worktrees/integrated-unit-acceptance/Thirdspace-creator',front='/Users/zyongzhu/.codex/worktrees/integrated-frontend-unit/Thirdspace-creator';
const pkgs=['contract','ai-worker','backend','frontend'],candidate='533224f334c43cdb81a344424e420cad93784dd1';
const sha=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const receipt=p=>JSON.parse(fs.readFileSync(e+'/'+p));
const done=()=>pkgs.every(p=>['completed_exit0','completed_nonzero'].includes(receipt(p+'-exit.json').status)&&fs.existsSync(e+'/'+p+'-summary.json')&&fs.existsSync(e+'/'+p+'-typecheck-exit.json')&&['completed_exit0','completed_nonzero'].includes(receipt(p+'-typecheck-exit.json').status));
function files(dir){if(!fs.existsSync(dir))return [];return fs.readdirSync(dir,{withFileTypes:true}).flatMap(d=>d.isDirectory()?files(path.join(dir,d.name)):d.isFile()?[path.join(dir,d.name)]:[]);}
(async()=>{for(;;){try{if(done())break;}catch{}await new Promise(r=>setTimeout(r,10000));}
 const inventory=receipt('frozen-test-discovery.json');const frontend=receipt('frontend-frozen-discovery.json');
 const checks=pkgs.map(pkg=>{const root=pkg==='frontend'?front:unit;const expected=pkg==='frontend'?frontend.files:inventory.packages[pkg].files;const j=receipt(pkg+'.json'),actual=j.testResults.map(f=>path.relative(root,f.name));
  const normalized=expected.map(f=>({file:pkg==='frontend'?(f.file.startsWith('frontend/')?f.file:'frontend/'+f.file):f.file,sha256:f.sha256}));
  const expectedSet=new Set(normalized.map(f=>f.file)),actualSet=new Set(actual);
  return {package:pkg,root,actualHead:cp.execFileSync('/usr/bin/git',['rev-parse','HEAD'],{cwd:root,timeout:120000,encoding:'utf8'}).trim(),staticCandidates:normalized.length,actualResultFiles:actual.length,changedInputs:normalized.filter(f=>!fs.existsSync(path.join(root,f.file))||sha(path.join(root,f.file))!==f.sha256),missingOriginalConfig:normalized.filter(f=>!actualSet.has(f.file)).map(f=>f.file),extrasActualConfig:actual.filter(p=>!expectedSet.has(p)),notes:pkg==='contract'?'static includes original-config-excluded two src files; separate contract-extra receipt preserves original76 config scope':'actual original JSON scope, no selector/exclusion edits'};
 });
 const roots=[unit,front].map(root=>{const inv=JSON.parse(fs.readFileSync(path.join(root,'docs/verification/t1246/source-inventory-before.json'))),source=[...inv.other_changes,...inv.same_as_codex];return {root,sourceCount:source.length,source253Changed:source.filter(f=>sha(path.join(root,f.path))!==f.sha256),gitTrackedStatus:cp.execFileSync('/usr/bin/git',['status','--porcelain','--untracked-files=no'],{cwd:root,timeout:120000,encoding:'utf8'}),generatedArtifacts:[path.join(root,'ai-worker/dist'),path.join(root,'frontend/.next/types')].flatMap(d=>files(d).map(file=>({file,sha256:sha(file),size:fs.statSync(file).size})))};});
 const records=pkgs.map(p=>({package:p,test:receipt(p+'-exit.json'),summary:receipt(p+'-summary.json'),typecheck:receipt(p+'-typecheck-exit.json')}));
 const output={candidate,observedAt:new Date().toISOString(),allFirstVitestAndTypechecksActuallyClosed:true,noRepairsOrRetries:true,checks,roots,records};
 fs.writeFileSync(e+'/first-final-source-scope-check.json',JSON.stringify(output,null,2)+'\n');
 cp.execFileSync(process.execPath,['/tmp/t1246-unit/write-total-first-report.cjs'],{timeout:120000,stdio:'inherit'});
 console.log(JSON.stringify({status:'all_first_real_receipts_closed_not_pass_claim',recordFile:e+'/first-final-source-scope-check.json',summary:records.map(r=>({package:r.package,testExit:r.test.exitCode,typecheckExit:r.typecheck.exitCode,failedTests:r.summary.failedTests})),sourceChanged:roots.map(r=>({root:r.root,source253Changed:r.source253Changed.length})),scope:checks.map(c=>({package:c.package,staticCandidates:c.staticCandidates,actualResultFiles:c.actualResultFiles,changedInputs:c.changedInputs.length,missing:c.missingOriginalConfig.length,extras:c.extrasActualConfig.length}))}));
})().catch(err=>{console.error(err);process.exitCode=1;});
