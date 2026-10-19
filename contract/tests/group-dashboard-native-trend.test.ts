import {expect,it} from 'vitest';
import {ENDPOINTS} from '../src';
import {WORKSPACE_OPERATION_SCOPES} from '../src/workspace-operation-scope';
import {getCliOperationPolicy} from '../src/cli-policy';
import {REQUEST_OPERATION_IDS} from '../src/observability';
it('T1347独立趋势只读且组隔离，真实0与未知不混',()=>{
 const endpoint=ENDPOINTS.getGroupTrend;expect(endpoint).toMatchObject({id:'pages.groupTrend.get',method:'GET',path:'/groups/:groupId/trend'});
 expect(WORKSPACE_OPERATION_SCOPES[endpoint.id]).toBe('group');expect(getCliOperationPolicy(endpoint.id)?.effect).toBe('read');expect(REQUEST_OPERATION_IDS).toContain(endpoint.id);
 const data={groupId:'g',platform:'wechatVideo',accountId:'a',startDate:'2026-10-01',endDate:'2026-10-02',trend:[{label:'2026-10-01',value:0},{label:'2026-10-02',value:null}],performanceTrend:{mode:'daily',unit:'次',valueLabel:'播放量',reason:null,accountId:'a',observedAt:'2026-10-03T00:00:00Z',reportIds:['report']}};
 expect(endpoint.response.parse(data).trend.map(p=>p.value)).toEqual([0,null]);expect(endpoint.response.safeParse({...data,trend:[{label:'2026-10-01',value:-1}]}).success).toBe(false);
});
