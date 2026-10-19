import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const tsModule=await import(process.env.CREATOROS_TEST_TYPESCRIPT_MODULE??'/tmp/t1053-native-video/source/node_modules/typescript/lib/typescript.js');
const ts=tsModule.default??tsModule;
const [input,output]=process.argv.slice(2);
assert.ok(input,'用法：check-process-globals.ts <native.js> [报告.json]');
const code=readFileSync(input,'utf8');
const ast=ts.createSourceFile(input,code,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS);
const guarded:any[]=[],unguarded:any[]=[],propertyNames:any[]=[];
const contains=(ancestor:any,node:any)=>ancestor.pos<=node.pos&&ancestor.end>=node.end;
const typeGuard=(node:any)=>/typeof\s+process\s*={2,3}\s*["']object["']/.test(node.getText(ast));
function visit(node:any){
 if(ts.isIdentifier(node)&&node.text==='process'){
  const parent=node.parent;
  if((ts.isPropertyAccessExpression(parent)&&parent.name===node)||(ts.isMethodDeclaration(parent)&&parent.name===node)||(ts.isPropertyAssignment(parent)&&parent.name===node))propertyNames.push({offset:node.getStart(ast),syntax:ts.SyntaxKind[parent.kind]});
  else{
   let safe=ts.isTypeOfExpression(parent);
   for(let ancestor=parent;!safe&&ancestor;ancestor=ancestor.parent){
    if(ts.isBinaryExpression(ancestor)&&ancestor.operatorToken.kind===ts.SyntaxKind.AmpersandAmpersandToken&&contains(ancestor.right,node)&&typeGuard(ancestor.left))safe=true;
    if(ts.isIfStatement(ancestor)&&contains(ancestor.thenStatement,node)&&typeGuard(ancestor.expression))safe=true;
   }
   (safe?guarded:unguarded).push({offset:node.getStart(ast),context:code.slice(Math.max(0,node.getStart(ast)-100),node.end+110)});
  }
 }
 ts.forEachChild(node,visit);
}
visit(ast);
const nodeEnv=(code.match(/\bprocess\.env\.NODE_ENV\b/g)??[]).length;
const report={status:nodeEnv===0&&unguarded.length===0?'PASS':'FAIL',sha256:createHash('sha256').update(code).digest('hex'),unreplacedNodeEnv:nodeEnv,guardedGlobalProcessReferences:guarded.length,unguardedGlobalProcessReferences:unguarded.length,propertyOrMethodNames:propertyNames.length,scope:'TypeScript AST检查全产物；仅typeof和同条件短路保护的Node可选分支属于安全全局引用，成员/方法名不算全局。',guarded,unguarded};
if(output)writeFileSync(output,JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({...report,guarded:undefined,unguarded:undefined},null,2));
assert.equal(nodeEnv,0);assert.equal(unguarded.length,0);
