// 仅root结束这次影子服务；不关闭Ego空间/平台Page，不删除数据和证据。
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
const file=process.env.T1110_EGO_SERVER_STATE;if(!file)throw Error('须提供本次影子server state');const state=JSON.parse(readFileSync(file,'utf8'));
if(state.schema!=='t1110-ego-server/v1'||!state.root.includes('/creatoros-t1110-shadow-')||!Number.isInteger(state.serverPid))throw Error('状态文件不是本次隔离服务');
const command=execFileSync('ps',['-p',String(state.serverPid),'-o','command='],{encoding:'utf8',timeout:120000}).trim();
if(!command.includes(state.shadow)||!command.includes('pnpm'))throw Error('进程已退出或PID归属不匹配，不能停止其它服务');
process.kill(-state.serverPid,'SIGTERM');console.log('本次影子服务已发停止请求；证据及同空间浏览器由root统一收尾。');
