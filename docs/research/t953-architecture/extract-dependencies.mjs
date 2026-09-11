import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
const root=process.cwd(),out=path.join(root,'docs/research/t953-architecture');
const require=createRequire(path.join(root,'backend/package.json')),ts=require('typescript');
const packages=['frontend','backend','contract','ai-worker','mcp-server'];
const modules=fs.readdirSync('backend/src/modules').filter(n=>fs.statSync('backend/src/modules/'+n).isDirectory());
const imports=[],counts={};
const excluded=/(?:\.test\.|\.spec\.|__tests__|\/test[s]?\/|\/fixtures\/)/;
function walk(dir){return fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(path.join(dir,e.name)):/\.[cm]?[tj]sx?$/.test(e.name)?[path.join(dir,e.name)]:[]);}
for(const pkg of packages){
 const config=ts.readConfigFile(pkg+'/tsconfig.json',ts.sys.readFile);const options=ts.parseJsonConfigFileContent(config.config,ts.sys,path.resolve(pkg)).options;
 for(const file of walk(pkg+'/src').filter(f=>!excluded.test('/'+f))){
  const source=ts.createSourceFile(file,fs.readFileSync(file,'utf8'),ts.ScriptTarget.Latest,true),from=file.match(/^backend\/src\/modules\/([^/]+)/)?.[1];
  if(from)counts[from]=(counts[from]??0)+1;
  function visit(n){let spec,typeOnly=false;
   if((ts.isImportDeclaration(n)||ts.isExportDeclaration(n))&&n.moduleSpecifier&&ts.isStringLiteral(n.moduleSpecifier)){spec=n.moduleSpecifier.text;typeOnly=Boolean(n.isTypeOnly||n.importClause?.isTypeOnly);}
   else if(ts.isImportTypeNode(n)&&ts.isLiteralTypeNode(n.argument)&&ts.isStringLiteral(n.argument.literal)){spec=n.argument.literal.text;typeOnly=true;}
   else if(ts.isCallExpression(n)&&n.arguments.length===1&&ts.isStringLiteral(n.arguments[0])&&(n.expression.kind===ts.SyntaxKind.ImportKeyword||(ts.isIdentifier(n.expression)&&n.expression.text==='require')))spec=n.arguments[0].text;
   if(spec){const target=ts.resolveModuleName(spec,path.resolve(file),options,ts.sys).resolvedModule?.resolvedFileName;const rel=target?path.relative(root,fs.realpathSync(target)):null;
    if(rel&&!rel.startsWith('..')&&!rel.includes('node_modules'))imports.push({file,line:source.getLineAndCharacterOfPosition(n.getStart(source)).line+1,specifier:spec,target:rel,typeOnly,fromModule:from??null,toModule:rel.match(/^backend\/src\/modules\/([^/]+)/)?.[1]??null});
   }ts.forEachChild(n,visit);
  }visit(source);
 }
}
const by=new Map();for(const i of imports){if(!i.fromModule||!i.toModule||i.fromModule===i.toModule)continue;const key=i.fromModule+'>'+i.toModule;if(!by.has(key))by.set(key,{from:i.fromModule,to:i.toModule,evidence:[]});by.get(key).evidence.push(i);}
const result={revision:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),method:'TypeScript AST + resolveModuleName；排除测试与fixtures；静态导入/导出及字面量dynamic import；typeOnly仅标记整条type import。未展开依赖注入与动态字符串。',modules:modules.map(id=>({id,sourceFiles:counts[id]??0})),edges:[...by.values()],imports,packages:packages.map(p=>{const j=JSON.parse(fs.readFileSync(p+'/package.json'));return {path:p,name:j.name,dependencies:Object.entries(j.dependencies??{}).filter(([n])=>n.startsWith('@creatoros/'))};})};
fs.writeFileSync(path.join(out,'dependencies.json'),JSON.stringify(result,null,2));
console.log(JSON.stringify({modules:modules.length,edges:result.edges.length,imports:imports.length,fanout:modules.map(id=>[id,result.edges.filter(e=>e.from===id).length]).sort((a,b)=>b[1]-a[1])}));
