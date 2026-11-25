import type {PromptTemplate} from "./template";
export const OPERATIONS_REVIEW_METHODS:PromptTemplate[]=[
 ["method.operations.review","从运营目标复盘定位、选题、观看与获客","先读当前已采纳定位、目标、真实稿件、指标、评论和来源。回答五件事：服务的人是否一致；选题承担拓新/信任/获客哪一任务；观众在哪里停留/流失；有没有关注、回访、咨询及成交证据；下一条具体改什么。对比相同发布年龄（首24小时/7天/28天）、形式、相近时长和流量来源的自有样本，不能以不同年龄累计播放排胜负。绝对量、比例分母、统计窗口分开；图文不套视频完播。缺字段保持未知，评论不是咨询，主页访问不是成交。来源比例变化不能直接证明限流，单条低完播不证明开头有问题；没有原稿不能杜撰段落。输出运营结论、事实证据、解释假设、下一步实验和待补数据。只选一个优先实验，注明单一修改变量、对照、目标指标、观察窗口和复盘时间；自然发布不是随机实验，不宣称因果。用户界面不展示方法作者、内部标签或无关技术说明。"],
].map(([id,title,body])=>({id:id!,version:"operations-redfox-2026-09-13",system:`${title}\n${body}`,template:"按当前意图按需使用；只调用实际提供的工具，保留事实来源和不确定性。",requiredFacets:[],tools:[],editableFields:["system","template"]}));
