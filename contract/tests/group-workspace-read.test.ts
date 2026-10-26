import {expect,it,vi} from 'vitest';
import {ENDPOINTS,groupWorkspaceMeta} from '../src';
import {WORKSPACE_OPERATION_SCOPES} from '../src/workspace-operation-scope';
import {getCliOperationPolicy} from '../src/cli-policy';
import {REQUEST_OPERATION_IDS} from '../src/observability';
it('总览专用端点按组只读，沿用同一范围和数据合同',async()=>{
 const endpoint=ENDPOINTS.getGroupWorkspace;
 expect(endpoint).toMatchObject({id:'pages.groupWorkspace.get',method:'GET',path:'/groups/:groupId/workspace'});
 expect(WORKSPACE_OPERATION_SCOPES[endpoint.id]).toBe('group');expect(getCliOperationPolicy(endpoint.id)).toMatchObject({effect:'read',confirmation:'none'});
 expect(REQUEST_OPERATION_IDS).toContain(endpoint.id);const {default:registry}=await vi.importActual<{default:{requestOperations:string[]}}>('../src/observability-registry.json');expect(registry.requestOperations).toContain(endpoint.id);
 expect(endpoint.response.shape.workspace).toBe(groupWorkspaceMeta);
 expect(endpoint.params!.safeParse({groupId:''}).success).toBe(false);
 expect(endpoint.query!.safeParse({platform:'xiaohongshu',startDate:'2026-10-27',endDate:'2026-10-26'}).success).toBe(false);
 expect(endpoint.query!.parse({platform:'xiaohongshu',startDate:'2026-09-27',endDate:'2026-10-26'})).toEqual({platform:'xiaohongshu',startDate:'2026-09-27',endDate:'2026-10-26'});
});
