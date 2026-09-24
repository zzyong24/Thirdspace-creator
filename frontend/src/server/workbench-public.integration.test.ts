import {afterEach,it,expect} from "vitest";
import {ENDPOINTS} from "@creatoros/contract";
import {compositeTransport,__resetPersistenceForTests} from "./persistence-client";

const ctx={userId:"cli-integration-user",accountId:"cli-integration-account",requestId:"cli-integration",source:"user" as const};
afterEach(()=>__resetPersistenceForTests());
it("公开dispatch真实装配可发现宿主能力，并拒绝未授权任务/产物",async()=>{
 const empty={params:undefined,query:undefined,body:undefined};
 const result=await compositeTransport.request(ENDPOINTS.listWorkbenchCapabilities,empty,ctx);
 const catalog=ENDPOINTS.listWorkbenchCapabilities.response.parse((result as {data:unknown}).data);
 expect(catalog.dependencyLock.piCodingAgent).toBeTruthy();
 expect(catalog.builtins.some(b=>b.id==="creatoros.task-files")).toBe(true);
 for(const endpoint of [ENDPOINTS.inspectWorkbenchTask,ENDPOINTS.readWorkbenchEvents]){
  await expect(compositeTransport.request(endpoint,{...empty,params:{taskId:"foreign"},query:{afterSequence:0,limit:50}},ctx)).rejects.toThrow();
 }
 await expect(compositeTransport.request(ENDPOINTS.listWorkbenchArtifacts,{...empty,params:{conversationId:"foreign"},query:{limit:50}},ctx)).rejects.toThrow();
 await expect(compositeTransport.request(ENDPOINTS.renderWorkbenchArtifact,{...empty,params:{taskId:"foreign",artifactId:"foreign",version:1},query:{format:"preview"}},ctx)).rejects.toThrow();
 await expect(compositeTransport.request(ENDPOINTS.listWorkbenchCapabilities,empty)).rejects.toThrow();
});
