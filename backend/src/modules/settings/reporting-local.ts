import { createHmac, randomUUID } from "node:crypto";
import { sql, type Db, encryptSecret } from "@creatoros/backend";
import type { RequestContext } from "@creatoros/contract";

// The candidate checkbox in Settings is presentation only. No row, collection,
// or network request is created until the user explicitly confirms this version.
// Version 1 authorizes local encrypted preparation only. A later remote
// receiver MUST bump this version and obtain a new explicit grant.
export const REPORTING_CONSENT_VERSION = 1;
type Scope = "diagnostics" | "creator";
type ConsentRow = { scope: Scope; account_id: string; enabled: boolean; consent_version: number; consent_epoch: number; account_alias: string | null; changed_at: string };
type Account = { id: string; accountHandle: string; platform: string; status: string };
type Work = { id: string; accountId: string; platform: string; status: string; hiddenAt: string | null; removedAt: string | null; platformStatus: string | null; publishedAt: string | null };
type Snapshot = { id: string; publicationId: string; accountId: string; capturedAt: string; source: string; rawMetrics: unknown };

export interface ReportingLocalPorts {
  getAccount(ctx: RequestContext, id: string): Promise<Account>;
  listAccounts(ctx: RequestContext, page: { limit: number; offset: number }): Promise<{ rows: Account[]; total: number }>;
  listWorks(ctx: RequestContext, page: { limit: number; offset: number }): Promise<Work[]>;
  latestSnapshots(ctx: RequestContext, publicationIds: readonly string[]): Promise<Snapshot[]>;
}

export interface ReportingConsentInput {
  scope: Scope;
  accountId?: string;
  enabled: boolean;
  consentVersion: number;
  consentChangeId: string;
}

const metricKeys = ["plays", "likes", "comments", "shares", "favorites"] as const;

function safeMetric(raw: Record<string, unknown>, key: string): { status: "available" | "unavailable"; value: number | null } {
  const value = raw[key];
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0
    ? { status: "available", value }
    : { status: "unavailable", value: null };
}

// Diagnostics have a separate finite taxonomy. Free text, stack, paths and
// prompt contents are deliberately absent from this type and projection.
export type DiagnosticCode = "operation_failed" | "generation_failed" | "collection_failed" | "render_failed" | "publish_failed" | "startup_failed";

