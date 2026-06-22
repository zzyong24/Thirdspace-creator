// Projects module schema surface — the contract Zod DTOs this module produces
// (foundation §5: "<module>.schema.ts — re-export/usage of the contract Zod DTOs
// for this module"). The transport's row→resource mappers and the contract test
// validate against these; the contract is the single source of truth for the
// wire shape (contract/src/resources/projects.ts).
//
// The @creatoros/contract root barrel re-exports ENDPOINTS but NOT the projects
// resource files, so derive each DTO from its op's `response` schema (same
// approach as notifications.schema.ts). For list ops the `response` is the item
// schema (isList wraps it at the envelope layer).
import { ENDPOINTS } from "@creatoros/contract";

export const projectResource = ENDPOINTS.getProject.response;
export const projectStageResource = ENDPOINTS.listStages.response;
export const contentOutputResource = ENDPOINTS.getOutput.response;
export const taskResource = ENDPOINTS.listTasks.response;
export const projectActivityResource = ENDPOINTS.listActivity.response;

export type ProjectResource = (typeof projectResource)["_output"];
export type ProjectStageResource = (typeof projectStageResource)["_output"];
export type ContentOutputResource = (typeof contentOutputResource)["_output"];
export type TaskResource = (typeof taskResource)["_output"];
export type ProjectActivityResource = (typeof projectActivityResource)["_output"];
