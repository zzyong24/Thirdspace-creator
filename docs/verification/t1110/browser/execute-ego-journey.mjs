// Gate候选入口：root先冻结源码/明确同空间测试Page并启动影子服务；不创建或claim空间。
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
if(!process.env.T1110_EGO_SERVER_STATE||!process.env.T1110_EGO_PAGE_LABEL)throw Error('缺少root明确提供的隔离server state/同空间Page；不能制造浏览器通过');
const here=dirname(fileURLToPath(import.meta.url));
// Ego nodejs运行在其服务进程，shell自定义环境变量不传入该执行环境；只在脚本字面量中传入这两个QA参数。
const configuration={serverFile:process.env.T1110_EGO_SERVER_STATE,label:process.env.T1110_EGO_PAGE_LABEL};
const input=`const __t1110RootConfiguration=${JSON.stringify(configuration)};\n`+readFileSync(join(here,'run-ego-journey.mjs'),'utf8');
const result=execFileSync('ego-browser',['nodejs'],{input,env:process.env,encoding:'utf8',timeout:7200000,maxBuffer:64*1024*1024});
process.stdout.write(result);
