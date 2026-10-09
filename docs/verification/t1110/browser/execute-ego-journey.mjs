// Gate候选入口：root先冻结源码/明确同空间测试Page并启动影子服务；不创建或claim空间。
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
if(!process.env.T1110_EGO_SERVER_STATE||!process.env.T1110_EGO_PAGE_LABEL)throw Error('缺少root明确提供的隔离server state/同空间Page；不能制造浏览器通过');
const here=dirname(fileURLToPath(import.meta.url));
const result=execFileSync('ego-browser',['nodejs'],{input:readFileSync(join(here,'run-ego-journey.mjs'),'utf8'),env:{...process.env,T1110_EGO_SERVER_STATE:process.env.T1110_EGO_SERVER_STATE,T1110_EGO_PAGE_LABEL:process.env.T1110_EGO_PAGE_LABEL},encoding:'utf8',timeout:7200000,maxBuffer:64*1024*1024});
process.stdout.write(result);
