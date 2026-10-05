import {defineEndpoint} from "../endpoints";
import {workSourceSelectBody,workSourceSelectResult} from "../resources/work-source-select";
export const workSourcesOperations={selectWorkSource:defineEndpoint({id:"work.sources.select",method:"POST",path:"/work-sources/select",body:workSourceSelectBody,response:workSourceSelectResult,fr:["FR-1045-2"]})} as const;
