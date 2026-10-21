/**
 * Contract tests for the overlay routing shells (Task 8).
 *
 * Verifies the architectural contracts from SPEC section 5 and D-006:
 *  - `OverlayController` reads `?copilot=open` from the URL and renders its
 *    children (the AI Copilot panel).
 *  - Closing the overlay removes only the `copilot` query parameter,
 *    preserving the pathname and any other approved search params.
 *  - The overlay responds to Escape.
 *  - Focus is trapped inside an open overlay.
 *  - The trigger that opened the overlay regains focus on close.
 *  - `NewProjectDialog` (the intercepting route shell) renders above a
 *    visible background and closes on browser Back when a background route
 *    exists.
 *
 * The test file doubles as the RED/GREEN contract for Task 8. Until the
 * implementation lands, every test in this file is expected to fail.
 */

import * as React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// ---------------------------------------------------------------------------
// next/navigation mock — controlled per test via `mockNext`.
// ---------------------------------------------------------------------------

interface NextNavState {
  pathname: string;
  searchParams: URLSearchParams;
  replace: ReturnType<typeof vi.fn>;
  back: ReturnType<typeof vi.fn>;
  push: ReturnType<typeof vi.fn>;
  refresh: ReturnType<typeof vi.fn>;
}

const mockNext: {
  state: NextNavState;
  usePathname: () => string;
  useSearchParams: () => URLSearchParams;
  useRouter: () => {
    replace: NextNavState["replace"];
    back: NextNavState["back"];
    push: NextNavState["push"];
    refresh: NextNavState["refresh"];
  };
} = {
  state: {
    pathname: "/",
    searchParams: new URLSearchParams(),
    replace: vi.fn(),
    back: vi.fn(),
    push: vi.fn(),
    refresh: vi.fn(),
  },
  usePathname: () => mockNext.state.pathname,
  useSearchParams: () => mockNext.state.searchParams,
  useRouter: () => ({
    replace: mockNext.state.replace,
    back: mockNext.state.back,
    push: mockNext.state.push,
    refresh: mockNext.state.refresh,
  }),
};

vi.mock("next/navigation", () => ({
  usePathname: () => mockNext.usePathname(),
  useSearchParams: () => mockNext.useSearchParams(),
  useRouter: () => mockNext.useRouter(),
}));

// ---------------------------------------------------------------------------
// contract-client mock — the dialog drives `client.ensureProject` (Task 8).
// The mock returns a project with a deterministic `*-mock-*` id so the test
// can assert that navigation uses the *returned* id rather than a slug guess.
// ---------------------------------------------------------------------------

const mockClient = {
  getAccount: vi.fn(async () => ({status: "active"})),
  getPreferences: vi.fn<() => Promise<{defaultCreationMode?: string}>>(async () => ({})),
  createOutput: vi.fn(async ({body}: {body: {title:string; contentType?:string}}) => ({id:"output-mock-1",projectId:"project-mock-1",title:body.title,contentType:body.contentType ?? "video"})),
  ensureProject: vi.fn(async ({ body }: { body: { title: string } }) => ({
    project:{id: "project-mock-1",title: body.title,currentStage: "research"},sourceReferences:[],preparationTaskId:null,reused:false,
  })),
};

