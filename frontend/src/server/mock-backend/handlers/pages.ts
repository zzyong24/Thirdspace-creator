import { buildDashboardViewModel } from "@/fixtures/selectors";
import type { Handler } from "../mock-transport";

// Dashboard page-DTO composer. Reads the mutable store and projects it into the
// `dashboardPage` DTO via the (data-parameterized) dashboard selector, so the
// shape stays identical to the fixture-composed view model.
const getDashboard: Handler = ({ store }) => buildDashboardViewModel(store);

// id → page-DTO composer. The dashboard endpoint id is `pages.dashboard.get`
// (contract/src/operations/pages.ts).
export const pagesHandlers: Record<string, Handler> = {
  "pages.dashboard.get": getDashboard,
};
