import {describe,expect,it} from "vitest";
import {assetGenerationParameterError,referenceImageAllowed,supportsAssetGenerationMode} from "./asset-generation-modes";

const minimaxH3={provider:"minimax",model:"MiniMax-H3"};
const minimaxLegacy={provider:"minimax",model:"MiniMax-Hailuo-2.3"};
const openai={provider:"openai",model:"gpt-image-1"};
const png=(width:number,height:number)=>{
 const bytes=Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/atcAAAAASUVORK5CYII=","base64");
 bytes.writeUInt32BE(width,16);bytes.writeUInt32BE(height,20);return bytes;
};

describe("通用素材生成模式",()=>{
 it("只开放适配器真实支持的参考图模式",()=>{
  expect(supportsAssetGenerationMode(openai,"image_to_image")).toBe(true);
  expect(supportsAssetGenerationMode({provider:"minimax",model:"image-01-live"},"image_to_image")).toBe(true);
  expect(supportsAssetGenerationMode(minimaxH3,"image_to_video")).toBe(true);
  expect(supportsAssetGenerationMode({provider:"omnihi",model:"seedance"},"image_to_video")).toBe(false);
  expect(supportsAssetGenerationMode({provider:"minimax",model:"unknown"},"text_to_image")).toBe(false);
  expect(supportsAssetGenerationMode({provider:"minimax",model:"unknown"},"text_to_video")).toBe(false);
 });
 it("首帧格式、真实文件类型、尺寸和画幅在提交前校验",()=>{
  expect(referenceImageAllowed(minimaxH3,"image_to_video","image/png",png(512,512))).toBe(true);
  expect(referenceImageAllowed(minimaxH3,"image_to_video","image/png",png(255,512))).toBe(false);
  expect(referenceImageAllowed(minimaxH3,"image_to_video","image/png",png(512,1400))).toBe(false);
  expect(referenceImageAllowed(minimaxH3,"image_to_video","image/jpeg",png(512,512))).toBe(false);
  expect(referenceImageAllowed(minimaxLegacy,"image_to_video","image/png",png(300,512))).toBe(false);
  expect(referenceImageAllowed(minimaxLegacy,"image_to_video","image/png",png(301,512))).toBe(true);
 });
 it("模型时长和分辨率按供应商契约拒绝",()=>{
  expect(assetGenerationParameterError(minimaxH3,"text_to_video",{prompt:"镜头",durationSec:4,resolution:"2K"})).toBeNull();
  expect(assetGenerationParameterError({provider:"minimax",model:"MiniMax-H3-Max"},"text_to_video",{prompt:"镜头",durationSec:4,resolution:"2K"})).toContain("H3 Max");
  expect(assetGenerationParameterError(minimaxLegacy,"image_to_video",{prompt:"镜头",durationSec:7,resolution:"768P"})).toContain("6 或 10 秒");
 });
});
