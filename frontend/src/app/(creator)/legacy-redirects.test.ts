/**
 * [T-063a] 旧一级路由 301 契约测试。
 *
 * 10 条旧路由的 app 层 page 已替换为 `permanentRedirect(target)`(feature 组件
 * 零删除,由新宿主 tab 内嵌)。这里锁定每条的落点:mock next/navigation 让
 * permanentRedirect 抛出(Next 语义),断言目标 URL。SPEC §4-3:301 永久保留,
 * 书签/深链不断。
 */

import { describe, expect, it, vi } from "vitest";

const permanentRedirect = vi.fn((target: string) => {
  throw new Error(`NEXT_PERMANENT_REDIRECT:${target}`);
});

vi.mock("next/navigation", () => ({
  permanentRedirect: (target: string) => permanentRedirect(target),
}));

import TopicsRedirect from "./topics/page";
import PublishingRedirect from "./publishing/page";
import CalendarRedirect from "./calendar/page";
import AssetsRedirect from "./assets/page";
import KnowledgeRedirect from "./knowledge/page";
import ExperienceRedirect from "./experience/page";
import PositioningRedirect from "./positioning/page";
import CalibrationRedirect from "./calibration/page";
import AutomationsRedirect from "./automations/page";
import AccountsRedirect from "./accounts/page";

// 旧路由 → 新落点(北极星 SPEC §3 T-063a 名单,一条不少)。
const REDIRECTS: ReadonlyArray<
  readonly [name: string, page: () => never, target: string]
> = [
  ["/topics", TopicsRedirect, "/projects?tab=candidates"],
  ["/publishing", PublishingRedirect, "/projects?tab=published"],
  ["/calendar", CalendarRedirect, "/projects?tab=schedule"],
  ["/assets", AssetsRedirect, "/library?tab=assets"],
  ["/knowledge", KnowledgeRedirect, "/library?tab=knowledge"],
  ["/experience", ExperienceRedirect, "/library?tab=experience"],
  ["/positioning", PositioningRedirect, "/settings?tab=positioning"],
  ["/calibration", CalibrationRedirect, "/settings?tab=calibration"],
  ["/automations", AutomationsRedirect, "/settings?tab=automations"],
  ["/accounts", AccountsRedirect, "/settings?tab=account"],
];

describe("[T-063a] 旧一级路由 301 落点", () => {
  for (const [name, Page, target] of REDIRECTS) {
    it(`${name} → ${target}`, () => {
      expect(() => Page()).toThrowError(`NEXT_PERMANENT_REDIRECT:${target}`);
    });
  }
});
