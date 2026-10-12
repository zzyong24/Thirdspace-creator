'use strict';
const assert=require('node:assert/strict'),{exactOwned}=require('./launch.cjs');
const parent={pid:100,uid:501,birth:'parent-original'},entry={pid:101,ppid:100,uid:501,birth:'child-original'};
const rows=[['valid',entry,entry,parent,parent,true],['child reused',entry,{...entry,birth:'other'},parent,parent,false],['parent reused',entry,entry,parent,{...parent,birth:'other'},false],['child uid',entry,{...entry,uid:502},parent,parent,false],['parent uid',entry,entry,parent,{...parent,uid:502},false],['different ppid',entry,{...entry,ppid:99},parent,parent,false],['different pid',entry,{...entry,pid:102},parent,parent,false],['unregistered',null,entry,parent,parent,false],['missing child',entry,null,parent,parent,false],['missing parent',entry,entry,parent,null,false],['registered foreign uid',{...entry,uid:502},{...entry,uid:502},parent,parent,false],['no registered parent',entry,entry,null,parent,false]];
for(const [name,...args]of rows){const expected=args.pop();assert.equal(exactOwned(...args),expected,name);}
process.stdout.write(JSON.stringify({scope:'pure Node predicate only; no ps/signal/HTTP',passed:rows.length,failed:0})+'\n');
