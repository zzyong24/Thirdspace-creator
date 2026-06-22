import { expect, test } from "vitest";
import {
  isLocalTestUrl,
  recordExternalNetworkAttempt,
} from "../../tests/helpers/network-policy";

test("allows only exact local browser test hosts", () => {
  expect(isLocalTestUrl("http://localhost:3100/dashboard")).toBe(true);
  expect(isLocalTestUrl("ws://localhost:3100/_next/webpack-hmr")).toBe(true);
  expect(isLocalTestUrl("http://127.0.0.1:3100/dashboard")).toBe(true);
  expect(isLocalTestUrl("ws://127.0.0.1:3100/socket")).toBe(true);
  expect(isLocalTestUrl("https://localhost.example.com/data")).toBe(false);
  expect(isLocalTestUrl("https://127.0.0.1.example.com/data")).toBe(false);
});

test("records every blocked HTTP and WebSocket attempt", () => {
  const attempts: Array<{
    type: "http" | "websocket";
    url: string;
  }> = [];

  expect(
    recordExternalNetworkAttempt(
      attempts,
      "http",
      "http://localhost:3100/api",
    ),
  ).toBe(false);
  expect(
    recordExternalNetworkAttempt(
      attempts,
      "http",
      "https://localhost.example.com/api",
    ),
  ).toBe(true);
  expect(
    recordExternalNetworkAttempt(
      attempts,
      "websocket",
      "wss://127.0.0.1.example.com/socket",
    ),
  ).toBe(true);

  expect(attempts).toEqual([
    {
      type: "http",
      url: "https://localhost.example.com/api",
    },
    {
      type: "websocket",
      url: "wss://127.0.0.1.example.com/socket",
    },
  ]);
});
