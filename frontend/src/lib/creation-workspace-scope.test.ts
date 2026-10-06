import {describe,it,expect,vi} from "vitest";
import {createCreationWorkspace} from "./creation-workspace-scope";

describe("冻结创作工作区（TMP候选测试，尚未运行）",()=>{
  it("组内平台账号变化不改变纯组header，跨组取消实际fetch signal",async()=>{
    let group="group-a";let resolve:(value:Response)=>void=()=>{};let actualSignal:AbortSignal|undefined;
    const fetchApi=vi.fn((_input:RequestInfo|URL,init?:RequestInit)=>{actualSignal=init?.signal??undefined;return new Promise<Response>(done=>{resolve=done;});});
    const workspace=createCreationWorkspace({groupId:group,accountId:null},{isCurrent:scope=>scope.groupId===group,fetchApi});
    workspace.activate();const op=workspace.capture();const request=op.client.getProject({params:{projectId:"project"},query:undefined,body:undefined});
    const rejected=expect(request).rejects.toThrow();
    expect(fetchApi.mock.calls[0]?.[1]?.signal).toBe(op.signal);
    group="group-b";workspace.cancel();expect(actualSignal?.aborted).toBe(true);
    resolve(new Response(JSON.stringify({data:{}})));await rejected;expect(()=>op.assertCurrent()).toThrow();workspace.dispose();
  });
  it("旧epoch不能因StrictMode再次activate复活",()=>{
    const workspace=createCreationWorkspace({groupId:"group",accountId:null},{isCurrent:()=>true});
    const old=workspace.capture();workspace.dispose();workspace.activate();expect(()=>old.assertCurrent()).toThrow();expect(()=>workspace.capture().assertCurrent()).not.toThrow();workspace.dispose();
  });
  it("纯组不要求账号，旧账号工作区仍检查其实际范围",()=>{
    const group=createCreationWorkspace({groupId:"group",accountId:null},{isCurrent:()=>true});expect(()=>group.capture().assertCurrent()).not.toThrow();
    const missing=createCreationWorkspace({groupId:null,accountId:null},{isCurrent:()=>true});expect(()=>missing.capture().assertCurrent()).toThrow("选择");group.dispose();missing.dispose();
  });
});
