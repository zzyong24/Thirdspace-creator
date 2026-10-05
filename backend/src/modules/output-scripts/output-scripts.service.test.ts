import {expect,it} from "vitest";
import {createHash} from "node:crypto";
import {createOutputScriptsService,type OutputScriptPorts} from "./output-scripts.service";

it("作品互转脚本不伪装雷达来源；采用编辑稿仍保留严格历史来源",async()=>{
 const ctx={userId:"u",accountId:"a",requestId:"r",source:"user" as const};
 const sourceAnchor={kind:"output_version" as const,sourceOutputId:"image",artifactId:"graphic",versionId:"saved-image",
  sourceType:"image" as const,selectionDigest:"a".repeat(64),selection:{mode:"whole" as const}};
 const writes:Array<Record<string,unknown>>=[];const verified:Array<unknown>=[];
 const task={id:"converted",taskType:"script.draft",status:"awaiting_confirmation",projectId:"p",
  inputData:{projectId:"p",outputId:"video",artifactId:"script",baseVersionId:"v0",conversion:{sourceAnchor},
   sourceSnapshots:[{sourceType:"project_text",sourceId:"image@saved-image",body:"来源正文",sha256:"source"}]},
  results:[{resultType:"artifact_version",artifactId:"script",resultData:{body:"脚本",contentData:{sections:[]}}}]};
 const ports={projects:{getOutput:async()=>({id:"video",projectId:"p",contentType:"video"})},
  artifacts:{getArtifact:async()=>({id:"script",projectId:"p",contentOutputId:"video",artifactType:"output_script",currentVersionId:"v0"}),
   listVersions:async()=>[{id:"v0"}],getVersionByAdoptionReceipt:async()=>null,
   createVersion:async(_c:unknown,_id:string,input:Record<string,unknown>)=>{writes.push(input);return{id:"v1"};}},
  readTask:async()=>task,assertOutputVersionSource:async(_c:unknown,ref:unknown)=>{verified.push(ref);}} as unknown as OutputScriptPorts;
 const service=createOutputScriptsService(ports);
 expect((await service.read(ctx,task.id)).sourceRefs).toEqual([sourceAnchor]);
 await service.adopt(ctx,{candidateId:task.id,expectedCurrentVersionId:"v0",editedValue:"用户改过脚本",clientRequestId:"saved-conversion"});
 expect(writes[0]!.contentData).toMatchObject({sourceRefs:[sourceAnchor]});
 expect(verified.length).toBeGreaterThan(0);
 task.inputData.conversion.sourceAnchor.selectionDigest="bad";
 await expect(service.read(ctx,task.id)).rejects.toThrow();
});

it("视频脚本候选仅归当前账号作品；采纳用基准版本 CAS",async()=>{
  const ctx={userId:"u",accountId:"a",requestId:"r",source:"user" as const};
  let currentVersionId="v0";
  const output={id:"o",projectId:"p",contentType:"video"};
  const task={id:"t",taskType:"script.draft",status:"awaiting_confirmation",projectId:"p",
    inputData:{projectId:"p",outputId:"o",artifactId:"artifact",baseVersionId:"v0"},
    results:[{resultType:"artifact_version",artifactId:"artifact",resultData:{body:"生成的脚本",contentData:{sections:[]}}}]};
  const artifact={id:"artifact",projectId:"p",contentOutputId:"o",artifactType:"output_script",currentVersionId};
  const ports={projects:{getOutput:async(c:typeof ctx)=>{if(c.accountId!=="a")throw new Error("not found");return output;},
    getProject:async()=>({id:"p",title:"项目",brief:"简介"})},
    artifacts:{getArtifact:async()=>({...artifact,currentVersionId}),listVersions:async()=>[{id:"v0"}],
      getVersionByAdoptionReceipt:async()=>null,
      createVersion:async(_c:typeof ctx,_id:string,input:{expectedCurrentVersionId?:string})=>{
        if(input.expectedCurrentVersionId!==currentVersionId)throw new Error("VERSION_CONFLICT");
        currentVersionId="v1";return {id:"v1"};
      }},
    submitScriptDraft:async()=>({id:"t"}),readTask:async()=>task} as unknown as OutputScriptPorts;
  const service=createOutputScriptsService(ports);
  expect((await service.read(ctx,"t")).value).toBe("生成的脚本");
  await expect(service.read({...ctx,accountId:"other"},"t")).rejects.toThrow();
  await expect(service.adopt(ctx,{candidateId:"t",expectedCurrentVersionId:"wrong",editedValue:"编辑稿",clientRequestId:"key"}))
    .rejects.toMatchObject({code:"VERSION_CONFLICT"});
  expect((await service.adopt(ctx,{candidateId:"t",expectedCurrentVersionId:"v0",editedValue:"编辑稿",clientRequestId:"key"})).versionId).toBe("v1");
  await expect(service.adopt(ctx,{candidateId:"t",expectedCurrentVersionId:"v0",editedValue:"不同稿",clientRequestId:"other"}))
    .rejects.toMatchObject({code:"VERSION_CONFLICT"});
});

