import { cleanup, render } from "@testing-library/react";
import { runInNewContext } from "node:vm";
import type { ComponentProps } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/script", () => ({
  default: ({
    id,
    strategy,
    dangerouslySetInnerHTML,
  }: ComponentProps<"script"> & {
    strategy?: string;
  }) => (
    <script
      data-script-id={id}
      data-strategy={strategy}
      dangerouslySetInnerHTML={dangerouslySetInnerHTML}
    />
  ),
}));

import { PreHydrationScripts } from "@/app/layout";

afterEach(() => {
  cleanup();
  localStorage.clear();
  delete document.documentElement.dataset.theme;
  delete document.documentElement.dataset.density;
  document.documentElement.classList.remove("dark");
  vi.restoreAllMocks();
});

describe("PreHydrationScripts", () => {
  it("uses Next beforeInteractive scripts in theme-then-handshake order", () => {
    const { container } = render(<PreHydrationScripts />);
    const scripts = Array.from(container.querySelectorAll("script"));

    expect(scripts).toHaveLength(2);
    expect(scripts.map((script) => script.dataset.scriptId)).toEqual([
      "creatoros-theme-init",
      "creatoros-handshake-fetch",
    ]);
    expect(
      scripts.every(
        (script) => script.dataset.strategy === "beforeInteractive",
      ),
    ).toBe(true);
  });

  it("keeps theme initialization and guarded same-origin handshake semantics", () => {
    const { container } = render(<PreHydrationScripts />);
    const [theme, handshake] = Array.from(
      container.querySelectorAll("script"),
    ).map((script) => script.textContent ?? "");

    expect(theme).toContain("creatoros.settings.theme");
    expect(theme).toContain("classList.toggle('dark'");
    expect(theme).toContain("dataset.theme");

    expect(handshake).toContain("__CREATOROS_HANDSHAKE_TOKEN__");
    expect(handshake).toContain("x-creatoros-handshake");
    expect(handshake).toContain("new URL(u,O).origin===O");
    expect(handshake).toContain("__CREATOROS_FETCH_PATCHED__");
  });

  it.each(["compact", "comfortable", null, "invalid"])(
    "首帧实际脚本从%s恢复合法密度且不写回存储",
    (density) => {
      if (density !== null) localStorage.setItem("creatoros.settings.density", density);
      localStorage.setItem("creatoros.settings.theme", "light");
      document.documentElement.dataset.density = density === "compact" ? "comfortable" : "compact";
      const { container } = render(<PreHydrationScripts />);
      const script = container.querySelector("script")!.textContent!;
      runInNewContext(script, { document, localStorage, window });
      expect(document.documentElement.dataset.density).toBe(density === "compact" ? "compact" : "comfortable");
      expect(document.documentElement.dataset.theme).toBe("light");
      expect(document.documentElement.classList.contains("dark")).toBe(false);
      expect(localStorage.getItem("creatoros.settings.density")).toBe(density);
    },
  );

  it("主题读取失败时首帧仍独立恢复默认密度", () => {
    document.documentElement.dataset.density = "compact";
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("unavailable"); });
    const { container } = render(<PreHydrationScripts />);
    const script = container.querySelector("script")!.textContent!;
    expect(() => runInNewContext(script, { document, localStorage, window })).not.toThrow();
    expect(document.documentElement.dataset.density).toBe("comfortable");
  });
});
