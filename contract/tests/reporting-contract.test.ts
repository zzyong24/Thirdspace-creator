import { describe,expect,it } from "vitest";
import { ENDPOINTS } from "../src/endpoints";

describe("T-1024 local reporting consent contract",()=>{
  const valid={scope:"creator",accountId:"account-a",enabled:true,consentVersion:1,consentChangeId:"00000000-0000-4000-8000-000000000001"};
  it("accepts exact account-scoped authorization only",()=>{
    expect(ENDPOINTS.setReportingConsent.body.safeParse(valid).success).toBe(true);
    for(const field of ["cookie","title","prompt","rawLog","secretReference"])
      expect(ENDPOINTS.setReportingConsent.body.safeParse({...valid,[field]:"secret"}).success).toBe(false);
    expect(ENDPOINTS.setReportingConsent.body.safeParse({...valid,consentVersion:0}).success).toBe(false);
  });
  it("rejects extra fields in public status",()=>{
    const row={scope:"diagnostics",accountId:null,accountLabel:null,platform:null,accountActive:true,enabled:false,needsReconsent:false,consentEpoch:0,changedAt:null,queuedCount:0};
    expect(ENDPOINTS.getReportingStatus.response.safeParse({consentVersion:1,diagnostics:row,accounts:[],preparationAvailable:true,uploadAvailable:false}).success).toBe(true);
    expect(ENDPOINTS.getReportingStatus.response.safeParse({consentVersion:1,diagnostics:{...row,cookie:"secret"},accounts:[],preparationAvailable:true,uploadAvailable:false}).success).toBe(false);
  });
});
