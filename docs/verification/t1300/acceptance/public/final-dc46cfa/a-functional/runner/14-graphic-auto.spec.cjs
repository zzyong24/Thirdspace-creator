"use strict";
const {test,action,perform}=require("./platform.cjs");
test("U14-graphic-autoSend",async({page})=>{test.setTimeout(28800000);await action("U14-graphic-autoSend",()=>perform(page,"graphic","U14-graphic-autoSend",false));});
