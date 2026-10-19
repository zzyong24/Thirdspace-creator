import base from './playwright.t1369.config';
const servers=base.webServer as Array<Record<string,unknown>>;
const config={...base,projects:[{name:'t1369-normal',use:{viewport:{width:1366,height:900}}}],webServer:[{...servers[0],command:'pnpm --dir ../backend exec node --import tsx ../docs/verification/t1355/harness/binding-fixture-server.mts'},{...servers[1],command:'node ../docs/verification/t1369/production/server.mjs',url:undefined,port:Number(process.env.T1356_APP_PORT??41387),wait:{stdout:/T1369_PRODUCTION_READY/},timeout:7_800_000}]};
export default config;
