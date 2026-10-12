import {afterEach,describe,expect,it,vi} from 'vitest';
import {mkdtemp,rm} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';
import * as context from '../src/context';
import {DispatchClient} from '../src/dispatch';
import {endpointInputSchema} from '../src/tools';import {ENDPOINTS} from '@creatoros/contract';
const dirs:string[]=[];afterEach(async()=>{await Promise.all(dirs.map(d=>rm(d,{recursive:true,force:true})));dirs.length=0});
describe('独立组上下文',()=>{
 it('保存默认组与默认真实账号互不覆盖',async()=>{const d=await mkdtemp(join(tmpdir(),'group-context-'));dirs.push(d);const p=join(d,'context.json');await context.writeDefaultAccountId('acct-real',p);await context.writeDefaultGroupId('grp-real',p);expect(await context.readDefaultAccountId(p)).toBe('acct-real');expect(await context.readDefaultGroupId(p)).toBe('grp-real');await context.writeDefaultAccountId('acct-real2',p);expect(await context.readDefaultGroupId(p)).toBe('grp-real')});
 it('HTTP组头独立于平台账号头，空组不会伪造accountId',async()=>{const fetchImpl=vi.fn(async(_input:RequestInfo|URL,_init?:RequestInit)=>new Response(JSON.stringify({data:[],meta:{}}),{status:200}));const client=new DispatchClient({baseUrl:'http://localhost',fetchImpl:fetchImpl as typeof fetch});await client.dispatch('projects.list',{}, {groupId:'grp-real'});expect(fetchImpl.mock.calls[0]?.[1]?.headers).toMatchObject({'x-group-id':'grp-real'});expect(fetchImpl.mock.calls[0]?.[1]?.headers).not.toHaveProperty('x-account-id');await client.dispatch('projects.list',{}, {groupId:'grp-real',accountId:'acct-real'});expect(fetchImpl.mock.calls[1]?.[1]?.headers).toMatchObject({'x-group-id':'grp-real','x-account-id':'acct-real'})});
 it('MCP工具提供独立groupId上下文',()=>{const schema=endpointInputSchema(ENDPOINTS.listProjects) as any;expect(schema.properties._creatoros.properties.groupId).toEqual({type:'string',minLength:1})});
});
