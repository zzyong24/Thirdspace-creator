import { z } from "zod";
import { id, iso8601 } from "../primitives";

// [T-235c] 指定抖音收藏夹(收藏夹跟拍信号源,SPEC 2026-07-11 daily-topic-autopilot 追加)。
// 用户在抖音建专门收藏夹(如「选题库」),把想跟拍的对标视频收进去;在这里**按夹名登记**要
// 采集的指定夹 —— 系统每天只采登记的夹,不碰其他收藏(隐私红线)。幂等锚 = 同 user 同名唯一
// (name);collectsId 首采时按名精确匹配真机收藏夹回填(登记时用户不知道 id,只知道名字)。
// 单一 wire-shape 真源;模块 favorites.schema.ts re-export(同 trend-source 约定)。

export const favoritesFolderResource = z.object({
  id,
  userId: id,
  groupId:id.nullable().optional(),
  accountId: id.nullable(), // 按抖音号隔离(哪个号在采这个夹)
  name: z.string(), // 收藏夹名(幂等锚:同 user 同名唯一;须与抖音收藏夹同名)
  collectsId: z.string().nullable(), // 抖音 collects_id_str(首采按名匹配回填;未匹配 null)
  note: z.string().nullable(),
  enabled: z.boolean(),
  lastSyncedAt: iso8601.nullable(), // 最近一次成功匹配+采集时刻(未采过 null)
  createdAt: iso8601,
  updatedAt: iso8601,
});
export type FavoritesFolderResource = z.infer<typeof favoritesFolderResource>;
