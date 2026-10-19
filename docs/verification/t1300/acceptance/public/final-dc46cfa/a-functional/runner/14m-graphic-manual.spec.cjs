"use strict";
const {test,action,perform}=require("./platform.cjs");
test("U14-graphic-manual",async({page})=>{test.setTimeout(28800000);await action("U14-graphic-manual",()=>perform(page,"graphic","U14-graphic-manual",true));});
