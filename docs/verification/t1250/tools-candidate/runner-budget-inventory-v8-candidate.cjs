'use strict';
// SEMANTIC_BOUNDARY_ALLOW: 只读测试声明计算完整时间预算，不解释内容、不替换断言、不执行测试源码。
module.exports=function inventory(ts,files,read,phase){
 const DEFAULT_BODY=1800000,DEFAULT_HOOK=3000000,MIN=120000;
 const unwrap=node=>{while(node&&(ts.isAsExpression(node)||ts.isParenthesizedExpression(node)||ts.isNonNullExpression(node)))node=node.expression;return node;};
 const number=node=>{node=unwrap(node);if(node&&ts.isNumericLiteral(node))return Number(node.text);throw Error('UNRESOLVED_EXPLICIT_TIMEOUT');};
 const safe=(n,label,min=0)=>{if(!Number.isSafeInteger(n)||n<min)throw Error('INVALID_STATIC_BUDGET:'+label);return n;};
 const records=[];
 // 本runner在child前清除全部CREATOROS_*；只解释这一明确事实和当前平台，未知资格不作豁免。
 const knownCondition=(node,declarations=new Map(),seen=new Set())=>{
  node=unwrap(node);if(!node)return {known:false};
  if(ts.isStringLiteralLike(node))return {known:true,value:node.text};
  if(node.kind===ts.SyntaxKind.TrueKeyword)return {known:true,value:true};if(node.kind===ts.SyntaxKind.FalseKeyword)return {known:true,value:false};
  if(node.getText()==='process.platform')return {known:true,value:process.platform};
  if(ts.isPropertyAccessExpression(node)&&node.expression.getText()==='process.env'&&node.name.text.startsWith('CREATOROS_')&&!['CREATOROS_APP_DATA_DIR','CREATOROS_DB_DIR','CREATOROS_MEDIA_ROOT','CREATOROS_BROWSER_POOL_DIR','CREATOROS_WORKBENCH_ROOT','CREATOROS_DATABASE_BACKUP_DIR','CREATOROS_DOUYIN_AUTH_DIR','CREATOROS_WEB_AUTH_DIR'].includes(node.name.text))return {known:true,value:undefined};
  if(ts.isIdentifier(node)&&declarations.has(node.text)&&!seen.has(node.text)){const next=new Set(seen);next.add(node.text);return knownCondition(declarations.get(node.text),declarations,next);}
  if(ts.isPrefixUnaryExpression(node)&&node.operator===ts.SyntaxKind.ExclamationToken){const x=knownCondition(node.operand,declarations,seen);return x.known?{known:true,value:!x.value}:{known:false};}
  if(ts.isBinaryExpression(node)){const a=knownCondition(node.left,declarations,seen);if(a.known&&node.operatorToken.kind===ts.SyntaxKind.AmpersandAmpersandToken&&!a.value)return {known:true,value:a.value};if(a.known&&node.operatorToken.kind===ts.SyntaxKind.BarBarToken&&a.value)return {known:true,value:a.value};const b=knownCondition(node.right,declarations,seen);if(!a.known||!b.known)return {known:false};switch(node.operatorToken.kind){case ts.SyntaxKind.BarBarToken:return {known:true,value:a.value||b.value};case ts.SyntaxKind.AmpersandAmpersandToken:return {known:true,value:a.value&&b.value};case ts.SyntaxKind.EqualsEqualsEqualsToken:return {known:true,value:a.value===b.value};case ts.SyntaxKind.ExclamationEqualsEqualsToken:return {known:true,value:a.value!==b.value};}}
  return {known:false};
 };
 for(const file of files){
  const sf=ts.createSourceFile(file,read(file),ts.ScriptTarget.Latest,true),aliases=new Set(['it','test']),aliasInitializers=new Map(),declarations=new Map(),cases=[],hooks=[];
  function testAlias(node){node=unwrap(node);if(!node)return false;if(ts.isIdentifier(node))return aliases.has(node.text);if(ts.isPropertyAccessExpression(node))return testAlias(node.expression);if(ts.isConditionalExpression(node))return testAlias(node.whenTrue)&&testAlias(node.whenFalse);if(ts.isBinaryExpression(node))return testAlias(node.right);return false;}
  function collect(n){if(ts.isVariableDeclaration(n)&&ts.isIdentifier(n.name)&&n.initializer){if(declarations.has(n.name.text))declarations.set(n.name.text,null);else declarations.set(n.name.text,n.initializer);}ts.forEachChild(n,collect);}collect(sf);
  function discover(n){if(ts.isVariableDeclaration(n)&&ts.isIdentifier(n.name)&&testAlias(n.initializer)){aliases.add(n.name.text);aliasInitializers.set(n.name.text,n.initializer);}ts.forEachChild(n,discover);}discover(sf);
  function kind(node,seen=new Set()){node=unwrap(node);if(!node)return;if(ts.isIdentifier(node)&&aliases.has(node.text)){if(aliasInitializers.has(node.text)){if(seen.has(node.text))throw Error('CYCLIC_TEST_ALIAS:'+file);const next=new Set(seen);next.add(node.text);return kind(aliasInitializers.get(node.text),next);}return {type:'test',multiplier:1,qualificationKnown:true,disabledByKnownQualification:false};}
   if(ts.isConditionalExpression(node)){const condition=knownCondition(node.condition,declarations);if(!condition.known)throw Error('UNKNOWN_TEST_QUALIFICATION:'+file+':'+node.condition.getText(sf));const selected=kind(condition.value?node.whenTrue:node.whenFalse,seen);if(!selected)throw Error('INVALID_QUALIFIED_TEST_ALIAS:'+file);return {...selected,qualificationSource:node.condition.getText(sf),qualificationKnown:true};}
   if(ts.isPropertyAccessExpression(node)){const base=kind(node.expression,seen);return base&&['skip','only','todo','concurrent','sequential'].includes(node.name.text)?{...base,qualificationKnown:true,disabledByKnownQualification:base.disabledByKnownQualification===true||node.name.text==='skip'||node.name.text==='todo'}:undefined;}
   if(ts.isCallExpression(node)&&ts.isPropertyAccessExpression(node.expression)){
    const base=kind(node.expression.expression,seen);if(!base)return;
    const method=node.expression.name.text;
    if(method==='skipIf'||method==='runIf'){const condition=knownCondition(node.arguments[0],declarations);if(!condition.known)throw Error('UNKNOWN_TEST_QUALIFICATION:'+file+':'+node.arguments[0]?.getText(sf));return {...base,qualificationSource:node.arguments[0]?.getText(sf),qualificationKnown:condition.known,disabledByKnownQualification:base.disabledByKnownQualification===true||(method==='skipIf'?Boolean(condition.value):!condition.value)};}
    if(method==='each'){const array=unwrap(node.arguments[0]);if(!array||!ts.isArrayLiteralExpression(array)||array.elements.some(ts.isSpreadElement))throw Error('UNRESOLVED_EACH_TABLE:'+file);return {...base,multiplier:safe(array.elements.length,'each',1)};}
   }
  }
  const regex=title=>new RegExp(title.replace(/[.*+?^${}()|[\]\\]/g,'\\$&').replace(/%[#sdifjo]/g,'.*')+'$');
  function walk(n){if(ts.isCallExpression(n)){
    const found=kind(n.expression);
    if(found&&n.arguments[0]&&(ts.isStringLiteralLike(n.arguments[0]))){
     let explicitMs=null;const third=n.arguments[2];if(third){if(ts.isObjectLiteralExpression(third)){const timeout=third.properties.find(p=>ts.isPropertyAssignment(p)&&p.name.getText(sf)==='timeout');if(timeout)explicitMs=number(timeout.initializer);}else explicitMs=number(third);}
     const title=n.arguments[0].text,selected=phase==='regression'||title.includes('T1250');
     if(selected)cases.push({disabledByKnownQualification:found.disabledByKnownQualification===true,qualificationSource:found.qualificationSource??null,qualificationKnown:found.qualificationKnown??false,title,titleRegex:regex(title).source,multiplicity:found.multiplier,explicitBodyMs:explicitMs,effectiveBodyMs:Math.max(DEFAULT_BODY,explicitMs??0),line:sf.getLineAndCharacterOfPosition(n.getStart(sf)).line+1});
    }
    const name=n.expression.getText(sf);if(['beforeAll','afterAll','beforeEach','afterEach'].includes(name)){const explicitMs=n.arguments[1]?number(n.arguments[1]):null;hooks.push({name,explicitMs,effectiveMs:Math.max(DEFAULT_HOOK,explicitMs??0),line:sf.getLineAndCharacterOfPosition(n.getStart(sf)).line+1});}
   }ts.forEachChild(n,walk);
  }walk(sf);
  if(!cases.length)throw Error('STATIC_CASES_MISSING:'+file);
  const count=cases.reduce((sum,c)=>sum+c.multiplicity,0),perCaseHookMs=Math.max(DEFAULT_HOOK*2,DEFAULT_HOOK+hooks.filter(h=>/Each$/.test(h.name)).reduce((sum,h)=>sum+h.effectiveMs,0)),allHooksMs=Math.max(DEFAULT_HOOK*2,hooks.filter(h=>/All$/.test(h.name)).reduce((sum,h)=>sum+h.effectiveMs,0));
  const serialCasesMs=cases.reduce((sum,c)=>sum+c.multiplicity*(c.effectiveBodyMs+perCaseHookMs),0);
  records.push({file,cases,hooks,declaredCaseCount:count,runnableCaseCount:cases.filter(c=>!c.disabledByKnownQualification).reduce((sum,c)=>sum+c.multiplicity,0),originalQualifiedSkipCount:cases.filter(c=>c.disabledByKnownQualification).reduce((sum,c)=>sum+c.multiplicity,0),perCaseHookMs,allHooksMs,serialCasesMs,shortExplicitDeclarations:cases.filter(c=>c.explicitBodyMs!==null&&c.explicitBodyMs<MIN)});
 }
 const staticChildMs=safe(records.reduce((sum,f)=>sum+f.serialCasesMs+f.allHooksMs,0)+240000+480000,'child',MIN);
 const collectMs=1800000,prepareMs=120000,eachProcessTerminationReserveMs=2160000,afterSourceReceiptMs=720000;
 const outerMs=safe(prepareMs+collectMs+eachProcessTerminationReserveMs+staticChildMs+eachProcessTerminationReserveMs+afterSourceReceiptMs,'outer',MIN);
 if(staticChildMs>2147483647)throw Error('CHILD_TIMER_RANGE_EXCEEDED');
 return {records,staticCaseCount:records.reduce((sum,f)=>sum+f.declaredCaseCount,0),runnableCaseCount:records.reduce((sum,f)=>sum+f.runnableCaseCount,0),originalQualifiedSkipCount:records.reduce((sum,f)=>sum+f.originalQualifiedSkipCount,0),staticChildMs,collectMs,prepareMs,eachProcessTerminationReserveMs,afterSourceReceiptMs,outerMs,defaultBodyMs:DEFAULT_BODY,defaultHookMs:DEFAULT_HOOK,poolStartTeardownMs:240000,childCleanupReportMs:480000,helperLifecycleSourceFacts:{identityPsCount:3,eachPsMs:180000,normalInitialAndFinalSnapshots:2,maxSignalSnapshots:2,termKillEachGraceMs:180000,lastPollingSnapshotOvershootEachMs:180000,pollIntervalEachMs:100,worstNormalLifecycleMs:1980200,allocatedLifecycleMs:2160000},shortExplicitDeclarations:records.flatMap(f=>f.shortExplicitDeclarations.map(c=>({file:f.file,...c})))};
};