export function createReportingLocal(db: Db, masterKey: Buffer | null | undefined, ports: ReportingLocalPorts, now: () => string) {
  const rows = async (ctx: RequestContext): Promise<ConsentRow[]> => {
    const result = await db.execute(sql`SELECT scope,account_id,enabled,consent_version,consent_epoch,account_alias,changed_at FROM reporting_consents WHERE user_id=${ctx.userId}`);
    return result.rows as ConsentRow[];
  };
  const assertAccount = async (ctx: RequestContext, accountId: string) => {
    const account = await ports.getAccount(ctx, accountId);
    if (account.status !== "active") throw new Error("REPORTING_ACCOUNT_INACTIVE");
    return account;
  };
  const accountRows = async (ctx: RequestContext) => {
    const all: Account[] = [];
    for (let offset = 0;; offset += 100) {
      const page = await ports.listAccounts(ctx, { limit: 100, offset });
      all.push(...page.rows);
      if (all.length >= page.total || page.rows.length === 0) break;
    }
    return all;
  };
  const state = (scope: Scope, account: Account | null, consent: ConsentRow | undefined, counts: Map<string, number>) => {
    const accountId = account?.id ?? null;
    const needsReconsent = Boolean(consent?.enabled && consent.consent_version !== REPORTING_CONSENT_VERSION);
    return {
      scope,
      accountId,
      accountLabel: account?.accountHandle ?? null,
      platform: account?.platform ?? null,
      accountActive: account ? account.status === "active" : true,
      enabled: Boolean(consent?.enabled) && !needsReconsent,
      needsReconsent,
      consentEpoch: consent?.consent_epoch ?? 0,
      changedAt: consent?.changed_at ?? null,
      queuedCount: counts.get(`${scope}:${accountId ?? ""}`) ?? 0,
    };
  };
  const currentConsent = async (ctx: RequestContext, scope: Scope, accountId: string) => {
    const result = await db.execute(sql`SELECT scope,account_id,enabled,consent_version,consent_epoch,account_alias,changed_at FROM reporting_consents WHERE user_id=${ctx.userId} AND scope=${scope} AND account_id=${accountId}`);
    return result.rows[0] as ConsentRow | undefined;
  };
  const enqueue = async (ctx: RequestContext, scope: Scope, accountId: string, consent: ConsentRow, eventId: string, payload: object, workAlias: string | null = null) => {
    if (!masterKey) return false; // Encryption is mandatory; local work continues.
    const createdAt = now();
    const expiresAt = new Date(Date.parse(createdAt) + 7 * 86400000).toISOString();
    const encrypted = encryptSecret(JSON.stringify(payload), masterKey);
    const result = await db.execute(sql`
      INSERT INTO reporting_outbox(event_id,user_id,scope,account_id,work_alias,consent_epoch,encrypted_payload,created_at,expires_at)
      SELECT ${eventId},${ctx.userId},${scope},${accountId},${workAlias},${consent.consent_epoch},${encrypted},${createdAt},${expiresAt}
      WHERE EXISTS (SELECT 1 FROM reporting_consents WHERE user_id=${ctx.userId} AND scope=${scope} AND account_id=${accountId} AND enabled=TRUE AND consent_version=${REPORTING_CONSENT_VERSION} AND consent_epoch=${consent.consent_epoch})
      ON CONFLICT(event_id) DO NOTHING RETURNING event_id`);
    return result.rows.length > 0;
  };
  const prune = async () => {
    await db.execute(sql`DELETE FROM reporting_outbox WHERE expires_at<=${now()}`);
    await db.execute(sql`DELETE FROM reporting_outbox WHERE event_id IN (
      SELECT event_id FROM (
        SELECT event_id,row_number() OVER (PARTITION BY user_id,scope,account_id ORDER BY created_at DESC,event_id DESC) AS position
        FROM reporting_outbox
      ) ranked WHERE position>5000
    )`);
  };
  const enforcePartitionLimit = async (ctx:RequestContext,scope:Scope,accountId:string) => {
    await db.execute(sql`DELETE FROM reporting_outbox WHERE event_id IN (
      SELECT event_id FROM reporting_outbox WHERE user_id=${ctx.userId} AND scope=${scope} AND account_id=${accountId}
      ORDER BY created_at DESC,event_id DESC OFFSET 5000
    )`);
  };

  return {
    prune,
    async status(ctx: RequestContext) {
      await prune();
      const [consents, accounts, queue] = await Promise.all([
        rows(ctx), accountRows(ctx),
        db.execute(sql`SELECT scope,account_id,count(*)::integer AS count FROM reporting_outbox WHERE user_id=${ctx.userId} AND expires_at>${now()} GROUP BY scope,account_id`),
      ]);
      const counts = new Map((queue.rows as Array<{scope:string;account_id:string;count:number}>).map(r => [`${r.scope}:${r.account_id}`, r.count]));
      const find = (scope: Scope, accountId: string) => consents.find(c => c.scope === scope && c.account_id === accountId);
      return {
        consentVersion: REPORTING_CONSENT_VERSION as 1,
        diagnostics: state("diagnostics", null, find("diagnostics", ""), counts),
        accounts: accounts.map(a => state("creator", a, find("creator", a.id), counts)),
        preparationAvailable: Boolean(masterKey),
        // Growth receiver and Activity capability are intentionally absent from
        // this CreatorOS-only delivery. No scheduler may infer upload readiness.
        uploadAvailable: false,
      };
    },
    async setConsent(ctx: RequestContext, input: ReportingConsentInput) {
      if ((input.scope!=="diagnostics" && input.scope!=="creator") || typeof input.enabled!=="boolean" || !/^[0-9a-fA-F-]{36}$/.test(input.consentChangeId)) throw new Error("REPORTING_CONSENT_INVALID");
      if (input.consentVersion !== REPORTING_CONSENT_VERSION) throw new Error("REPORTING_CONSENT_VERSION_MISMATCH");
      if (input.enabled && !masterKey) throw new Error("REPORTING_ENCRYPTION_UNAVAILABLE");
      if (input.scope === "creator") {
        if (!input.accountId) throw new Error("REPORTING_ACCOUNT_REQUIRED");
        if (input.enabled) await assertAccount(ctx, input.accountId);
        else await ports.getAccount(ctx, input.accountId);
      } else if (input.accountId) throw new Error("REPORTING_DIAGNOSTICS_HAS_NO_ACCOUNT");
      const accountId = input.accountId ?? "";
      const stamp = now();
      await db.transaction(async tx => {
        const inserted=await tx.execute(sql`INSERT INTO reporting_consent_changes(user_id,change_id,scope,account_id,enabled,changed_at) VALUES(${ctx.userId},${input.consentChangeId},${input.scope},${accountId},${input.enabled},${stamp}) ON CONFLICT(user_id,change_id) DO NOTHING RETURNING change_id`);
        if (!inserted.rows.length) {
          const prior = await tx.execute(sql`SELECT scope,account_id,enabled FROM reporting_consent_changes WHERE user_id=${ctx.userId} AND change_id=${input.consentChangeId}`);
          const saved = prior.rows[0] as {scope:string;account_id:string;enabled:boolean}|undefined;
          if(!saved)throw new Error("REPORTING_CHANGE_ID_NOT_VISIBLE");
          if (saved.scope !== input.scope || saved.account_id !== accountId || saved.enabled !== input.enabled) throw new Error("REPORTING_CHANGE_ID_CONFLICT");
          return;
        }
        await tx.execute(sql`
          INSERT INTO reporting_consents(user_id,scope,account_id,enabled,consent_version,consent_epoch,account_alias,changed_at)
          VALUES(${ctx.userId},${input.scope},${accountId},${input.enabled},${REPORTING_CONSENT_VERSION},1,${input.scope === "creator" ? randomUUID() : null},${stamp})
          ON CONFLICT(user_id,scope,account_id) DO UPDATE SET enabled=excluded.enabled,consent_version=excluded.consent_version,consent_epoch=reporting_consents.consent_epoch+1,changed_at=excluded.changed_at`);
        if (!input.enabled) await tx.execute(sql`DELETE FROM reporting_outbox WHERE user_id=${ctx.userId} AND scope=${input.scope} AND account_id=${accountId}`);
      });
      return this.status(ctx);
    },
    async clearPending(ctx: RequestContext, scope: Scope, accountId = "") {
      if(scope!=="diagnostics" && scope!=="creator")throw new Error("REPORTING_SCOPE_INVALID");
      if (scope === "creator") await ports.getAccount(ctx, accountId);
      else if (accountId) throw new Error("REPORTING_DIAGNOSTICS_HAS_NO_ACCOUNT");
      await db.execute(sql`DELETE FROM reporting_outbox WHERE user_id=${ctx.userId} AND scope=${scope} AND account_id=${accountId}`);
      return this.status(ctx);
    },
    async captureDiagnostic(ctx: RequestContext, code: DiagnosticCode, referenceId: string, occurredAt: string, operationId?: string) {
      const consent = await currentConsent(ctx, "diagnostics", "");
      if (!consent?.enabled || consent.consent_version !== REPORTING_CONSENT_VERSION) return false;
      if (!/^[a-zA-Z0-9_-]{1,80}$/.test(referenceId) || !Number.isFinite(Date.parse(occurredAt))) return false;
      if (operationId && !/^[a-zA-Z0-9_.-]{1,100}$/.test(operationId)) return false;
      const eventId = createHmac("sha256", masterKey ?? Buffer.alloc(32)).update(`diagnostics:${ctx.userId}:${consent.consent_epoch}:${code}:${referenceId}`).digest("hex");
      const inserted=await enqueue(ctx, "diagnostics", "", consent, eventId, {schemaVersion:1,scope:"diagnostics",eventId,code,referenceId,occurredAt,...(operationId?{operationId}:{})});
      if(inserted) await enforcePartitionLimit(ctx,"diagnostics","");
      return inserted;
    },
    async captureAccountState(ctx: RequestContext, accountId: string, state: "connected" | "collection_succeeded" | "collection_failed" | "needs_reconnect", referenceId: string, observedAt: string) {
      const account=await assertAccount(ctx,accountId);
      const consent=await currentConsent(ctx,"creator",accountId);
      if(!consent?.enabled || consent.consent_version!==REPORTING_CONSENT_VERSION || !consent.account_alias || !masterKey) return false;
      if(!/^[a-zA-Z0-9_-]{1,80}$/.test(referenceId) || !Number.isFinite(Date.parse(observedAt))) return false;
      const eventId=createHmac("sha256",masterKey).update(`account:${consent.account_alias}:${consent.consent_epoch}:${state}:${referenceId}`).digest("hex");
      const inserted=await enqueue(ctx,"creator",accountId,consent,eventId,{
        schemaVersion:1,scope:"creator",eventType:"account_state",eventId,
        accountAlias:consent.account_alias,platform:account.platform,state,
        observedAt,source:state==="connected"?"binding":"job_run",referenceId,
        // T-1020 account-level follower snapshots are not yet available.
        followerCount:{status:"unavailable",value:null,source:null,capturedAt:null},
      });
      if(inserted) await enforcePartitionLimit(ctx,"creator",accountId);
      return inserted;
    },
    async captureAccountMetrics(ctx: RequestContext, accountId: string) {
      const account = await assertAccount(ctx, accountId);
      const consent = await currentConsent(ctx, "creator", accountId);
      if (!consent?.enabled || consent.consent_version !== REPORTING_CONSENT_VERSION || !consent.account_alias || !masterKey) return 0;
      const scoped = {...ctx,accountId};
      let captured = 0;
      const visibleAliases = new Set<string>();
      for (let offset = 0;; offset += 100) {
        const works = await ports.listWorks(scoped, {limit:100,offset});
        if (!works.length) break;
        const visible = works.filter(w => w.accountId === accountId && w.platform === account.platform && w.status === "published" && !w.hiddenAt && !w.removedAt && (w.platformStatus === null || w.platformStatus === "已通过"));
        const snapshots = await ports.latestSnapshots(scoped,visible.map(w => w.id));
        const byId = new Map(snapshots.filter(s => s.accountId === accountId).map(s => [s.publicationId,s]));
        for (const work of visible) {
          const snap = byId.get(work.id);
          if (!snap) continue;
          if (snap.source !== "ingestion" || !Number.isFinite(Date.parse(snap.capturedAt))) continue;
          const raw = typeof snap.rawMetrics === "object" && snap.rawMetrics !== null && !Array.isArray(snap.rawMetrics) ? snap.rawMetrics as Record<string,unknown> : {};
          const workAlias = createHmac("sha256",masterKey).update(`work:${consent.account_alias}:${work.id}`).digest("hex");
          visibleAliases.add(workAlias);
          const eventId = createHmac("sha256",masterKey).update(`snapshot:${consent.account_alias}:${consent.consent_epoch}:${snap.id}`).digest("hex");
          const metrics = Object.fromEntries(metricKeys.map(key => [key,key==="plays"?(safeMetric(raw,"plays").status==="available"?safeMetric(raw,"plays"):safeMetric(raw,"views")):safeMetric(raw,key)]));
          if (await enqueue(ctx,"creator",accountId,consent,eventId,{schemaVersion:1,scope:"creator",eventId,accountAlias:consent.account_alias,workAlias,platform:account.platform,publishedAt:work.publishedAt,capturedAt:snap.capturedAt,source:snap.source,metrics},workAlias)) captured++;
        }
        if (works.length < 100) break;
      }
      // If a work turned private/hidden/removed, its unsent data is no longer
      // eligible even if a previous sweep queued it while the work was public.
      const queued = await db.execute(sql`SELECT event_id,work_alias FROM reporting_outbox WHERE user_id=${ctx.userId} AND scope='creator' AND account_id=${accountId} AND work_alias IS NOT NULL`);
      for (const item of queued.rows as Array<{event_id:string;work_alias:string}>) {
        if (!visibleAliases.has(item.work_alias)) await db.execute(sql`DELETE FROM reporting_outbox WHERE user_id=${ctx.userId} AND scope='creator' AND account_id=${accountId} AND event_id=${item.event_id}`);
      }
      // Bound ordinary queue growth; never touch a control/delete queue.
      await enforcePartitionLimit(ctx,"creator",accountId);
      return captured;
    },
  };
}
