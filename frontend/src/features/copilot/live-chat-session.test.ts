// @vitest-environment jsdom
import { expect, it, vi } from "vitest";
import { getLiveChatSession } from "./live-chat-session";

it("keeps the same window chat across remounts and isolates account scopes", () => {
  const makeChat = vi.fn(() => ({ token: Symbol("chat") }));
  const first = getLiveChatSession("account-a:scope-a", makeChat);
  first.conversationId = "conversation-a";
  first.epoch = 2;
  const remounted = getLiveChatSession("account-a:scope-a", makeChat);
  const anotherAccount = getLiveChatSession("account-b:scope-a", makeChat);

  expect(remounted).toBe(first);
  expect(remounted.chat).toBe(first.chat);
  expect(remounted.conversationId).toBe("conversation-a");
  expect(remounted.epoch).toBe(2);
  expect(anotherAccount).not.toBe(first);
  expect(makeChat).toHaveBeenCalledTimes(2);
});
