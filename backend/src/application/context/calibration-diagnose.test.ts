import {expect,it,vi} from "vitest";
import {createCalibrationDiagnoseReaders} from "./calibration-diagnose";
import {createCurrentArtifactReader} from "./current-artifact";
const ctx={userId:"user",accountId:"account",source:"ai" as const,requestId:"r"};
function fixture(){
 const getProject=vi.fn(async()=>({id:"project"}));
 const listVersions=vi.fn(async()=>[{id:"current",versionNumber:2,contentText:"当前完整正文",contentData:{}},{id:"newer",versionNumber:3,contentText:"未选中更新稿"}]);
 const artifactsService={listProjectArtifacts:vi.fn(async()=>[{id:"artifact",artifactType:"output_script",currentVersionId:"current"}]),listVersions,getScriptSections:vi.fn(async()=>[])};
 const getOutput=vi.fn(async()=>({id:"output",projectId:"project",title:"标题"}));
 const readCurrent=createCurrentArtifactReader({projectsService:{getProject},artifactsService} as never);
 const reader=createCalibrationDiagnoseReaders({projectsService:{getOutput},publishingService:{},calibrationService:{},readCurrentScript:(c:typeof ctx,p:string)=>readCurrent(c,p,"output_script")} as never);
 return {reader,getOutput,getProject,listVersions};
}
it("作品诊断公共读取链使用当前版本正文，不按最新版本或标题代替",async()=>{
 const f=fixture();expect(await f.reader.subject.get(ctx,"content_output","output")).toEqual({title:"标题",scriptText:"当前完整正文"});
 expect(f.getOutput).toHaveBeenCalledWith(ctx,"output");expect(f.getProject).toHaveBeenCalledWith(ctx,"project");expect(f.listVersions).toHaveBeenCalledWith(ctx,"artifact");
});
it("作品归属拒绝不得读取原稿或降级标题诊断",async()=>{
 const f=fixture();f.getOutput.mockRejectedValue(new Error("无权读取作品"));await expect(f.reader.subject.get(ctx,"content_output","foreign")).rejects.toThrow("无权");expect(f.getProject).not.toHaveBeenCalled();
});
it("原稿读取失败必须传播；真实无当前版本才返回空稿",async()=>{
 const f=fixture();f.listVersions.mockRejectedValueOnce(new Error("数据库不可用"));await expect(f.reader.subject.get(ctx,"content_output","output")).rejects.toThrow("数据库不可用");
 f.listVersions.mockResolvedValue([]);expect((await f.reader.subject.get(ctx,"content_output","output")).scriptText).toBe("");
});

it('诊断默认读取传完整ctx调用真实service端口ensure，失败原样传播',async()=>{
 const selected={...ctx,groupId:'G',membershipVersion:4,groupVersion:2},currentVersion={id:'真实冻结版本',dimensions:[{key:'cta',label:'真实CTA',description:'原完整说明',weight:1}]},ensureDefaultRubric=vi.fn(async()=>({currentVersion}));
 const reader=createCalibrationDiagnoseReaders({calibrationService:{ensureDefaultRubric}} as never);
 expect(await reader.rubric.current(selected)).toEqual({rubricVersionId:currentVersion.id,dimensions:[{key:'cta',label:'真实CTA',description:'原完整说明'}]});expect(ensureDefaultRubric).toHaveBeenCalledExactlyOnceWith(selected);
 const failure=new Error('实际权限错误');ensureDefaultRubric.mockRejectedValueOnce(failure);await expect(reader.rubric.current(selected)).rejects.toBe(failure);
});
