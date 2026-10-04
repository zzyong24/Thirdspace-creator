import {afterEach,expect,it,vi} from 'vitest';
import {buildAgentSpawnOptions} from '../../vendor/acpx/src/acp/auth-env';
afterEach(()=>vi.unstubAllEnvs());
it('宿主显式子环境不继承产品密钥或日志开关',()=>{
 vi.stubEnv('CREATOROS_PRIVATE_TEST_SECRET','never-forward');
 vi.stubEnv('APP_SERVER_LOGS','never-forward');
 const options=buildAgentSpawnOptions('/tmp',undefined,undefined,{HOME:'/tmp/agent-home',PATH:'/bin'});
 expect(options.env.CREATOROS_PRIVATE_TEST_SECRET).toBeUndefined();
 expect(options.env.APP_SERVER_LOGS).toBeUndefined();
 expect(options.env.HOME).toBe('/tmp/agent-home');
});
