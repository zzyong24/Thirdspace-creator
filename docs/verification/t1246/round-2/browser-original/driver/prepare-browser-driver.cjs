#!/usr/bin/env node
// T-1246: mechanical source-copy preparation only. Never imports/runs Playwright tests.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const cp = require('node:child_process');
const tsPath = process.argv[2];
if (!tsPath) throw new Error('Provide the already-installed TypeScript compiler file; this tool never installs dependencies.');
const ts = require(path.resolve(tsPath));
const root = path.resolve(__dirname, '../../../../../..');
const src = path.join(root, 'frontend/tests');
const dst = path.join(root, 'frontend/tests-t1246-round2-original');
if (fs.existsSync(dst)) throw new Error('Generated directory already exists. Archive/review prior snapshot; never overwrite evidence or a running suite.');
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const allFiles = d => fs.readdirSync(d, { withFileTypes:true }).flatMap(e => e.isDirectory() ? allFiles(path.join(d,e.name)) : [path.join(d,e.name)]).sort();
const first = JSON.parse(fs.readFileSync(path.join(root,'docs/verification/t1246/driver/manifest.json'),'utf8'));
const sourcePaths=first.allOriginalTestFiles.map(f=>f.file).sort();
if(sourcePaths.length!==100||new Set(sourcePaths).size!==100)throw Error('EXACT_FIRST_100_INPUTS_REQUIRED');
const additional=['e2e/settings-return.spec.ts','e2e/t1097-assisted-work-candidate-adoption.spec.ts'];
const actual=allFiles(src).map(f=>path.relative(src,f)).filter(f=>!additional.includes(f)).sort();
if(JSON.stringify(actual)!==JSON.stringify(sourcePaths))throw Error('ORIGINAL_100_INVENTORY_DRIFT_NOT_AUTHORIZED');
const sourceFiles=sourcePaths.map(f=>path.join(src,f));
const originalSpecs = sourceFiles.filter(p => path.relative(src,p).startsWith('e2e/')&&p.endsWith('.spec.ts'));
if (originalSpecs.length !== 54) throw new Error(`Expected whole original 54-file inventory, got ${originalSpecs.length}; re-review plan rather than filter tests.`);
for(const p of sourceFiles){const to=path.join(dst,path.relative(src,p));fs.mkdirSync(path.dirname(to),{recursive:true});fs.copyFileSync(p,to,fs.constants.COPYFILE_EXCL);}
const changes=[], fileRecords=[], budgets=[], unresolved=[], outputSuffixes=[];
function transform(file){
 const rel=path.relative(src,file), before=fs.readFileSync(file,'utf8');
 const ast=ts.createSourceFile(rel,before,ts.ScriptTarget.Latest,true,rel.endsWith('.tsx')?ts.ScriptKind.TSX:ts.ScriptKind.TS);
 const edits=[];let awaitDeclarations=0;let maxLiteralLoop=1;let longestOriginalTestMs=0;let observedLongestTimeoutMs=rel==='e2e/settings.spec.ts'?420000:300000; // 独立observer须覆盖action120s+request120s+60s余量
 const constants=new Map();
 function value(n){
  if (!n) return null;
  if(ts.isNumericLiteral(n)) return Number(n.text);
  if(ts.isIdentifier(n)) return constants.get(n.text) ?? null;
  if(ts.isParenthesizedExpression(n)) return value(n.expression);
  if(ts.isBinaryExpression(n)){const a=value(n.left),b=value(n.right);if(a===null||b===null)return null;return ({[ts.SyntaxKind.PlusToken]:()=>a+b,[ts.SyntaxKind.MinusToken]:()=>a-b,[ts.SyntaxKind.AsteriskToken]:()=>a*b,[ts.SyntaxKind.SlashToken]:()=>a/b}[n.operatorToken.kind]??(()=>null))();}
  return null;
 }
 function scan(n){
  if(ts.isVariableDeclaration(n)&&ts.isIdentifier(n.name)&&n.initializer){const v=value(n.initializer);if(v!==null)constants.set(n.name.text,v);}
  if(ts.isAwaitExpression(n))awaitDeclarations++;
  if(ts.isCallExpression(n)&&/\.setTimeout$/.test(n.expression.getText(ast))&&/^test(?:Info)?\./.test(n.expression.getText(ast))){const v=value(n.arguments[0]);if(v!==null)longestOriginalTestMs=Math.max(longestOriginalTestMs,v);}
  if(ts.isPropertyAssignment(n)&&n.name.getText(ast)==='timeout'){const v=value(n.initializer);if(v!==null)observedLongestTimeoutMs=Math.max(observedLongestTimeoutMs,v);}
  if(ts.isForStatement(n)&&n.condition&&ts.isBinaryExpression(n.condition)){const v=value(n.condition.right);if(v!==null&&v>0&&v<=10000)maxLiteralLoop=Math.max(maxLiteralLoop,Math.ceil(v)+1);}
  if(ts.isForOfStatement(n)&&ts.isArrayLiteralExpression(n.expression))maxLiteralLoop=Math.max(maxLiteralLoop,n.expression.elements.length);
  ts.forEachChild(n,scan);
 }
 scan(ast);
 // Each file is deliberately over-budgeted: all declared await sites, including helpers,
 // with explicit loop/helper weighting, plus startup and fixture cleanup. Original
 // 24/72h budgets are preserved. This is an outer declaration, never task deadline input.
 const helpers=new Map();
 const countAwaits=node=>{let count=0;const visit=x=>{if(ts.isAwaitExpression(x))count++;ts.forEachChild(x,visit);};visit(node);return count;};
 const collect=node=>{
  if(ts.isFunctionDeclaration(node)&&node.name&&node.body)helpers.set(node.name.text,countAwaits(node.body));
  if(ts.isVariableDeclaration(node)&&ts.isIdentifier(node.name)&&node.initializer&&(ts.isArrowFunction(node.initializer)||ts.isFunctionExpression(node.initializer)))helpers.set(node.name.text,countAwaits(node.initializer.body));
  ts.forEachChild(node,collect);
 };collect(ast);
 let weightedAwaitSites=0;
 const weigh=node=>{
  if(ts.isAwaitExpression(node)){
   let weight=1;
   if(ts.isCallExpression(node.expression)&&ts.isIdentifier(node.expression.expression))weight=Math.max(1,helpers.get(node.expression.expression.text)??1);
   for(let ancestor=node.parent;ancestor;ancestor=ancestor.parent){
    if(ts.isForStatement(ancestor)&&ancestor.condition&&ts.isBinaryExpression(ancestor.condition)){const bound=value(ancestor.condition.right);if(bound!==null&&bound>0&&bound<=10000)weight*=Math.ceil(bound)+1;}
    if(ts.isForOfStatement(ancestor)&&ts.isArrayLiteralExpression(ancestor.expression))weight*=Math.max(1,ancestor.expression.elements.length);
   }
   weightedAwaitSites+=weight;
  }
  ts.forEachChild(node,weigh);
 };weigh(ast);
 // Weight only the awaits inside a literal loop and the directly-called helper's
 // await sites. Double the serial allowance for bounded polling/cleanup overlap.
 // Do not multiply unrelated awaits by an unrelated 205-row fixture seeding loop.
 const serialBudgetMs=Math.max(180000,(weightedAwaitSites+10)*observedLongestTimeoutMs*2+300000+360000);
 if(serialBudgetMs>2147483000)throw Error(`Timer range exceeds Node signed32 bound: ${rel}; review case phase budget before preparing.`);
 const effectiveTestMs=Math.max(serialBudgetMs,longestOriginalTestMs,180000);
 if(rel.startsWith('e2e/'))budgets.push({file:rel,awaitDeclarations,maxLiteralLoop,weightedAwaitSites,observedLongestTimeoutMs,longestOriginalTestMs,serialBudgetMs,effectiveTestMs,unboundedDynamicLoops:'Original deadline-bounded polling and content-dependent loops retained; runtime --list and reviewer verify complete outer coverage before execution.'});
 function edit(start,end,replacement,kind,consumer){
  const original=before.slice(start,end);if(original===replacement)return;
  if(edits.some(e=>start<e.end&&end>e.start))throw Error(`Overlapping edits ${rel}:${start}`);
  edits.push({start,end,original,replacement,kind,consumer,line:ast.getLineAndCharacterOfPosition(start).line+1,context:before.slice(Math.max(0,start-100),Math.min(before.length,end+100))});
 }
 const add=(n,replacement,kind,consumer)=>edit(n.getStart(ast),n.getEnd(),replacement,kind,consumer);
 function timeoutObject(obj,floor,consumer){
  const prop=obj.properties.find(p=>ts.isPropertyAssignment(p)&&p.name.getText(ast)==='timeout');
  if(prop)return; // explicit property visitor handles existing value, preserves long values
  const end=obj.getEnd()-1;const has=!!obj.properties.length;const trailing=has&&before.slice(obj.properties.at(-1).getEnd(),end).includes(',');
  edit(end,end,`${has&&!trailing?', ':''}timeout: ${floor}`, 'explicit-missing-timeout', consumer);
 }
 function walk(n){
  if(['visual/__setup__.ts','visual/__teardown__.ts'].includes(rel)&&ts.isCallExpression(n)&&n.expression.getText(ast)==='resolve'&&n.arguments.some(a=>ts.isStringLiteral(a)&&a.text==='__artifacts__')){
   const fingerprint=rel==='visual/__teardown__.ts'?', "baseline-fingerprint.json"':'';
   add(n,`resolve(process.env.CREATOROS_T1246_RUN_DIR!, "visual-baseline"${fingerprint})`,'evidence-output-path',rel==='visual/__setup__.ts'?'globalSetup fingerprint OUTPUT only; original17 reference INPUT preserved':'globalTeardown paired fingerprint OUTPUT read; original baseline checks preserved');
   return;
  }
  if(ts.isPropertyAssignment(n)&&n.name.getText(ast)==='timeout'){
   const obj=n.parent;
   const fixture=ts.isObjectLiteralExpression(obj)&&obj.properties.some(p=>ts.isPropertyAssignment(p)&&p.name.getText(ast)==='scope'&&/worker/.test(p.initializer.getText(ast)));
   const observer=ts.isCallExpression(obj.parent)&&/(?:waitForResponse|waitForRequest|expect\.poll)$/.test(obj.parent.expression.getText(ast));
   if(observer&&rel==='e2e/settings.spec.ts'&&obj.parent.expression.getText(ast)==='page.waitForResponse'){
    let fn=obj.parent;while(fn&&!ts.isFunctionDeclaration(fn))fn=fn.parent;
    if(fn?.name?.text==='waitForUiOperation'){
     add(n.initializer,`Math.max((${n.initializer.getText(ast)}), id === "settings.models.test" ? 420000 : 300000)`,'declared-model-test-serial-observer','原model-test handler串行action120s+put120s+test120s+settle60s；只该ID420s，其他ID300s，原更长保留');
     return;
    }
   }
   const floor=fixture?180000:observer?300000:120000,v=value(n.initializer);
   if(v===null)add(n.initializer,`Math.max((${n.initializer.getText(ast)}), ${floor})`,'declared-timeout-floor',n.parent.parent.getText(ast).slice(0,240));
   else if(v<floor)add(n.initializer,String(floor),'declared-timeout-floor',n.parent.parent.getText(ast).slice(0,240));
  }
  if(ts.isCallExpression(n)&&n.expression.getText(ast)==='resolve'&&n.arguments.length===3&&n.arguments[0].getText(ast)==='repoRoot'&&n.arguments[1].getText(ast).replace(/["']/g,'')==='orchestrator'&&n.arguments[2].getText(ast).replace(/["']/g,'')==='evidence'){
   outputSuffixes.push('orchestrator/evidence');
   add(n,'resolve(process.env.CREATOROS_T1246_RUN_DIR!, "original-output", "orchestrator", "evidence")','evidence-output-path','visible-copy writer original evidenceDir consumer');
  }
  if(ts.isPropertyAccessExpression(n)&&['process.env.CREATOROS_T1224_EVIDENCE_DIR','process.env.CREATOROS_T1070_EVIDENCE_DIR'].includes(n.getText(ast))){
   outputSuffixes.push('orchestrator/evidence');
   add(n,'resolve(process.env.CREATOROS_T1246_RUN_DIR!, "original-output", "orchestrator", "evidence")','evidence-output-path','env-based evidence writer output only');
  }
  if(ts.isStringLiteral(n)&&n.text.startsWith('../.codex-tmp/')){
   const suffix=n.text.slice(3);outputSuffixes.push(suffix);
   add(n,`(process.env.CREATOROS_T1246_RUN_DIR! + ${JSON.stringify('/original-output/'+suffix)})`,'evidence-output-path','actual screenshot historical .codex-tmp OUTPUT only');
  }
  if(ts.isStringLiteral(n)&&n.text.startsWith('../orchestrator/evidence/')){
   const suffix=n.text.slice(3);outputSuffixes.push(suffix);
   add(n,`(process.env.CREATOROS_T1246_RUN_DIR! + ${JSON.stringify('/original-output/'+suffix)})`,'evidence-output-path','afterAll visibleCopyPath writer');
  }
  if(ts.isCallExpression(n)&&ts.isPropertyAccessExpression(n.expression)){
   const text=n.expression.getText(ast), method=n.expression.name.text;
   if(method==='setTimeout'&&/^test(?:Info)?\./.test(text)&&n.arguments[0])add(n.arguments[0],`Math.max((${n.arguments[0].getText(ast)}), ${effectiveTestMs})`,'declared-test-outer-budget',text);
   if(['setDefaultTimeout','setDefaultNavigationTimeout'].includes(method)&&n.arguments[0]){
    const v=value(n.arguments[0]);if(v===null||v<120000)add(n.arguments[0],`Math.max((${n.arguments[0].getText(ast)}), 120000)`,'declared-page-timeout-floor',text);
   }
   const isApi=/\.request\.(get|post|put|patch|delete|head|fetch)$/.test(text)||/^(request|apiRequest|api)\.(get|post|put|patch|delete|head|fetch)$/.test(text);
   const isRouteFetch=/\broute\.fetch$/.test(text);
   const isScreenshot=method==='screenshot',isObserver=method==='waitForResponse'||method==='waitForRequest'||text==='expect.poll',floor=isObserver?300000:120000;
   if(isApi||isRouteFetch||isScreenshot||isObserver){
    const index=isApi||isObserver?1:0,opts=n.arguments[index];
    if(!opts){const end=n.getEnd()-1,last=n.arguments.at(-1),trailing=last&&before.slice(last.getEnd(),end).includes(',');edit(end,end,`${n.arguments.length&&!trailing?', ':''}{ timeout: ${floor} }`,'explicit-missing-timeout',text);}
    else if(ts.isObjectLiteralExpression(opts))timeoutObject(opts,floor,text);
    else if(isObserver&&ts.isIdentifier(opts)&&opts.text==='wait'&&['e2e/t1136-calendar-dialog-layout.spec.ts','e2e/t1140-picker-low-height.spec.ts','e2e/t1159-wechat-native-report.spec.ts'].includes(rel)){
     // 已逐源核真实wait声明；仅观察者调用参数加独立预算，原共享wait/interval/assert不变。
     add(opts,`{ ...wait, timeout: Math.max(wait.timeout ?? 0, 300000) }`,'declared-observer-timeout-floor',text+' original wait options preserved; observer covers action120s + HTTP120s + margin60s');
    }else unresolved.push({file:rel,line:ast.getLineAndCharacterOfPosition(opts.getStart()).line+1,consumer:text,options:opts.getText(ast),reason:'non-literal option object: requires explicit review, not hidden monkeypatch'});
   }
  }
  if(ts.isStringLiteral(n)&&/(?:^|\/)docs\/verification\/t\d+/.test(n.text)){
   if(n.text.endsWith('/user-baseline.png'))return; // real test INPUT, not evidence OUTPUT
   const suffix=n.text.slice(n.text.indexOf('docs/verification/')+'docs/verification/'.length);outputSuffixes.push(suffix);
   add(n,`(process.env.CREATOROS_T1246_RUN_DIR! + ${JSON.stringify('/original-output/'+suffix)})`,'evidence-output-path',n.parent.getText(ast).slice(0,220));
  }
  ts.forEachChild(n,walk);
 }
 walk(ast);
 // DR006只在两原T1070副本补真实输出consumer所需导入，原源不改；逆构记录精确保留。
 if(rel.includes('t1070-')&&edits.some(e=>e.kind==='evidence-output-path'&&e.replacement.includes('resolve('))){
  const nodePath=ast.statements.find(n=>ts.isImportDeclaration(n)&&ts.isStringLiteral(n.moduleSpecifier)&&n.moduleSpecifier.text==='node:path');
  if(!nodePath||!nodePath.importClause?.namedBindings||!ts.isNamedImports(nodePath.importClause.namedBindings))throw Error('DR006_EXPECTED_NAMED_PATH_IMPORT');
  const names=nodePath.importClause.namedBindings;
  if(!names.elements.some(n=>n.name.text==='resolve'))edit(names.getEnd()-1,names.getEnd()-1,', resolve','approved-output-consumer-import','DR006 generated resolve output path only');
 }
 if(rel==='helpers/test-environment.ts'){
  const old='const verificationRoot = resolve(process.cwd(), "..", "docs", "verification", "t1207");';const pos=before.indexOf(old);if(pos<0)throw Error('scenario evidence root source drift');
  edit(pos,pos+old.length,'const verificationRoot = resolve(process.env.CREATOROS_T1246_RUN_DIR!, "scenario");','evidence-output-path','automatic success/failure screenshot index');
  const importText='import { expect, test as base } from "@playwright/test";';const ip=before.indexOf(importText);if(ip<0)throw Error('shared expect import source drift');
  edit(ip,ip+importText.length,'import { expect as baseExpect, test as base } from "@playwright/test";\nconst expect = baseExpect.configure({ timeout: 120000 });','declared-global-expect-timeout','explicit supported expect.configure, not monkeypatch');
  // Original auto-capture fixture uses own timeout so teardown has 180s independent of
  // the test body. Both original errors and capture errors still aggregate unchanged.
  const auto='{ auto: true },';const ap=before.indexOf(auto);if(ap<0)throw Error('capture fixture source drift');
  edit(ap,ap+auto.length,'{ auto: true, timeout: 180000 },','declared-fixture-timeout','original automatic screenshot fixture teardown');
 }
 // Explicit supported suite declaration raises defaults for files without setTimeout;
 // no hooks/body/expect/assertion/content/response/data are added or removed.
 if(rel.startsWith('e2e/')&&rel.endsWith('.spec.ts'))edit(before.length,before.length,`\n// T-1246 copied-source declaration: original assertions unchanged.\ntest.describe.configure({ timeout: ${effectiveTestMs} });\n`,'declared-default-test-outer-budget','all runtime cases in this original source file');
 edits.sort((a,b)=>a.start-b.start||a.end-b.end);
 let after=before;for(const e of [...edits].reverse())after=after.slice(0,e.start)+e.replacement+after.slice(e.end);
 // Validate byte-for-byte reconstruction of the original text using only recorded edits.
 let check=after;let shift=0;const at=[];for(const e of edits){at.push({...e,newStart:e.start+shift,newEnd:e.start+shift+e.replacement.length});shift+=e.replacement.length-(e.end-e.start);}
 for(const e of [...at].reverse())check=check.slice(0,e.newStart)+e.original+check.slice(e.newEnd);
 if(check!==before)throw Error(`Original reconstruction failed: ${rel}`);
 const parse=ts.createSourceFile(rel,after,ts.ScriptTarget.Latest,true);if(parse.parseDiagnostics.length)throw Error(`Copied-source syntax error: ${rel}`);
 fs.writeFileSync(path.join(dst,rel),after);
 const rec={file:rel,originalSha256:sha(Buffer.from(before)),generatedSha256:sha(Buffer.from(after)),originalBytes:Buffer.byteLength(before),generatedBytes:Buffer.byteLength(after),edits:edits.length,reconstruction:'original source byte-identical after removing only recorded edits'};fileRecords.push(rec);
 changes.push(...edits.map(e=>({file:rel,...e})));
}
for(const f of sourceFiles)if(/\.(ts|tsx)$/.test(f)&&(/^(e2e|helpers|fixtures)\//.test(path.relative(src,f))||['visual/__setup__.ts','visual/__teardown__.ts'].includes(path.relative(src,f))))transform(f);
const allOriginal=sourceFiles.map(f=>({file:path.relative(src,f),sha256:sha(fs.readFileSync(f))}));
const manifest={schemaVersion:1,task:'T-1246',description:'当前54原目标与批准合同校准后的170原body＋声明预算规范的隔离验收',preparedAt:new Date().toISOString(),sourceRoot:root,sourceCommit:cp.execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),candidateState:'not-frozen',firstRoundManifestSha256:sha(fs.readFileSync(path.join(root,'docs/verification/t1246/driver/manifest.json'))),firstRoundOriginalTestFiles:first.allOriginalTestFiles,excludedNewReadonlyInputs:additional,sourceTreeDirty:!!cp.execFileSync('git',['status','--porcelain','--','frontend/tests','frontend/playwright.config.ts'],{cwd:root,encoding:'utf8'}).trim(),configOriginalSha256:sha(fs.readFileSync(path.join(root,'frontend/playwright.config.ts'))),generatedTestRoot:path.relative(root,dst),originalSpecCount:originalSpecs.length,originalSpecNames:originalSpecs.map(p=>path.basename(p)),allOriginalTestFiles:allOriginal,allGeneratedTestFiles:allFiles(dst).map(f=>({file:path.relative(dst,f),sha256:sha(fs.readFileSync(f))})),transformedFiles:fileRecords,changes,budgets,outputSuffixes:[...new Set(outputSuffixes)],unresolved,policy:{requestExpectActionNavigationCaptureMinMs:120000,testHookFixtureMinMs:180000,retries:0,trace:'on',screenshot:'on',selection:'e2e project complete 54 files and all parameterized cases',assertions:'生成副本仅预算/输出/DR006已批准resolve导入变换；当前源批准合同校准单独diff保留，原170目标与body库存不删',responses:'unchanged',dataOwnership:'unchanged',modelTimeoutInputs:'unchanged',sleepsIntervals:'unchanged',taskAbsoluteDeadline:'unchanged',noRuntimeMonkeypatch:true},globalTimeout:'0 = no separate shorter suite deadline; outer runner must be uncapped or derived from frozen --list actual case sum + startup/cleanup; do not use functions exec fixed wall cap',runtimeList:null,executionStarted:false};
fs.writeFileSync(path.join(__dirname,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
const diff=cp.spawnSync('git',['diff','--no-index','--',src,dst],{encoding:'utf8',maxBuffer:64*1024*1024});if(diff.status!==0&&diff.status!==1)throw Error(diff.stderr);
fs.writeFileSync(path.join(__dirname,'changes.diff'),diff.stdout);
console.log(JSON.stringify({originalSpecCount:54,transformedFiles:fileRecords.length,edits:changes.length,unresolved,generatedTestRoot:dst,executionStarted:false},null,2));