it("视频雷达来源必须有完整逐字稿，提交时冻结正文与 SHA-256",async()=>{
  const ctx={userId:"u",accountId:"a",requestId:"r",source:"user" as const};
  const submitted:Array<Record<string,unknown>>=[];
  const transcript="真实视频逐字稿第一句。真实视频逐字稿第二句。";
  const rawPorts={projects:{getOutput:async()=>({id:"o",projectId:"p",contentType:"video"}),
    getProject:async()=>({id:"p",title:"项目",brief:"项目主题"})},
    artifacts:{getArtifact:async()=>({id:"artifact",projectId:"p",contentOutputId:"o",artifactType:"output_script"}),
      listVersions:async()=>[{id:"v0"}]},
    resolveVideoSource:async(_c:typeof ctx,id:string)=>id==="ready"?{id,versionId:"transcript-v1",label:"雷达视频",transcript}:null,
    submitScriptDraft:async(_c:typeof ctx,input:Record<string,unknown>)=>{submitted.push(input);return {id:"t"};},
    readTask:async()=>({id:"t",taskType:"script.draft",status:"queued",projectId:"p",inputData:{
      projectId:"p",outputId:"o",artifactId:"artifact",baseVersionId:"v0",sourceSnapshots:submitted.at(-1)?.sourceSnapshots},results:[]})};
  const ports=rawPorts as unknown as OutputScriptPorts;
  const service=createOutputScriptsService(ports);
  await expect(service.generate(ctx,{outputId:"o",sourceItemId:"missing",clientRequestId:"key-1"}))
    .rejects.toMatchObject({code:"SOURCE_UNAVAILABLE"});
  expect(submitted).toHaveLength(0);
  const generated=await service.generate(ctx,{outputId:"o",sourceItemId:"ready",clientRequestId:"key-2"});
  expect(generated.sourceRefs).toEqual([{kind:"intelligence_video_transcript",id:"ready@transcript-v1",
    sha256:createHash("sha256").update(transcript).digest("hex")}]);
  expect((submitted[0]!.sourceSnapshots as Array<{body:string}>)[0]!.body).toBe(transcript);
});

it("视频失败任务仅在有可信恢复断点时重试，且沿用原始 inputData",async()=>{
  const ctx={userId:"u",accountId:"a",requestId:"r",source:"user" as const};
  const inputData={projectId:"p",outputId:"o",artifactId:"artifact",baseVersionId:"v0",topic:"旧主题"};
  let checkpoint:Record<string,unknown>|null=null;
  let submitted:Record<string,unknown>|null=null;
  const rawPorts={projects:{getOutput:async()=>({id:"o",projectId:"p",contentType:"video"})},
    artifacts:{getArtifact:async()=>({id:"artifact",projectId:"p",contentOutputId:"o",artifactType:"output_script",currentVersionId:"v0"}),
      listVersions:async()=>[{id:"v0"}]},
    readTask:async(_c:typeof ctx,id:string)=>({id,taskType:"script.draft",status:id==="old"?"failed":"queued",
      projectId:"p",inputData,results:[]}),
    readTaskRuntimeData:async()=>({scriptDraftCheckpoint:checkpoint}),
    retryScriptDraft:async(_c:typeof ctx,input:Record<string,unknown>)=>{submitted=input;return {id:"new"};}};
  const ports=rawPorts as unknown as OutputScriptPorts;
  const service=createOutputScriptsService(ports);
  await expect(service.retryFrozen(ctx,"old","retry-1")).rejects.toMatchObject({code:"SOURCE_UNAVAILABLE"});
  expect(submitted).toBeNull();
  checkpoint={stage:"voiceover_complete"};
  expect((await service.retryFrozen(ctx,"old","retry-2")).candidateId).toBe("new");
  expect(submitted).toMatchObject({retryOfTaskId:"old",inputData});
});

