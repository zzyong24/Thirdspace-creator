/**
 * [T-136 切片 a] 账号切换器的纯逻辑(与 React / DOM 解耦,单测锁死退化行为)。
 *
 * SPEC §E 退化三态:
 *  ①0 个号 → 引导去绑定(UI 层显绑定入口)。
 *  ②有号但 localStorage 无 current → 自动选「第一个 active」号。
 *  ③localStorage 存的 accountId 已不存在(号被删)→ 自动清除 + 回落自动选号。
 */

// 账号切换器只关心这几个字段(平台账号 DTO 的子集,避免耦合完整 resource)。
export interface SwitcherAccount {
  readonly id: string;
  readonly accountHandle: string;
  readonly platform: string;
  readonly status: "active" | "archived";
}

export interface ResolveResult {
  /** 归一后应选中的 accountId(null = 无可选号,走绑定引导)。 */
  readonly currentId: string | null;
  /** 是否需要把归一结果写回 localStorage(存的 id 失效 / 从无到有时为 true)。 */
  readonly shouldPersist: boolean;
}

/**
 * 从「账号列表 + localStorage 存的 id」归一出当前应选中的号(SPEC §E ②③)。
 *
 * - stored 命中一个 **active** 号 → 保持(shouldPersist=false)。
 * - stored 为空 / 指向已删号 / 指向已归档号 → 自动选第一个 active(shouldPersist=true,写回)。
 * - 无任何 active 号 → currentId=null(UI 引导绑定;shouldPersist 仅在需清除失效 stored 时 true)。
 */
export function resolveCurrentAccount(
  accounts: readonly SwitcherAccount[],
  storedId: string | null,
): ResolveResult {
  const actives = accounts.filter((a) => a.status === "active");

  // stored 命中一个仍 active 的号 → 保持不动。
  if (storedId && actives.some((a) => a.id === storedId)) {
    return { currentId: storedId, shouldPersist: false };
  }

  // 否则自动选第一个 active 号(②有号未选 / ③stored 失效 → 回落自动选)。
  const fallback = actives[0]?.id ?? null;

  // 需要写回的情形:选出了 fallback(与 stored 不同),或 stored 有值但已失效需清除。
  const shouldPersist = fallback !== storedId;

  return { currentId: fallback, shouldPersist };
}

export interface SwitcherGroup {
  readonly id: string;
  readonly name: string;
  readonly status: "active" | "archived";
  readonly members: readonly { readonly accountId: string; readonly leftAt: string | null }[];
}
/** SEMANTIC_BOUNDARY_ALLOW: 仅按真实ID及成员关系归一选中组，不按昵称猜测合并。 */
export function resolveCurrentGroup(groups: readonly SwitcherGroup[], storedId: string | null, legacyAccountId: string | null = null): ResolveResult {
  const active = groups.filter(group => group.status === "active");
  if (storedId && active.some(group => group.id === storedId)) return {currentId:storedId,shouldPersist:false};
  const legacy = legacyAccountId ? active.filter(group => group.members.some(member => member.accountId === legacyAccountId && member.leftAt === null)) : [];
  const currentId = (legacy.length === 1 ? legacy[0]?.id : active[0]?.id) ?? null;
  return {currentId,shouldPersist:currentId !== storedId};
}
