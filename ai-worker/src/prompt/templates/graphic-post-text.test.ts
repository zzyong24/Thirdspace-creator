import {it,expect} from 'vitest';
import {GRAPHIC_POST_TEXT_TEMPLATE} from './graphic-post-text';
import {BAOYU_SERIES_PLANNING_METHOD} from '../vendor/baoyu-xhs-images/method';
it('实际文字规划Skill复用连续阅读大纲方法，不生成虚假图片状态',()=>{
 expect(GRAPHIC_POST_TEXT_TEMPLATE.system).toContain(BAOYU_SERIES_PLANNING_METHOD);
 expect(GRAPHIC_POST_TEXT_TEMPLATE.system).toContain('visualBrief');
});
