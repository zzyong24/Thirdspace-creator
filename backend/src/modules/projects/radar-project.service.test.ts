import {describe,it,expect} from "vitest";
import {createDb} from "@creatoros/backend";
import {createRadarProjectService} from "./radar-project.service";
import {createProjectRepository} from "./projects.repository";
const ctx={userId:"u",accountId:"a",requestId:"r",source:"user" as const};
describe("雷达项目创建幂等",()=>{
 it("同队列重复/重启创建返回同一项目并保留阶段",async()=>{
  const {db}=await createDb();const deps={now:()=>"2026-09-08T00:00:00Z",nextId:(p:string)=>p};
  const input={queueTaskId:"queue-1",title:"初始项目",briefDetail:{}};
  const [one, concurrent]=await Promise.all([createRadarProjectService(db,deps).ensureRadarProject(ctx,input),createRadarProjectService(db,deps).ensureRadarProject(ctx,input)]);
  expect(concurrent.id).toBe(one.id);
  const two=await createRadarProjectService(db,deps).ensureRadarProject(ctx,{...input,title:"不得覆盖"});
  expect(two.id).toBe(one.id);expect(two.title).toBe("初始项目");
  const other=await createRadarProjectService(db,deps).ensureRadarProject({...ctx,accountId:"b"},input);expect(other.id).not.toBe(one.id);
  expect((await createProjectRepository(db).listStages(ctx,one.id)).length).toBe(7);
 });
});