vi.mock("@/lib/contract-client", () => ({
  client: {
    getAccount: () => mockClient.getAccount(),
    getPreferences: () => mockClient.getPreferences(),
    createOutput: (input: {body:{title:string;contentType?:string}}) => mockClient.createOutput(input),
    ensureProject: (input: { body: { title: string } }) =>
      mockClient.ensureProject(input),
  },
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let nextTickListeners: Array<() => void> = [];
function onNextTick(listener: () => void): void {
  nextTickListeners.push(listener);
}
function flushNextTick(): void {
  const listeners = nextTickListeners;
  nextTickListeners = [];
  for (const listener of listeners) listener();
}

let nativeReplace: ReturnType<typeof vi.spyOn>;
function resetNext(initial?: Partial<NextNavState>) {
  mockNext.state.pathname = initial?.pathname ?? "/projects";
  mockNext.state.searchParams = initial?.searchParams ?? new URLSearchParams();
  mockNext.state.replace = vi.fn((target: string) => {
    const [pathname, query] = target.split("?");
    if (pathname) mockNext.state.pathname = pathname;
    mockNext.state.searchParams = new URLSearchParams(query ?? "");
    act(() => {
      flushNextTick();
    });
  });
  nativeReplace?.mockRestore();
  nativeReplace = vi.spyOn(window.history, "replaceState").mockImplementation((_data, _unused, url) => {
    const [pathname, query] = String(url).split("?");
    if (pathname) mockNext.state.pathname = pathname;
    mockNext.state.searchParams = new URLSearchParams(query ?? "");
    act(() => { flushNextTick(); });
  });
  mockNext.state.back = vi.fn();
  mockNext.state.push = vi.fn();
  mockNext.state.refresh = vi.fn();
  nextTickListeners = [];
}

/**
 * Renders the OverlayController inside a test harness that bumps a
 * `useState` counter every time the mocked URL changes. This mirrors
 * what the real Next.js router does and lets React flush effect
 * cleanups (e.g. focus restoration) after the close handler runs.
 */
function RoutedOverlayController({
  children,
}: {
  children: React.ReactNode;
}) {
  const [renderKey, setRenderKey] = React.useState(0);
  React.useEffect(() => {
    onNextTick(() => {
      setRenderKey((value) => value + 1);
    });
  }, []);
  return (
    <React.Fragment key={renderKey}>{children}</React.Fragment>
  );
}

async function importOverlayController() {
  return await import("./overlay-controller");
}

async function importNewProjectDialog() {
  return await import("./new-project-dialog");
}

beforeEach(() => {
  resetNext();
  mockClient.getPreferences.mockReset().mockResolvedValue({});
  mockClient.ensureProject.mockClear();
  mockClient.createOutput.mockClear();
});

afterEach(() => {
  cleanup();
  document.body.replaceChildren();
  nativeReplace?.mockRestore();
});

// ---------------------------------------------------------------------------
// OverlayController
// ---------------------------------------------------------------------------

describe("OverlayController", () => {
  function setViewport(width: number, height: number) {
    Object.defineProperties(window, {
      innerWidth: { configurable: true, value: width },
      innerHeight: { configurable: true, value: height },
    });
  }

  function renderOpenOverlay(
    OverlayController: React.ComponentType<{ children: React.ReactNode }>,
  ) {
    resetNext({
      pathname: "/projects",
      searchParams: new URLSearchParams("copilot=open"),
    });
    return render(
      <RoutedOverlayController>
        <OverlayController>
          <div data-testid="copilot-panel">copilot body</div>
        </OverlayController>
      </RoutedOverlayController>,
    );
  }

  it("[T-906] 默认使用更大的 1080 × 800 助手窗口", async () => {
    setViewport(1440, 1000);
    const { OverlayController } = await importOverlayController();
    renderOpenOverlay(OverlayController);

    const dialog = screen.getByRole("dialog", { name: "AI 助手" });
    expect(dialog).toHaveStyle({ width: "1080px", height: "800px" });
  });

  it("[T-906] 启动时恢复上次保存的窗口尺寸", async () => {
    setViewport(1440, 1000);
    window.localStorage.setItem(
      "creatoros_ai_copilot_size_v1",
      JSON.stringify({ width: 940, height: 690 }),
    );
    const { OverlayController } = await importOverlayController();
    renderOpenOverlay(OverlayController);

    const dialog = screen.getByRole("dialog", { name: "AI 助手" });
    await waitFor(() => {
      expect(dialog).toHaveStyle({ width: "940px", height: "690px" });
    });
  });

  it("[T-906] 保存尺寸超过当前屏幕时仍保持窗口完整可见", async () => {
    setViewport(900, 700);
    window.localStorage.setItem(
      "creatoros_ai_copilot_size_v1",
      JSON.stringify({ width: 1400, height: 960 }),
    );
    const { OverlayController } = await importOverlayController();
    renderOpenOverlay(OverlayController);

    const dialog = screen.getByRole("dialog", { name: "AI 助手" });
    await waitFor(() => {
      expect(dialog).toHaveStyle({ width: "852px", height: "652px" });
    });
  });

  it("[T-906] 拖拽右下角会调整尺寸并持久化", async () => {
    setViewport(1600, 1100);
    const { OverlayController } = await importOverlayController();
    renderOpenOverlay(OverlayController);

    const handle = screen.getByRole("separator", {
      name: "调整 AI 助手大小",
    });
    fireEvent.pointerDown(handle, { clientX: 100, clientY: 100 });
    fireEvent.pointerMove(window, { clientX: 150, clientY: 140 });
    fireEvent.pointerUp(window);

    const dialog = screen.getByRole("dialog", { name: "AI 助手" });
    await waitFor(() => {
      expect(dialog).toHaveStyle({ width: "1180px", height: "880px" });
    });
    expect(
      JSON.parse(
        window.localStorage.getItem("creatoros_ai_copilot_size_v1") ?? "{}",
      ),
    ).toEqual({ width: 1180, height: 880 });
  });

  it("renders nothing when ?copilot=open is absent", async () => {
    resetNext({ pathname: "/projects", searchParams: new URLSearchParams() });
    const { OverlayController } = await importOverlayController();
    const { container } = render(
      <RoutedOverlayController>
        <OverlayController>
          <div data-testid="copilot-panel">copilot body</div>
        </OverlayController>
      </RoutedOverlayController>,
    );
    expect(screen.queryByTestId("copilot-panel")).toBeNull();
    expect(container.firstChild).toBeNull();
  });

  it("renders its children when ?copilot=open is present", async () => {
    const params = new URLSearchParams("copilot=open");
    resetNext({ pathname: "/projects", searchParams: params });
    const { OverlayController } = await importOverlayController();
    render(
      <RoutedOverlayController>
        <OverlayController>
          <div data-testid="copilot-panel">copilot body</div>
        </OverlayController>
      </RoutedOverlayController>,
    );
    expect(screen.getByTestId("copilot-panel")).toBeInTheDocument();
  });

  it("removes only the copilot param on close and preserves pathname", async () => {
    const params = new URLSearchParams("copilot=open&filter=active");
    resetNext({ pathname: "/projects", searchParams: params });
    const { OverlayController } = await importOverlayController();
    render(
      <RoutedOverlayController>
        <OverlayController>
          <div>
            <button type="button" data-testid="copilot-close" data-overlay-close>
              Close
            </button>
          </div>
        </OverlayController>
      </RoutedOverlayController>,
    );

    const close = screen.getByTestId("copilot-close");
    await userEvent.click(close);

    expect(nativeReplace).toHaveBeenCalledTimes(1);
    expect(mockNext.state.replace).not.toHaveBeenCalled();
    const [, , target] = nativeReplace.mock.calls[0] ?? [];
    // `copilot` is removed but the other approved param `filter=active`
    // must survive (SPEC §5: "Closing removes only `copilot`").
    expect(target).toBe("/projects?filter=active");
    expect(mockNext.state.push).not.toHaveBeenCalled();
  });

  it("[T-096 矩阵#6 / T-080 回归] 关闭清掉全部深链伴生参数(surface/fn/prefill/selKind/selId/scope),无残参", async () => {
    // 模拟从复盘一键岛深链打开(带 surface/fn/selection),外加 T-096 的 scope 声明与
    // 一个无关的白名单参数 filter —— 关闭后只有 filter 幸存:残留的 scope/selKind 会让
    // 下一个入口误落上一入口的会话桶/带旧上下文(泄漏路径)。
    const params = new URLSearchParams(
      "copilot=open&surface=review&fn=review.analyze&prefill=x&selKind=project&selId=proj-9&scope=global&filter=active",
    );
    resetNext({ pathname: "/projects", searchParams: params });
    const { OverlayController } = await importOverlayController();
    render(
      <RoutedOverlayController>
        <OverlayController>
          <div>
            <button type="button" data-testid="copilot-close-deep" data-overlay-close>
              Close
            </button>
          </div>
        </OverlayController>
      </RoutedOverlayController>,
    );

    await userEvent.click(screen.getByTestId("copilot-close-deep"));

    const [, , target] = nativeReplace.mock.calls[0] ?? [];
    expect(target).toBe("/projects?filter=active");
  });

  it("closes to just the pathname when no other search params are present", async () => {
    const params = new URLSearchParams("copilot=open");
    resetNext({ pathname: "/projects", searchParams: params });
    const { OverlayController } = await importOverlayController();
    render(
      <RoutedOverlayController>
        <OverlayController>
          <div>
            <button
              type="button"
              data-testid="copilot-close-2"
              data-overlay-close
            >
              Close
            </button>
          </div>
        </OverlayController>
      </RoutedOverlayController>,
    );

    await userEvent.click(screen.getByTestId("copilot-close-2"));

    const [, , target] = nativeReplace.mock.calls[0] ?? [];
    expect(target).toBe("/projects");
  });

  it("closes on Escape", async () => {
    const params = new URLSearchParams("copilot=open");
    resetNext({ pathname: "/projects", searchParams: params });
    const { OverlayController } = await importOverlayController();
    render(
      <RoutedOverlayController>
        <OverlayController>
          <div data-testid="copilot-panel">
            <button type="button">inside</button>
          </div>
        </OverlayController>
      </RoutedOverlayController>,
    );

    await userEvent.keyboard("{Escape}");
    expect(nativeReplace).toHaveBeenCalledTimes(1);
    expect(mockNext.state.replace).not.toHaveBeenCalled();
  });

  it("定位入口未获得浏览器焦点时，关闭仍返回定位入口", async () => {
    resetNext({ pathname: "/positioning", searchParams: new URLSearchParams("copilot=open&surface=positioning") });
    const { OverlayController } = await importOverlayController();
    render(<RoutedOverlayController>
      <a href="?copilot=open&surface=positioning" data-testid="positioning-open-copilot">开始定位对话</a>
      <OverlayController><button data-overlay-close>关闭定位对话</button></OverlayController>
    </RoutedOverlayController>);
    expect(screen.getByRole("dialog", {name:"定位对话"})).toBeInTheDocument();
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(screen.getByTestId("positioning-open-copilot")).toHaveFocus());
  });

  it("traps focus inside the open overlay and restores focus to the trigger on close", async () => {
    // Place a trigger outside the overlay so the trigger can regain focus.
    const trigger = document.createElement("button");
    trigger.type = "button";
    trigger.textContent = "Open copilot";
    trigger.setAttribute("data-overlay-trigger", "true");
    document.body.appendChild(trigger);
    trigger.focus();

    const params = new URLSearchParams("copilot=open");
    resetNext({ pathname: "/projects", searchParams: params });
    const { OverlayController } = await importOverlayController();
    render(
      <RoutedOverlayController>
        <OverlayController>
          <div data-testid="copilot-panel" role="dialog" aria-label="AI 助手">
            <button type="button">first</button>
            <button type="button">second</button>
            <button type="button">third</button>
          </div>
        </OverlayController>
      </RoutedOverlayController>,
    );

    // The overlay moves initial focus into its first focusable.
    await waitFor(() => {
      const active = document.activeElement;
      expect(active).not.toBe(trigger);
      expect(active?.closest('[data-testid="copilot-panel"]')).not.toBeNull();
    });

    // Tabbing from the last focusable wraps back into the dialog rather
    // than leaking back to the trigger button outside the overlay.
    const panel = await screen.findByTestId("copilot-panel");
    const buttons = Array.from(
      panel.querySelectorAll<HTMLElement>("button"),
    );
    const last = screen.getByRole("separator", {
      name: "调整 AI 助手大小",
    });
    const first = buttons[0]!;
    last.focus();

    document.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Tab", bubbles: true }),
    );

    const active = document.activeElement as HTMLElement | null;
    expect(active).not.toBe(trigger);
    expect(panel.contains(active)).toBe(true);
    expect(active).toBe(first);

    // Close via Escape.
    await userEvent.keyboard("{Escape}");

    // Focus restoration happens during the controller's effect cleanup;
    // the replace() triggers a re-render with `open=false`, which runs
    // the cleanup synchronously after commit.
    await waitFor(
      () => {
        expect(document.activeElement).toBe(trigger);
      },
      { timeout: 2000 },
    );
  });
});

// ---------------------------------------------------------------------------
// NewProjectDialog (intercepting route shell)
// ---------------------------------------------------------------------------

describe("NewProjectDialog (intercepting route shell)", () => {
  it("移除无效模式偏好读取，保留主题、描述和多选形式", async () => {
    resetNext({pathname: "/projects/new"});
    const {NewProjectDialog} = await importNewProjectDialog();
    render(<NewProjectDialog />);
    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/作品主题/), "已经填写的主题");
    await user.type(screen.getByLabelText("一句话描述"), "需要保留的资料");
    await user.click(screen.getByLabelText(/图文/));
    await user.selectOptions(screen.getByLabelText("发布目标"), "xiaohongshu");
    expect(mockClient.getPreferences).not.toHaveBeenCalled();
    expect(screen.getByLabelText(/作品主题/)).toHaveValue("已经填写的主题");
    expect(screen.getByLabelText("一句话描述")).toHaveValue("需要保留的资料");
    expect(screen.getByLabelText(/图文/)).toBeChecked();
    expect(screen.getByLabelText(/视频/)).toBeChecked();
    expect(screen.queryByText(/横屏|竖屏|创作模式/)).not.toBeInTheDocument();
  });

  it("renders the dialog shell above the page content", async () => {
    // The dialog renders only on its own route (/projects/new); that is the
    // route the @modal slot mounts it under.
    resetNext({ pathname: "/projects/new", searchParams: new URLSearchParams() });
    const { NewProjectDialog } = await importNewProjectDialog();
    render(
      <>
        <div data-testid="background-page">projects list</div>
        <NewProjectDialog />
      </>,
    );
    const dialog = screen.getByRole("dialog", { name: /新建项目/i });
    expect(dialog).toBeInTheDocument();
    expect(screen.getByTestId("background-page")).toBeInTheDocument();
  });

  it("calls router.back() when a background route exists and Back is requested", async () => {
    // Simulate a history entry by pushing a back action via window.history.
    window.history.pushState(null, "", "/projects");
    resetNext({ pathname: "/projects/new", searchParams: new URLSearchParams() });
    const { NewProjectDialog } = await importNewProjectDialog();
    render(<NewProjectDialog />);
    const close = screen.getByRole("button", { name: /关闭/i });
    await userEvent.click(close);
    expect(mockNext.state.back).toHaveBeenCalledTimes(1);
  });

  it("creates the project through the client and navigates to the returned id", async () => {
    resetNext({ pathname: "/projects/new", searchParams: new URLSearchParams() });
    const { NewProjectDialog } = await importNewProjectDialog();
    render(<NewProjectDialog />);

    // Fill the required name field and submit (enterAfterCreate defaults true).
    const name = screen.getByRole("textbox", { name: /作品主题/i });
    await userEvent.type(name, "新选题");
    window.localStorage.setItem("creatoros:current-account", "account-test");
    const create = screen.getByRole("button", { name: /^创建$/ });
    await userEvent.click(create);

    await waitFor(() => {
      expect(mockClient.ensureProject).toHaveBeenCalledTimes(1);
    });
    // The create payload carries the typed title.
    expect(mockClient.ensureProject.mock.calls[0]![0]).toMatchObject({
      body: { source:"manual",title: "新选题",idempotencyKey:expect.any(String) },
    });
    expect(mockClient.createOutput).toHaveBeenCalledWith(expect.objectContaining({
      params:{projectId:"project-mock-1"}, body:expect.objectContaining({title:"新选题",contentType:"video",clientRequestId:expect.any(String)}),
    }));
    // [T-055a] Navigation lands on the *returned* project id's draft
    // workbench (stage routes retired), not a slug guess derived from the name.
    await waitFor(() => {
      expect(mockNext.state.replace).toHaveBeenCalledTimes(1);
    });
    const [target] = mockNext.state.replace.mock.calls[0] ?? [];
    expect(target).toBe("/projects/project-mock-1");
  });
});


