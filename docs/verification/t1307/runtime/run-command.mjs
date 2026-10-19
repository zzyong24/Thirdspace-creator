import fs from 'node:fs';import {spawn} from 'node:child_process';import path from 'node:path';
const [label,command,...args]=process.argv.slice(2);if(!/^[a-z0-9-]+$/.test(label??'')||!command)throw Error('invalid command');
const base=path.dirname(new URL(import.meta.url).pathname),startedAt=new Date().toISOString(),out=fs.createWriteStream(path.join(base,label+'.log'));let error;
const child=spawn(command,args,{cwd:process.cwd(),env:{...process.env,T1307_EVIDENCE_RUN:label},stdio:['ignore','pipe','pipe']});
child.stdout.on('data',v=>{out.write(v);process.stdout.write(v)});child.stderr.on('data',v=>{out.write(v);process.stderr.write(v)});child.on('error',e=>{error=String(e)});
child.on('close',(code,signal)=>{const result={command,args,startedAt,finishedAt:new Date().toISOString(),exitCode:code,signal,error};out.end();fs.writeFileSync(path.join(base,label+'-exit.json'),JSON.stringify(result,null,2)+'\n');process.exitCode=code??1;});
