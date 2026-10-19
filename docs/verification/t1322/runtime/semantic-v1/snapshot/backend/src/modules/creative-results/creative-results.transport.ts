import type { Endpoint, RequestContext, Transport } from "@creatoros/contract";
import { AuthenticationError, UnsupportedOperationError } from "@creatoros/backend";
import type {OutputConversionsService} from "./output-conversions.service";
import type { CreativeResultsService } from "./creative-results.service";

export const CREATIVE_RESULT_OP_IDS = [
  "outputs.conversions.create","outputs.conversions.get",
  "creativeCapabilities.list", "creativeResults.generate", "creativeResults.list", "creativeResults.get",
  "creativeResults.adopt", "creativeResults.retry", "creativeResults.bundles.create",
  "creativeResults.bundles.get", "creativeResults.bundles.list",
] as const;

export function createCreativeResultsTransport(serviceFor: (ctx: RequestContext) => CreativeResultsService,conversionsFor?:(ctx:RequestContext)=>OutputConversionsService): Transport {
  return {async request(endpoint: Endpoint, input, ctx) {
    if (!ctx) throw new AuthenticationError();
    const service = serviceFor(ctx);
    const payload = (input ?? {}) as {params?: Record<string, string>; query?: Record<string, unknown>; body?: Record<string, unknown>};
    const params = payload.params ?? {}; const query = payload.query ?? {}; const body = payload.body ?? {};
    const meta = {requestId: ctx.requestId};
    switch (endpoint.id) {
      case "outputs.conversions.create": {if(!conversionsFor)throw new UnsupportedOperationError(endpoint.id);return {data:await conversionsFor(ctx).convert(ctx,body as Parameters<OutputConversionsService["convert"]>[1]),meta};}
      case "outputs.conversions.get": {if(!conversionsFor)throw new UnsupportedOperationError(endpoint.id);return {data:await conversionsFor(ctx).get(ctx,params.clientRequestId??""),meta};}
      case "creativeCapabilities.list": return {data: await service.listCapabilities(ctx, query as Parameters<CreativeResultsService["listCapabilities"]>[1]), meta};
      case "creativeResults.generate": return {data: await service.generate(ctx, {outputId: params.outputId ?? "", ...body} as Parameters<CreativeResultsService["generate"]>[1]), meta};
      case "creativeResults.list": return {data: await service.list(ctx, {outputId: params.outputId ?? "", ...query} as Parameters<CreativeResultsService["list"]>[1]), meta};
      case "creativeResults.get": return {data: await service.get(ctx, params.resultId ?? ""), meta};
      case "creativeResults.adopt": return {data: await service.adopt(ctx, {resultId: params.resultId ?? "", ...body} as Parameters<CreativeResultsService["adopt"]>[1]), meta};
      case "creativeResults.retry": return {data: await service.retry(ctx, params.resultId ?? "", String(body.clientRequestId ?? "")), meta};
      case "creativeResults.bundles.create": return {data: await service.createBundle(ctx, {outputId: params.outputId ?? "", ...body} as Parameters<CreativeResultsService["createBundle"]>[1]), meta};
      case "creativeResults.bundles.get": return {data: await service.getBundle(ctx, params.bundleId ?? ""), meta};
      case "creativeResults.bundles.list": return {data: await service.listBundles(ctx, {outputId: params.outputId ?? "", ...query} as Parameters<CreativeResultsService["listBundles"]>[1]), meta};
      default: throw new UnsupportedOperationError(endpoint.id);
    }
  }};
}
