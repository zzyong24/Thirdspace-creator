import { render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

let fakeSetTimeout: typeof globalThis.setTimeout | undefined;
let warnSpy: typeof console.warn | undefined;

test("provides jest-dom matchers to component tests", () => {
  render(<button type="button">Create project</button>);

  expect(
    screen.getByRole("button", { name: "Create project" }),
  ).toBeInTheDocument();
});

test("installs writable browser API shims", () => {
  expect(
    Object.getOwnPropertyDescriptor(window, "matchMedia")?.writable,
  ).toBe(true);
  expect(
    Object.getOwnPropertyDescriptor(globalThis, "ResizeObserver")?.writable,
  ).toBe(true);
  expect(
    Object.getOwnPropertyDescriptor(
      globalThis,
      "IntersectionObserver",
    )?.writable,
  ).toBe(true);
  expect(
    Object.getOwnPropertyDescriptor(Element.prototype, "scrollTo")?.writable,
  ).toBe(true);
});

describe.sequential("test environment cleanup", () => {
  test("can dirty shared browser and test state", () => {
    vi.useFakeTimers();
    fakeSetTimeout = globalThis.setTimeout;
    vi.stubEnv("CREATOROS_TEST_LEAK", "dirty");
    window.history.pushState(null, "", "/leaked?state=dirty");
    window.localStorage.setItem("leaked", "local");
    window.sessionStorage.setItem("leaked", "session");
    document.body.append(document.createElement("aside"));
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    expect(process.env.CREATOROS_TEST_LEAK).toBe("dirty");
    expect(window.location.pathname).toBe("/leaked");
    expect(warnSpy).toBe(console.warn);
  });

  test("starts the next test with deterministic shared state", () => {
    expect(globalThis.setTimeout).not.toBe(fakeSetTimeout);
    expect(process.env.CREATOROS_TEST_LEAK).toBeUndefined();
    expect(window.location.pathname).toBe("/");
    expect(window.location.search).toBe("");
    expect(window.localStorage).toHaveLength(0);
    expect(window.sessionStorage).toHaveLength(0);
    expect(document.body).toBeEmptyDOMElement();
    expect(console.warn).not.toBe(warnSpy);
  });
});
