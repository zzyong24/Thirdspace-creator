import {expect,it} from 'vitest';
import {CHATBOX_TOPIC_TEMPLATE} from './chatbox-turn';
it('平台重组以真实脚本为原稿，图像沿已存在的用户采纳与精确版本链',()=>{
 const prompt=CHATBOX_TOPIC_TEMPLATE.system;
 for(const term of ['scriptContext','scriptText','scriptRef','禁止反写脚本或另一个平台','material.generate','articles.get','assets.get','article.save','currentFileId','素材采纳本身不会插入文章','不得用 work.editor typed_snapshot 绕过图片边界'])expect(prompt).toContain(term);
});
