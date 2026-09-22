import {describe,it,expect} from "vitest";
import {ENDPOINTS} from "../src/endpoints";
import {getCliOperationPolicy} from "../src/cli-policy";

describe("新增 Agent 能力公开 CLI 契约",()=>{
  it("只读投影和对账均可动态发现并有明确 effect",()=>{
    const ids=Object.values(ENDPOINTS).map(x=>x.id as string);
    for(const id of ["workbench.tasks.inspect","workbench.tasks.events","workbench.capabilities.list","workbench.artifacts.list","workbench.artifacts.read","workbench.artifacts.render","workbench.artifacts.reconcile"]){
      expect(ids).toContain(id);
      expect(getCliOperationPolicy(id as Parameters<typeof getCliOperationPolicy>[0])?.effect).toBe(id.endsWith("reconcile")?"write":"read");
    }
  });
  it("产物范围拒绝越界版本和超大分页",()=>{
    const endpoints=Object.values(ENDPOINTS);
    const read=endpoints.find(x=>x.id as string==="workbench.artifacts.read")!;
    expect(read).toBeDefined();
    expect(read.params!.safeParse({taskId:"task",artifactId:"artifact",version:0}).success).toBe(false);
    expect(read.query!.safeParse({offset:0,limit:128001}).success).toBe(false);
  });
});
