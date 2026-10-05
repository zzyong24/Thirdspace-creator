import {visualTemplateResource,type VisualTemplate} from "@creatoros/contract";
/** 作者明确编辑的内容目录；仅按用户筛选选用，不推断行业或创作语义。MIT预览来源见公共T1025-SOURCES.json。 */
export const expandedVisualTemplates:ReadonlyArray<VisualTemplate> = [
  {
    "id": "real-person-whiteboard",
    "scope": "builtin",
    "revision": 1,
    "libraryKind": "cover",
    "industries": [
      "教育学习",
      "科技数码",
      "职场成长",
      "商业服务"
    ],
    "visualMode": "real_person",
    "kind": "style",
    "name": "真人白板讲解",
    "prompt": "标题：{{本期标题}}。内容：{{当前确认稿}}。使用用户选择的本人原图保留五官、发型与自然肤色。暖白、深蓝、铜橙；大标题与本人半身、简洁白板并列，把本期具体问题拆成清楚步骤。按用户比例重新构图，标题不压住脸，不复制示例人物、问题或数字。样图为AI人物构图示意，生成必须换本人照片。",
    "aspectRatio": "16:9",
    "aspectRatios": [
      "1:1",
      "3:4",
      "16:9",
      "9:16",
      "2:3",
      "3:2",
      "4:3",
      "4:5",
      "5:4",
      "21:9"
    ],
    "references": [],
    "sourceTemplateId": "real-person-whiteboard",
    "pageRecipes": [],
    "requiredIdentity": true,
    "previewPath": "/visual-templates/public-person-wide.png",
    "createdAt": "2026-10-04T08:00:00.000Z",
    "updatedAt": "2026-10-04T08:00:00.000Z"
  },
  {
    "id": "photo-product-tech",
    "scope": "builtin",
    "revision": 1,
    "libraryKind": "cover",
    "industries": [
      "科技数码",
      "职场成长"
    ],
    "visualMode": "photo_product",
    "kind": "style",
    "name": "数码实拍 · 三点测评",
    "prompt": "标题：{{本期标题}}。内容：{{当前确认稿}}。先选择本期真实产品照片作为内容参考，保留真实外观、标识、结构和配色；蓝白自然光桌面，产品置于下半区，大标题在上，三个简短注释只来自本期确认内容。不编价格、评分、续航或性能数据，不把AI示意当成实拍。样图仅供构图，所有文字和产品换成用户实际素材。",
    "aspectRatio": "3:4",
    "aspectRatios": [
      "1:1",
      "3:4",
      "16:9",
      "9:16",
      "2:3",
      "3:2",
      "4:3",
      "4:5",
      "5:4",
      "21:9"
    ],
    "references": [],
    "sourceTemplateId": "photo-product-tech",
    "pageRecipes": [],
    "requiredIdentity": false,
    "previewPath": "/visual-templates/product-tech.png",
    "createdAt": "2026-10-04T08:00:00.000Z",
    "updatedAt": "2026-10-04T08:00:00.000Z"
  },
  {
    "id": "photo-product-beauty",
    "scope": "builtin",
    "revision": 1,
    "libraryKind": "cover",
    "industries": [
      "美妆护肤",
      "商业服务"
    ],
    "visualMode": "photo_product",
    "kind": "style",
    "name": "美妆实拍 · 质地笔记",
    "prompt": "标题：{{本期标题}}。内容：{{当前确认稿}}。先选择本期产品实拍，保留真实包装、文字、瓶型与颜色。暖白淡杏背景、自然窗光、商品近景与质地细节、小面积注释，标题清楚留上半区。只用用户提供的成分、使用记录或材料；不编造疗效、认证、天数或测试结果。样图为AI示意，不能冒充本期产品实拍。",
    "aspectRatio": "3:4",
    "aspectRatios": [
      "1:1",
      "3:4",
      "16:9",
      "9:16",
      "2:3",
      "3:2",
      "4:3",
      "4:5",
      "5:4",
      "21:9"
    ],
    "references": [],
    "sourceTemplateId": "photo-product-beauty",
    "pageRecipes": [],
    "requiredIdentity": false,
    "previewPath": "/visual-templates/product-beauty.png",
    "createdAt": "2026-10-04T08:00:00.000Z",
    "updatedAt": "2026-10-04T08:00:00.000Z"
  },
  {
    "id": "github-cover-dot-matrix",
    "scope": "builtin",
    "revision": 1,
    "libraryKind": "cover",
    "industries": [
      "科技数码",
      "教育学习",
      "商业服务"
    ],
    "visualMode": "graphic",
    "kind": "style",
    "name": "点阵浅色封面",
    "prompt": "标题：{{本期标题}}。内容：{{当前确认稿}}。浅灰纸面、细网格、低对比点阵场、墨黑清楚大标题；示意图用于解释，真实数字必须由用户提供。按用户明确比例重新安排；中文标题完整且手机可读，四周留安全边距。风格参考：Lieflat HTML Design（MIT）。预览是开源示例；示例的产品、作者、日期、指标和结论都不是本期事实，全部替换，不复制示例正文。",
    "aspectRatio": "3:4",
    "aspectRatios": [
      "1:1",
      "3:4",
      "16:9",
      "9:16",
      "2:3",
      "3:2",
      "4:3",
      "4:5",
      "5:4",
      "21:9"
    ],
    "references": [],
    "sourceTemplateId": "github-cover-dot-matrix",
    "pageRecipes": [],
    "requiredIdentity": false,
    "previewPath": "/visual-templates/github-xhs-cover-dot-matrix.png",
    "createdAt": "2026-10-04T08:00:00.000Z",
    "updatedAt": "2026-10-04T08:00:00.000Z"
  },
  {
    "id": "github-xhs-dot-matrix",
    "scope": "builtin",
    "revision": 1,
    "libraryKind": "xhs",
    "industries": [
      "科技数码",
      "教育学习",
      "商业服务"
    ],
    "visualMode": "graphic",
    "kind": "style",
    "name": "点阵浅色图文",
    "prompt": "主题：{{本期主题}}。资料：{{真实素材与当前确认稿}}。浅灰纸面、细网格、低对比点阵场、墨黑清楚大标题；示意图用于解释，真实数字必须由用户提供。图文全套保持一致字级和配色；首图引出问题，内页各解释一件事。仅生成当前页，不复制长文截图，不将多页拼成一张。风格参考：Lieflat HTML Design（MIT）。预览是开源示例；示例的产品、作者、日期、指标和结论都不是本期事实，全部替换，不复制示例正文。 当前预览只展示首图风格，正文按所选页配方独立生成。",
    "aspectRatio": "3:4",
    "aspectRatios": [
      "1:1",
      "3:4",
      "16:9",
      "9:16",
      "2:3",
      "3:2",
      "4:3",
      "4:5",
      "5:4",
      "21:9"
    ],
    "references": [],
    "sourceTemplateId": "github-xhs-dot-matrix",
    "pageRecipes": [
      {
        "role": "cover",
        "label": "首图：本期主题与核心问题",
        "prompt": "只生成当前独立页面：首图：本期主题与核心问题。用一个短标题和主题视觉引出本期问题。使用本期真实资料，文字少而清楚；不把多页拼成预览板。"
      },
      {
        "role": "body",
        "label": "正文：一个方法与具体例子",
        "prompt": "只生成当前独立页面：正文：一个方法与具体例子。用当前稿的一项方法及真实例子说明怎么做。使用本期真实资料，文字少而清楚；不把多页拼成预览板。"
      },
      {
        "role": "body",
        "label": "正文：证据与适用边界",
        "prompt": "只生成当前独立页面：正文：证据与适用边界。使用本期资料解释证据、观察和实际限制，不伪造结果。使用本期真实资料，文字少而清楚；不把多页拼成预览板。"
      }
    ],
    "requiredIdentity": false,
    "previewPath": "/visual-templates/github-xhs-cover-dot-matrix.png",
    "createdAt": "2026-10-04T08:00:00.000Z",
    "updatedAt": "2026-10-04T08:00:00.000Z"
  },
  {
    "id": "github-cover-consulting-report",
    "scope": "builtin",
    "revision": 1,
    "libraryKind": "cover",
    "industries": [
      "商业服务",
      "职场成长",
      "科技数码"
    ],
    "visualMode": "graphic",
    "kind": "style",
    "name": "深蓝报告封面",
    "prompt": "标题：{{本期标题}}。内容：{{当前确认稿}}。深海军蓝与暖白、报告编号和整齐网格；先说结论，再用本期真实证据解释，不制造权威徽章。按用户明确比例重新安排；中文标题完整且手机可读，四周留安全边距。风格参考：Lieflat HTML Design（MIT）。预览是开源示例；示例的产品、作者、日期、指标和结论都不是本期事实，全部替换，不复制示例正文。",
    "aspectRatio": "3:4",
    "aspectRatios": [
      "1:1",
      "3:4",
      "16:9",
      "9:16",
      "2:3",
      "3:2",
      "4:3",
      "4:5",
      "5:4",
      "21:9"
    ],
    "references": [],
    "sourceTemplateId": "github-cover-consulting-report",
    "pageRecipes": [],
    "requiredIdentity": false,
    "previewPath": "/visual-templates/github-xhs-cover-consulting-report.png",
    "createdAt": "2026-10-04T08:00:00.000Z",
    "updatedAt": "2026-10-04T08:00:00.000Z"
  },
  {
    "id": "github-xhs-consulting-report",
    "scope": "builtin",
    "revision": 1,
    "libraryKind": "xhs",
    "industries": [
      "商业服务",
      "职场成长",
      "科技数码"
    ],
    "visualMode": "graphic",
    "kind": "style",
    "name": "深蓝报告图文",
    "prompt": "主题：{{本期主题}}。资料：{{真实素材与当前确认稿}}。深海军蓝与暖白、报告编号和整齐网格；先说结论，再用本期真实证据解释，不制造权威徽章。图文全套保持一致字级和配色；首图引出问题，内页各解释一件事。仅生成当前页，不复制长文截图，不将多页拼成一张。风格参考：Lieflat HTML Design（MIT）。预览是开源示例；示例的产品、作者、日期、指标和结论都不是本期事实，全部替换，不复制示例正文。 当前预览只展示首图风格，正文按所选页配方独立生成。",
    "aspectRatio": "3:4",
    "aspectRatios": [
      "1:1",
      "3:4",
      "16:9",
      "9:16",
      "2:3",
      "3:2",
      "4:3",
      "4:5",
      "5:4",
      "21:9"
    ],
    "references": [],
    "sourceTemplateId": "github-xhs-consulting-report",
    "pageRecipes": [
      {
        "role": "cover",
        "label": "首图：本期主题与核心问题",
        "prompt": "只生成当前独立页面：首图：本期主题与核心问题。用一个短标题和主题视觉引出本期问题。使用本期真实资料，文字少而清楚；不把多页拼成预览板。"
      },
      {
        "role": "body",
        "label": "正文：一个方法与具体例子",
        "prompt": "只生成当前独立页面：正文：一个方法与具体例子。用当前稿的一项方法及真实例子说明怎么做。使用本期真实资料，文字少而清楚；不把多页拼成预览板。"
      },
      {
        "role": "body",
        "label": "正文：证据与适用边界",
        "prompt": "只生成当前独立页面：正文：证据与适用边界。使用本期资料解释证据、观察和实际限制，不伪造结果。使用本期真实资料，文字少而清楚；不把多页拼成预览板。"
      }
    ],
    "requiredIdentity": false,
    "previewPath": "/visual-templates/github-xhs-cover-consulting-report.png",
    "createdAt": "2026-10-04T08:00:00.000Z",
    "updatedAt": "2026-10-04T08:00:00.000Z"
  },
  {
    "id": "github-cover-editorial",
    "scope": "builtin",
    "revision": 1,
    "libraryKind": "cover",
    "industries": [
      "通用",
      "教育学习",
      "职场成长",
      "商业服务"
    ],
    "visualMode": "graphic",
    "kind": "style",
    "name": "杂志留白封面",
    "prompt": "标题：{{本期标题}}。内容：{{当前确认稿}}。米白与墨黑，衬线感中文大标题、细分隔线、大留白；一个观点配一组清楚证据。按用户明确比例重新安排；中文标题完整且手机可读，四周留安全边距。风格参考：Lieflat HTML Design（MIT）。预览是开源示例；示例的产品、作者、日期、指标和结论都不是本期事实，全部替换，不复制示例正文。",
    "aspectRatio": "3:4",
    "aspectRatios": [
      "1:1",
      "3:4",
      "16:9",
      "9:16",
      "2:3",
      "3:2",
      "4:3",
      "4:5",
      "5:4",
      "21:9"
    ],
    "references": [],
    "sourceTemplateId": "github-cover-editorial",
    "pageRecipes": [],
    "requiredIdentity": false,
    "previewPath": "/visual-templates/github-xhs-cover-editorial.png",
    "createdAt": "2026-10-04T08:00:00.000Z",
    "updatedAt": "2026-10-04T08:00:00.000Z"
  },
  {
    "id": "github-xhs-editorial",
    "scope": "builtin",
    "revision": 1,
    "libraryKind": "xhs",
    "industries": [
      "通用",
      "教育学习",
      "职场成长",
      "商业服务"
    ],
    "visualMode": "graphic",
    "kind": "style",
    "name": "杂志留白图文",
    "prompt": "主题：{{本期主题}}。资料：{{真实素材与当前确认稿}}。米白与墨黑，衬线感中文大标题、细分隔线、大留白；一个观点配一组清楚证据。图文全套保持一致字级和配色；首图引出问题，内页各解释一件事。仅生成当前页，不复制长文截图，不将多页拼成一张。风格参考：Lieflat HTML Design（MIT）。预览是开源示例；示例的产品、作者、日期、指标和结论都不是本期事实，全部替换，不复制示例正文。 当前预览只展示首图风格，正文按所选页配方独立生成。",
    "aspectRatio": "3:4",
    "aspectRatios": [
      "1:1",
      "3:4",
      "16:9",
      "9:16",
      "2:3",
      "3:2",
      "4:3",
      "4:5",
      "5:4",
      "21:9"
    ],
    "references": [],
    "sourceTemplateId": "github-xhs-editorial",
    "pageRecipes": [
      {
        "role": "cover",
        "label": "首图：本期主题与核心问题",
        "prompt": "只生成当前独立页面：首图：本期主题与核心问题。用一个短标题和主题视觉引出本期问题。使用本期真实资料，文字少而清楚；不把多页拼成预览板。"
      },
      {
        "role": "body",
        "label": "正文：一个方法与具体例子",
        "prompt": "只生成当前独立页面：正文：一个方法与具体例子。用当前稿的一项方法及真实例子说明怎么做。使用本期真实资料，文字少而清楚；不把多页拼成预览板。"
      },
      {
        "role": "body",
        "label": "正文：证据与适用边界",
        "prompt": "只生成当前独立页面：正文：证据与适用边界。使用本期资料解释证据、观察和实际限制，不伪造结果。使用本期真实资料，文字少而清楚；不把多页拼成预览板。"
      }
    ],
    "requiredIdentity": false,
    "previewPath": "/visual-templates/github-xhs-cover-editorial.png",
    "createdAt": "2026-10-04T08:00:00.000Z",
    "updatedAt": "2026-10-04T08:00:00.000Z"
  },
  {
    "id": "github-cover-rain-notes",
    "scope": "builtin",
    "revision": 1,
    "libraryKind": "cover",
    "industries": [
      "教育学习",
      "职场成长",
      "旅行户外"
    ],
    "visualMode": "graphic",
    "kind": "style",
    "name": "纸感手账封面",
    "prompt": "标题：{{本期标题}}。内容：{{当前确认稿}}。奶油纸面、深棕文字、手账边注和克制划线，标题短而清楚，避免密集长文。按用户明确比例重新安排；中文标题完整且手机可读，四周留安全边距。风格参考：Lieflat HTML Design（MIT）。预览是开源示例；示例的产品、作者、日期、指标和结论都不是本期事实，全部替换，不复制示例正文。",
    "aspectRatio": "3:4",
    "aspectRatios": [
      "1:1",
      "3:4",
      "16:9",
      "9:16",
      "2:3",
      "3:2",
      "4:3",
      "4:5",
      "5:4",
      "21:9"
    ],
    "references": [],
    "sourceTemplateId": "github-cover-rain-notes",
    "pageRecipes": [],
    "requiredIdentity": false,
    "previewPath": "/visual-templates/github-xhs-cover-rain-notes.png",
    "createdAt": "2026-10-04T08:00:00.000Z",
    "updatedAt": "2026-10-04T08:00:00.000Z"
  },
  {
    "id": "github-xhs-rain-notes",
    "scope": "builtin",
    "revision": 1,
    "libraryKind": "xhs",
    "industries": [
      "教育学习",
      "职场成长",
      "旅行户外"
    ],
    "visualMode": "graphic",
    "kind": "style",
    "name": "纸感手账图文",
    "prompt": "主题：{{本期主题}}。资料：{{真实素材与当前确认稿}}。奶油纸面、深棕文字、手账边注和克制划线，标题短而清楚，避免密集长文。图文全套保持一致字级和配色；首图引出问题，内页各解释一件事。仅生成当前页，不复制长文截图，不将多页拼成一张。风格参考：Lieflat HTML Design（MIT）。预览是开源示例；示例的产品、作者、日期、指标和结论都不是本期事实，全部替换，不复制示例正文。 当前预览只展示首图风格，正文按所选页配方独立生成。",
    "aspectRatio": "3:4",
    "aspectRatios": [
      "1:1",
      "3:4",
      "16:9",
      "9:16",
      "2:3",
      "3:2",
      "4:3",
      "4:5",
      "5:4",
      "21:9"
    ],
    "references": [],
    "sourceTemplateId": "github-xhs-rain-notes",
    "pageRecipes": [
      {
        "role": "cover",
        "label": "首图：本期主题与核心问题",
        "prompt": "只生成当前独立页面：首图：本期主题与核心问题。用一个短标题和主题视觉引出本期问题。使用本期真实资料，文字少而清楚；不把多页拼成预览板。"
      },
      {
        "role": "body",
        "label": "正文：一个方法与具体例子",
        "prompt": "只生成当前独立页面：正文：一个方法与具体例子。用当前稿的一项方法及真实例子说明怎么做。使用本期真实资料，文字少而清楚；不把多页拼成预览板。"
      },
      {
        "role": "body",
        "label": "正文：证据与适用边界",
        "prompt": "只生成当前独立页面：正文：证据与适用边界。使用本期资料解释证据、观察和实际限制，不伪造结果。使用本期真实资料，文字少而清楚；不把多页拼成预览板。"
      }
    ],
    "requiredIdentity": false,
    "previewPath": "/visual-templates/github-xhs-cover-rain-notes.png",
    "createdAt": "2026-10-04T08:00:00.000Z",
    "updatedAt": "2026-10-04T08:00:00.000Z"
  },
  {
    "id": "github-cover-shiny-tiles",
    "scope": "builtin",
    "revision": 1,
    "libraryKind": "cover",
    "industries": [
      "科技数码",
      "商业服务"
    ],
    "visualMode": "graphic",
    "kind": "style",
    "name": "银色科技封面",
    "prompt": "标题：{{本期标题}}。内容：{{当前确认稿}}。墨黑与银白玻璃卡、极大字级对比、一块明确视觉主物件；效果是概念，不冒充真实产品实拍。按用户明确比例重新安排；中文标题完整且手机可读，四周留安全边距。风格参考：Lieflat HTML Design（MIT）。预览是开源示例；示例的产品、作者、日期、指标和结论都不是本期事实，全部替换，不复制示例正文。",
    "aspectRatio": "3:4",
    "aspectRatios": [
      "1:1",
      "3:4",
      "16:9",
      "9:16",
      "2:3",
      "3:2",
      "4:3",
      "4:5",
      "5:4",
      "21:9"
    ],
    "references": [],
    "sourceTemplateId": "github-cover-shiny-tiles",
    "pageRecipes": [],
    "requiredIdentity": false,
    "previewPath": "/visual-templates/github-xhs-cover-shiny-tiles.png",
    "createdAt": "2026-10-04T08:00:00.000Z",
    "updatedAt": "2026-10-04T08:00:00.000Z"
  },
  {
    "id": "github-xhs-shiny-tiles",
    "scope": "builtin",
    "revision": 1,
    "libraryKind": "xhs",
    "industries": [
      "科技数码",
      "商业服务"
    ],
    "visualMode": "graphic",
    "kind": "style",
    "name": "银色科技图文",
    "prompt": "主题：{{本期主题}}。资料：{{真实素材与当前确认稿}}。墨黑与银白玻璃卡、极大字级对比、一块明确视觉主物件；效果是概念，不冒充真实产品实拍。图文全套保持一致字级和配色；首图引出问题，内页各解释一件事。仅生成当前页，不复制长文截图，不将多页拼成一张。风格参考：Lieflat HTML Design（MIT）。预览是开源示例；示例的产品、作者、日期、指标和结论都不是本期事实，全部替换，不复制示例正文。 当前预览只展示首图风格，正文按所选页配方独立生成。",
    "aspectRatio": "3:4",
    "aspectRatios": [
      "1:1",
      "3:4",
      "16:9",
      "9:16",
      "2:3",
      "3:2",
      "4:3",
      "4:5",
      "5:4",
      "21:9"
    ],
    "references": [],
    "sourceTemplateId": "github-xhs-shiny-tiles",
    "pageRecipes": [
      {
        "role": "cover",
        "label": "首图：本期主题与核心问题",
        "prompt": "只生成当前独立页面：首图：本期主题与核心问题。用一个短标题和主题视觉引出本期问题。使用本期真实资料，文字少而清楚；不把多页拼成预览板。"
      },
      {
        "role": "body",
        "label": "正文：一个方法与具体例子",
        "prompt": "只生成当前独立页面：正文：一个方法与具体例子。用当前稿的一项方法及真实例子说明怎么做。使用本期真实资料，文字少而清楚；不把多页拼成预览板。"
      },
      {
        "role": "body",
        "label": "正文：证据与适用边界",
        "prompt": "只生成当前独立页面：正文：证据与适用边界。使用本期资料解释证据、观察和实际限制，不伪造结果。使用本期真实资料，文字少而清楚；不把多页拼成预览板。"
      }
    ],
    "requiredIdentity": false,
    "previewPath": "/visual-templates/github-xhs-cover-shiny-tiles.png",
    "createdAt": "2026-10-04T08:00:00.000Z",
    "updatedAt": "2026-10-04T08:00:00.000Z"
  },
  {
    "id": "github-cover-sunrise",
    "scope": "builtin",
    "revision": 1,
    "libraryKind": "cover",
    "industries": [
      "通用",
      "家居装修",
      "时尚穿搭",
      "旅行户外"
    ],
    "visualMode": "graphic",
    "kind": "style",
    "name": "日光编辑封面",
    "prompt": "标题：{{本期标题}}。内容：{{当前确认稿}}。暖金晨光、奶油与棕色、杂志衬线、通透留白，围绕本期主题表达一条明确观察。按用户明确比例重新安排；中文标题完整且手机可读，四周留安全边距。风格参考：Lieflat HTML Design（MIT）。预览是开源示例；示例的产品、作者、日期、指标和结论都不是本期事实，全部替换，不复制示例正文。",
    "aspectRatio": "3:4",
    "aspectRatios": [
      "1:1",
      "3:4",
      "16:9",
      "9:16",
      "2:3",
      "3:2",
      "4:3",
      "4:5",
      "5:4",
      "21:9"
    ],
    "references": [],
    "sourceTemplateId": "github-cover-sunrise",
    "pageRecipes": [],
    "requiredIdentity": false,
    "previewPath": "/visual-templates/github-xhs-cover-sunrise.png",
    "createdAt": "2026-10-04T08:00:00.000Z",
    "updatedAt": "2026-10-04T08:00:00.000Z"
  },
  {
    "id": "github-xhs-sunrise",
    "scope": "builtin",
    "revision": 1,
    "libraryKind": "xhs",
    "industries": [
      "通用",
      "家居装修",
      "时尚穿搭",
      "旅行户外"
    ],
    "visualMode": "graphic",
    "kind": "style",
    "name": "日光编辑图文",
    "prompt": "主题：{{本期主题}}。资料：{{真实素材与当前确认稿}}。暖金晨光、奶油与棕色、杂志衬线、通透留白，围绕本期主题表达一条明确观察。图文全套保持一致字级和配色；首图引出问题，内页各解释一件事。仅生成当前页，不复制长文截图，不将多页拼成一张。风格参考：Lieflat HTML Design（MIT）。预览是开源示例；示例的产品、作者、日期、指标和结论都不是本期事实，全部替换，不复制示例正文。 当前预览只展示首图风格，正文按所选页配方独立生成。",
    "aspectRatio": "3:4",
    "aspectRatios": [
      "1:1",
      "3:4",
      "16:9",
      "9:16",
      "2:3",
      "3:2",
      "4:3",
      "4:5",
      "5:4",
      "21:9"
    ],
    "references": [],
    "sourceTemplateId": "github-xhs-sunrise",
    "pageRecipes": [
      {
        "role": "cover",
        "label": "首图：本期主题与核心问题",
        "prompt": "只生成当前独立页面：首图：本期主题与核心问题。用一个短标题和主题视觉引出本期问题。使用本期真实资料，文字少而清楚；不把多页拼成预览板。"
      },
      {
        "role": "body",
        "label": "正文：一个方法与具体例子",
        "prompt": "只生成当前独立页面：正文：一个方法与具体例子。用当前稿的一项方法及真实例子说明怎么做。使用本期真实资料，文字少而清楚；不把多页拼成预览板。"
      },
      {
        "role": "body",
        "label": "正文：证据与适用边界",
        "prompt": "只生成当前独立页面：正文：证据与适用边界。使用本期资料解释证据、观察和实际限制，不伪造结果。使用本期真实资料，文字少而清楚；不把多页拼成预览板。"
      }
    ],
    "requiredIdentity": false,
    "previewPath": "/visual-templates/github-xhs-cover-sunrise.png",
    "createdAt": "2026-10-04T08:00:00.000Z",
    "updatedAt": "2026-10-04T08:00:00.000Z"
  },
  {
    "id": "xhs-family",
    "scope": "builtin",
    "revision": 1,
    "libraryKind": "xhs",
    "industries": [
      "母婴亲子",
      "教育学习"
    ],
    "visualMode": "graphic",
    "kind": "style",
    "name": "亲子共读",
    "prompt": "主题：{{本期主题}}。资料：{{真实素材与当前确认稿}}。奶油白、鼠尾草绿、暖杏纸拼贴与绘本插画，安静阅读角，只表达用户真实共读问题，不作育儿功效承诺。单图先做首图；多图按每页职责分别输出，不凑页数。样图为AI首图风格示意，实际照片/经历/文字全部换成本期资料，AI内容如实声明。",
    "aspectRatio": "3:4",
    "aspectRatios": [
      "1:1",
      "3:4",
      "16:9",
      "9:16",
      "2:3",
      "3:2",
      "4:3",
      "4:5",
      "5:4",
      "21:9"
    ],
    "references": [],
    "sourceTemplateId": "xhs-family",
    "pageRecipes": [
      {
        "role": "cover",
        "label": "首图：这次共读的问题",
        "prompt": "只生成当前独立页面：首图：这次共读的问题。一个问题与书页构图。使用本期真实资料，文字少而清楚；不把多页拼成预览板。"
      },
      {
        "role": "body",
        "label": "正文：实际书页与孩子的提问",
        "prompt": "只生成当前独立页面：正文：实际书页与孩子的提问。用用户给出的书页或记录说明一个提问，儿童隐私由用户选择保留范围。使用本期真实资料，文字少而清楚；不把多页拼成预览板。"
      },
      {
        "role": "body",
        "label": "正文：回应与继续探索",
        "prompt": "只生成当前独立页面：正文：回应与继续探索。展示本期真实回应和可以继续讨论的开放问题，不编成长效果。使用本期真实资料，文字少而清楚；不把多页拼成预览板。"
      }
    ],
    "requiredIdentity": false,
    "previewPath": "/visual-templates/xhs-family.png",
    "createdAt": "2026-10-04T08:00:00.000Z",
    "updatedAt": "2026-10-04T08:00:00.000Z"
  },
  {
    "id": "xhs-pet",
    "scope": "builtin",
    "revision": 1,
    "libraryKind": "xhs",
    "industries": [
      "宠物生活",
      "家居装修"
    ],
    "visualMode": "graphic",
    "kind": "style",
    "name": "宠物生活清单",
    "prompt": "主题：{{本期主题}}。资料：{{真实素材与当前确认稿}}。奶油白、燕麦绿、暖木色，动物与生活物件的自然照片质感，清楚标签，不编养宠经历或医学效果。单图先做首图；多图按每页职责分别输出，不凑页数。样图为AI首图风格示意，实际照片/经历/文字全部换成本期资料，AI内容如实声明。",
    "aspectRatio": "3:4",
    "aspectRatios": [
      "1:1",
      "3:4",
      "16:9",
      "9:16",
      "2:3",
      "3:2",
      "4:3",
      "4:5",
      "5:4",
      "21:9"
    ],
    "references": [],
    "sourceTemplateId": "xhs-pet",
    "pageRecipes": [
      {
        "role": "cover",
        "label": "首图：本期养宠场景",
        "prompt": "只生成当前独立页面：首图：本期养宠场景。围绕真实场景展示一个需求。使用本期真实资料，文字少而清楚；不把多页拼成预览板。"
      },
      {
        "role": "body",
        "label": "正文：用户实际用品与用途",
        "prompt": "只生成当前独立页面：正文：用户实际用品与用途。列清本期实际选择的物件和使用方式。使用本期真实资料，文字少而清楚；不把多页拼成预览板。"
      },
      {
        "role": "body",
        "label": "正文：使用记录与注意点",
        "prompt": "只生成当前独立页面：正文：使用记录与注意点。只写用户记录中的观察与边界，不编医疗判断。使用本期真实资料，文字少而清楚；不把多页拼成预览板。"
      }
    ],
    "requiredIdentity": false,
    "previewPath": "/visual-templates/xhs-pet.png",
    "createdAt": "2026-10-04T08:00:00.000Z",
    "updatedAt": "2026-10-04T08:00:00.000Z"
  },
  {
    "id": "xhs-sport",
    "scope": "builtin",
    "revision": 1,
    "libraryKind": "xhs",
    "industries": [
      "运动健康",
      "职场成长"
    ],
    "visualMode": "graphic",
    "kind": "style",
    "name": "日常运动记录",
    "prompt": "主题：{{本期主题}}。资料：{{真实素材与当前确认稿}}。暖白、墨蓝与珊瑚橙，自然静物照片与清楚日程标签，留白有节奏，不编训练成绩或身体变化。单图先做首图；多图按每页职责分别输出，不凑页数。样图为AI首图风格示意，实际照片/经历/文字全部换成本期资料，AI内容如实声明。",
    "aspectRatio": "3:4",
    "aspectRatios": [
      "1:1",
      "3:4",
      "16:9",
      "9:16",
      "2:3",
      "3:2",
      "4:3",
      "4:5",
      "5:4",
      "21:9"
    ],
    "references": [],
    "sourceTemplateId": "xhs-sport",
    "pageRecipes": [
      {
        "role": "cover",
        "label": "首图：本期运动安排",
        "prompt": "只生成当前独立页面：首图：本期运动安排。用实际日程引出一个可以坚持的动作。使用本期真实资料，文字少而清楚；不把多页拼成预览板。"
      },
      {
        "role": "body",
        "label": "正文：准备与执行记录",
        "prompt": "只生成当前独立页面：正文：准备与执行记录。展示用户的实际准备和一次执行记录，不编指标。使用本期真实资料，文字少而清楚；不把多页拼成预览板。"
      },
      {
        "role": "body",
        "label": "正文：复盘与调整",
        "prompt": "只生成当前独立页面：正文：复盘与调整。说明本期真实观察与下一次明确选择，不生成医学处方。使用本期真实资料，文字少而清楚；不把多页拼成预览板。"
      }
    ],
    "requiredIdentity": false,
    "previewPath": "/visual-templates/xhs-sport.png",
    "createdAt": "2026-10-04T08:00:00.000Z",
    "updatedAt": "2026-10-04T08:00:00.000Z"
  }
].map(value=>visualTemplateResource.parse(value));
