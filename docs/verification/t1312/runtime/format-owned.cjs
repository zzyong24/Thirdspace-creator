const fs=require('fs'),path=require('path'),crypto=require('crypto'),ts=require(path.resolve('backend/node_modules/typescript')),prettier=require(path.resolve('node_modules/.pnpm/prettier@3.9.5/node_modules/prettier'));
const sha=s=>crypto.createHash('sha256').update(s).digest('hex');
function ast(s){function node(n){const children=[];ts.forEachChild(n,c=>{children.push(node(c));});return {kind:n.kind,...((ts.isLiteralExpression(n)||ts.isTemplateLiteralToken(n))&&typeof n.text==='string'?{text:n.text}:{}),...(typeof n.escapedText==='string'?{identifier:n.escapedText}:{}),...(n.isTypeOnly===true?{isTypeOnly:true}:{}),children};}return JSON.stringify(node(ts.createSourceFile('source.ts',s,ts.ScriptTarget.Latest,true,ts.ScriptKind.TS)));}
const options={parser:'typescript',printWidth:100,tabWidth:2,semi:true,singleQuote:false};
async function statement(s,indent){const f=(await prettier.format(s,options)).trimEnd();return f.split('\n').map((line,i)=>(i?' '.repeat(indent):'')+line).join('\n');}
async function property(s,indent){const f=await prettier.format('const holder = {'+s+'};',options),tree=ts.createSourceFile('fragment.ts',f,ts.ScriptTarget.Latest,true),p=tree.statements[0].declarationList.declarations[0].initializer.properties[0];return p.getText(tree).split('\n').map((line,i)=>i?' '.repeat(indent)+line.slice(2):line).join('\n');}
function name(n){return n.name&&ts.isIdentifier(n.name)?n.name.text:ts.isVariableStatement(n)?n.declarationList.declarations[0].name.getText():'';}
async function transform(file,s){
 if(file.endsWith('/default-rubric.ts'))return prettier.format(s,options);
 const tree=ts.createSourceFile(file,s,ts.ScriptTarget.Latest,true),edits=[];
 function add(n,kind='statement'){edits.push({start:n.getStart(tree),end:n.end,kind,indent:n.getStart(tree)-s.lastIndexOf('\n',n.getStart(tree))-1});}
 if(file.endsWith('/calibration.repository.ts')){
  for(const n of tree.statements){if(ts.isInterfaceDeclaration(n)&&n.name.text==='CalibrationRepository')for(const member of n.members.slice(0,4))add(member,'interface-member');}
  const build=tree.statements.find(n=>ts.isFunctionDeclaration(n)&&name(n)==='buildRepository');
  const wanted=new Set(['ctx','ordinaryCtx','identity','scoped','defaultWorkspaceWrite','preserveInsertedNullGroup','defaultAccess','defaultRoot','validateDefaultVersion','defaultVersion','defaultCurrent','parentIdentity','writeParent','withDefaultParent']);
  for(const n of build.body.statements){if(wanted.has(name(n)))add(n);if(ts.isFunctionDeclaration(n)&&['getRubricRow','getRubricVersionRow'].includes(name(n)))add(n.body.statements[0]);}
  const returned=build.body.statements.find(n=>ts.isReturnStatement(n)).expression;
  const props=new Set(['getDefaultRubric','ensureDefaultRubric','getDefaultOrOwnedRubricVersion','withWrite','withVersionWrite','withRubricWrite','withPredictionWrite','withSuggestionWrite','createPrediction']);
  for(const p of returned.properties){if(props.has(name(p)))add(p,'property');else if(name(p)==='countRubricVersions')add(p.body.statements[0]);else if(name(p)==='insertRubricVersion'){
    function find(n){if(ts.isIfStatement(n)&&n.expression.getText(tree).startsWith('mode'))add(n);else ts.forEachChild(n,find);}find(p);
  }}
 }else if(file.endsWith('/calibration.service.ts')){
  function visit(n){if(ts.isMethodDeclaration(n)&&['getDefaultRubricVersion','ensureDefaultRubric','createRuleSuggestion'].includes(name(n)))add(n,'property');else ts.forEachChild(n,visit);}visit(tree);
 }else if(file.endsWith('/calibration-positioning-adoption.service.ts')){
  function visit(n){if(ts.isVariableStatement(n)&&name(n)==='actualLegacy')add(n);else if(ts.isExpressionStatement(n)&&n.getText(tree).startsWith('await ports.createDraftPrediction'))add(n);else ts.forEachChild(n,visit);}visit(tree);
 }
 for(const e of edits.sort((a,b)=>b.start-a.start)){const source=s.slice(e.start,e.end);let f;if(e.kind==='property')f=await property(source,e.indent);else if(e.kind==='interface-member'){const full=await prettier.format('interface Fragment {'+source+'}',options),parsed=ts.createSourceFile('fragment.ts',full,ts.ScriptTarget.Latest,true),member=parsed.statements[0].members[0];f=member.getText(parsed).split('\n').map((line,i)=>i?' '.repeat(e.indent)+line.slice(2):line).join('\n');}else f=await statement(source,e.indent);s=s.slice(0,e.start)+f+s.slice(e.end);}
 if(file.endsWith('/calibration.repository.ts'))s=s.replace('function buildRepository(db:Db,deps:RepoDeps,defaultRootId?:string):CalibrationRepository{','function buildRepository(\n  db: Db,\n  deps: RepoDeps,\n  defaultRootId?: string,\n): CalibrationRepository {').replace(' return buildRepository(db,deps);','  return buildRepository(db, deps);').replace('  context?:RequestContext;','  context?: RequestContext;');
 return s;
}
(async()=>{
 const files=['backend/src/modules/calibration/default-rubric.ts','backend/src/modules/calibration/calibration.repository.ts','backend/src/modules/calibration/calibration.service.ts','backend/src/modules/ai/calibration-positioning-adoption.service.ts'];
 const results=[];
 for(const file of files){const before=fs.readFileSync(file,'utf8'),after=await transform(file,before),beforeAst=sha(ast(before)),afterAst=sha(ast(after));if(beforeAst!==afterAst)throw Error('AST不等，禁止写入 '+file);results.push({file,before,after,beforeSha256:sha(before),afterSha256:sha(after),beforeAstSha256:beforeAst,afterAstSha256:afterAst,astEqual:true});}
 for(const r of results)fs.writeFileSync(r.file,r.after);
 fs.writeFileSync('docs/verification/t1312/runtime/FORMAT_ONLY.json',JSON.stringify({method:'TypeScript完整有序AST kind/identifier/literal/isTypeOnly递归序列，去position/trivia；全部四源先核等后写入',files:results.map(({before,after,...record})=>record)},null,2)+'\n');
})().catch(e=>{console.error(e);process.exitCode=1;});
