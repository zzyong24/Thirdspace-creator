import {it,expect} from "vitest";
import {imageRatioStatus} from "./image-ratio";
it("实际像素保真，一像素取整可匹配，供应商错比例不伪装成功",()=>{expect(imageRatioStatus(1086,1448,"3:4")).toEqual({actualRatio:"3:4",matched:true});expect(imageRatioStatus(1000,1333,"3:4").matched).toBe(true);expect(imageRatioStatus(1024,1536,"3:4").matched).toBe(false);expect(imageRatioStatus(1024,1024).matched).toBeNull();});
