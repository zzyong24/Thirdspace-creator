import {it,expect} from 'vitest';
import {GRAPHIC_CARD_BRIEF_TEMPLATE} from './graphic-card-brief';
import {BAOYU_SERIES_IMAGE_METHOD} from '../vendor/baoyu-xhs-images/method';
it('实际注册模板载入固定开源逐页与共享参考方法而保留旧配图分支',()=>{
 expect(GRAPHIC_CARD_BRIEF_TEMPLATE.system).toContain(BAOYU_SERIES_IMAGE_METHOD);
 expect(GRAPHIC_CARD_BRIEF_TEMPLATE.template).toContain('targetCardId');
 expect(GRAPHIC_CARD_BRIEF_TEMPLATE.template).not.toContain('禁止叠加文字');
});
