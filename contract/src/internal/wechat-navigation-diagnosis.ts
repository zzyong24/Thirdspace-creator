import {z} from 'zod';
const instant=z.string().datetime();
const hash=z.string().regex(/^[a-f0-9]{64}$/);
export const wechatNavigationScreenshot=z.object({phase:z.enum(['identity_verified','observation_end']),status:z.enum(['captured','missing']),artifactId:z.string().min(1).max(160).optional(),sha256:hash.optional()}).strict();
/** 公共索引不含profile、私有路径、菜单正文、URL或稳定平台身份。 */
export const wechatNavigationDiagnosisResource=z.object({
 diagnosticRunId:z.string().min(1).max(200),status:z.enum(['completed','failed','cancelled','unknown']),reasonCode:z.string().min(1).max(100).nullable(),
 startedAt:instant,deadlineAt:instant,completedAt:instant,scopeProofHash:hash,
 identityMatched:z.boolean().nullable(),sampleCount:z.number().int().min(0).max(32),screenshots:z.array(wechatNavigationScreenshot).max(2),
 stop:z.object({browserOpened:z.boolean(),contextCloseStarted:z.boolean(),physicalStopConfirmed:z.boolean(),physicalStoppedAt:instant.nullable(),hostLeaseReleaseConfirmed:z.boolean(),hostLeaseReleasedAt:instant.nullable(),stopPending:z.boolean()}).strict(),
}).strict();
export type WechatNavigationDiagnosisResource=z.infer<typeof wechatNavigationDiagnosisResource>;
