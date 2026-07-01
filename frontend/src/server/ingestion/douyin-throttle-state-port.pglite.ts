// 抖音限流状态的 PGlite 适配器(T-038a / SPEC §4.3 [gate-F2])。实现 ThrottleStatePort,
// 走 runtime 现有 PGlite store(与 scheduled_job / job_run 同一个 `db` 句柄),**不是**
// node-postgres 的独立 Pool——仓内 runtime 主库是 Postgres-WASM/PGlite。
//
// 读写照 scheduling.repository.ts 的 drizzle 模式:
//   - 写:db.insert(table).values(...).onConflictDoUpdate({ target, set })(channel PK upsert)。
//   - 读:db.select().from(table).where(eq(table.channel, channel))。
// 表由迁移 0012 建(backend/drizzle/0012_douyin_throttle_state.sql),drizzle 表定义
// douyinThrottleState 在 backend/src/schema/ingestion.ts,经 db.ts 的 schema union 注册。
//
// **非 user-scoped**:采集是账号级全局(单用户本地部署,SPEC §4.3)——不带 user_id,
// channel 即主键。时间戳在库里是 ISO-8601 TEXT(全仓惯例),这里在 epoch ms ↔ ISO 边界转换。

import { douyinThrottleState, eq, type Db } from "@creatoros/backend";
import type { DouyinChannel } from "./douyin-throttle-config";
import type {
  ThrottleStatePort,
  ThrottleStateRecord,
} from "./douyin-request-gateway";

// epoch ms → ISO(null 透传);ISO → epoch ms(null 透传)。库存 ISO TEXT,gateway 用 epoch ms。
function msToIso(ms: number | null): string | null {
  return ms === null ? null : new Date(ms).toISOString();
}
function isoToMs(iso: string | null): number | null {
  if (iso === null) return null;
  const t = Date.parse(iso);
  return Number.isNaN(t) ? null : t;
}

export function createPgliteThrottleStatePort(
  db: Db,
  // 注入时钟仅用于 updated_at 戳(与仓内 deps.now 风格一致);默认真实时钟。
  now: () => string = () => new Date().toISOString(),
): ThrottleStatePort {
  return {
    async load(channel: DouyinChannel): Promise<ThrottleStateRecord | null> {
      const rows = await db
        .select()
        .from(douyinThrottleState)
        .where(eq(douyinThrottleState.channel, channel));
      const row = rows[0];
      if (!row) return null;
      return {
        cooldownUntil: isoToMs(row.cooldownUntil),
        consecutiveThrottles: row.consecutiveThrottles,
        lastRequestAt: isoToMs(row.lastRequestAt),
      };
    },

    async save(
      channel: DouyinChannel,
      state: ThrottleStateRecord,
    ): Promise<void> {
      const updatedAt = now();
      await db
        .insert(douyinThrottleState)
        .values({
          channel,
          cooldownUntil: msToIso(state.cooldownUntil),
          consecutiveThrottles: state.consecutiveThrottles,
          lastRequestAt: msToIso(state.lastRequestAt),
          updatedAt,
        })
        .onConflictDoUpdate({
          target: douyinThrottleState.channel,
          set: {
            cooldownUntil: msToIso(state.cooldownUntil),
            consecutiveThrottles: state.consecutiveThrottles,
            lastRequestAt: msToIso(state.lastRequestAt),
            updatedAt,
          },
        });
    },
  };
}
