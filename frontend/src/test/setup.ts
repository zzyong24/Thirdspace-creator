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

  // ProseMirror / TipTap (脚本编辑器,T-019) reads geometry off Range and text nodes
  // (coordsAtPos → getClientRects / getBoundingClientRect) while dispatching transactions.
  // jsdom implements neither on Range, so typing throws "getClientRects is not a function".
  // Provide deterministic zero-rects so the editor's selection/scroll bookkeeping no-ops in
  // tests (we never assert on pixel geometry). Harmless for any contenteditable test.
  const ZERO_RECT = {
    bottom: 0,
    height: 0,
    left: 0,
    right: 0,
    top: 0,
    width: 0,
    x: 0,
    y: 0,
    toJSON() {
      return {};
    },
  } as DOMRect;
  const emptyRectList = (): DOMRectList => {
    const list = {
      length: 0,
      item: () => null,
      [Symbol.iterator]: function* () {
        // no rects
      },
    } as unknown as DOMRectList;
    return list;
  };
  if (typeof Range !== "undefined") {
    Object.defineProperties(Range.prototype, {
      getClientRects: {
        configurable: true,
        value: () => emptyRectList(),
        writable: true,
      },
      getBoundingClientRect: {
        configurable: true,
        value: () => ZERO_RECT,
        writable: true,
      },
    });
  }
  if (typeof Element.prototype.getClientRects !== "function") {
    Object.defineProperty(Element.prototype, "getClientRects", {
      configurable: true,
      value: () => emptyRectList(),
      writable: true,
    });
  }
  // ProseMirror's mouse handlers call document.elementFromPoint (caret-from-coord).
  // jsdom does not implement it; return null so coord-based resolution bails harmlessly.
  if (
    typeof document !== "undefined" &&
    typeof document.elementFromPoint !== "function"
  ) {
    Object.defineProperty(document, "elementFromPoint", {
      configurable: true,
      value: () => null,
      writable: true,
    });
  }
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
