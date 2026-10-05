import * as React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const calls=vi.hoisted(()=>({get:vi.fn(),set:vi.fn(),clear:vi.fn()}));
vi.mock("@/lib/contract-client",()=>({client:{getReportingStatus:calls.get,setReportingConsent:calls.set,clearReportingPending:calls.clear}}));

import { ReportingConsentCard } from "./reporting-consent-card";

const diagnostics={scope:"diagnostics" as const,accountId:null,accountLabel:null,platform:null,accountActive:true,enabled:false,needsReconsent:false,consentEpoch:0,changedAt:null,queuedCount:0};
const account={scope:"creator" as const,accountId:"a",accountLabel:"主号",platform:"douyin",accountActive:true,enabled:false,needsReconsent:false,consentEpoch:0,changedAt:null,queuedCount:0};
const status={consentVersion:1 as const,diagnostics,accounts:[account],preparationAvailable:true,uploadAvailable:false};

describe("T-1024 reporting settings",()=>{
  beforeEach(()=>{vi.stubGlobal("crypto",{randomUUID:()=>"00000000-0000-4000-8000-000000000001"});calls.get.mockResolvedValue(status);calls.set.mockImplementation(async(input:{body:{scope:string;accountId?:string;enabled:boolean}})=>({
    ...status,
    diagnostics:input.body.scope==="diagnostics"?{...diagnostics,enabled:input.body.enabled,changedAt:"2026-09-29T12:00:00Z"}:diagnostics,
    accounts:input.body.accountId?[{...account,enabled:input.body.enabled,changedAt:"2026-09-29T12:00:00Z"}]:[account],
  }));calls.clear.mockResolvedValue(status);});
  afterEach(()=>{cleanup();vi.unstubAllGlobals();vi.clearAllMocks();});

  it("shows checked suggestions while making no grant or upload request",async()=>{
    render(<ReportingConsentCard/>);
    expect(await screen.findAllByText("未开启，待确认 · 待发 0 条")).toHaveLength(2);
    expect(screen.getByRole("checkbox",{name:"故障诊断上报偏好"})).toBeChecked();
    expect(screen.getByRole("checkbox",{name:"douyin · 主号上报偏好"})).toBeChecked();
    expect(calls.set).not.toHaveBeenCalled();
    expect(screen.getByText(/接收服务尚未接通/)).toBeInTheDocument();
  });

  it("grants only the selected account after an explicit click",async()=>{
    render(<ReportingConsentCard/>);
    await screen.findByRole("checkbox",{name:"douyin · 主号上报偏好"});
    const buttons=screen.getAllByRole("button",{name:"同意并开启"});
    fireEvent.click(buttons[1]!);
    await waitFor(()=>expect(calls.set).toHaveBeenCalledWith(expect.objectContaining({body:expect.objectContaining({scope:"creator",accountId:"a",enabled:true,consentVersion:1})})));
    expect(calls.set).toHaveBeenCalledTimes(1);
  });

  it("persists an explicit opt-out from the preselected suggestion",async()=>{
    render(<ReportingConsentCard/>);
    const checkbox=await screen.findByRole("checkbox",{name:"故障诊断上报偏好"});
    fireEvent.click(checkbox);
    await waitFor(()=>expect(calls.set).toHaveBeenCalledWith(expect.objectContaining({body:expect.objectContaining({scope:"diagnostics",enabled:false})})));
  });
  it("offers a real retry when the consent read fails",async()=>{
    calls.get.mockRejectedValueOnce(Error("offline"));
    render(<ReportingConsentCard/>);
    fireEvent.click(await screen.findByRole("button",{name:"重试读取"}));
    expect(await screen.findByRole("checkbox",{name:"故障诊断上报偏好"})).toBeChecked();
    expect(calls.get).toHaveBeenCalledTimes(2);
  });
  it("disables granting when the encrypted local queue is unavailable",async()=>{
    calls.get.mockResolvedValueOnce({...status,preparationAvailable:false});
    render(<ReportingConsentCard/>);
    expect((await screen.findAllByRole("button",{name:"同意并开启"}))[0]).toBeDisabled();
    expect(screen.getByText(/本机加密密钥未就绪/)).toBeInTheDocument();
  });
});
