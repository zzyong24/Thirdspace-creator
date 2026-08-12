import { describe, expect, it } from "vitest";
import { SCRIPT_DRAFT_TEMPLATE } from "./script-draft";

describe("[T-790] script.draft 用认知对打组织说服", () => {
  it("围绕一个旧判断与新判断连续施压，而不是并列讲知识", () => {
    expect(SCRIPT_DRAFT_TEMPLATE.template).toContain(
      "观众当前相信的一个具体旧判断",
    );
    expect(SCRIPT_DRAFT_TEMPLATE.template).toContain(
      "每一段必须继续削弱旧判断或增强新判断",
    );
    expect(SCRIPT_DRAFT_TEMPLATE.template).toContain(
      "反例、类比、因果推演、预判异议、亲历案例",
    );
  });
});
