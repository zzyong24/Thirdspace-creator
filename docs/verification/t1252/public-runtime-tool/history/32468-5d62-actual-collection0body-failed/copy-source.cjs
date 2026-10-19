'use strict';
const path=require('node:path'),crypto=require('node:crypto');
const hash=s=>crypto.createHash('sha256').update(s).digest('hex');
module.exports=function copySource(ts,source,originalPath){
 const sf=ts.createSourceFile(originalPath,source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TS);if(sf.parseDiagnostics.length)throw Error('PRIVATE_SOURCE_PARSE_FAILED');
 const edits=[];function add(node,to,reason){edits.push({start:node.getStart(sf),end:node.end,from:source.slice(node.getStart(sf),node.end),to,reason});}
 function walk(node){
  let literal;if(ts.isImportDeclaration(node))literal=node.moduleSpecifier;
  else if(ts.isCallExpression(node)&&node.expression.kind===ts.SyntaxKind.ImportKeyword&&node.arguments.length===1)literal=node.arguments[0];
  if(literal&&ts.isStringLiteralLike(literal)&&literal.text.startsWith('.'))add(literal,JSON.stringify(path.resolve(path.dirname(originalPath),literal.text)),'private-copy relative import points to exact bound original consumer');
  ts.forEachChild(node,walk);
 }walk(sf);
 const originalTitle='真实Rust journal→正式装配→公共对账：pause撞已提交写，原call结算后resume不重复写';let originalCall;
 function cases(node){if(ts.isCallExpression(node)&&node.arguments.some(a=>ts.isStringLiteralLike(a)&&a.text===originalTitle))originalCall=node;ts.forEachChild(node,cases);}cases(sf);
 if(!originalCall||originalCall.arguments.length!==3||!ts.isNumericLiteral(originalCall.arguments[2])||Number(originalCall.arguments[2].text)!==60000)throw Error('EXACT_ORIGINAL_NATIVE_CASE_60000_REQUIRED');
 add(originalCall.arguments[2],'80040000','derived original8 CLI/native/setup/cleanup case observer; original task deadline60000 is unchanged');
 const callback=originalCall.arguments[1];let waits=0,timers=0;
 function budgets(node){if(ts.isCallExpression(node)&&node.expression.getText(sf)==='setTimeout'&&node.arguments.length===2&&ts.isNumericLiteral(node.arguments[1])&&Number(node.arguments[1].text)===60000){add(node.arguments[1],'80160000','fixture done observation: full original case80040000+positive close120000');timers++;}
  if(ts.isPropertyAssignment(node)&&node.name.getText(sf)==='timeout'&&ts.isNumericLiteral(node.initializer)&&Number(node.initializer.text)===10000){add(node.initializer,'120000','positive finite original ready/automatic observation min120000');waits++;}
  ts.forEachChild(node,budgets);
 }budgets(callback);if(waits!==2||timers!==1)throw Error('EXACT_ORIGINAL_WAIT_CONSUMERS_REQUIRED');
 edits.sort((a,b)=>a.start-b.start);if(edits.some((e,i)=>i&&edits[i-1].end>e.start))throw Error('OVERLAPPING_PRIVATE_SOURCE_EDITS');
 let output=source;for(const e of [...edits].reverse())output=output.slice(0,e.start)+e.to+output.slice(e.end);
 let delta=0;const resulting=edits.map(e=>{const result={...e,outputStart:e.start+delta,outputEnd:e.start+delta+e.to.length};delta+=e.to.length-e.from.length;return result;});
 let inverse=output;for(const e of [...resulting].reverse()){if(inverse.slice(e.outputStart,e.outputEnd)!==e.to)throw Error('PRIVATE_INVERSE_CONSUMER_MISMATCH');inverse=inverse.slice(0,e.outputStart)+e.from+inverse.slice(e.outputEnd);}
 if(inverse!==source)throw Error('PRIVATE_EXACT_INVERSE_FAILED');
 return {source:output,proof:{candidateSha256:hash(source),generatedSha256:hash(output),inverseSha256:hash(inverse),inverseEqualsCandidate:true,unit:'UTF16 offsets and ms',edits:resulting,originalNativeBodyMs:80040000,originalNativeTaskDeadlineMs:60000}};
};
