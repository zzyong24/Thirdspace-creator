/**
 * Session-guard tests for the (creator) segment layout (Module 00, Task 11).
 *
 * The (creator) layout is the single shell wrapping every authenticated page.
 * Foundation §2 makes it the session guard:
 *  - no / invalid session cookie → `redirect("/login?from=<pathname>")`,
 *  - a valid cookie → derive `ctx`, render children, and bind the Shell user
 *    card to the REAL identity (`displayName` / `email` from the resolved
 *    user — the `userResource` shape `settings.get` will eventually serve).
 *
 * `next/headers` (cookies + headers), `next/navigation` (redirect +
 * usePathname/useSearchParams used by the client ShellRouter island), and the
 * shared identity service are all mocked so the async server layout is
 * exercisable in jsdom without the Next server runtime.
 */

import * as React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

// --- next/navigation: redirect throws (Next semantics) so control stops; the
//     client ShellRouter island reads usePathname/useSearchParams. ---
class RedirectError extends Error {
  constructor(public readonly target: string) {
    super(`NEXT_REDIRECT:${target}`);
  }
}
const redirect = vi.fn((target: string) => {
  throw new RedirectError(target);
});
vi.mock("next/navigation", () => ({
  redirect: (target: string) => redirect(target),
  usePathname: () => "/settings",
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({
    replace: vi.fn(),
    refresh: vi.fn(),
    push: vi.fn(),
    back: vi.fn(),
  }),
}));

// --- next/headers: cookies() + headers() are async in Next 16. ---
let cookieValue: string | undefined;
let pathnameHeader: string | undefined;
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      name === "creatoros_session" && cookieValue !== undefined
        ? { name, value: cookieValue }
        : undefined,
  }),
  headers: async () => ({
    get: (name: string) =>
      name === "x-pathname" ? (pathnameHeader ?? null) : null,
  }),
}));

// --- identity service: resolve a ctx from the cookie + return the user. ---
const CANONICAL_USER = {
  id: "user-zyongzhu",
  email: "zyongzhu@creatoros.local",
  displayName: "Zyong Zhu",
  timezone: "Asia/Shanghai",
  locale: "zh-CN",
  createdAt: "2025-01-01T00:00:00.000Z",
  updatedAt: "2025-01-01T00:00:00.000Z",
};

const resolveContextFromToken = vi.fn();
const resolveLocalContext = vi.fn();
const getCurrentUser = vi.fn();
vi.mock("@/server/persistence-client", () => ({
  getIdentityService: async () => ({
    resolveContextFromToken,
    resolveLocalContext,
    getCurrentUser,
  }),
}));

// --- contract-client.server: the layout's G1 notifications read + [T-332 S4]
//     the accounts.list read (0 号守卫判定)。Stub the server client so the guard
//     test stays focused on identity (and never pulls the real compositeTransport
//     / pglite into jsdom). listAccounts 默认返回一个 active 号(非 0 号),
//     0 号用例各自覆盖为 []。 ---
const listNotifications = vi.fn(async () => [] as unknown[]);
const listAccounts = vi.fn(async () => [{ status: "active" }] as unknown[]);
vi.mock("@/lib/contract-client.server", () => ({
  createServerClient: () => ({ listNotifications, listAccounts }),
}));

// --- T-147 P5 激活门:这些 session-guard 测试聚焦身份守卫,激活门默认放行(=web/dev 语义)。
//     激活门的桌面拦/web 跳逻辑由 activation-gate.server.test.ts 专门覆盖。 ---
vi.mock("@/lib/activation-gate.server", () => ({
  isActivationAllowed: async () => true,
}));

async function importLayout() {
  return (await import("./layout")).default;
}

// AuthenticationError must be the SAME class instance the layout's module graph
// catches. With `vi.resetModules()` between tests the dynamic layout import gets
// a fresh identity module, so we import the error from that same fresh graph
// (after resetModules) rather than a stale top-level import.
async function importAuthenticationError() {
  return (await import("@creatoros/backend/modules/identity")).AuthenticationError;
}

beforeEach(() => {
  redirect.mockClear();
  resolveContextFromToken.mockReset();
  resolveLocalContext.mockReset();
  getCurrentUser.mockReset();
  listNotifications.mockClear();
  listAccounts.mockReset();
  listAccounts.mockResolvedValue([{ status: "active" }]); // 默认非 0 号
  cookieValue = undefined;
  pathnameHeader = "/settings";
});

afterEach(() => {
  cleanup();
  vi.resetModules();
});

