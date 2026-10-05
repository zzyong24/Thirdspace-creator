import {it,expect} from "vitest";
import {graphicPostTextCandidate,graphicPostTextKind} from "../src/resources/graphic-posts";
import {creativeKind} from "../src/resources/creative-results";
it("图卡文字是严格结构候选，和已生成图片候选分开",()=>{
 expect(graphicPostTextKind.safeParse("cardBriefs").success).toBe(true);
 expect(creativeKind.safeParse("cardBriefs").success).toBe(true);
 expect(graphicPostTextCandidate.safeParse({candidateId:"candidate",outputId:"image",kind:"cardBriefs",status:"succeeded",value:[{cardId:"card",title:"标题",body:"正文",sourceRefs:[]}],
 baseVersionId:"v",sourceRefs:[],ruleSnapshotRef:null,appliedRules:"not_applied"}).success).toBe(true);
});
