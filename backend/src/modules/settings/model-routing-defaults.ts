import {modelRoutingChoicesSchema, type ModelRoutingChoices, type ModelRoutingResource} from '@creatoros/contract';
/** SEMANTIC_BOUNDARY_ALLOW: 只落实已存来源和用户确认的默认值，不根据密钥、许可证或内容推断选择。 */
export function effectiveModelRouting(value:Pick<ModelRoutingResource,'choices'|'legacyExecutionEngine'>):ModelRoutingChoices {
 if(value.choices)return modelRoutingChoicesSchema.parse(value.choices);
 const source=value.legacyExecutionEngine==='codex'?'codex':'official';
 return {text:source,vision:source,image:source,video:'official',audio:'official',embed:'official'};
}
