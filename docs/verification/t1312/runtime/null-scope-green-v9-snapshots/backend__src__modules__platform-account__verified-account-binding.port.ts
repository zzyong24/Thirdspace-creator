import { and, eq } from "drizzle-orm";
import { platformId } from "@creatoros/contract";
import type { Db } from "../../db";
import { platformAccounts } from "./platform-account.db-schema";

type BindingTx = Parameters<Parameters<Db["transaction"]>[0]>[0];

export class VerifiedAccountBindingError extends Error {
  constructor(public readonly code: "FORBIDDEN_ACCOUNT" | "WRONG_PLATFORM_IDENTITY", message: string) {
    super(message);
    this.name = "VerifiedAccountBindingError";
  }
}

export interface VerifiedAccountBindingPortDeps {
  now: () => string;
  nextId: (prefix: string) => string;
  // The adapter registry supplies the platforms for which identity proof is active.
  allowedPlatforms: ReadonlySet<string>;
}

/**
 * PlatformAccount-owned service port for the T-1020 bind-confirm transaction.
 * The caller owns the transaction and the trusted proof; this port owns account
 * creation and reconnection. Manual createAccount remains on its older allowlist.
 */
export function createVerifiedAccountBindingPort(deps: VerifiedAccountBindingPortDeps) {
  return {
    async claimVerifiedAccount(tx: BindingTx, input: {
      userId: string; platform: string; platformIdentity: string; existingAccountId: string | null;
    }): Promise<{ accountId: string }> {
      if (!platformId.safeParse(input.platform).success || !deps.allowedPlatforms.has(input.platform) ||
        !input.userId || !input.platformIdentity.trim()) {
        throw new VerifiedAccountBindingError("WRONG_PLATFORM_IDENTITY", "该平台没有可用的受信身份适配器");
      }
      if (input.existingAccountId) {
        const [claimed] = await tx.select().from(platformAccounts).where(and(
          eq(platformAccounts.id, input.existingAccountId), eq(platformAccounts.userId, input.userId))).for("update");
        if (!claimed) throw new VerifiedAccountBindingError("FORBIDDEN_ACCOUNT", "账号不属于当前用户");
        if (claimed.platform !== input.platform || claimed.externalAccountId !== input.platformIdentity) {
          throw new VerifiedAccountBindingError("WRONG_PLATFORM_IDENTITY", "平台身份与已绑定账号不一致");
        }
        if (claimed.status !== "active") await tx.update(platformAccounts).set({ status: "active", updatedAt: deps.now() })
          .where(eq(platformAccounts.id, claimed.id));
        return { accountId: claimed.id };
      }
      const identityWhere = and(eq(platformAccounts.userId, input.userId), eq(platformAccounts.platform, input.platform),
        eq(platformAccounts.externalAccountId, input.platformIdentity));
      const [sameIdentity] = await tx.select().from(platformAccounts).where(identityWhere).for("update");
      if (sameIdentity) {
        if (sameIdentity.status !== "active") await tx.update(platformAccounts).set({ status: "active", updatedAt: deps.now() })
          .where(eq(platformAccounts.id, sameIdentity.id));
        return { accountId: sameIdentity.id };
      }
      const [created] = await tx.insert(platformAccounts).values({
        id: deps.nextId("acct"), userId: input.userId, platform: input.platform,
        externalAccountId: input.platformIdentity, accountHandle: input.platformIdentity,
        status: "active", createdAt: deps.now(), updatedAt: deps.now(),
      }).onConflictDoNothing().returning({ id: platformAccounts.id });
      if (created) return { accountId: created.id };
      // A concurrent claimant may have inserted the same scoped identity. Resolve
      // by that exact key; never fall back to display name or another user's row.
      const [raced] = await tx.select().from(platformAccounts).where(identityWhere).for("update");
      if (!raced) throw new VerifiedAccountBindingError("WRONG_PLATFORM_IDENTITY", "账号身份占用冲突");
      if (raced.status !== "active") await tx.update(platformAccounts).set({ status: "active", updatedAt: deps.now() })
        .where(eq(platformAccounts.id, raced.id));
      return { accountId: raced.id };
    },
  };
}
