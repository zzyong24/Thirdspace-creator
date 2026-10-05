import { z } from "zod";
import { defineEndpoint } from "../endpoints";
import { id, platformId } from "../primitives";
import {outputConversionRequest,outputConversionReceipt} from "../resources/output-conversions";
import {articleCandidateSection} from "../resources/articles";
import {graphicPostCardBriefs,graphicPostImageUse} from "../resources/graphic-posts";
import { creativeBundle, creativeCapability, creativeKind, creativeResult } from "../resources/creative-results";

const requestId = z.string().min(8).max(128);
const outputParams = z.object({outputId: id});
const resultParams = z.object({resultId: id});
const bundleParams = z.object({bundleId: id});
const generationItem = z.object({kind: creativeKind, targetPlatform: platformId.nullable().optional(),
  targetSectionId: id.optional()}).strict();

export const creativeResultsOperations = {
  convertOutput:defineEndpoint({id:"outputs.conversions.create",method:"POST",path:"/output-conversions",body:outputConversionRequest,response:outputConversionReceipt,fr:["FR-1043-3"]}),
  getOutputConversion:defineEndpoint({id:"outputs.conversions.get",method:"GET",path:"/output-conversions/:clientRequestId",params:z.object({clientRequestId:requestId}).strict(),response:outputConversionReceipt,fr:["FR-1043-5"]}),
  listCreativeCapabilities: defineEndpoint({id: "creativeCapabilities.list", method: "GET", path: "/creative-capabilities",
    query: z.object({accountId: id.optional(), projectId: id.optional(), outputId: id.optional()}).strict(),
    response: z.object({items: z.array(creativeCapability)}).strict(), fr: ["FR-1029-2"]}),
  generateResult: defineEndpoint({id: "creativeResults.generate", method: "POST", path: "/outputs/:outputId/creative-results/generate",
    params: outputParams, body: generationItem.extend({clientRequestId: requestId, sourceItemId: id.optional(),
      ruleOverrides: z.record(z.string(), z.unknown()).optional()}).strict(), response: creativeResult, fr: ["FR-1029-2"]}),
  listResults: defineEndpoint({id: "creativeResults.list", method: "GET", path: "/outputs/:outputId/creative-results",
    params: outputParams, query: z.object({bundleId: id.optional(), cursor: z.string().optional(), pageSize: z.coerce.number().int().min(1).max(50).default(20)}).strict(),
    response: z.object({items: z.array(creativeResult), nextCursor: z.string().nullable()}).strict(), fr: ["FR-1029-6"]}),
  getResult: defineEndpoint({id: "creativeResults.get", method: "GET", path: "/creative-results/:resultId",
    params: resultParams, response: creativeResult, fr: ["FR-1029-6"]}),
  adoptResult: defineEndpoint({id: "creativeResults.adopt", method: "POST", path: "/creative-results/:resultId/adopt",
    params: resultParams, body: z.object({expected: z.union([
      z.object({owner: z.literal("graphic_post"), versionId: id}).strict(),
      z.object({owner: z.literal("output_script"), versionId: id}).strict(),
      z.object({owner: z.literal("wechat_article"), versionId: id}).strict(),
      z.object({owner: z.literal("publication"), mode: z.literal("existing"), publicationId: id, revisionId: id}).strict(),
      z.object({owner: z.literal("publication"), mode: z.literal("create"), outputId: id, platform: platformId, expectedAbsent: z.literal(true)}).strict(),
    ]), editedValue: z.union([z.array(articleCandidateSection),graphicPostCardBriefs,z.string(), z.array(z.string()), z.array(graphicPostImageUse)]),
      clientRequestId: requestId,includeFactItems:z.boolean().optional()}).strict().superRefine((body,ctx)=>{
        // SEMANTIC_BOUNDARY_ALLOW: 仅核验已声明的owner与页ID用途，不解释内容或挑选页。
        if(body.expected.owner!=="graphic_post"&&Array.isArray(body.editedValue)&&body.editedValue.some(value=>value&&typeof value==="object"&&"cardId" in value))ctx.addIssue({code:"custom",path:["editedValue"],message:"页ID仅属于图文作品"});
      }), response: z.object({owner: z.enum(["graphic_post", "output_script", "wechat_article", "publication"]),
      resultId: id, versionId: id.optional(), publicationId: id.optional(), revisionId: id.optional(), status: z.literal("adopted")}).strict(), fr: ["FR-1029-6"]}),
  retryResult: defineEndpoint({id: "creativeResults.retry", method: "POST", path: "/creative-results/:resultId/retry",
    params: resultParams, body: z.object({clientRequestId: requestId}).strict(), response: creativeResult, fr: ["FR-1029-3"]}),
  createBundle: defineEndpoint({id: "creativeResults.bundles.create", method: "POST", path: "/outputs/:outputId/creative-result-bundles",
    params: outputParams, body: z.object({items: z.array(generationItem).min(1).max(12), clientRequestId: requestId}).strict(),
    response: creativeBundle, fr: ["FR-1029-3"]}),
  getBundle: defineEndpoint({id: "creativeResults.bundles.get", method: "GET", path: "/creative-result-bundles/:bundleId",
    params: bundleParams, response: creativeBundle, fr: ["FR-1029-3"]}),
  listBundles: defineEndpoint({id: "creativeResults.bundles.list", method: "GET", path: "/outputs/:outputId/creative-result-bundles",
    params: outputParams, query: z.object({cursor: z.string().optional(), pageSize: z.coerce.number().int().min(1).max(50).default(20)}).strict(),
    response: z.object({items: z.array(creativeBundle), nextCursor: z.string().nullable()}).strict(), fr: ["FR-1029-3"]}),
} as const;