it("真实转换生成冻结选区；来源、规则及目标变化后的同请求恢复原任务，异意图拒绝",async()=>{
 const ctx={userId:"u",accountId:"a",requestId:"r",source:"user" as const};
 const anchor={kind:"output_version" as const,sourceOutputId:"image",artifactId:"graphic",versionId:"v-source",sourceType:"image" as const,selectionDigest:"a".repeat(64),selection:{mode:"whole" as const}};
 const conversion={request:{sourceOutputId:"image",sourceVersionId:"v-source",targetType:"video" as const,mode:"whole" as const,clientRequestId:"conversion-original",reuseImages:[]},sourceAnchor:anchor};
 let task:Record<string,unknown>|null=null,submissions=0,resolutions=0;
 const deps={projects:{getOutput:async()=>({id:"video",projectId:"p",contentType:"video"}),getProject:async()=>({id:"p",title:"背景",brief:"背景不得冒充正文"})},
  artifacts:{getArtifact:async()=>({id:"script",projectId:"p",contentOutputId:"video",artifactType:"output_script"}),listVersions:async()=>[{id:"v0"}]},
  assertOutputVersionSource:async()=>{},findGenerationByAttempt:async()=>task,
  resolveConversionSource:async()=>{resolutions++;if(resolutions>1)throw Error("不重采样");return {projectId:"p",sourceAnchor:anchor,content:{fields:{body:"真正选定正文"},sections:[]},constraints:{factItems:[],sourceRefs:[],ruleSnapshotRef:null}};},
  submitScriptDraft:async(_c:unknown,input:Record<string,unknown>)=>{submissions++;task={id:"task",inputData:{...input,artifactId:"script",baseVersionId:"v0"},taskType:"script.draft",status:"queued",projectId:"p",results:[]};return{id:"task"};},readTask:async()=>task} as unknown as OutputScriptPorts;
 const s=createOutputScriptsService(deps);
 const input={outputId:"video",clientRequestId:"stable-conversion-task",conversion};
 expect((await s.generate(ctx,input)).sourceRefs).toEqual([anchor]);
 expect((await s.generate(ctx,input)).candidateId).toBe("task");expect(submissions).toBe(1);expect(resolutions).toBe(1);
 const data=(task as unknown as {inputData:Record<string,unknown>}).inputData;
 expect(data.conversion).toEqual(conversion);expect((data.sourceSnapshots as Array<{body:string}>)[0]?.body).toContain("真正选定正文");
 expect((data.sourceSnapshots as Array<{body:string}>)[0]?.body).not.toContain("背景不得冒充正文");
 await expect(s.generate(ctx,{...input,conversion:{...conversion,request:{...conversion.request,reuseImages:[{assetId:"a",assetFileId:"f"}]}}})).rejects.toMatchObject({code:"IDEMPOTENCY_CONFLICT"});
});

it("视频转换不能静默忽略与作品不一致的目标平台",async()=>{
 const ctx={userId:"u",accountId:"a",requestId:"r",source:"user" as const};let submitted=0;
 const conversion={request:{sourceOutputId:"image",sourceVersionId:"v",targetType:"video" as const,mode:"whole" as const,targetPlatform:"xiaohongshu" as const,clientRequestId:"platform-request",reuseImages:[]},sourceAnchor:{kind:"output_version" as const,sourceOutputId:"image",artifactId:"g",versionId:"v",sourceType:"image" as const,selectionDigest:"a".repeat(64),selection:{mode:"whole" as const}}};
 const ports={projects:{getOutput:async()=>({id:"video",projectId:"p",contentType:"video",targetPlatform:"douyin"})},findGenerationByAttempt:async()=>null,
 resolveConversionSource:async()=>{submitted++;throw Error("不该读取");}} as unknown as OutputScriptPorts;
 await expect(createOutputScriptsService(ports).generate(ctx,{outputId:"video",clientRequestId:"platform-attempt",conversion})).rejects.toMatchObject({code:"TARGET_PLATFORM_MISMATCH"});
 expect(submitted).toBe(0);
});
it("视频已绑定执行直接恢复原冻结脚本，不复制断点或改用今天的稿",async()=>{
 const ctx={userId:"u",accountId:"a",requestId:"r",source:"user" as const};let status="failed",legacy=0;
 const task={id:"original",taskType:"script.draft",executionTaskId:"bound-execution",status,projectId:"p",inputData:{projectId:"p",outputId:"video",artifactId:"script",baseVersionId:"base"},results:[]};
 const owner=createOutputScriptsService({projects:{getOutput:async(c:{accountId?:string|null})=>{if(c.accountId!=="a")throw Error("越权");return {id:"video",projectId:"p",contentType:"video"} as never;}},
  artifacts:{getArtifact:async()=>({id:"script",projectId:"p",contentOutputId:"video",artifactType:"output_script",currentVersionId:"later"}),listVersions:async()=>[{id:"base"}]},
  readTask:async()=>({...task,status}),resumeGeneration:async(_c:unknown,input:{taskId:string;clientRequestId:string})=>{expect(input).toEqual({taskId:"original",clientRequestId:"bound-video-retry"});status="queued";return{id:"original"};},
  readTaskRuntimeData:async()=>{legacy++;throw Error("不复制断点");},retryScriptDraft:async()=>{legacy++;throw Error("不复制已绑定脚本任务");},
 } as unknown as OutputScriptPorts);
 expect(await owner.retryFrozen(ctx,"original","bound-video-retry")).toMatchObject({candidateId:"original",taskId:"original",baseVersionId:"base",status:"queued"});
 expect(await owner.retryFrozen(ctx,"original","bound-video-retry")).toMatchObject({candidateId:"original"});expect(legacy).toBe(0);
 await expect(owner.retryFrozen({...ctx,accountId:"b"},"original","bound-video-retry")).rejects.toThrow();
});
