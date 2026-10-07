import {readFile,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import ts from 'typescript';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const publicRoot=path.join(root,'frontend/public/reference-editors');
const manifest=JSON.parse(await readFile(path.join(root,'reference-editors/manifest.json'),'utf8'));
const sha=value=>createHash('sha256').update(value).digest('hex');
function ownedPath(base,name){const value=path.resolve(base,name);if(!value.startsWith(base+path.sep))throw Error(`归档路径越界：${name}`);return value;}
async function files(dir,prefix=''){const result=[];for(const item of await readdir(dir,{withFileTypes:true})){const rel=path.posix.join(prefix,item.name);if(item.isDirectory())result.push(...await files(path.join(dir,item.name),rel));else result.push(rel);}return result.sort();}
// 确定性构建边界：只检查JS语法中的生产宏，字符串/文档示例不算Node全局依赖。
function checkProductionMacro(code,name){
 const source=ts.createSourceFile(name,code,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS);
 const field=node=>ts.isPropertyAccessExpression(node)?node.name.text:ts.isElementAccessExpression(node)&&node.argumentExpression&&ts.isStringLiteral(node.argumentExpression)?node.argumentExpression.text:null;
 function visit(node){if(field(node)==='NODE_ENV'&&field(node.expression)==='env'&&ts.isIdentifier(node.expression.expression)&&node.expression.expression.text==='process')throw Error(`浏览器原生包未替换生产宏：${name}`);ts.forEachChild(node,visit);}
 visit(source);
}
const result=[];
for(const editor of ['noterelay','doocs-md','kuaitu','opencut-classic']){
 const entry=manifest[editor]?.native;if(!entry)throw Error(`原生构建清单缺失：${editor}`);
 const out=path.join(publicRoot,editor,'native');
 const actual=await files(out),expected=Object.keys(entry.bundleFiles).sort();
 if(JSON.stringify(actual)!==JSON.stringify(expected))throw Error(`原生构建文件集不一致：${editor}`);
 for(const name of expected){const data=await readFile(ownedPath(out,name));if(sha(data)!==entry.bundleFiles[name])throw Error(`原生构建摘要不一致：${editor}/${name}`);if(name.endsWith('.js'))checkProductionMacro(data.toString('utf8'),`${editor}/${name}`);}
 for(const name of ['native.js','native.css'])if(!expected.includes(name))throw Error(`原生入口缺失：${editor}/${name}`);
 const archive=await readFile(ownedPath(publicRoot,entry.sourceArchive));
 if(sha(archive)!==entry.sourceArchiveSha256)throw Error(`对应源码摘要不一致：${editor}`);
 result.push({editor,files:actual.length,sourceArchive:entry.sourceArchive,sourceArchiveSha256:entry.sourceArchiveSha256});
}
const source=await readFile(path.join(root,'contract/src/resources/noterelay-layout.ts'));
if(!source.equals(await readFile(path.join(root,'reference-editors/noterelay/web/noterelay-layout.ts'))))throw Error('NoteRelay 合同复制件漂移');
const opencut=manifest['opencut-classic'];
const opencutArchive=ownedPath(publicRoot,opencut.native.sourceArchive);
const fixedBase=await readFile(ownedPath(publicRoot,opencut.native.fixedBaseArchive));
if(sha(fixedBase)!==opencut.native.fixedBaseSha256||opencut.native.fixedBaseSha256!==opencut.sourceArchiveSha256)throw Error('OpenCut 固定重建基础归档摘要不一致');
const nativeContract=await readFile(path.join(root,'contract/src/resources/production-native-document.ts'));
const archivedNativeContract=execFileSync('tar',['-xOf',opencutArchive,'./apps/web/src/embedded/native-document-contract.ts']);
if(sha(archivedNativeContract)!==opencut.native.contractCopySha256)throw Error('OpenCut v31 合同归档摘要不一致');
if(!nativeContract.equals(archivedNativeContract))throw Error('OpenCut v31 合同归档复制件漂移');
for(const [name,expected] of [[opencut.native.patch,opencut.native.patchSha256],[opencut.native.fullReconstructionPatch,opencut.native.fullReconstructionPatchSha256]]){if(!name||!expected)throw Error('OpenCut 完整重建patch清单缺失');if(sha(await readFile(ownedPath(publicRoot,name)))!==expected)throw Error(`OpenCut 对应源码patch摘要不一致：${name}`);}
const graph=JSON.parse(await readFile(path.join(publicRoot,'opencut-classic/native/NATIVE_BUILD_GRAPH.json'),'utf8'));
if(graph.fixture!==false)throw Error('OpenCut 发布包不能是compositor fixture');
for(const module of ['src/embedded/native-controller.ts','src/embedded/native-preview.ts','src/embedded/native-document-contract.ts','src/embedded/native-operations.ts','src/services/video-cache/service.ts'])if(!graph.modules.some(item=>item.module===module))throw Error(`OpenCut 新原生消费者未进入实际生产模块图：${module}`);
console.log(JSON.stringify({passed:true,verification:'四类原生交付文件集、摘要、对应源码、生产宏语法检查、累计重建patch摘要、新原生preview实际模块图及共享合同归档复制件；不代表浏览器执行/像素验收',editors:result},null,2));
