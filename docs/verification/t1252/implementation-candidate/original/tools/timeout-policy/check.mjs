#!/usr/bin/env node
// 执行超时的静态防复发门；间隔/TTL/测试deadline不算业务等待。不能代替公共调用链回归。
import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';import {execFileSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
const ts=createRequire(new URL('../../frontend/package.json',import.meta.url))('typescript');
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const MIN=120000;
const excluded=/^(docs|output|outputs|tmp|\.codegraph)\/|(?:^|\/)(?:node_modules|target|dist|build|vendor|fixtures|__fixtures__|tests|__tests__|testdata)\/|\.(?:test|spec|fixture)\.[^.]+$|_tests\.rs$|(?:vitest|playwright)\.config\./;
const sha=text=>createHash('sha256').update(text).digest('hex');
// SEMANTIC_BOUNDARY_ALLOW: 仅识别逐字独评的关闭动画，不选择内容或放宽未知timer；源/节点任一变化即不匹配。
const closedUiTimers=new Map([
 ['frontend/public/reference-editors/kuaitu/js/index.770609ce.js',{source:'a95f1a410d9e534c33900f53439da21d22f42eebcd982c5e52cc04ea0fcc576c',nodes:new Set(['2e135c9dc8ff87581d65d00852be3de0685eb251f14e55b6021cd78f6f65dbe3','b28181fd33ac47ef063cc1616a2ea25474c5841a62ac9105c3ee25b2e26007ff','88411360cf29cc0d5fd49d3de98ebb51aa079a4ac5593a2ae542b42474da06f9'])}],
 ['frontend/public/reference-editors/kuaitu/native/native.js',{source:'f67b3668caee708e44cf22b50181ebd1a74ee602c2872a9d46e3acc7a5e975a2',nodes:new Set(['268f7983612c3d61a69ef7a61919b4a921cc1d82632d2c25b77efb8ac0486e79','2f93b85b15d17ffa5fc516513ca215acec12b4473425c685571e9aaa9d8fbf62','3673d09622d337dcc74b094314c3b1080a96796da1e1f2756afab77638c8d555'])}],
]);
export function inspectSource(source,filename='source.ts'){
 const file=ts.createSourceFile(filename,source,ts.ScriptTarget.Latest,true,filename.endsWith('x')?ts.ScriptKind.TSX:ts.ScriptKind.TS);
 const errors=[],scopes=new Map(),nodeScopes=new Map();
 const newScope=(node,parent,kind)=>{const scope={parent,kind,bindings:new Map()};scopes.set(node,scope);return scope;};
 function bindName(scope,name,value){if(ts.isIdentifier(name))scope.bindings.set(name.text,value);else if(ts.isObjectBindingPattern(name)||ts.isArrayBindingPattern(name))for(const item of name.elements)if(ts.isBindingElement(item))bindName(scope,item.name,undefined);}
 function collect(node,scope){
  if(node===file)scope=newScope(node,undefined,'function');
  else if(ts.isFunctionLike(node)){
   if(ts.isFunctionDeclaration(node)&&node.name)bindName(scope,node.name,undefined);
   scope=newScope(node,scope,'function');
   if(ts.isFunctionExpression(node)&&node.name)bindName(scope,node.name,undefined);
   for(const parameter of node.parameters??[])bindName(scope,parameter.name,undefined);
  }else if(ts.isBlock(node)||ts.isCatchClause(node)||ts.isForStatement(node)||ts.isForInStatement(node)||ts.isForOfStatement(node)||ts.isCaseBlock(node)){scope=newScope(node,scope,'block');if(ts.isCatchClause(node)&&node.variableDeclaration)bindName(scope,node.variableDeclaration.name,undefined);}
  nodeScopes.set(node,scope);
  if(ts.isVariableDeclaration(node)){
   let target=scope;const list=node.parent;
   if(ts.isVariableDeclarationList(list)&&!(list.flags&ts.NodeFlags.BlockScoped))while(target.parent&&target.kind!=='function')target=target.parent;
   bindName(target,node.name,node.initializer);
  }
  if(ts.isImportClause(node)){if(node.name)bindName(scope,node.name,undefined);}
  if(ts.isImportSpecifier(node)||ts.isNamespaceImport(node)||ts.isClassDeclaration(node)&&node.name)bindName(scope,node.name,undefined);
  ts.forEachChild(node,child=>collect(child,scope));
 }collect(file);
 function binding(node,name){for(let scope=nodeScopes.get(node);scope;scope=scope.parent)if(scope.bindings.has(name))return {found:true,value:scope.bindings.get(name)};return {found:false};}
 function numeric(node,seen=new Set()){
  if(!node)return undefined;
  if(ts.isNumericLiteral(node))return Number(node.text);
  if(ts.isParenthesizedExpression(node)||ts.isAsExpression(node)||ts.isNonNullExpression(node))return numeric(node.expression,seen);
  if(ts.isIdentifier(node)){
   const found=binding(node,node.text);
   if(!found.found&&node.text==='MIN_EXECUTION_TIMEOUT_MS')return MIN;
   if(!found.found&&node.text==='TIMEOUT_COMPLETION_GRACE_MS')return 10000;
   if(!found.value||seen.has(found.value))return undefined;
   return numeric(found.value,new Set([...seen,found.value]));
  }
  if(ts.isPrefixUnaryExpression(node)){const value=numeric(node.operand,seen);return value===undefined?undefined:node.operator===ts.SyntaxKind.MinusToken?-value:value;}
  if(ts.isBinaryExpression(node)){
   const a=numeric(node.left,seen),b=numeric(node.right,seen);
   if([ts.SyntaxKind.QuestionQuestionToken,ts.SyntaxKind.BarBarToken].includes(node.operatorToken.kind))return a??b;
   if(a===undefined||b===undefined)return undefined;
   switch(node.operatorToken.kind){case ts.SyntaxKind.AsteriskToken:return a*b;case ts.SyntaxKind.PlusToken:return a+b;case ts.SyntaxKind.MinusToken:return a-b;case ts.SyntaxKind.SlashToken:return a/b;}
  }
  if(ts.isConditionalExpression(node)){const a=numeric(node.whenTrue,seen),b=numeric(node.whenFalse,seen);return a!==undefined&&b!==undefined?Math.min(a,b):undefined;}
  if(ts.isCallExpression(node)){
   const name=node.expression.getText(file);
   if(name.endsWith('executionTimeoutMs'))return Math.max(MIN,numeric(node.arguments[0],seen)??MIN);
   if(name.endsWith('completionWaitMs'))return MIN+10000;
   const values=node.arguments.map(arg=>numeric(arg,seen));
   if(name==='Math.max'){
    const known=values.filter(value=>value!==undefined);if(known.some(value=>value>=MIN))return Math.max(...known);
    if(values.every(value=>value!==undefined))return Math.max(...values);
   }
   if(name==='Math.min'&&values.every(value=>value!==undefined))return Math.min(...values);
  }
  return undefined;
 }
 const add=(node,value,kind)=>{if(value!==undefined&&value>0&&value<MIN){const line=file.getLineAndCharacterOfPosition(node.getStart(file)).line+1;errors.push({file:filename,line,kind,valueMs:value,source:node.getText(file)});}};
 const frozenUi=closedUiTimers.get(filename),frozenUiMatches=frozenUi?.source===sha(source);
 function idleSchedulingOption(node){
  const options=node.parent,call=options?.parent;if(!ts.isObjectLiteralExpression(options)||!ts.isCallExpression(call)||call.arguments[1]!==options)return false;
  const expression=call.expression;
  if(ts.isIdentifier(expression))return expression.text==='requestIdleCallback'&&!binding(expression,expression.text).found;
  return ts.isPropertyAccessExpression(expression)&&expression.name.text==='requestIdleCallback'&&ts.isIdentifier(expression.expression)&&['window','globalThis'].includes(expression.expression.text)&&!binding(expression.expression,expression.expression.text).found;
 }
 function walk(node){
  if(ts.isPropertyAssignment(node)){
   const key=node.name.getText(file).replace(/^['"]|['"]$/g,'');
   if(['timeout','timeoutMs','deadlineMs'].includes(key)&&!idleSchedulingOption(node))add(node,numeric(node.initializer),key);
  }
  if(ts.isCallExpression(node)){
   const name=node.expression.getText(file),leaf=name.split('.').at(-1);
   if(name==='AbortSignal.timeout'||['setDefaultTimeout','setDefaultNavigationTimeout'].includes(leaf))add(node,numeric(node.arguments[0]),leaf);
   if(leaf==='setTimeout'){
    if(frozenUiMatches&&frozenUi.nodes.has(sha(node.getText(file))))return;
    const callback=node.arguments[0]?.getText(file)??'';
    // 确认有拒绝/中止/终止效果的timer，排除轮询与sleep的resolve timer。
    if(/\b(?:reject|abort|kill|terminate|fail|destroy)\s*\(/.test(callback))add(node,numeric(node.arguments[1]),'abort/reject/kill timer');
    else if(node.arguments[0]&&ts.isNumericLiteral(node.arguments[0]))add(node,numeric(node.arguments[0]),'request timer');
   }
  }
  ts.forEachChild(node,walk);
 }walk(file);return errors;
}
function main(){
 const paths=execFileSync('git',['ls-files','-z'],{cwd:root,encoding:'utf8',maxBuffer:32*1024*1024,timeout:120000}).split('\0').filter(Boolean);
 const failures=[];let scanned=0;
 for(const rel of paths){
  if(excluded.test(rel)||!fs.existsSync(path.join(root,rel)))continue;
  const source=fs.readFileSync(path.join(root,rel),'utf8');
  if(/\.(?:ts|tsx|js|jsx|mjs|cjs)$/.test(rel)){scanned++;failures.push(...inspectSource(source,rel));}
  else if(/\.(?:rs|py|ps1|yml|yaml|toml)$/.test(rel)){
   scanned++;source.split(/\r?\n/).forEach((line,index)=>{
    const secs=line.match(/\.timeout\(Duration::from_secs\((\d+)\)\)\)|\btimeout\s*=\s*(\d+(?:\.\d+)?)\b|\btimeout:\s*(\d+)s\b/);
    if(secs){const value=Number(secs[1]??secs[2]??secs[3])*1000;if(value>0&&value<MIN)failures.push({file:rel,line:index+1,kind:'原生/脚本执行预算',valueMs:value,source:line.trim()});}
   });
  }
 }
 console.log(JSON.stringify({ok:failures.length===0,minimumExecutionMs:MIN,scannedFiles:scanned,failures,limits:'静态已知数值及默认回归；动态调用链、库默认、绝对deadline与观察终态由聚焦测试和逐条清单核对'},null,2));
 if(failures.length)process.exitCode=1;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main();
