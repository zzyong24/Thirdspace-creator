'use strict';
// 私有内存overlay检查；不emit、不改node_modules/源码，不替代正式安装后标准tsc。
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'../../../..'),ts=require(path.join(root,'frontend/node_modules/typescript'));
const candidate=__dirname,base=path.join(root,'mcp-server');
const config=ts.readConfigFile(path.join(base,'tsconfig.json'),ts.sys.readFile);
const parsed=ts.parseJsonConfigFileContent(config.config,ts.sys,base);
parsed.options.typeRoots=[path.join(base,'node_modules/@types')];
const host=ts.createCompilerHost({...parsed.options,noEmit:true});
const originalRead=host.readFile.bind(host),originalExists=host.fileExists.bind(host);
const overlay=file=>{const rel=path.relative(root,file);const p=path.join(candidate,rel);return !rel.startsWith('..')&&fs.existsSync(p)&&fs.statSync(p).isFile()?p:file;};
host.readFile=file=>originalRead(overlay(file));host.fileExists=file=>originalExists(overlay(file));
host.resolveModuleNames=(names,containingFile)=>names.map(name=>{
 if(name==='undici')return {resolvedFileName:path.join(root,'node_modules/.pnpm/undici@7.27.2/node_modules/undici/index.d.ts'),extension:ts.Extension.Dts,isExternalLibraryImport:true};
 return ts.resolveModuleName(name,containingFile,parsed.options,host).resolvedModule;
});
const program=ts.createProgram({rootNames:parsed.fileNames,options:{...parsed.options,noEmit:true},host});
const diagnostics=ts.getPreEmitDiagnostics(program).map(d=>({file:d.file?path.relative(root,d.file.fileName):null,line:d.file&&d.start!==undefined?d.file.getLineAndCharacterOfPosition(d.start).line+1:null,code:d.code,message:ts.flattenDiagnosticMessageText(d.messageText,' ')}));
const result={scope:'private memory overlay; actual undici7.27.2 declarations; not standard production typecheck; no install/emit/sharedbuild/server',typescript:ts.version,rootNames:parsed.fileNames.length,diagnostics};fs.writeFileSync(path.join(candidate,'private-type-diagnostics.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));if(diagnostics.length)process.exitCode=1;
