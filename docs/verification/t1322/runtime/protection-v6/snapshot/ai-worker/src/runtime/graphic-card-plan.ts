import {graphicCardBriefSchema} from "../prompt/templates/graphic-card-brief";
import type {CoverContext} from "./cover-plan";

/** SEMANTIC_BOUNDARY_ALLOW: protocol projection only; the model chooses the visual idea. */
export function projectGraphicCardPlan(raw: unknown, _context: CoverContext, visualRequirements = "",options:{aspectRatio?:string}={}) {
  const plan = graphicCardBriefSchema.parse(raw);
  const prompt = plan.imagePrompt.trim();
  return {name: "图文配图候选", prompt, graphicCardPlan: {altText: plan.altText, imagePrompt: prompt},
    ...(visualRequirements ? {visualRequirements} : {}),...(options.aspectRatio?{aspectRatio:options.aspectRatio}:{})};
}
