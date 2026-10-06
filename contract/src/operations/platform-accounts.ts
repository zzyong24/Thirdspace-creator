import { z } from "zod";
import { defineEndpoint } from "../endpoint-definition";
import {
  id,
  paginationQuery,
  platformId,
  platformAccountStatus,
} from "../primitives";
import { platformAccountResource, platformAccountCapabilitiesResource,accountBindingStart,accountBindingResource } from "../resources/platform-accounts";

const accountParams = z.object({ accountId: id });
// New platforms require T-1020's identity-verified bind flow. The legacy manual
// create operation remains limited to the platforms its backend supports.
const legacyManualPlatformId = platformId.exclude(["wechatOfficialAccount"]);

// SPEC §13 "平台账号 (platform-account)" group (七步 §7.1, contract v0.4).
// Stores a secret *reference*, never a raw token.
export const platformAccountOperations = {
  startAccountBinding:defineEndpoint({id:"accounts.bind.start",method:"POST",path:"/accounts/bindings",body:accountBindingStart,response:accountBindingResource,fr:["FR-ACCOUNT-BIND"]}),
  getAccountBinding:defineEndpoint({id:"accounts.bind.status",method:"GET",path:"/accounts/bindings/:runId",params:z.object({runId:id}),response:accountBindingResource,fr:["FR-ACCOUNT-BIND"]}),
  cancelAccountBinding:defineEndpoint({id:"accounts.bind.cancel",method:"POST",path:"/accounts/bindings/:runId/cancel",params:z.object({runId:id}),response:accountBindingResource,fr:["FR-ACCOUNT-BIND"]}),
  getPlatformAccountCapabilities:defineEndpoint({id:"accounts.bindingCapabilities",method:"GET",path:"/accounts/binding-capabilities",response:platformAccountCapabilitiesResource,isList:true,fr:["FR-ACCOUNT-CAPABILITIES"]}),
  listAccounts: defineEndpoint({
    id: "accounts.list",
    method: "GET",
    path: "/accounts",
    query: paginationQuery.extend({ platform: platformId.optional() }),
    response: platformAccountResource,
    isList: true,
    fr: ["FR-ACCOUNT-LIST"],
  }),
  createAccount: defineEndpoint({
    id: "accounts.create",
    method: "POST",
    path: "/accounts",
    body: z.object({
      platform: legacyManualPlatformId,
      accountHandle: z.string().min(1),
      idempotencyKey:z.string().min(1).max(160).optional(),
      secretReference: z.string().optional(),
      followerBaseline: z.number().int().min(0).optional(),
    }),
    response: platformAccountResource,
    fr: ["FR-ACCOUNT-CREATE"],
  }),
  getAccount: defineEndpoint({
    id: "accounts.get",
    method: "GET",
    path: "/accounts/:accountId",
    params: accountParams,
    response: platformAccountResource,
    fr: ["FR-ACCOUNT-GET"],
  }),
  updateAccount: defineEndpoint({
    id: "accounts.update",
    method: "PATCH",
    path: "/accounts/:accountId",
    params: accountParams,
    body: z.object({
      accountHandle: z.string().min(1).optional(),
      secretReference: z.string().optional(),
      followerBaseline: z.number().int().min(0).optional(),
      status: platformAccountStatus.optional(),
    }),
    response: platformAccountResource,
    fr: ["FR-ACCOUNT-UPDATE"],
  }),
  archiveAccount: defineEndpoint({
    id: "accounts.archive",
    method: "POST",
    path: "/accounts/:accountId/archive",
    params: accountParams,
    response: platformAccountResource,
    fr: ["FR-ACCOUNT-ARCHIVE"],
  }),
} as const;
