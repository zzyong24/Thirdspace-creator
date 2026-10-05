/** MIT JimLiu/baoyu-skills @1567581c. Adapted workflow, no upstream executable/backend selection. */
export const BAOYU_SERIES_PLANNING_METHOD = `组图方法（源自 baoyu-xhs-images 的逐页大纲，已按本系统改造）：
先理解已确认内容、真实来源和用户目标；按阅读顺序规划每页的核心信息、稿面标题/正文与 visualBrief 画面意图。每页承担明确作用，前后页自然承接，避免重复或突然换话题；开头交代主题，中间逐步展开，末页收束。页数由实际内容与用户选择决定，不套固定数量或平台硬上限。
每页的 visualBrief 描述可见主体、构图、关系、信息密度、共享角色/色调/材质和阅读衔接；它是可编辑的生图要求，不是已经生成的图片。已有 cardId 保留稳定身份，不借改写更换 ID；新增页给唯一 cardId。共享方向仅在用户设置时作为约束，不用关键词选风格。事实只能来自当前内容与绑定来源，来源引用必须完整复制。`;
export const BAOYU_SERIES_IMAGE_METHOD = `组图画面方法（源自 baoyu-xhs-images 的逐页提示、首图参考链和局部重做，已按本系统改造）：
若上下文含 series，读取全部有序 cardBriefs，但只为 targetCardId 指定页生成一张画面；判断该页与前后页的内容关系，使用该页标题/正文/visualBrief 以及 seriesProfile.visualDirection。其他页提供连续阅读语境，不能把全组挤进本页或擅改稿面文字。
用户已明确选择的精确 referenceImage 作为整组视觉锚，延续其中适用的角色、颜色与材质；没有参考也允许生成。先出一页、确认后选择为参考，是可选创作路径，不自动采用图片。重做指定页只修改该页画面，保持共享方向，不声称其他页已改。
画面可按真实页内容安排文字与视觉关系；需要文字时仅使用该页明确稿面文字，不能补造数字/事实，提醒其为待核对位图文字，用户可在画布校正。共享提示与参考只能帮助一致性，不能保证人物、文字或事实准确。`;
