import type { ProjectStageName } from "@/types/domain";

/**
 * [T-052] 阶段中文名单一词表 —— 全站唯一真值。
 *
 * 审计(ALIGNMENT §三)发现阶段名三套且互相矛盾:列表页 research=「复盘中」(bug)、
 * 各页 研究/调研/选题调研 混用。铁律:名词态/进行态各一套,消费点只从这里取,
 * 不得在页面内再写局部 STAGE_LABELS 字典。
 */

/** 名词态(导航/stepper/徽标):研究 / 策划 / 脚本 / 拍摄 / 发布 / 复盘。 */
export const STAGE_LABELS: Record<ProjectStageName, string> = {
  brief: "立项",
  research: "研究",
  planning: "策划",
  script: "脚本",
  production: "拍摄",
  publishing: "发布",
  review: "复盘",
};

/** 进行态(项目列表状态列等):「研究中」…… publishing 特例为「发布中」。 */
export const STAGE_LABELS_ACTIVE: Record<ProjectStageName, string> = {
  brief: "立项中",
  research: "研究中",
  planning: "策划中",
  script: "写稿中",
  production: "拍摄中",
  publishing: "发布中",
  review: "复盘中",
};

/** 阶段一句话说明(列表副标题等)。 */
export const STAGE_DESCRIPTORS: Record<ProjectStageName, string> = {
  brief: "立项准备",
  research: "调研与洞察",
  planning: "结构大纲",
  script: "完善录制稿",
  production: "录制与剪辑",
  publishing: "发布与分发",
  review: "数据复盘",
};
