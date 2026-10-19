import {it,expect} from "vitest";
import {ENDPOINTS} from "../src/endpoints";
import {getCliOperationPolicy} from "../src/cli-policy";
it("公共POST严格列入CLI read且完整registry分类",()=>{expect(ENDPOINTS.selectWorkSource.method).toBe("POST");expect(getCliOperationPolicy("work.sources.select")).toEqual({effect:"read",confirmation:"none",asyncTask:false,idempotency:"not_applicable"});for(const e of Object.values(ENDPOINTS))expect(getCliOperationPolicy(e.id)).not.toBeNull();});
