import { z } from "zod";
import { defineEndpoint } from "../endpoint-definition";
import { userResource } from "../resources/settings";

// Identity / auth operations (P2 — 用户注册真账号). Most of the auth surface
// (login / logout / me) is served by BARE Next route handlers, NOT contract
// dispatch ops — Identity historically owns no dispatch op. Registration is the
// first auth action lifted into the contract so its body/response shape is the
// single source of truth shared by the route validator and any typed client.
//
// `POST /auth/register` mints a brand-new EMPTY account: a unique email, a
// password, and an optional displayName (defaults server-side from the email
// local-part). The response is the public `userResource` (the new user's DTO);
// the raw session token is set as an httpOnly cookie by the route, never echoed
// in the body (SPEC §20/§21) — same security posture as login.
export const authOperations = {
  register: defineEndpoint({
    id: "identity.register",
    method: "POST",
    path: "/auth/register",
    body: z.object({
      email: z.string().min(1),
      password: z.string().min(1),
      displayName: z.string().min(1).optional(),
    }),
    response: userResource,
    fr: ["FR-AUTH-REGISTER"],
  }),

  // `PATCH /me` is the second auth action lifted into the contract: the
  // authenticated user's editable profile fields. The body is a partial patch
  // (every key optional) over the identity-owned `users` row — `displayName`
  // backs the Settings 昵称 input and `locale` backs the Settings 系统语言
  // selector (both previously read-only / local-only桩). `email` / `timezone`
  // stay out of the editable surface in this wave (email is the login identifier
  // / unique key; timezone has no dedicated control). The response is the
  // refreshed public `userResource` so the caller can re-render immediately.
  patchProfile: defineEndpoint({
    id: "identity.profile.patch",
    method: "PATCH",
    path: "/me",
    body: z.object({
      displayName: z.string().min(1).optional(),
      locale: z.string().min(1).optional(),
    }),
    response: userResource,
    fr: ["FR-AUTH-PROFILE-UPDATE"],
  }),
} as const;
