# c4e Motion 独立实现复核交接

准确源码提交c4e13e27d5ecfaec67d9da0a80d3de667e5c3aaa；当前af34实现/template tests/snap三文件与c4e逐字相同，指纹见motion-c4-independent-implementation-handoff.json。唯一生产差异是 template.ts 中 schedulePortraitSpeakerDirection.change，实际12行新增/5行替换，原f2/fmt共同约束起点、duration、层终点；终点不新增.34 tween，剩余短窗clamp原transition。没有裁整timeline/音轨、改15expected、生成语义或重试预算。MOTION_C4_IMPLEMENTATION.diff 是已提交事实diff，不是新的未应用方案；其中snap只有原60.00终点tween/zIndex两行删除。

准确验收证据（均此目录）：

- backend-motion-duration-baseline-accurate-red.log：仅新8边界配6b1322af原production，3P5F，保真实RED。
- backend-motion-duration-final-template88.log：80原+8新=88P0F，2.33秒exit0。初87P1F的原错误终点snapshot保在backend-motion-duration-template-green.log，文件名不等于通过。
- lesson024-motion-required-tests-green.log：原完整LED024，Worker11P、backend186P（原video98+template88）、frontend12P；实际原命令三段全exit0，计数不并入170/研究64。
- lesson024-motion-actual-preview-green.log：原verify-t794-motion-card-preview.mjs真实HyperFrames/浏览器，1920×1080与1080×1920，各5关系卡，strict duration15/几何/字幕间隔/画布/无pageerror均通过。原脚本已知临时目录中的10PNG本次精确复制到motion-t794-preview-artifacts，保原像素/hash，不宣称重跑。
- motion-t902-existing-safety-render.log：原verify-t896-video-layout-fallback.mts实际HyperFrames渲染/ffprobe，1080×1920、30/1fps、3秒、fallbacks=[]、exit0；合成媒体无真实用户人物验收声明。
- backend-motion-duration-corrected-typecheck.log：实际tsc exit0，空日志与其真实退出证据motion-timeline-duration-result.json一起读；不凭空日志判断。

MOTION_TIMELINE_DURATION_RESULT.md及本轮精确proposal历史来源/主控授权保留；独立proposal审查是实施前范围复核，不冒称本次独立实现review已经PASS。相邻辅助单缩放、尾talking-head全幅、真人常驻/字幕安全、horizontal/visualOnly原断言与完整LED024均保，正式安装双机未验。
