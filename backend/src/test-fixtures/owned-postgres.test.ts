import {afterEach,expect,it,vi} from 'vitest';
import {Pool} from 'pg';
import childProcess from 'node:child_process';
import {mkdtempSync,writeFileSync,mkdirSync,rmSync,realpathSync,symlinkSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomBytes} from 'node:crypto';
import {OwnedPostgresPool,assertOwnedPostgresUrl,ownedPostgresCliEnv,validateOwnedPostgresUrl,type OwnedPostgresMarker} from './owned-postgres';
vi.setConfig({testTimeout:180000,hookTimeout:180000});
const cleanups:Array<()=>void>=[];
afterEach(()=>{for(const c of cleanups.splice(0).reverse())c();vi.restoreAllMocks();vi.unstubAllEnvs();});
function marker():OwnedPostgresMarker{
 const nonce=randomBytes(16).toString('hex'),root=mkdtempSync(join(realpathSync(tmpdir()),'t1246-owned-pg-'));
 cleanups.push(()=>rmSync(root,{recursive:true,force:true}));mkdirSync(join(root,'data'));mkdirSync(join(root,'databases'));
 const m:OwnedPostgresMarker={version:1,task:'T-1246',nonce,root,dataDir:join(root,'data'),registryDir:join(root,'databases'),uid:process.getuid!(),pid:process.pid,startedUnix:1,processBirth:'not-a-postgres-birth',postgresBinary:'/does-not-exist/postgres',port:61234,adminRole:`t1246_${nonce.slice(0,12)}`,managementDatabase:'postgres'};
 writeFileSync(join(m.dataDir,'postmaster.pid'),`${m.pid}\n${m.dataDir}\n1\n61234\n\n127.0.0.1\n`);
 writeFileSync(join(root,'owner.json'),JSON.stringify(m),{mode:0o600});vi.stubEnv('CREATOROS_OWNED_PG_MARKER',join(root,'owner.json'));vi.stubEnv('CREATOROS_OWNED_PG_NONCE',nonce);return m;
}
function refused(value:string|undefined){
 const query=vi.spyOn(Pool.prototype,'query'),connect=vi.spyOn(Pool.prototype,'connect'),cli=vi.spyOn(childProcess,'execFile'),spawn=vi.spyOn(childProcess,'spawn');
 expect(()=>new OwnedPostgresPool({connectionString:value})).toThrow('T1246_ENV_NOT_OWNED_PG');
 expect(()=>assertOwnedPostgresUrl(value)).toThrow('T1246_ENV_NOT_OWNED_PG');
 expect(()=>ownedPostgresCliEnv(value??'')).toThrow('T1246_ENV_NOT_OWNED_PG');
 expect(query).not.toHaveBeenCalled();expect(connect).not.toHaveBeenCalled();expect(cli).not.toHaveBeenCalled();expect(spawn).not.toHaveBeenCalled();
 // 本路径没有 execFile(pg_dump/pg_restore) 调用端口；拒绝发生于返回 CLI env 之前。
}
it('缺 marker/nonce 时在真实 pg Pool connect/query 之前拒绝，CLI env 不产生',()=>{vi.stubEnv('CREATOROS_OWNED_PG_MARKER','');vi.stubEnv('CREATOROS_OWNED_PG_NONCE','');refused('postgresql://nobody@127.0.0.1:55422/postgres');});
it('旧 nonce 不能借用本轮根',()=>{marker();vi.stubEnv('CREATOROS_OWNED_PG_NONCE',randomBytes(16).toString('hex'));refused('postgresql://nobody@127.0.0.1:61234/postgres');});
it('marker 符号链接逃逸先拒绝且 SQL/PG CLI 零调用',()=>{const m=marker(),p=join(m.root,'link.json');symlinkSync(join(m.root,'owner.json'),p);vi.stubEnv('CREATOROS_OWNED_PG_MARKER',p);refused('postgresql://nobody@127.0.0.1:61234/postgres');});
it('PID 相同但出生时间不是本轮 postmaster 时先拒绝',()=>{marker();refused('postgresql://nobody@127.0.0.1:61234/postgres');});
it('postmaster.pid 的目录篡改先拒绝',()=>{const m=marker();writeFileSync(join(m.dataDir,'postmaster.pid'),`${m.pid}\n/foreign/user/data\n1\n61234\n\n127.0.0.1\n`);refused('postgresql://nobody@127.0.0.1:61234/postgres');});
it.each(['5432','55422'])('marker 禁止端口 %s 不连接',port=>{const m=marker();writeFileSync(join(m.root,'owner.json'),JSON.stringify({...m,port:Number(port)}));refused(`postgresql://nobody@127.0.0.1:${port}/postgres`);});
it.each(['localhost','example.test','[::1]','192.0.2.1'])('纯 URL 边界拒绝 %s；不是 PG 功能证据',host=>{const m=marker();expect(()=>validateOwnedPostgresUrl(`postgresql://${m.adminRole}@${host}:${m.port}/postgres`,m)).toThrow('T1246_ENV_NOT_OWNED_PG');});
it.each(['wrong_role','postgres'])('纯 URL 边界拒绝非本轮角色 %s',role=>{const m=marker();expect(()=>validateOwnedPostgresUrl(`postgresql://${role}@127.0.0.1:${m.port}/postgres`,m)).toThrow('T1246_ENV_NOT_OWNED_PG');});
it.each(['?host=foreign','?service=default','?sslmode=prefer','#x'])('纯 URL 边界拒绝连接覆盖参数 %s',suffix=>{const m=marker();expect(()=>validateOwnedPostgresUrl(`postgresql://${m.adminRole}@127.0.0.1:${m.port}/postgres${suffix}`,m)).toThrow('T1246_ENV_NOT_OWNED_PG');});
it('纯 URL 校验保明确管理 URL，不能由此代签真实 PG 功能',()=>{const m=marker(),url=`postgresql://${m.adminRole}@127.0.0.1:${m.port}/postgres`;expect(validateOwnedPostgresUrl(url,m).toString()).toBe(url);});
it('任意未登记用户数据库在 SQL 前拒绝',()=>{const m=marker();expect(()=>validateOwnedPostgresUrl(`postgresql://${m.adminRole}@127.0.0.1:${m.port}/real_user_database`,m)).toThrow('T1246_ENV_NOT_OWNED_PG');});
