import {expect,it} from "vitest";
import {decodeScriptTable, syncScriptTableTranscript} from "./script-table-protocol";
const four="| # | 口播 | 画面 | 字幕 |\n| --- | --- | --- | --- |\n| 1 | 正文 | 画面 | 字幕 |";
it("四列与系统六列逐行转换，保留转义竖线、换行和明确角色/时长",()=>{
 expect(decodeScriptTable('# 分镜脚本\n\n'+four)).toMatchObject({transcript:"正文",sections:[{id:"script-saved-0",body:"口播：正文\n画面：画面\n字幕：字幕"}]});
 const six="| # | 结构角色 | 口播 | 画面 | 字幕 | 时长 |\n| --- | --- | --- | --- | --- | --- |\n| 1 | hook | 甲\\|乙<br>丙 | 工作台 | 字幕 | 0-5s |\n| 2 | body | 丁 |  |  | 5-8s |";
 expect(decodeScriptTable(six)).toEqual({scriptTableProtocol:"labeled-storyboard-v1",scriptTableNarration:{"script-saved-0":"甲|乙\n丙","script-saved-1":"丁"},transcript:"甲|乙\n丙\n丁",sections:[{id:"script-saved-0",heading:"1. 甲|乙\n丙 · hook（0-5s）",body:"口播：甲|乙\n丙\n画面：工作台\n字幕：字幕"},{id:"script-saved-1",heading:"2. 丁 · body（5-8s）",body:"口播：丁"}]});
 expect(decodeScriptTable(six)).toEqual(decodeScriptTable(six));
});
it.each(["普通正文",four+"\n补充重要正文",four+"\n| 2 | 残行 |",four.replace("| --- | --- | --- | --- |","| --- | --- |"),four.replace("| 1 | 正文 |","| 错误序号 | 正文 |"),four.replace("口播 | 画面","画面 | 口播"),four.replace("正文 |","未转义|正文 |"),four.split("\n").slice(0,2).join("\n"),four.replace("正文 |"," |")])("不完整或未知协议不部分吞正文：%s",text=>{expect(decodeScriptTable(text)).toBeNull();});
it("空口播不借画面补事实，有实际口播的整表仍可转换",()=>{
 const text=four+"\n| 2 |  | 过渡画面 | 过渡字幕 |";
 expect(decodeScriptTable(text)).toMatchObject({transcript:"正文\n",sections:[{body:"口播：正文\n画面：画面\n字幕：字幕"},{body:"画面：过渡画面\n字幕：过渡字幕"}]});
});

it("同步只处理明确协议来源，多行/无标签/仅制作字段不混入字幕",()=>{
 const other={transcript:"调用方明确正文",sections:[{body:"新句"}]};
 expect(syncScriptTableTranscript(other,"a")).toBe(other);
 const tagged={...other,scriptTableProtocol:"labeled-storyboard-v1",scriptTableNarration:{a:"旧句",b:"用户正文",c:""},sections:[{id:"a",body:"口播：新句\n续行\n画面：画面\n字幕：字幕"},{id:"b",body:"用户正文"},{id:"c",body:"画面：过渡\n字幕：提示"}]};
 expect(syncScriptTableTranscript(tagged,"a")).toMatchObject({transcript:"新句\n续行\n用户正文\n"});
 expect(tagged.transcript).toBe("调用方明确正文");
});
