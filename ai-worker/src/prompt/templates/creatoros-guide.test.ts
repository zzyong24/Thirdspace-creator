import { describe, expect, it } from "vitest";
import {
  CREATOROS_GUIDE_TEMPLATE,
  CREATOROS_GUIDE_VERIFIED_AT,
} from "./creatoros-guide";

describe("[T-770] creatoros.guide official 产品元 Skill", () => {
  it("代码随版、只读且只包含用户安全的稳定产品事实", () => {
    expect(CREATOROS_GUIDE_TEMPLATE).toMatchObject({
      id: "creatoros.guide",
      version: "v1",
      requiredFacets: [],
      tools: [],
      editableFields: [],
    });
    expect(CREATOROS_GUIDE_VERIFIED_AT).toBe("2026-08-11");
    expect(CREATOROS_GUIDE_TEMPLATE.system).toContain("本地优先");
    expect(CREATOROS_GUIDE_TEMPLATE.system).toContain("AI 干重活，人做判断");
    expect(CREATOROS_GUIDE_TEMPLATE.system).toContain("产品边界");
  });

  it("不把内部服务、凭据、机器身份或待办路线图暴露成产品说明", () => {
    const guide = CREATOROS_GUIDE_TEMPLATE.system;
    for (const forbidden of [
      "http://",
      "https://",
      "Growth",
      "Activity",
      "config-access-ticket",
      "machineId",
      "MACHINE_SEED",
      "API Key",
      "migration",
      "BACKLOG",
    ]) {
      expect(guide).not.toContain(forbidden);
    }
  });
});
