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
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
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
}

const mockNext: {
  state: NextNavState;
  usePathname: () => string;
  useSearchParams: () => URLSearchParams;
  useRouter: () => { replace: NextNavState["replace"]; back: NextNavState["back"]; push: NextNavState["push"] };
} = {
  state: {
    pathname: "/",
    searchParams: new URLSearchParams(),
    replace: vi.fn(),
    back: vi.fn(),
    push: vi.fn(),
  },
  usePathname: () => mockNext.state.pathname,
  useSearchParams: () => mockNext.state.searchParams,
  useRouter: () => ({
    replace: mockNext.state.replace,
    back: mockNext.state.back,
    push: mockNext.state.push,
  }),
};

vi.mock("next/navigation", () => ({
  usePathname: () => mockNext.usePathname(),
  useSearchParams: () => mockNext.useSearchParams(),
  useRouter: () => mockNext.useRouter(),
}));

// ---------------------------------------------------------------------------
// contract-client mock — the dialog drives `client.createProject` (Task 8).
// The mock returns a project with a deterministic `*-mock-*` id so the test
// can assert that navigation uses the *returned* id rather than a slug guess.
// ---------------------------------------------------------------------------

const mockClient = {
  createProject: vi.fn(async ({ body }: { body: { title: string } }) => ({
    id: "project-mock-1",
    title: body.title,
    currentStage: "research",
  })),
};

vi.mock("@/lib/contract-client", () => ({
  client: {
    createProject: (input: { body: { title: string } }) =>
      mockClient.createProject(input),
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
  mockNext.state.back = vi.fn();
  mockNext.state.push = vi.fn();
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
  mockClient.createProject.mockClear();
});

afterEach(() => {
  cleanup();
  document.body.replaceChildren();
});

// ---------------------------------------------------------------------------
// OverlayController
// ---------------------------------------------------------------------------

describe("OverlayController", () => {
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

    expect(mockNext.state.replace).toHaveBeenCalledTimes(1);
    const [target, opts] = mockNext.state.replace.mock.calls[0] ?? [];
    // `copilot` is removed but the other approved param `filter=active`
    // must survive (SPEC §5: "Closing removes only `copilot`").
    expect(target).toBe("/projects?filter=active");
    expect(opts).toMatchObject({ scroll: false });
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

    const [target] = mockNext.state.replace.mock.calls[0] ?? [];
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
    expect(mockNext.state.replace).toHaveBeenCalledTimes(1);
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
    const last = buttons[buttons.length - 1]!;
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
    const name = screen.getByRole("textbox", { name: /项目名称/i });
    await userEvent.type(name, "新选题");
    const create = screen.getByRole("button", { name: /^创建$/ });
    await userEvent.click(create);

    await waitFor(() => {
      expect(mockClient.createProject).toHaveBeenCalledTimes(1);
    });
    // The create payload carries the typed title.
    expect(mockClient.createProject.mock.calls[0]![0]).toMatchObject({
      body: { title: "新选题" },
    });
    // Navigation lands on the *returned* project id's research workspace, not
    // a slug guess derived from the name.
    await waitFor(() => {
      expect(mockNext.state.replace).toHaveBeenCalledTimes(1);
    });
    const [target] = mockNext.state.replace.mock.calls[0] ?? [];
    expect(target).toBe("/projects/project-mock-1/research");
  });
});