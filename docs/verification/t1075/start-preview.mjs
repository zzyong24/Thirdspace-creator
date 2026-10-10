import {mkdtempSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {spawn} from 'node:child_process';
const root=mkdtempSync(join(tmpdir(),'creatoros-t1075-walk-'));
writeFileSync('/tmp/creatoros-t1075-preview-root',root);
const child=spawn('pnpm',['dev','--hostname','127.0.0.1','--port','3197'],{cwd:resolve('frontend'),stdio:'inherit',env:{...process.env,DATABASE_URL:'',PGLITE_DATA_DIR:join(root,'pglite'),CREATOROS_WORKSPACES_ROOT:join(root,'workspaces'),CREATOROS_MEDIA_ROOT:join(root,'media'),CREATOROS_DOUYIN_AUTH_DIR:join(root,'douyin'),CREATOROS_WEB_AUTH_DIR:join(root,'web'),CREATOROS_BROWSER_POOL_DIR:join(root,'pool'),CREATOROS_DISABLE_SCHEDULER:'1',CREATOROS_DISABLE_BACKGROUND_DRIVERS:'1',CREATOROS_DEV_MODE:'1',CREATOROS_STORAGE:'local',S3_BUCKET:'',S3_ACCESS_KEY_ID:'',S3_SECRET_ACCESS_KEY:'',NO_PROXY:'127.0.0.1,localhost',no_proxy:'127.0.0.1,localhost'}});
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>child.kill(signal));child.on('exit',code=>process.exit(code??1));
