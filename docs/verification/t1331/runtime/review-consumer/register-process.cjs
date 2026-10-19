'use strict';
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process');
module.exports=function(root,role){
 const runId=process.env.T1331_REVIEW_RUN_ID;if(!runId)throw Error('T1331_REVIEW_RUN_NONCE_MISSING');
 const raw=cp.execFileSync('/bin/ps',['-p',String(process.pid),'-o','pgid=,lstart=,comm='],{encoding:'utf8'}).trim(),match=raw.match(/^(\d+)\s+(.+)$/);
 if(!match)throw Error('T1331_REVIEW_PROCESS_IDENTITY_MISSING');
 fs.appendFileSync(path.join(root,'owned-processes.ndjson'),JSON.stringify({runId,role,pid:process.pid,pgid:Number(match[1]),identity:match[2]})+'\n');
};
