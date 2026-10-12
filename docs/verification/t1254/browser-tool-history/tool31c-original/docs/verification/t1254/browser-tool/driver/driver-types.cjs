'use strict';
const path=require('node:path'),fs=require('node:fs'),{createRequire}=require('node:module');
const root=fs.realpathSync(process.cwd()),testRoot=fs.realpathSync(process.argv[2]);
if(path.basename(root)!=='frontend'||!testRoot.startsWith(root+path.sep)||path.basename(testRoot)!=='tests-t1254-doocs')throw Error('EXACT_OWNED_FRONTEND_DRIVER_TYPES_SCOPE');
const ts=createRequire(path.join(root,'package.json'))('typescript'),file=path.join(testRoot,'doocs-public.spec.ts');
const options={target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,moduleResolution:ts.ModuleResolutionKind.Node10,strict:true,noEmit:true,incremental:false,skipLibCheck:true,esModuleInterop:true,types:['node'],typeRoots:[path.join(root,'node_modules/@types')]};
const diagnostics=ts.getPreEmitDiagnostics(ts.createProgram([file],options)).map(d=>({file:d.file?.fileName,code:d.code,message:ts.flattenDiagnosticMessageText(d.messageText,'\n')}));
process.stdout.write(JSON.stringify({kind:'proper-semantic-owned-driver-only',compilerVersion:ts.version,diagnostics,frontendGlobalTypesNotClaimed:true,noOutputEmission:true})+'\n');if(diagnostics.length)process.exitCode=1;
