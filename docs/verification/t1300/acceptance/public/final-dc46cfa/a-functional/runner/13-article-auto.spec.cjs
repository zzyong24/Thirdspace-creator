"use strict";
const {test,action,perform}=require("./platform.cjs");
test("U13-article-autoSend",async({page})=>{test.setTimeout(28800000);await action("U13-article-autoSend",()=>perform(page,"article","U13-article-autoSend",false));});
