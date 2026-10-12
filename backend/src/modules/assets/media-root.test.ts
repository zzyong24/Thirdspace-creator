import { afterEach, describe, expect, it } from "vitest";
import * as os from "node:os";
import * as path from "node:path";

import { blobRouteRoot, defaultMediaRoot, resolveRootPath } from "./media-root";

const originalMediaRoot = process.env.CREATOROS_MEDIA_ROOT;

afterEach(() => {
  if (originalMediaRoot === undefined) delete process.env.CREATOROS_MEDIA_ROOT;
  else process.env.CREATOROS_MEDIA_ROOT = originalMediaRoot;
});

describe("media root resolution", () => {
  it("preserves the hard default when no environment root is configured", () => {
    delete process.env.CREATOROS_MEDIA_ROOT;
    const expected = path.join(os.homedir(), "CreatorOS", "media");

    expect(defaultMediaRoot()).toBe(expected);
    expect(resolveRootPath(null)).toBe(expected);
    expect(resolveRootPath("  ")).toBe(expected);
    expect(blobRouteRoot()).toBe(expected);
  });

  it("uses the configured media root only for empty persisted paths", () => {
    process.env.CREATOROS_MEDIA_ROOT = " /tmp/creatoros-isolated-media ";
    const configured = path.resolve("/tmp/creatoros-isolated-media");

    expect(defaultMediaRoot()).toBe(configured);
    expect(resolveRootPath(null)).toBe(configured);
    expect(resolveRootPath(undefined)).toBe(configured);
    expect(resolveRootPath("  ")).toBe(configured);
    expect(blobRouteRoot()).toBe(configured);
    expect(resolveRootPath("/persisted/custom-media")).toBe(
      path.resolve("/persisted/custom-media"),
    );
  });

  it("expands a configured home-relative root without changing HOME", () => {
    const home = os.homedir();
    process.env.CREATOROS_MEDIA_ROOT = "~/CreatorOS/test-media";

    expect(defaultMediaRoot()).toBe(path.resolve(home, "CreatorOS/test-media"));
    expect(resolveRootPath("~/saved-media")).toBe(path.resolve(home, "saved-media"));
    expect(os.homedir()).toBe(home);
  });

  it("falls back to the original hard default for an empty environment value", () => {
    process.env.CREATOROS_MEDIA_ROOT = "   ";
    const expected = path.join(os.homedir(), "CreatorOS", "media");

    expect(defaultMediaRoot()).toBe(expected);
    expect(resolveRootPath(null)).toBe(expected);
    expect(blobRouteRoot()).toBe(expected);
  });
});
