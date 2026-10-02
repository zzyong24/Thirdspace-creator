import { describe, expect, it } from "vitest";

import { CLI_OPERATION_POLICIES, ENDPOINTS } from "../src";

describe("T-843 CLI operation policy", () => {
  it("穷尽覆盖且只覆盖全部正式 operation", () => {
    expect(Object.keys(CLI_OPERATION_POLICIES).sort()).toEqual(
      Object.values(ENDPOINTS).map((endpoint) => endpoint.id).sort(),
    );
    expect(Object.keys(CLI_OPERATION_POLICIES)).toHaveLength(255);
  });

  it('观众任务三操作有对应读写策略',()=>{
    expect(CLI_OPERATION_POLICIES['topics.workspace.get'].effect).toBe('read');
    for(const id of ['topics.workspace.save','topics.proposals.feedback'] as const)expect(CLI_OPERATION_POLICIES[id]).toMatchObject({effect:'write',idempotency:'native'});
  });
  it("每项都有服务端可信的执行元数据", () => {
    for (const policy of Object.values(CLI_OPERATION_POLICIES)) {
      expect(["read", "write", "destructive", "external"]).toContain(policy.effect);
      expect(["none", "apply", "confirm_impact"]).toContain(policy.confirmation);
      expect(typeof policy.asyncTask).toBe("boolean");
      expect(["not_applicable", "native", "gateway"]).toContain(policy.idempotency);
      if (policy.effect === "read") expect(policy.confirmation).toBe("none");
      if (policy.effect === "write") expect(policy.confirmation).toBe("apply");
      if (policy.effect === "destructive" || policy.effect === "external") {
        expect(policy.confirmation).toBe("confirm_impact");
      }
    }
  });

  it("[T-881] CLI 删除当前分镜 B-roll 必须提示影响确认", () => {
    expect(
      CLI_OPERATION_POLICIES["outputs.production.editingPlan.broll.remove"],
    ).toMatchObject({
      effect: "destructive",
      confirmation: "confirm_impact",
    });
  });
});