// T1062_COMPONENT_PORT_SEAM: 仅本文件既有业务spies；真实scope/epoch/signal/lifecycle不替换。
vi.mock("@/lib/creation-workspace-scope", async importOriginal => {
  const actual = await importOriginal<typeof import("@/lib/creation-workspace-scope")>();
  const {client: componentPorts} = await import("@/lib/contract-client");
  type Workspace = ReturnType<typeof actual.createCreationWorkspace>;
  type Operation = ReturnType<Workspace["capture"]>;
  const views = new WeakMap<Workspace, Workspace>();
  function portClient(base: Operation["client"], capture: () => Operation): Operation["client"] {
    const methods = new Map<PropertyKey, unknown>();
    return new Proxy(base, {
      get(target, key, receiver) {
        const port = Reflect.get(componentPorts, key);
        const original = Reflect.get(target, key, receiver);
        if (typeof port !== "function") return original;
        if (!methods.has(key)) methods.set(key, async (...args: unknown[]) => {
          const operation = capture();
          operation.assertCurrent();
          try { return await Reflect.apply(Reflect.get(componentPorts, key), componentPorts, args); }
          finally { operation.assertCurrent(); }
        });
        return methods.get(key);
      },
    });
  }
  function view(workspace: Workspace): Workspace {
    const cached = views.get(workspace);
    if (cached) return cached;
    const client = portClient(workspace.client, () => workspace.capture());
    const capture = (): Operation => {
      const operation = workspace.capture();
      return Object.freeze({...operation, client: portClient(operation.client, () => operation)});
    };
    const proxy = new Proxy(workspace, {
      get(target, key) {
        if (key === "client") return client;
        if (key === "capture") return capture;
        // Reflect读取原对象getter，signal/epoch始终是原factory当前值；不spread workspace。
        return Reflect.get(target, key, target);
      },
    });
    views.set(workspace, proxy);
    return proxy;
  }
  return {
    ...actual,
    createCreationWorkspace: (...args: Parameters<typeof actual.createCreationWorkspace>) => view(actual.createCreationWorkspace(...args)),
    useCreationWorkspace: (scope: Parameters<typeof actual.useCreationWorkspace>[0]) => view(actual.useCreationWorkspace(scope)),
    useCreationClient: () => view(actual.useCreationWorkspace(actual.useCreationScope())).client,
  };
});
// T1062_COMPONENT_PORT_SEAM_END
