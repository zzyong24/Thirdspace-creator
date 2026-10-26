import {describe,it,expect} from "vitest";
import {ENDPOINTS,WORKSPACE_OPERATION_SCOPES as scopes} from "../src";
describe("账号组操作归属契约",()=>{
 it('T1278来源偏好属于用户，切账号组不变成组偏好',()=>{
  expect(scopes['settings.modelRouting.get']).toBe('user');
  expect(scopes['settings.modelRouting.put']).toBe('user');
 });
 it("模型摘要与任务观察可按组读取，文件门保持平台账号",()=>{
  expect(scopes["workbench.modelCalls.summary" as keyof typeof scopes]).toBe("group");
  for(const id of ["workbench.artifacts.read","workbench.files.reconcile"] as const)
   expect(scopes[id]).toBe("platform-account");
 });
 it("工具目录与任务观察允许纯组，物料与文件仍要求原平台账号",()=>{
  expect(scopes["workbench.capabilities.list"]).toBe("group");
  expect(scopes["workbench.tasks.inspect"]).toBe("group");expect(scopes["workbench.tasks.events"]).toBe("group");
  for(const id of ["workbench.artifacts.list","workbench.artifacts.read","workbench.artifacts.render","workbench.artifacts.reconcile","workbench.files.reconcile"] as const)
   expect(scopes[id]).toBe("platform-account");
 });
 it("逐条声明所有正式操作，没有按名字在运行时猜作用域",()=>{
  expect(Object.keys(scopes).sort()).toEqual(Object.values(ENDPOINTS).map(e=>e.id).sort());
 });
 it("空组共享与私有平台账号、项目派生边界分别明确",()=>{
  expect(scopes["projects.create"]).toBe("group");
  expect(scopes["intelligence.sources.previewWeb"]).toBe("group");
  expect(scopes["settings.onboarding.group.get"]).toBe("group");
  expect(scopes["intelligence.sources.previewProfile"]).toBe("platform-account");
  expect(scopes["ingestion.douyin.login"]).toBe("platform-account");
  expect(scopes["outputs.production.put"]).toBe("project-derived");
  expect(scopes["publications.revisions.create"]).toBe("project-derived");
  expect(scopes["settings.models.put"]).toBe("user");
 });
 it("画布模板允许空组，粗剪和组合必须沿真实项目，绑定与采集分别声明",()=>{
  expect(scopes["canvas.create"]).toBe("group");
  expect(scopes["assets.visualTemplates.save"]).toBe("group");
  expect(scopes["creativeCapabilities.list"]).toBe("group");
  expect(scopes["outputs.production.editor.rough-cut.adopt"]).toBe("project-derived");
  expect(scopes["work.sources.select"]).toBe("project-derived");
  expect(scopes["workCompositions.members.create"]).toBe("project-derived");
  expect(scopes["canvas.material.adopt"]).toBe("project-derived");
  expect(scopes["platforms.bind.begin"]).toBe("group");
  expect(scopes["platforms.collections.start"]).toBe("platform-account");
  expect(scopes["platforms.metrics.read"]).toBe("platform-account");
  expect(scopes["settings.reporting.get"]).toBe("user");
 });
});

it("T1199 计划资格属于组，真实账号成员由后端再次验证",()=>{
 expect(scopes["accounts.collectionPlanReadiness"]).toBe("group");
 expect(scopes["accounts.get"]).toBe("user");
 expect(scopes["platforms.collections.start"]).toBe("platform-account");
});
