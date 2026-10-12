'use strict';
const assert=require('node:assert/strict'),{matchApprovedRename}=require('./rename-match.cjs'),proof=require('./EXACT_52_APPROVED_GIT_RENAME_PROJECTIONS.json'),pairs=proof.pairs;
assert.equal(pairs.length,52);let positive=0,negative=0;
function yes(r){assert.equal(matchApprovedRename(r,pairs),true);positive++;}function no(r){assert.equal(matchApprovedRename(r,pairs),false);negative++;}
for(let i=0;i<pairs.length;i++){const p=pairs[i],other=pairs[(i+1)%pairs.length],r={status:p.status,file:p.file,source:p.source};yes(r);no({...r,source:other.source});no({...r,file:other.file});no({...r,status:'C '});no({...r,status:'RC'});no({...r,source:'unapproved/source.js'});no({...r,file:'unapproved/target.js'});no({...r,source:'backend/src/application/generation/work-review-root.test.ts'});no({...r,source:p.file});}
for(const r of [null,{}, {status:'R ',file:1,source:'x'},{status:'R ',file:'x',source:1},{status:' R',file:pairs[0].file,source:pairs[0].source}])no(r);
console.log(JSON.stringify({pureMatcherOnly:true,positive,negative,all52ActualPinnedPairs:true,wrongSourceWrongTargetCopyUnknownNonDeletedRejected:true,noAuditNoGitNoFilesystemVerificationNoServices:true}));
