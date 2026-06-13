import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";

class ResizeObserverMock implements ResizeObserver {
  disconnect = vi.fn();
  observe = vi.fn();
  unobserve = vi.fn();
}

class IntersectionObserverMock implements IntersectionObserver {
  readonly root = null;
  readonly rootMargin = "0px";
  readonly thresholds = [0];

  disconnect = vi.fn();
  observe = vi.fn();
  takeRecords = vi.fn(() => []);
  unobserve = vi.fn();
}

function installBrowserShims() {
  const matchMedia = vi.fn(
    (query: string): MediaQueryList => ({
      addEventListener: vi.fn(),
      addListener: vi.fn(),
      dispatchEvent: vi.fn(() => true),
      matches: false,
      media: query,
      onchange: null,
      removeEventListener: vi.fn(),
      removeListener: vi.fn(),
    }),
  );

  Object.defineProperties(globalThis, {
    IntersectionObserver: {
      configurable: true,
      value: IntersectionObserverMock,
    },
    ResizeObserver: {
      configurable: true,
      value: ResizeObserverMock,
    },
  });

  Object.defineProperties(window, {
    matchMedia: {
      configurable: true,
      value: matchMedia,
    },
    scrollTo: {
      configurable: true,
      value: vi.fn(),
    },
  });

  Object.defineProperty(Element.prototype, "scrollTo", {
    configurable: true,
    value: vi.fn(),
  });
}

installBrowserShims();

afterEach(() => {
  cleanup();
  window.history.replaceState(null, "", "/");
  window.localStorage.clear();
  window.sessionStorage.clear();
  document.body.replaceChildren();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.resetAllMocks();
  installBrowserShims();
});
