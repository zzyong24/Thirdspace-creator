import {describe,it,expect} from "vitest";
import {ENDPOINTS} from "../src/endpoints";
import {getCliOperationPolicy} from "../src/cli-policy";

describe("新增 Agent 能力公开 CLI 契约",()=>{
  it.each(["unknown_result","retry_wait","waiting_user","partial"])("持久进度保留真实 %s 状态，不用展示枚举阻断读取",status=>{
    expect(ENDPOINTS.readWorkbenchEvents.response.parse({events:[],nextSequence:0,hasMore:false,status,attempt:1}).status).toBe(status);
  });
  it("只读投影和对账均可动态发现并有明确 effect",()=>{
    const ids=Object.values(ENDPOINTS).map(x=>x.id as string);
    for(const id of ["workbench.tasks.inspect","workbench.tasks.events","workbench.capabilities.list","workbench.artifacts.list","workbench.artifacts.read","workbench.artifacts.render","workbench.artifacts.reconcile","workbench.files.reconcile"]){
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
  it("文件对账只接受原callId，不能由公开请求指定scope或写入内容",()=>{
    const endpoint=ENDPOINTS.reconcileWorkbenchFile;
    expect(endpoint.body.parse({operationId:"call-original"})).toEqual({operationId:"call-original"});
    for(const extra of [{scope:{userId:"foreign"}},{content:"rewrite"},{path:"report.html"},{expectedVersion:0},{fenceToken:"caller"}])
      expect(endpoint.body.safeParse({operationId:"call-original",...extra}).success).toBe(false);
  });
  it("文件重新准入只报告历史准入事实，不能声称有Native回执或已写版本",()=>{
    const response=ENDPOINTS.reconcileWorkbenchFile.response;
    const value={taskId:"task",operationId:"call",status:"readmitted",verificationKind:"predispatch_readmission",auditDigest:"sha256:"+"a".repeat(64),version:null,hash:null,size:null};
    expect(response.parse(value)).toEqual(value);
    for(const patch of [{version:4},{verificationKind:"native_receipt"},{status:"settled"},{auditDigest:undefined},{claimId:"secret"}])
      expect(response.safeParse({...value,...patch}).success).toBe(false);
    expect(ENDPOINTS.reconcileWorkbenchFile.body.safeParse({operationId:"call",sourceVersion:"048fd032"}).success).toBe(false);
  });
});
