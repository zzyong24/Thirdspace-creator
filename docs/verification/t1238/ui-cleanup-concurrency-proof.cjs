// 执行实际测试器的清理块，使用临时真实文件验证启动期间和就绪后的并发编辑。
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const source=fs.readFileSync(path.join(__dirname,'run-ui-journey.cjs'),'utf8');
const start=source.indexOf('  for(const item of metadata){');const end=source.indexOf('  fs.closeSync(log);',start);
assert(start>=0&&end>start);const cleanup=new Function('fs','metadata','isolatedDistDir',source.slice(start,end));
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'t1238-cleanup-concurrency-'));const isolated='.next/creatoros-t1238-settings-proof';
try{
 for(const timing of ['before-ready','after-ready']){
  const file=path.join(dir,timing+'-next-env.d.ts');const before='import "./.next/dev/types/routes.d.ts";\n';
  const generated='import "./'+isolated+'/types/routes.d.ts";\n'+(timing==='before-ready'?'// concurrent edit retained\n':'');
  fs.writeFileSync(file,generated+(timing==='after-ready'?'// concurrent edit retained\n':''));
  cleanup(fs,[{file,before,generated}],isolated);
  assert.equal(fs.readFileSync(file,'utf8'),before+'// concurrent edit retained\n');
  const previous={include:['**/*.ts']};
  const modified={include:['**/*.ts',isolated+'/types/**/*.ts'],compilerOptions:{strict:true}};
  const configGenerated=JSON.stringify(timing==='before-ready'?modified:{include:modified.include});
  const actual=path.join(dir,'tsconfig.json');fs.writeFileSync(actual,JSON.stringify(modified));cleanup(fs,[{file:actual,before:JSON.stringify(previous),generated:configGenerated}],isolated);
  assert.deepEqual(JSON.parse(fs.readFileSync(actual,'utf8')),{include:['**/*.ts'],compilerOptions:{strict:true}});
  console.log(timing+': next-env concurrent edit and tsconfig field retained; owned paths removed');
 }
 console.log('实际清理块 sha256='+crypto.createHash('sha256').update(source.slice(start,end)).digest('hex'));
}finally{fs.rmSync(dir,{recursive:true,force:true});}
