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

class StorageMock implements Storage {
  private readonly values = new Map<string, string>();

  get length() {
    return this.values.size;
  }

  clear() {
    this.values.clear();
  }

  getItem(key: string) {
    return this.values.get(key) ?? null;
  }

  key(index: number) {
    return Array.from(this.values.keys())[index] ?? null;
  }

  removeItem(key: string) {
    this.values.delete(key);
  }

  setItem(key: string, value: string) {
    this.values.set(String(key), String(value));
  }
}

function installBrowserShims() {
  if (typeof window === "undefined" || typeof Element === "undefined") {
    return;
  }

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
      writable: true,
    },
    ResizeObserver: {
      configurable: true,
      value: ResizeObserverMock,
      writable: true,
    },
  });

  Object.defineProperties(window, {
    matchMedia: {
      configurable: true,
      value: matchMedia,
      writable: true,
    },
    scrollTo: {
      configurable: true,
      value: vi.fn(),
      writable: true,
    },
  });

  for (const name of ["localStorage", "sessionStorage"] as const) {
    if (typeof window[name]?.setItem !== "function") {
      Object.defineProperty(window, name, {
        configurable: true,
        value: new StorageMock(),
      });
    }
  }

  Object.defineProperty(Element.prototype, "scrollTo", {
    configurable: true,
    value: vi.fn(),
    writable: true,
  });

  // Radix UI primitives (Select, DropdownMenu, Tooltip, …) call Pointer
  // Capture and scrollIntoView APIs that jsdom does not implement. Without
  // these shims the primitives throw during open/keyboard interactions.
  Object.defineProperties(Element.prototype, {
    hasPointerCapture: {
      configurable: true,
      value: vi.fn(() => false),
      writable: true,
    },
    setPointerCapture: {
      configurable: true,
      value: vi.fn(),
      writable: true,
    },
    releasePointerCapture: {
      configurable: true,
      value: vi.fn(),
      writable: true,
    },
    scrollIntoView: {
      configurable: true,
      value: vi.fn(),
      writable: true,
    },
  });
}

installBrowserShims();

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.useRealTimers();
  if (typeof window !== "undefined" && typeof document !== "undefined") {
    cleanup();
    window.history.replaceState(null, "", "/");
    if (typeof window.localStorage?.clear === "function") {
      window.localStorage.clear();
    }
    if (typeof window.sessionStorage?.clear === "function") {
      window.sessionStorage.clear();
    }
    document.body.replaceChildren();
  }
  installBrowserShims();
});
