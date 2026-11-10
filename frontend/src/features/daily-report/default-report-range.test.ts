import {describe,expect,it} from "vitest";
import {defaultReportRange} from "./default-report-range";
import {reportPreset} from "./report-date-range";
import {readFileSync} from "node:fs";
import {join} from "node:path";
describe("运营分析默认近 7 天（月明录屏 2026-11-10）",()=>{
 it("北京时间 11-10 凌晨打开，默认 11-03 至 11-09，与快捷项近 7 天一致",()=>{
  expect(defaultReportRange("2026-11-09T19:30:00Z")).toEqual({startDate:"2026-11-03",endDate:"2026-11-09"});
  expect(defaultReportRange("2026-11-09T19:30:00Z")).toEqual(reportPreset(7,"2026-11-10"));
 });
 it("页面无日期参数时用近 7 天而不是昨天",()=>{
  const page=readFileSync(join(__dirname,"../../app/(creator)/daily-report/page.tsx"),"utf8");
  expect(page).toContain("defaultReportRange(");
  expect(page).not.toMatch(/:\{date:yesterdayBeijing\(/);
 });
});
