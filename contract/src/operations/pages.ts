import { dailyReportPage } from "../pages/daily-report";
import { z } from "zod";
import { defineEndpoint } from "../endpoints";
import { id } from "../primitives";
import { dashboardPage } from "../pages/dashboard";
import { projectOverviewPage } from "../pages/project-overview";
import { globalSearchPage } from "../pages/global-search";
import { positioningCenterResource } from "../resources/positioning";
// publishing-center is composed client-side (GET /publications + analytics) and
// has no distinct read path in SPEC §13. The DTO is re-exported for reuse only;
// no endpoint is registered below.
export { publishingCenterPage } from "../pages/publishing-center";

// PAGE composition DTO read endpoints. These responses are view-specific
// projections built by selectors, not raw resources.
export const pagesOperations = {
  getDailyReport: defineEndpoint({id:"pages.dailyReport.get",method:"GET",path:"/analytics/daily-report",query:z.object({date:z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(v=>!Number.isNaN(Date.parse(v+"T00:00:00Z"))&&new Date(v+"T00:00:00Z").toISOString().slice(0,10)===v,"日期无效").optional()}),response:dailyReportPage,fr:["FR-PAGE-DAILY-REPORT"]}),
  getProjectOverview: defineEndpoint({
    id: "pages.projectOverview.get",
    method: "GET",
    path: "/projects/:projectId/overview",
    params: z.object({ projectId: id }),
    response: projectOverviewPage,
    fr: ["FR-PAGE-PROJECT-OVERVIEW"],
  }),
  getDashboard: defineEndpoint({
    id: "pages.dashboard.get",
    method: "GET",
    path: "/analytics/dashboard",
    response: dashboardPage,
    fr: ["FR-PAGE-DASHBOARD"],
  }),
  getGlobalSearch: defineEndpoint({
    id: "pages.search.get",
    method: "GET",
    path: "/search",
    query: z.object({ q: z.string(), type: z.string().optional() }),
    response: globalSearchPage,
    fr: ["FR-PAGE-SEARCH"],
  }),
  // 定位中心 page (七步 ③). Owned/implemented by the positioning module.
  getPositioningCenter: defineEndpoint({
    id: "pages.positioning.get",
    method: "GET",
    path: "/positioning/center",
    response: positioningCenterResource,
    fr: ["FR-PAGE-POSITIONING"],
  }),
} as const;