describe("(creator) layout — session guard", () => {
  // [T-046 单机免登录] 无/坏 cookie 不再弹 /login —— resolveSession 以本机主用户直通,
  // shell 正常渲染。redirect 仅剩「库中无任何用户」的异常态兜底(seed 保证不发生)。
  it("no cookie → 直通本机主用户渲染 shell(T-046,不再弹 /login)", async () => {
    cookieValue = undefined;
    resolveLocalContext.mockResolvedValue({
      userId: "user-zyongzhu",
      requestId: "req-local-1",
      source: "user",
    });
    getCurrentUser.mockResolvedValue(CANONICAL_USER);
    const Layout = await importLayout();

    const tree = await Layout({
      children: <div data-testid="guarded-child">guarded</div>,
      modal: null,
    });
    render(tree);

    expect(redirect).not.toHaveBeenCalled();
    expect(resolveContextFromToken).not.toHaveBeenCalled();
    expect(resolveLocalContext).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("guarded-child")).toBeInTheDocument();
  });

  it("invalid cookie(resolve throws AuthenticationError)→ fallback 本机主用户,不弹 /login", async () => {
    cookieValue = "garbage-token";
    const AuthenticationError = await importAuthenticationError();
    resolveContextFromToken.mockRejectedValue(new AuthenticationError());
    resolveLocalContext.mockResolvedValue({
      userId: "user-zyongzhu",
      requestId: "req-local-2",
      source: "user",
    });
    getCurrentUser.mockResolvedValue(CANONICAL_USER);
    const Layout = await importLayout();

    const tree = await Layout({
      children: <div data-testid="guarded-child">guarded</div>,
      modal: null,
    });
    render(tree);

    expect(redirect).not.toHaveBeenCalled();
    expect(resolveLocalContext).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("guarded-child")).toBeInTheDocument();
  });

  // [FE-H03] 通知读取失败绝不拖垮整个登录后布局(首页/项目/素材/发布/设置全靠这个 layout)。
  it("通知读取失败 → 优雅降级(空铃铛),children 仍正常渲染,不弹 /login、不抛错", async () => {
    cookieValue = "valid-raw-token";
    resolveContextFromToken.mockResolvedValue({
      userId: "user-zyongzhu",
      requestId: "req-notif-fail",
      source: "user",
    });
    getCurrentUser.mockResolvedValue(CANONICAL_USER);
    // 通知请求炸掉(transport / DB error)。
    listNotifications.mockRejectedValueOnce(new Error("notifications transport down"));

    const Layout = await importLayout();
    const tree = await Layout({
      children: <div data-testid="guarded-child">guarded</div>,
      modal: null,
    });
    render(tree);

    expect(redirect).not.toHaveBeenCalled();
    // 布局照常渲染 children —— 次要铃铛失败没有拖垮页面。
    expect(screen.getByTestId("guarded-child")).toBeInTheDocument();
    // 铃铛降级为空(无未读徽标)。
    expect(
      document.querySelector('[data-slot="notification-unread-badge"]'),
    ).toBeNull();
  });

  it("renders children + the user card bound to the canonical user on a valid session", async () => {
    cookieValue = "valid-raw-token";
    resolveContextFromToken.mockResolvedValue({
      userId: "user-zyongzhu",
      requestId: "req-1",
      source: "user",
    });
    getCurrentUser.mockResolvedValue(CANONICAL_USER);

    const Layout = await importLayout();
    const tree = await Layout({
      children: <div data-testid="guarded-child">guarded</div>,
      modal: null,
    });
    render(tree);

    expect(redirect).not.toHaveBeenCalled();
    expect(resolveContextFromToken).toHaveBeenCalledWith("valid-raw-token");
    expect(getCurrentUser).toHaveBeenCalledWith({
      userId: "user-zyongzhu",
      requestId: "req-1",
      source: "user",
    });

    // children render inside the shell
    expect(screen.getByTestId("guarded-child")).toBeInTheDocument();

    // the user card renders the REAL identity (not a hardcoded fixture import):
    const userCard = screen.getByTestId("app-sidebar");
    expect(userCard.textContent).toContain("Zyong Zhu");
    expect(userCard.textContent).toContain("zyongzhu@creatoros.local");
  });
});

// [T-332 S4 / T-348] 0 号(名下无 active 抖音号)引导守卫:首页放行(承接引导流),
// 其余 per-account 页整页替换为绑定引导;读失败 fail-open(守卫是引导,不是安全门)。
describe("(creator) layout — [T-348] 0 号引导守卫", () => {
  async function renderAt(pathname: string) {
    cookieValue = "valid-raw-token";
    resolveContextFromToken.mockResolvedValue({
      userId: "user-zyongzhu",
      requestId: "req-guard",
      source: "user",
    });
    getCurrentUser.mockResolvedValue(CANONICAL_USER);
    pathnameHeader = pathname;
    const Layout = await importLayout();
    const tree = await Layout({
      children: <div data-testid="guarded-child">guarded</div>,
      modal: null,
    });
    return render(tree);
  }

  it("0 号 + 首页 `/` → 放行,渲染 children(首页承接 OnboardingCard 引导流,不被守卫盖)", async () => {
    listAccounts.mockResolvedValue([]); // 无 active 号 = 0 号
    await renderAt("/");
    expect(screen.getByTestId("guarded-child")).toBeInTheDocument();
    // 首页放行 → 不渲绑定引导整页。
    expect(
      document.querySelector('[data-testid="zero-account-guidance"]'),
    ).toBeNull();
  });

  it("0 号 + 知识库 → 放行 children,让默认随包课程在未绑定账号时也能阅读", async () => {
    listAccounts.mockResolvedValue([]);
    await renderAt("/knowledge");
    expect(screen.getByTestId("guarded-child")).toBeInTheDocument();
    expect(
      document.querySelector('[data-testid="zero-account-guidance"]'),
    ).toBeNull();
  });

  it("0 号 + per-account 页(/projects)→ 守卫,渲染绑定引导(不渲 children)", async () => {
    listAccounts.mockResolvedValue([]);
    await renderAt("/projects");
    expect(screen.getByTestId("zero-account-guidance")).toBeInTheDocument();
    expect(document.querySelector('[data-testid="guarded-child"]')).toBeNull();
  });

  it("有 active 号 + per-account 页(/projects)→ 不守卫,渲染 children", async () => {
    listAccounts.mockResolvedValue([{ status: "active" }]);
    await renderAt("/projects");
    expect(screen.getByTestId("guarded-child")).toBeInTheDocument();
    expect(
      document.querySelector('[data-testid="zero-account-guidance"]'),
    ).toBeNull();
  });

  it("accounts.list 读失败 → fail-open,per-account 页仍渲 children(守卫是引导,非安全门)", async () => {
    listAccounts.mockRejectedValue(new Error("transport down"));
    await renderAt("/projects");
    expect(screen.getByTestId("guarded-child")).toBeInTheDocument();
  });
});
