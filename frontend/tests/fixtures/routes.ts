/**
 * Canonical route metadata for the 17 CreatorOS views + 1 dialog
 * (Task 26 / page-specs §18).
 *
 * This file is the single source of truth used by the route, a11y and
 * visual matrix tests. Every approved view is listed once with its
 * URL, expected sidebar active item, expected header mode, and the
 * reference image SHA-256.
 *
 * The route matrix (tests/e2e/all-routes.spec.ts) iterates this list
 * and asserts that each route renders with one AppShell + one Sidebar
 * + one TopHeader and that the active sidebar item / header mode
 * match the spec. The accessibility matrix
 * (tests/accessibility/all-pages.spec.ts) runs axe against each
 * route. The visual matrix (tests/visual/all-pages.spec.ts) takes a
 * screenshot of each route so the Controller-approved baseline can
 * be diffed.
 */

export interface RouteSpec {
  readonly id: string;
  /** URL pathname that the test will visit. */
  readonly pathname: string;
  /** Title text rendered in the TopHeader slot. */
  readonly pageTitle: string;
  /** Sidebar item that must be marked aria-current="page". */
  readonly sidebarActiveId:
    | "home"
    | "projects"
    | "knowledge"
    | "assets"
    | "publishing"
    | "experience"
    | "settings";
  /** Expected TopHeader mode from shell-router.tsx. */
  readonly headerMode: "global" | "project-workspace" | "search";
  /** Reference image SHA-256 (TDD-PLAN §3-§25). */
  readonly imageSha256: string;
}

export const ROUTES: ReadonlyArray<RouteSpec> = [
  {
    id: "dashboard",
    pathname: "/",
    pageTitle: "首页",
    sidebarActiveId: "home",
    headerMode: "global",
    imageSha256:
      "7a1fb9a5d07050f6744231fb16d49f1c26a0bf953441c214d780bbb0e1247bab",
  },
  {
    id: "projects",
    pathname: "/projects",
    pageTitle: "项目",
    sidebarActiveId: "projects",
    headerMode: "global",
    imageSha256:
      "fbabec5271523484fbedce5a8e0b31f4a741fe55708a8064f03a1cc85ccfe083",
  },
  {
    id: "project-overview",
    pathname: "/projects/ai-native-browser",
    pageTitle: "AI Native Browser 深度解析",
    sidebarActiveId: "projects",
    headerMode: "project-workspace",
    imageSha256:
      "e599bfe55f3db65bfe5c98489502ebbb818ba67033bcc898bdc8764e11af37fa",
  },
  {
    id: "research-workspace",
    pathname: "/projects/ai-native-browser/research",
    pageTitle: "AI Native Browser 深度解析",
    sidebarActiveId: "projects",
    headerMode: "project-workspace",
    imageSha256:
      "5ea16c42268955de0196e5827f3a47a5badfb4b0454ca28a1002ede6f041032b",
  },
  {
    id: "planning-workspace",
    pathname: "/projects/ai-native-browser/planning",
    pageTitle: "AI Native Browser 深度解析",
    sidebarActiveId: "projects",
    headerMode: "project-workspace",
    imageSha256:
      "079e097e2641f9b805129ab377da08e8266a51c58516793bc22af74e3ae26ca9",
  },
  {
    id: "script-workspace",
    pathname: "/projects/ai-native-browser/script",
    pageTitle: "AI Native Browser 深度解析",
    sidebarActiveId: "projects",
    headerMode: "project-workspace",
    imageSha256:
      "5f3ba4c96a1ced43a250b5ed2c5e9611aafb0ad079864d34238d1887173aa5df",
  },
  {
    id: "production-workspace",
    pathname: "/projects/ai-native-browser/production",
    pageTitle: "AI Native Browser 深度解析",
    sidebarActiveId: "projects",
    headerMode: "project-workspace",
    imageSha256:
      "f73dff930936ab4eba1024c3f9dea0a96f6336c7901e39858589255aae9edf21",
  },
  {
    id: "publishing-workspace",
    pathname: "/projects/ai-native-browser/publishing",
    pageTitle: "AI Native Browser 深度解析",
    sidebarActiveId: "projects",
    headerMode: "project-workspace",
    imageSha256:
      "46385cfd85ac360d83ab0bcd799646f81eb633ffefca2a370dc5f8e5c2638e5f",
  },
  {
    id: "analytics-review",
    pathname: "/projects/ai-native-browser/review",
    pageTitle: "AI Native Browser 深度解析",
    sidebarActiveId: "projects",
    headerMode: "project-workspace",
    imageSha256:
      "b2636a275b328b96495d2f2a280e709111ecffe45f2f6649f5a8d2dd5fae4c59",
  },
  {
    id: "knowledge",
    pathname: "/knowledge",
    pageTitle: "知识库",
    sidebarActiveId: "knowledge",
    headerMode: "global",
    imageSha256:
      "85c96a181b9113ff9e638b3d14b6309e0a3ed556887471f99f6dddc7cea6c82b",
  },
  {
    id: "assets",
    pathname: "/assets",
    pageTitle: "素材中心",
    sidebarActiveId: "assets",
    headerMode: "global",
    imageSha256:
      "a3336cd1388ba223b4879cf93078c5b78c2f886c791abc17a0b2b153d7ba2402",
  },
  {
    id: "publishing-center",
    pathname: "/publishing",
    pageTitle: "发布中心",
    sidebarActiveId: "publishing",
    headerMode: "global",
    imageSha256:
      "5c678851e540b151c9e6c50dc5d956cd99a35b8ffdca5866a2863c796629967a",
  },
  {
    id: "experience",
    pathname: "/experience",
    pageTitle: "经验沉淀",
    sidebarActiveId: "experience",
    headerMode: "global",
    imageSha256:
      "609023b1435725b22b4e95c9ad3b68844c3562ad74b28575a9225ecfa46ba0bb",
  },
  {
    id: "search",
    pathname: "/search",
    pageTitle: "全局搜索",
    sidebarActiveId: "home",
    headerMode: "search",
    imageSha256:
      "e384830beb6b9b1e341e357cab5a27ca2aeb19b7fa91933a17d9a99da4d511ec",
  },
  {
    id: "settings",
    pathname: "/settings",
    pageTitle: "设置",
    sidebarActiveId: "settings",
    headerMode: "global",
    imageSha256:
      "ab32cc156f193da770064434f8b6313a39cede2eb2c656292fe3c5ba7bcef094",
  },
  {
    id: "new-project-overlay",
    pathname: "/projects/new",
    pageTitle: "新建项目",
    sidebarActiveId: "projects",
    headerMode: "global",
    imageSha256:
      "7c4e2a42c9d26b662bcfd4f47e9034068e38fc95abf7cf240ecbc57316db1bb4",
  },
  {
    id: "ai-copilot-overlay",
    pathname: "/?copilot=open",
    pageTitle: "AI 助手",
    sidebarActiveId: "home",
    headerMode: "global",
    imageSha256:
      "fda68da9f7a96d8c07f626bee03baeba889149de3e0eabf3e76805b9020cd6fc",
  },
];
