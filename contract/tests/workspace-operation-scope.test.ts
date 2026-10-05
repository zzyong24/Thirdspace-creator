import {describe,it,expect} from "vitest";
import {ENDPOINTS,WORKSPACE_OPERATION_SCOPES as scopes} from "../src";
describe("账号组操作归属契约",()=>{
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
});
