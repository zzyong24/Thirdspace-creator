/**
 * Component tests for the Login client island (Module 00, Task 10).
 *
 * The login form is a greenfield client island (foundation §2 "login page"
 * deliverable; not in roadmap §4 because §4 predates auth). It must:
 *  - render an email input, a password input, and a 登录 submit button,
 *  - POST { email, password } to `/api/v1/auth/login` on submit,
 *  - on 200, redirect to `searchParams.get("from") ?? "/"` via
 *    `router.replace(...)` then revalidate via `router.refresh()`,
 *  - on 401, render an inline error message WITHOUT leaking whether the
 *    email exists (no enumeration — same generic copy as the route).
 *
 * The island owns no routing decisions beyond replace/refresh; it talks to
 * the bare auth route over `fetch` (these are auth routes, not contract
 * dispatch ops — plan Architecture §). `next/navigation` is mocked so the
 * router + search params are observable.
 */

import * as React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mockRouter = {
  replace: vi.fn(),
  refresh: vi.fn(),
  push: vi.fn(),
  back: vi.fn(),
};

let searchParams = new URLSearchParams();

vi.mock("next/navigation", () => ({
  useRouter: () => mockRouter,
  useSearchParams: () => searchParams,
}));

async function importForm() {
  return await import("./login-form");
}

