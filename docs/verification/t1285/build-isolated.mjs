// 标准production build使用独立临时数据/媒体/登录态目录，不读写用户业务目录。
import {mkdtempSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {spawn} from 'node:child_process';
const root=mkdtempSync(join(tmpdir(),'creatoros-t1285-final-build-'));
writeFileSync(resolve('docs/verification/t1285/final-build-binding.json'),JSON.stringify({root,startedAt:new Date().toISOString(),command:'pnpm --dir frontend build'},null,2));
const child=spawn('pnpm',['--dir','frontend','build'],{stdio:'inherit',env:{...process.env,DATABASE_URL:'',PGLITE_DATA_DIR:join(root,'pglite'),CREATOROS_MEDIA_ROOT:join(root,'media'),CREATOROS_DOUYIN_AUTH_DIR:join(root,'auth-douyin'),CREATOROS_WEB_AUTH_DIR:join(root,'auth-web'),CREATOROS_DISABLE_SCHEDULER:'1',CREATOROS_DEV_MODE:'1'}});
process.on('SIGINT',()=>child.kill('SIGINT'));process.on('SIGTERM',()=>child.kill('SIGTERM'));
child.on('exit',(code,signal)=>{writeFileSync(resolve('docs/verification/t1285/final-build-result.json'),JSON.stringify({root,completedAt:new Date().toISOString(),exitCode:code,signal},null,2));process.exitCode=code??1;});
