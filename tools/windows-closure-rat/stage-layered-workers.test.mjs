import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { stageMissingDependencies } from './stage-layered-workers.mjs';

test('按依赖图复制并复用同版本包，缺必需包仍失败', () => {
 const root=mkdtempSync(join(tmpdir(),'依赖 图-'));
 try {
  const source=join(root,'source');const dest=join(root,'vendor');mkdirSync(source);writeFileSync(join(source,'package.json'),'{}');
  for(const [name,dependencies] of [['a',{b:'1'}],['b',{}]]) {
   const dir=join(source,'node_modules',name);mkdirSync(dir,{recursive:true});
   writeFileSync(join(dir,'package.json'),JSON.stringify({name,version:'1',main:'index.js',dependencies}));writeFileSync(join(dir,'index.js'),'module.exports=1');
  }
  assert.equal(stageMissingDependencies({from:source,vendorRoot:dest,packages:['a']}).length,2);
  assert.equal(existsSync(join(dest,'a/node_modules')),false);
  assert.equal(JSON.parse(readFileSync(join(dest,'b/package.json'),'utf8')).version,'1');
  assert.equal(stageMissingDependencies({from:source,vendorRoot:dest,packages:['a']}).length,0);
  rmSync(join(dest,'a/index.js'));
  stageMissingDependencies({from:source,vendorRoot:dest,packages:['a']});
  assert.equal(existsSync(join(dest,'a/index.js')),true,'已有manifest不能掩盖缺失入口文件');
  rmSync(join(dest,'b'),{recursive:true});
  assert.deepEqual(stageMissingDependencies({from:source,vendorRoot:dest,packages:['a']}).map(p=>p.name),['b']);
  assert.throws(()=>stageMissingDependencies({from:source,vendorRoot:dest,packages:['missing']}),/Cannot find module/);
  writeFileSync(join(dest,'a/package.json'),JSON.stringify({name:'a',version:'2'}));
  assert.throws(()=>stageMissingDependencies({from:source,vendorRoot:dest,packages:['a']}),/版本不一致/);
 } finally {rmSync(root,{recursive:true,force:true});}
});