function stubFetch(
  impl: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>,
) {
  const spy = vi.fn(impl);
  vi.stubGlobal("fetch", spy);
  return spy;
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

beforeEach(() => {
  mockRouter.replace.mockClear();
  mockRouter.refresh.mockClear();
  mockRouter.push.mockClear();
  searchParams = new URLSearchParams();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("LoginForm — structure", () => {
  it("renders email + password inputs and a 登录 submit button", async () => {
    const { LoginForm } = await importForm();
    render(<LoginForm />);

    expect(screen.getByLabelText(/邮箱|email/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/密码|password/i)).toBeInTheDocument();
    const submit = screen.getByRole("button", { name: /^登录$/ });
    expect(submit).toHaveAttribute("type", "submit");
  });

  it("uses type=email and type=password for the credential inputs", async () => {
    const { LoginForm } = await importForm();
    render(<LoginForm />);

    expect(screen.getByLabelText(/邮箱|email/i)).toHaveAttribute(
      "type",
      "email",
    );
    expect(screen.getByLabelText(/密码|password/i)).toHaveAttribute(
      "type",
      "password",
    );
  });
});

describe("LoginForm — submit", () => {
  it("POSTs the entered credentials to /api/v1/auth/login", async () => {
    const fetchSpy = stubFetch(() =>
      Promise.resolve(jsonResponse(200, { data: { id: "user-zyongzhu" } })),
    );
    const user = userEvent.setup();
    const { LoginForm } = await importForm();
    render(<LoginForm />);

    await user.type(
      screen.getByLabelText(/邮箱|email/i),
      "zyongzhu@creatoros.local",
    );
    await user.type(screen.getByLabelText(/密码|password/i), "creatoros-dev");
    await user.click(screen.getByRole("button", { name: /^登录$/ }));

    await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(1));
    const [url, init] = fetchSpy.mock.calls[0]!;
    expect(url).toBe("/api/v1/auth/login");
    expect(init?.method).toBe("POST");
    expect(JSON.parse(String(init?.body))).toEqual({
      email: "zyongzhu@creatoros.local",
      password: "creatoros-dev",
    });
  });

  it("redirects to / and refreshes on success when no `from` is present", async () => {
    stubFetch(() =>
      Promise.resolve(jsonResponse(200, { data: { id: "user-zyongzhu" } })),
    );
    const user = userEvent.setup();
    const { LoginForm } = await importForm();
    render(<LoginForm />);

    await user.type(
      screen.getByLabelText(/邮箱|email/i),
      "zyongzhu@creatoros.local",
    );
    await user.type(screen.getByLabelText(/密码|password/i), "creatoros-dev");
    await user.click(screen.getByRole("button", { name: /^登录$/ }));

    await waitFor(() => expect(mockRouter.replace).toHaveBeenCalledWith("/"));
    expect(mockRouter.refresh).toHaveBeenCalledTimes(1);
  });

  it("redirects to the `from` target on success when present", async () => {
    searchParams = new URLSearchParams("from=/settings");
    stubFetch(() =>
      Promise.resolve(jsonResponse(200, { data: { id: "user-zyongzhu" } })),
    );
    const user = userEvent.setup();
    const { LoginForm } = await importForm();
    render(<LoginForm />);

    await user.type(
      screen.getByLabelText(/邮箱|email/i),
      "zyongzhu@creatoros.local",
    );
    await user.type(screen.getByLabelText(/密码|password/i), "creatoros-dev");
    await user.click(screen.getByRole("button", { name: /^登录$/ }));

    await waitFor(() =>
      expect(mockRouter.replace).toHaveBeenCalledWith("/settings"),
    );
    expect(mockRouter.refresh).toHaveBeenCalledTimes(1);
  });

  it("autofill(不触发 React onChange)后仍可提交 —— 凭据从表单 DOM 读,不信 state", async () => {
    // 真机坑:浏览器密码管理器填充只改 DOM value、不派发 React 感知的 change,
    // state 恒空。旧实现按钮死灰 + body 发空。这里用原生 setter 模拟 autofill。
    const fetchSpy = stubFetch(() =>
      Promise.resolve(jsonResponse(200, { data: { id: "user-zyongzhu" } })),
    );
    const { LoginForm } = await importForm();
    const { fireEvent } = await import("@testing-library/react");
    render(<LoginForm />);

    const nativeSetter = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )!.set!;
    nativeSetter.call(
      screen.getByLabelText(/邮箱|email/i),
      "zyongzhu@creatoros.local",
    );
    nativeSetter.call(screen.getByLabelText(/密码|password/i), "creatoros-dev");

    // 按钮不因 state 为空而置灰。
    expect(screen.getByRole("button", { name: /^登录$/ })).toBeEnabled();
    fireEvent.submit(screen.getByTestId("login-form"));

    await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(1));
    const [, init] = fetchSpy.mock.calls[0]!;
    expect(JSON.parse(String(init?.body))).toEqual({
      email: "zyongzhu@creatoros.local",
      password: "creatoros-dev",
    });
  });

  it("空表单提交 → 内联提示「请输入邮箱和密码」,不发请求", async () => {
    const fetchSpy = stubFetch(() =>
      Promise.resolve(jsonResponse(200, { data: {} })),
    );
    const user = userEvent.setup();
    const { LoginForm } = await importForm();
    render(<LoginForm />);

    await user.click(screen.getByRole("button", { name: /^登录$/ }));

    await waitFor(() => {
      expect(screen.getByRole("alert").textContent).toContain(
        "请输入邮箱和密码",
      );
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("renders an inline error and does not navigate on 401", async () => {
    stubFetch(() =>
      Promise.resolve(
        jsonResponse(401, {
          error: { code: "AuthenticationError", message: "Invalid credentials" },
        }),
      ),
    );
    const user = userEvent.setup();
    const { LoginForm } = await importForm();
    render(<LoginForm />);

    await user.type(
      screen.getByLabelText(/邮箱|email/i),
      "zyongzhu@creatoros.local",
    );
    await user.type(screen.getByLabelText(/密码|password/i), "wrong-password");
    await user.click(screen.getByRole("button", { name: /^登录$/ }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeInTheDocument();
    });
    // No enumeration: the error copy must not echo the submitted email.
    expect(screen.getByRole("alert").textContent).not.toContain(
      "zyongzhu@creatoros.local",
    );
    expect(mockRouter.replace).not.toHaveBeenCalled();
    expect(mockRouter.refresh).not.toHaveBeenCalled();
  });
});
