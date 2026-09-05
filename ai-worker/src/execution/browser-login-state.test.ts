import { it, expect } from "vitest";
import { mergeBrowserLoginStates } from "./browser-login-state";
const cookie = (domain: string, value: string) => ({
  name: "session",
  value,
  domain,
  path: "/",
  expires: -1,
  httpOnly: true,
  secure: true,
  sameSite: "Lax",
});
it("合并授权网站快照并按cookie完整身份去重", () => {
  const a = {
    cookies: [cookie("a.example.com", "a")],
    origins: [
      {
        origin: "https://a.example.com",
        localStorage: [{ name: "key", value: "a" }],
      },
    ],
  };
  const b = { cookies: [cookie("b.example.com", "b")], origins: [] };
  const result = mergeBrowserLoginStates([
    JSON.stringify(a),
    JSON.stringify(a),
    null,
    JSON.stringify(b),
  ]);
  expect(result.cookies).toHaveLength(2);
  expect(result.origins).toHaveLength(1);
});
it("同一cookie或origin有冲突不擅自选择值", () => {
  const a = { cookies: [cookie(".example.com", "a")], origins: [] },
    b = { cookies: [cookie(".example.com", "b")], origins: [] };
  expect(() =>
    mergeBrowserLoginStates([JSON.stringify(a), JSON.stringify(b)]),
  ).toThrow("BROWSER_LOGIN_STATE_CONFLICT");
  const origin = (value: string) =>
    JSON.stringify({
      cookies: [],
      origins: [
        {
          origin: "https://example.com",
          localStorage: [{ name: "key", value }],
        },
      ],
    });
  expect(() => mergeBrowserLoginStates([origin("a"), origin("b")])).toThrow(
    "BROWSER_LOGIN_STATE_CONFLICT",
  );
});
it("空快照为真实空值且拒绝损坏结构", () => {
  expect(mergeBrowserLoginStates([null])).toEqual({ cookies: [], origins: [] });
  expect(() => mergeBrowserLoginStates(["{}"])).toThrow();
});
