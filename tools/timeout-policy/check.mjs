#!/usr/bin/env node
// 执行超时的静态防复发门；间隔/TTL/测试deadline不算业务等待。不能代替公共调用链回归。
import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';import {execFileSync} from 'node:child_process';
import {createRequire} from 'node:module';
const ts=createRequire(new URL('../../frontend/package.json',import.meta.url))('typescript');
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const MIN=120000;
const excluded=/^(docs|output|outputs|tmp|\.codegraph)\/|(?:^|\/)(?:node_modules|target|dist|build|vendor|fixtures|__fixtures__|tests|__tests__|testdata)\/|\.(?:test|spec|fixture)\.[^.]+$|_tests\.rs$|(?:vitest|playwright)\.config\./;
export function inspectSource(source,filename='source.ts'){
 const file=ts.createSourceFile(filename,source,ts.ScriptTarget.Latest,true,filename.endsWith('x')?ts.ScriptKind.TSX:ts.ScriptKind.TS);
 const bindings=new Map(),errors=[];
 function collect(node){if(ts.isVariableDeclaration(node)&&ts.isIdentifier(node.name)&&node.initializer)bindings.set(node.name.text,node.initializer);ts.forEachChild(node,collect);}collect(file);
 function numeric(node,seen=new Set()){
  if(!node)return undefined;
  if(ts.isNumericLiteral(node))return Number(node.text);
  if(ts.isParenthesizedExpression(node)||ts.isAsExpression(node)||ts.isNonNullExpression(node))return numeric(node.expression,seen);
  if(ts.isIdentifier(node)){
   if(node.text==='MIN_EXECUTION_TIMEOUT_MS')return MIN;
   if(node.text==='TIMEOUT_COMPLETION_GRACE_MS')return 10000;
   if(seen.has(node.text))return undefined;
   return numeric(bindings.get(node.text),new Set([...seen,node.text]));
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
 function walk(node){
  if(ts.isPropertyAssignment(node)){
   const key=node.name.getText(file).replace(/^['"]|['"]$/g,'');
   if(['timeout','timeoutMs','deadlineMs'].includes(key))add(node,numeric(node.initializer),key);
  }
  if(ts.isCallExpression(node)){
   const name=node.expression.getText(file),leaf=name.split('.').at(-1);
   if(name==='AbortSignal.timeout'||['setDefaultTimeout','setDefaultNavigationTimeout'].includes(leaf))add(node,numeric(node.arguments[0]),leaf);
   if(leaf==='setTimeout'){
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
 const paths=execFileSync('git',['ls-files','-z'],{cwd:root,encoding:'utf8'}).split('\0').filter(Boolean);
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
