'use strict';const assert=require('node:assert/strict'),{identity,ownedChild,fullBudget,outerFor}=require('./launch.cjs');
const p={pid:1,uid:501,birth:'original-parent'},e={pid:2,ppid:1,uid:501,birth:'original-child'};
const rows=[['valid',e,e,p,p,true],['child reused',e,{...e,birth:'reused'},p,p,false],['parent reused',e,e,p,{...p,birth:'reused'},false],['missing parent',e,e,p,null,false],['uid',e,{...e,uid:500},p,p,false],['ppid',e,{...e,ppid:3},p,p,false],['unregistered',null,e,p,p,false],['foreign parent uid',e,e,{...p,uid:500},{...p,uid:500},false]];
for(const [name,...args] of rows){const expected=args.pop();assert.equal(ownedChild(...args),expected,name);}
for(const n of [undefined,NaN,Infinity,0,-1,1.5,301])assert.throws(()=>fullBudget(n));assert.equal(fullBudget(1),5400000);assert.equal(fullBudget(300),543600000);assert.equal(outerFor('install'),4680000);assert.equal(outerFor('checks'),556020000);assert.equal(identity(p,{...p,birth:'different'}),false);
console.log(JSON.stringify({scope:'pure Node no ps/signal/HTTP/install/build',positiveIdentity:1,negativeOwnership:7,invalidActualCountsRejected:7,derivedBudgetAndOuterAssertions:4}));
