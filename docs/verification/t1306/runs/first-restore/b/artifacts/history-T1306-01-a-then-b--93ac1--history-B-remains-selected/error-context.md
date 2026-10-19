# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: history.spec.cjs >> T1306 01-a-then-b latest explicit history B remains selected
- Location: ../docs/verification/t1306/public/b/first-restore/history.spec.cjs:32:2

# Error details

```
Error: 明确选择B后应显示B；先落实际原件，再保自然FAIL

expect(received).toBeUndefined()

Received: [Error: expect(locator).toBeVisible() failed·
Locator: getByRole('region', { name: '文章和图文联合候选', exact: true })
Expected: visible
Timeout: 120000ms
Error: element(s) not found·
Call log:
  - Expect "toBeVisible" with timeout 120000ms
  - waiting for getByRole('region', { name: '文章和图文联合候选', exact: true })
]
```

# Page snapshot

```yaml
- generic [ref=e1]:
  - generic [ref=e3]:
    - complementary "主侧栏" [ref=e4]:
      - generic [ref=e5]:
        - generic [ref=e6]:
          - img [ref=e8]
          - generic [ref=e11]: CreatorOS
        - button "收起侧栏" [ref=e12]:
          - img [ref=e13]
      - generic [ref=e16]:
        - navigation "主要导航" [ref=e17]:
          - link "首页" [ref=e18] [cursor=pointer]:
            - /url: /
            - img [ref=e19]
            - generic [ref=e24]: 首页
          - link "创作者总览" [ref=e25] [cursor=pointer]:
            - /url: /overview
            - img [ref=e26]
            - generic [ref=e28]: 创作者总览
          - link "定位中心" [ref=e29] [cursor=pointer]:
            - /url: /positioning
            - img [ref=e30]
            - generic [ref=e32]: 定位中心
          - link "内容雷达" [ref=e33] [cursor=pointer]:
            - /url: /intelligence
            - img [ref=e34]
            - generic [ref=e41]: 内容雷达
          - link "选题" [ref=e42] [cursor=pointer]:
            - /url: /topics
            - img [ref=e43]
            - generic [ref=e46]: 选题
          - link "项目" [ref=e47] [cursor=pointer]:
            - /url: /projects
            - img [ref=e48]
            - generic [ref=e50]: 项目
          - link "知识库" [ref=e51] [cursor=pointer]:
            - /url: /knowledge
            - img [ref=e52]
            - generic [ref=e54]: 知识库
          - link "素材中心" [ref=e55] [cursor=pointer]:
            - /url: /assets
            - img [ref=e56]
            - generic [ref=e61]: 素材中心
          - link "创作画布" [ref=e62] [cursor=pointer]:
            - /url: /canvases
            - img [ref=e63]
            - generic [ref=e67]: 创作画布
          - link "发布中心" [ref=e68] [cursor=pointer]:
            - /url: /publishing
            - img [ref=e69]
            - generic [ref=e72]: 发布中心
          - link "运营分析" [ref=e73] [cursor=pointer]:
            - /url: /daily-report
            - img [ref=e74]
            - generic [ref=e76]: 运营分析
          - link "自动化" [ref=e77] [cursor=pointer]:
            - /url: /automations
            - img [ref=e78]
            - generic [ref=e82]: 自动化
          - link "设置" [ref=e83] [cursor=pointer]:
            - /url: /settings
            - img [ref=e84]
            - generic [ref=e87]: 设置
        - region "当前项目" [ref=e88]:
          - heading "当前项目" [level=2] [ref=e89]
          - list [ref=e90]:
            - listitem [ref=e91]:
              - link "先写问题，再记录方法" [ref=e92] [cursor=pointer]:
                - /url: /projects/project-d99d5a06-22
                - generic [ref=e93]: 先写问题，再记录方法
      - generic [ref=e94]:
        - generic [ref=e95]:
          - generic [ref=e96]:
            - img [ref=e98]
            - generic [ref=e101]: AI 助手
          - paragraph [ref=e102]: 创作者，今天想先做点什么？
          - link "打开 AI 助手" [ref=e103] [cursor=pointer]:
            - /url: "?copilot=open&scope=global"
        - button "帮助与反馈" [ref=e104]:
          - img [ref=e105]
          - generic [ref=e114]: 帮助与反馈
        - button "当前账号组：T1303-FINAL-B-fb228a46-df02-4a37-97d1-46b11d92e44c" [ref=e116] [cursor=pointer]:
          - img [ref=e118]
          - generic [ref=e122]:
            - generic [ref=e123]: 当前账号组
            - generic [ref=e124]: T1303-FINAL-B-fb228a46-df02-4a37-97d1-46b11d92e44c
          - img [ref=e125]
        - generic [ref=e128]:
          - generic [ref=e130]: "?"
          - generic [ref=e132]: 创作者
          - generic [ref=e133]: 个人版
    - generic [ref=e134]:
      - banner [ref=e135]:
        - generic [ref=e136]:
          - generic "先写问题，再记录方法" [ref=e138]
          - list "项目工作面" [ref=e139]:
            - listitem [ref=e140]:
              - link "脚本" [ref=e141] [cursor=pointer]:
                - /url: /projects/project-d99d5a06-22
            - listitem [ref=e142]:
              - link "文章" [ref=e143] [cursor=pointer]:
                - /url: /projects/project-d99d5a06-22/article?outputId=output-d99d5a06-76
            - listitem [ref=e144]:
              - link "图文" [ref=e145] [cursor=pointer]:
                - /url: /projects/project-d99d5a06-22/outputs/output-d99d5a06-88/image
            - listitem [ref=e146]:
              - link "复盘" [ref=e147] [cursor=pointer]:
                - /url: /projects/project-d99d5a06-22/review
        - link "搜索" [ref=e149] [cursor=pointer]:
          - /url: /search
          - img
        - button "充值" [ref=e151]
      - generic [ref=e157]:
        - main [ref=e159]:
          - generic [ref=e160]:
            - generic [ref=e161]:
              - heading "公众号成稿" [level=1] [ref=e162]
              - paragraph [ref=e163]: 原稿来自脚本，在对话中调整这篇文章。
            - button "重新组织内容" [ref=e164]
          - generic [ref=e165]:
            - generic [ref=e166]: 当前成稿已保存
            - link "查看脚本原稿" [ref=e167] [cursor=pointer]:
              - /url: /projects/project-d99d5a06-22
          - region "NoteRelay 排版预览" [ref=e168]:
            - generic [ref=e169]:
              - heading "成稿预览" [level=2] [ref=e171]
              - generic [ref=e172]:
                - button "复制公众号文章" [ref=e173]
                - group [ref=e174]:
                  - generic "更多导出" [ref=e175] [cursor=pointer]
            - generic "公众号排版编辑器" [ref=e178]:
              - article [ref=e181]:
                - generic [ref=e183]:
                  - generic [ref=e184]:
                    - paragraph [ref=e185]: 石墨极简风
                    - heading "先写问题，再记录方法" [level=1] [ref=e186]
                  - generic [ref=e188]:
                    - paragraph [ref=e189]: "01"
                    - heading "先写下，这次要解决什么问题" [level=3] [ref=e191]
                  - paragraph [ref=e192]:
                    - generic [ref=e193]: 我整理笔记时
                    - text: ，会先写清楚要解决的问题，再记下实际做过的步骤，最后检查结果。
                  - paragraph [ref=e194]:
                    - generic [ref=e195]: 比如整理一份阅读笔记
                    - text: ，我会先问自己：这次阅读解决了什么疑问？接着写下试过的方法，以及还没有想明白的地方。
                  - paragraph [ref=e196]:
                    - generic [ref=e197]: 这个问题可以具体一点
                    - text: ：原来哪里没理解？读完以后，哪一点有了新的认识？如果暂时还说不清楚，就把疑问先留下来。后面记录方法时，再回头看它回应的是哪个问题。
                  - generic [ref=e199]:
                    - paragraph [ref=e200]: "02"
                    - heading "沿着问题，记录实际做过的步骤" [level=3] [ref=e202]
                  - paragraph [ref=e203]:
                    - generic [ref=e204]: 问题写下来之后
                    - text: ，再顺着实际过程记录：先做了什么，接着尝试了什么，做到哪里仍然没有想明白。
                  - paragraph [ref=e205]:
                    - generic [ref=e206]: 读到的方法和自己做过的步骤
                    - text: ，可以在笔记里分清楚。只是读到了、还没有亲自尝试的方法，就注明“尚未尝试”；已经试过的，则写下实际过程。
                  - paragraph [ref=e207]:
                    - generic [ref=e208]: 这样回看时
                    - text: ，能知道哪些内容来自阅读，哪些是自己的实践记录，也能把做过的步骤对应到开头的问题。
                  - generic [ref=e210]:
                    - paragraph [ref=e211]: "03"
                    - heading "写完步骤，再回头检查结果" [level=3] [ref=e213]
                  - paragraph [ref=e214]:
                    - generic [ref=e215]: 步骤记完
                    - text: ，还要回到最初的问题：现在想明白了什么，还有什么没有想明白？
                  - paragraph [ref=e216]:
                    - generic [ref=e217]: 整理阅读笔记时
                    - text: ，可以把已经理解的部分写下来，再留下仍然困惑的地方。只想明白了一部分，就照实记录这一部分；暂时没有答案，也可以写明。
                  - paragraph [ref=e218]:
                    - generic [ref=e219]: 检查结果不必写得复杂
                    - text: 。几句具体的话就够了：现在能解释什么，哪一步还说不清楚，接下来需要继续弄明白什么。
                  - generic [ref=e221]:
                    - paragraph [ref=e222]: "04"
                    - heading "结束工作时，留下一个追问" [level=3] [ref=e224]
                  - paragraph [ref=e225]:
                    - generic [ref=e226]: 我想保留一个习惯
                    - text: ：每次结束工作，记下一个仍然值得追问的问题。
                  - paragraph [ref=e227]:
                    - generic [ref=e228]: 阅读笔记也可以这样收尾
                    - text: 。从还没有想明白的地方，找出下一次想继续弄清楚的事。比如，把“这里还不太懂”写得更具体一些：“我还不能解释这一步为什么这样做。”这只是提问的示例，具体问题要来自当次阅读。
                  - paragraph [ref=e229]:
                    - generic [ref=e230]: 留下的问题不必当场回答
                    - text: 。先把它写清楚，再考虑下一步。
                  - generic [ref=e232]:
                    - paragraph [ref=e233]: "05"
                    - heading "下次整理笔记，试着留下这四行" [level=3] [ref=e235]
                  - paragraph [ref=e236]:
                    - generic [ref=e237]: 这次要解决的问题
                    - text: ：___
                    - emphasis [ref=e238]:
                      - generic [ref=e239]:
                        - text: <strong style="color:#27272A;"><span leaf="">
                        - text: 实际试过的方法和步骤：</span></strong>
                    - emphasis [ref=e240]:
                      - generic [ref=e241]:
                        - text: <strong style="color:#27272A;"><span leaf="">
                        - text: 目前想明白的部分，以及还没想明白的地方：</span></strong>
                    - emphasis [ref=e242]:
                      - generic [ref=e243]:
                        - text: <strong style="color:#27272A;"><span leaf="">
                        - text: 下次仍然值得追问的一个问题：</span></strong>
                    - text: ___
                  - paragraph [ref=e244]:
                    - generic [ref=e245]: 这里没有统计数据
                    - text: ，也不承诺这样记录，效率就一定提高。我想保留的，是整理笔记时写清楚问题、实际做法和当前结果，结束工作时再留下一个值得追问的问题。
                  - paragraph [ref=e246]:
                    - text: 下一步，
                    - generic [ref=e247]: 先记录一个值得追问的问题
                    - text: 。
            - group [ref=e248]:
              - generic "开源来源与许可" [ref=e249] [cursor=pointer]
          - group [ref=e250]:
            - generic "历史版本" [ref=e251] [cursor=pointer]
        - separator "调整编导栏宽度" [ref=e252]
        - complementary "编导对话" [ref=e253]:
          - generic [ref=e254]:
            - button "收起编导栏" [ref=e256] [cursor=pointer]:
              - generic [ref=e257]: ⟩
              - text: 收起编导
            - generic [ref=e260]:
              - generic [ref=e261]:
                - img [ref=e263]
                - generic [ref=e266]:
                  - heading "编导对话" [level=2] [ref=e267]
                  - paragraph [ref=e268]: 基于当前稿与选区持续调整，预览后再采纳
                - generic [ref=e269]:
                  - generic "本会话累计 token 用量(↑输入 ↓输出)。费用换算后续可在模型配置里配置单价。" [ref=e270]: ↑225K ↓566
                  - button "新对话" [ref=e271]:
                    - img [ref=e272]
                    - text: 新对话
                  - button "历史记录" [active] [ref=e273]:
                    - img [ref=e274]
                    - text: 历史记录
              - generic "当前项目：先写问题，再记录方法" [ref=e278]:
                - img [ref=e279]
                - generic [ref=e281]: 项目
                - generic [ref=e282]: ·
                - generic [ref=e283]: 先写问题，再记录方法
              - generic [ref=e284]:
                - list "助手活动记录" [ref=e286]:
                  - listitem [ref=e287]:
                    - generic [ref=e288]: 请先读取当前已采纳文章，将最后一句改为“下一步，先记录一个值得追问的问题。”。保留其他正文、事实和图片，不增加经历或数字，不修改脚本或其他平台。请用work.editor.propose给一份完整可预览采纳的文章编辑候选，先不要保存，只出一份。
                  - listitem [ref=e289]:
                    - generic [ref=e291]:
                      - paragraph [ref=e292]: 已生成一份完整可预览、可采纳的文章编辑候选，仅将最后一句改为：
                      - blockquote [ref=e293]:
                        - paragraph [ref=e294]: 下一步，先记录一个值得追问的问题。
                      - paragraph [ref=e295]: 其余正文、事实和图片状态保持不变，未增加经历或数字，未修改脚本或其他平台。候选尚未保存，等待你预览采纳。
                    - group [ref=e296]:
                      - generic "读取完成 · 读取当前作品" [ref=e297] [cursor=pointer]:
                        - img [ref=e298]
                        - text: 读取完成 · 读取当前作品
                    - group [ref=e301]:
                      - generic "已读取当前文章与选区" [ref=e302] [cursor=pointer]
                    - group [ref=e303]:
                      - generic "读取完成 · 读取项目全流程" [ref=e304] [cursor=pointer]:
                        - img [ref=e305]
                        - text: 读取完成 · 读取项目全流程
                    - generic [ref=e308]:
                      - generic [ref=e309]: 项目全流程 · 先写问题，再记录方法
                      - generic [ref=e310]:
                        - generic [ref=e311]:
                          - paragraph [ref=e312]: 选题卡
                          - paragraph [ref=e313]: 已有
                        - generic [ref=e314]:
                          - paragraph [ref=e315]: 封面
                          - paragraph [ref=e316]: 暂无
                        - generic [ref=e317]:
                          - paragraph [ref=e318]: 审核
                          - paragraph [ref=e319]: 暂无
                        - generic [ref=e320]:
                          - paragraph [ref=e321]: 数据
                          - paragraph [ref=e322]: 暂无
                        - generic [ref=e323]:
                          - paragraph [ref=e324]: 稿件
                          - paragraph [ref=e325]: 已有
                        - generic [ref=e326]:
                          - paragraph [ref=e327]: 创作素材
                          - paragraph [ref=e328]: 暂无
                        - generic [ref=e329]:
                          - paragraph [ref=e330]: 发布
                          - paragraph [ref=e331]: 暂无
                        - generic [ref=e332]:
                          - paragraph [ref=e333]: 复盘
                          - paragraph [ref=e334]: 暂未接入
                      - paragraph [ref=e335]: 4 类稿件 · 0 份素材 · 0 条发布记录
                    - group [ref=e336]:
                      - generic "读取完成 · 读取执行方法" [ref=e337] [cursor=pointer]:
                        - img [ref=e338]
                        - text: 读取完成 · 读取执行方法
                    - group [ref=e341]:
                      - generic "候选待采用 · 生成精调候选" [ref=e342] [cursor=pointer]:
                        - img [ref=e343]
                        - text: 候选待采用 · 生成精调候选
                    - region "编导编辑候选" [ref=e347]:
                      - generic [ref=e348]:
                        - heading "文章编辑候选" [level=3] [ref=e349]
                        - generic [ref=e350]: 1 项改动
                      - paragraph [ref=e351]: 仅将文章最后一句替换为“下一步，先记录一个值得追问的问题。”，保留其余正文、事实、来源、图片与版式。
                      - generic [ref=e352]:
                        - button "预览改动" [ref=e353]
                        - button "采纳到当前作品" [disabled]
                        - link "打开作品" [ref=e354] [cursor=pointer]:
                          - /url: /projects/project-d99d5a06-22/article?outputId=output-d99d5a06-76
                - generic [ref=e357]:
                  - textbox "我能帮你做什么" [ref=e359]:
                    - /placeholder: 告诉我这篇文章需要怎么调整
                  - generic [ref=e360]:
                    - button "Choose File" [ref=e361]
                    - generic [ref=e362]:
                      - button "添加文件或图片" [ref=e363]:
                        - img [ref=e364]
                        - text: 添加文件或图片
                      - generic [ref=e366]: 也可拖到这里；图片识别效果取决于当前模型
                  - generic [ref=e368]:
                    - generic [ref=e369]: ⌘/Ctrl ↩ 发送 · Enter 换行
                    - button "清空输入" [disabled] [ref=e370]: 清空
                    - button "提交提示给 Copilot" [disabled] [ref=e371]:
                      - img [ref=e372]
                      - generic [ref=e374]: 生成
  - alert [ref=e377]
```

# Test source

```ts
  1  | 'use strict';
  2  | const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{performance}=require('node:perf_hooks');
  3  | const {test,expect,session,binding}=require('../../../../t1304/acceptance/candidate/driver/public-fixture.cjs');
  4  | const root=path.join(binding.sourceRoot,'docs/verification/t1306/runs/first-restore/b');
  5  | const handoff=JSON.parse(fs.readFileSync(path.join(binding.sourceRoot,'docs/verification/t1303/acceptance/runs/final-t1304-t1305/b/HANDOFF.json'),'utf8'));
  6  | const A=handoff.turns.editor.ids.conversationId,B=handoff.turns.joint1.ids.conversationId;
  7  | const convKey='copilot:conv:group:'+handoff.groupId+':project:'+handoff.projectId;
  8  | const sha=value=>crypto.createHash('sha256').update(value).digest('hex');
  9  | const safeCode=x=>typeof x==='string'&&/^[A-Za-z0-9_.:-]{1,120}$/.test(x)?x:'UNAVAILABLE';
  10 | const readOps=new Set(['articles.get','graphicPosts.get','artifacts.get','artifacts.versions.list']);
  11 | const forbidden=new Set(['articles.versions.create','graphicPosts.versions.create','artifacts.versions.create','artifacts.scriptPatches.apply','ai.conversations.messages.create']);
  12 | const ids={A,B};
  13 | const stamp=()=>({at:new Date().toISOString(),monotonicMs:performance.now()});
  14 | function noSecret(bytes){if(bytes.includes(Buffer.from(session.handshake)))throw Error('PRIVATE_SECRET_NOT_PERSISTED');}
  15 | function write(file,value){const bytes=Buffer.from(typeof value==='string'?value:JSON.stringify(value,null,2)+'\n');noSecret(bytes);fs.writeFileSync(file,bytes,{mode:0o600});}
  16 | async function rpcReply(page,id,input={}){
  17 |  if(!readOps.has(id))throw Error('READ_OPERATION_NOT_ALLOWED');let response;
  18 |  try{response=await page.request.post('/api/v1/dispatch',{timeout:900000,headers:{'x-group-id':handoff.groupId},data:{id,input}});}catch{throw Error('READ_RPC_TRANSPORT_FAILURE operation='+safeCode(id));}
  19 |  let reply;try{reply=await response.json();}catch{throw Error('READ_RPC_INVALID_JSON operation='+safeCode(id)+' status='+response.status());}
  20 |  if(!response.ok()||reply.success===false)throw Error('READ_RPC_REJECTED operation='+safeCode(id)+' status='+response.status()+' code='+safeCode(reply.error?.code??reply.code));return reply;
  21 | }
  22 | const rpc=async(page,id,input={})=>(await rpcReply(page,id,input)).data;
  23 | async function business(page){const versions=[];let pageIndex=1,total;do{const reply=await rpcReply(page,'artifacts.versions.list',{params:{artifactId:handoff.scriptId},query:{page:pageIndex,pageSize:100}});total=reply.meta?.total;expect(Number.isSafeInteger(total)&&total>=0).toBe(true);expect(Array.isArray(reply.data)).toBe(true);for(const row of reply.data){expect(versions.some(v=>v.id===row.id)).toBe(false);versions.push(row);}expect(versions.length).toBeLessThanOrEqual(total);if(versions.length<total)expect(reply.data.length).toBeGreaterThan(0);pageIndex++;}while(versions.length<total);return {article:await rpc(page,'articles.get',{params:{outputId:handoff.turns.joint1.articleId}}),graphic:await rpc(page,'graphicPosts.get',{params:{outputId:handoff.turns.joint1.graphicId}}),script:await rpc(page,'artifacts.get',{params:{artifactId:handoff.scriptId}}),scriptVersions:versions};}
  24 | function dispatchInfo(request){try{if(new URL(request.url()).origin!==new URL(session.baseURL).origin||new URL(request.url()).pathname!=='/api/v1/dispatch')return null;return request.postDataJSON();}catch{return null;}}
  25 | async function ensureRail(page){const mobile=page.getByRole('button',{name:'打开编导',exact:true}),expand=page.getByRole('button',{name:'展开编导栏',exact:true});if(await mobile.isVisible())await mobile.click();else if(await expand.isVisible())await expand.click();await expect(page.locator('aside[data-slot="stage-chat-rail"]')).toBeVisible();}
  26 | async function openHistory(page){const button=page.getByRole('button',{name:'历史记录',exact:true});await button.click();await expect(page.locator('[data-slot="copilot-history-item"]').first()).toBeVisible();}
  27 | async function clickHistory(page,id){await openHistory(page);const button=page.locator('[data-slot="copilot-history-item"][data-conversation-id="'+id+'"]');await expect(button).toHaveCount(1);await button.click();}
  28 | async function visibleState(page){const a=await page.getByRole('region',{name:'编导编辑候选',exact:true}).isVisible(),b=await page.getByRole('region',{name:'文章和图文联合候选',exact:true}).isVisible();const pointer=await page.evaluate(key=>localStorage.getItem(key),convKey);return {visibleA:a,visibleB:b,visibleConversationId:a&&!b?A:b&&!a?B:null,naturalPointer:pointer,userTexts:await page.locator('[data-slot="copilot-messages"] [data-slot="copilot-message"][data-role="user"]').allTextContents()};}
  29 | async function visibleIdWithMenu(page){const state=await visibleState(page);await openHistory(page);const active=page.locator('[data-slot="copilot-history-item"][data-active="true"]');state.menuActiveIds=await active.evaluateAll(nodes=>nodes.map(node=>node.getAttribute('data-conversation-id')));await page.getByRole('button',{name:'历史记录',exact:true}).click();return state;}
  30 | async function waitVisible(page,id){const region=page.getByRole('region',{name:id===A?'编导编辑候选':'文章和图文联合候选',exact:true});await expect(region).toBeVisible();await expect.poll(async()=>await page.evaluate(key=>localStorage.getItem(key),convKey),{timeout:120000}).toBe(id);}
  31 | for(const [name,order] of [['01-a-then-b','A-B'],['02-b-then-a','B-A'],['03-hydrate-then-b','A-complete-B']]){
  32 |  test('T1306 '+name+' latest explicit history B remains selected',async({page,context},info)=>{
  33 |   const dir=path.join(root,name);fs.mkdirSync(dir,{recursive:true,mode:0o700});const save=(name,v)=>write(path.join(dir,name+'.json'),v);
  34 |   const events=[],reads=[],attemptedWrites=[],sourceReads=[];const requestRefs=new WeakMap();let phase='seed',hold=false;let before,finalState,outcome='INCONCLUSIVE',safeFailure=null;
  35 |   const record=()=>save('timeline',{case:name,order,events,reads:reads.map(({release,promise,...safe})=>safe),attemptedWrites,sourceReads});
  36 |   const event=(kind,detail={})=>{events.push({kind,...detail,...stamp()});record();};
  37 |   const snap=async label=>{await page.screenshot({path:path.join(dir,label+'.png'),fullPage:true,animations:'disabled',caret:'hide',timeout:120000});write(path.join(dir,label+'.html'),await page.content());write(path.join(dir,label+'.aria.txt'),await page.locator('body').ariaSnapshot());save(label+'-state',{...stamp(),url:page.url(),...await visibleState(page)});};
  38 |   context.on('request',request=>{const d=dispatchInfo(request);if(d?.id==='ai.workCandidates.source'){sourceReads.push({id:d.id,input:d.input,...stamp()});record();}});
  39 |   await context.route('**/api/v1/dispatch',route=>{const d=dispatchInfo(route.request());if(forbidden.has(d?.id)){attemptedWrites.push({id:d.id,...stamp()});record();return route.abort('blockedbyclient');}return route.fallback();});
  40 |   await context.route('**/api/chat',route=>{attemptedWrites.push({id:'/api/chat',...stamp()});record();return route.abort('blockedbyclient');});
  41 |   page.on('response',async response=>{const entry=requestRefs.get(response.request());if(!entry)return;entry.browserResponseAt=stamp();entry.browserStatus=response.status();record();try{const bytes=await response.body();noSecret(bytes);entry.browserBodySha256=sha(bytes);entry.browserBodyBytes=bytes.length;entry.browserBodyCompleteAt=stamp();record();}catch{entry.browserReadError='BROWSER_RESPONSE_BODY_UNAVAILABLE';record();}});
  42 |   page.on('requestfinished',request=>{const entry=requestRefs.get(request);if(entry){entry.requestFinishedAt=stamp();record();}});
  43 |   page.on('requestfailed',request=>{const entry=requestRefs.get(request);if(entry){entry.requestFailedAt=stamp();entry.failure='BROWSER_REQUEST_FAILED';record();}});
  44 |   const handler=async route=>{
  45 |    const request=route.request(),d=dispatchInfo(request),id=d?.input?.params?.conversationId;
  46 |    if(d?.id!=='ai.conversations.messages.list'||![A,B].includes(id))return route.fallback();
  47 |    let release;const promise=new Promise(resolve=>{release=resolve;});const entry={sequence:reads.length+1,phase,conversationId:id,label:id===A?'A':'B',requestInput:d.input,requestBodySha256:sha(Buffer.from(request.postData()??'')),requestStartedAt:stamp(),held:hold,release,promise};reads.push(entry);requestRefs.set(request,entry);record();
  48 |    try{
  49 |     let response;try{response=await route.fetch({timeout:900000});}catch{entry.transportError='MESSAGES_ROUTE_FETCH_FAILURE';record();await route.abort('connectionfailed').catch(()=>{});return;}
  50 |     entry.serverResponseAt=stamp();const bytes=await response.body();noSecret(bytes);entry.serverStatus=response.status();entry.serverBodySha256=sha(bytes);entry.serverBodyBytes=bytes.length;entry.serverBodyAt=stamp();
  51 |     write(path.join(dir,'read-'+String(entry.sequence).padStart(2,'0')+'-real-body.json'),bytes.toString('utf8'));
  52 |     let body;try{body=JSON.parse(bytes);}catch{entry.protocolError='INVALID_MESSAGES_JSON';}
  53 |     entry.responseMessageIds=Array.isArray(body?.data)?body.data.map(row=>({id:row.id,role:row.role,conversationId:row.conversationId})):[];
  54 |     if(response.status()!==200||body?.success===false){entry.protocolError='REAL_MESSAGES_NOT_200_SUCCESS';record();await route.fulfill({response});return;}
  55 |     record();if(entry.held)await promise;entry.releaseStartedAt=stamp();entry.releaseBodySha256=sha(bytes);record();
  56 |     await route.fulfill({response});entry.releaseReturnedAt=stamp();record();
  57 |    }catch{entry.safeHandlerError='MESSAGES_RESPONSE_CONTROL_FAILURE';record();await route.abort('connectionfailed').catch(()=>{});}
  58 |   };
  59 |   await page.route('**/api/v1/dispatch',handler);
  60 |   const latest=(label,readPhase)=>reads.filter(x=>x.label===label&&x.phase===readPhase).at(-1);
  61 |   const realReady=async(label,readPhase)=>{await expect.poll(()=>latest(label,readPhase)?.serverStatus,{timeout:120000}).toBe(200);const entry=latest(label,readPhase);expect(entry.protocolError).toBeUndefined();expect(entry.responseMessageIds.some(row=>row.id===(label==='A'?handoff.turns.editor.ids.sourceMessageId:handoff.turns.joint1.ids.sourceMessageId)),'真实响应必须含对应原source user消息ID').toBe(true);return entry;};
  62 |   const received=async entry=>{await expect.poll(()=>Boolean(entry.browserBodySha256&&entry.requestFinishedAt),{timeout:120000}).toBe(true);expect(entry.browserBodySha256).toBe(entry.serverBodySha256);expect(entry.browserStatus).toBe(200);};
  63 |   const release=async entry=>{event('explicit-release',{sequence:entry.sequence,label:entry.label});entry.release();await received(entry);};
  64 |   try{
  65 |    await context.addCookies([{name:'creatoros_current_group',value:encodeURIComponent(handoff.groupId),url:session.baseURL}]);await context.addInitScript(id=>{localStorage.setItem('creatoros:current-group',id);localStorage.removeItem('creatoros:current-account');localStorage.setItem('creatoros:onboarding:hidden','1');},handoff.groupId);
  66 |    save('binding',{sourceHead:binding.sourceHead,controlHead:'e5d18d2c7d2fc8126319268a9633b2921f25d5a6',candidateBindingSha256:sha(fs.readFileSync(session.candidateBinding)),packetSha256:sha(fs.readFileSync(path.join(__dirname,'TASK_PACKET.md'))),ids,convKey,temporaryFreshContext:true,businessStorageInjected:false});
  67 |    before=await business(page);save('business-before',before);await page.goto(handoff.ownerURLs.article);await expect(page.locator('[data-page="article-workbench"]')).toBeVisible();await ensureRail(page);
  68 |    await realReady('A','seed');await received(latest('A','seed'));await waitVisible(page,A);event('initial-default-A-ready',await visibleState(page));
  69 |    phase='explicit-seed-A';event('click-history-A');await clickHistory(page,A);const seedA=await realReady('A',phase);await received(seedA);await waitVisible(page,A);const seeded=await visibleIdWithMenu(page);expect(seeded.menuActiveIds).toEqual([A]);save('natural-seed-A',seeded);await snap('seed-A-before-reload');
  70 |    phase='reload';hold=true;event('natural-reload');await page.reload();await expect(page.locator('[data-page="article-workbench"]')).toBeVisible();await ensureRail(page);const restoreA=await realReady('A','reload');expect(restoreA.held).toBe(true);event('restore-A-real200-held',{sequence:restoreA.sequence});
  71 |    if(order==='A-complete-B'){
  72 |     await release(restoreA);await waitVisible(page,A);event('restore-A-visible-before-B',await visibleState(page));await snap('A-complete-before-B');hold=false;
  73 |    }
  74 |    phase='explicit-B';event('click-history-B');await clickHistory(page,B);const requestedB=await realReady('B','explicit-B');event('explicit-B-real200',{sequence:requestedB.sequence,held:requestedB.held});
  75 |    if(order==='A-B'){
  76 |     expect(requestedB.held).toBe(true);await release(restoreA);await waitVisible(page,A);event('A-visible-before-B-release',await visibleState(page));await snap('A-first-visible');await release(requestedB);
  77 |    }else if(order==='B-A'){
  78 |     expect(requestedB.held).toBe(true);await release(requestedB);await waitVisible(page,B);event('B-visible-before-A-release',await visibleState(page));await snap('B-first-visible');await release(restoreA);
  79 |    }else await received(requestedB);
  80 |    let visibleError;try{await waitVisible(page,B);}catch(error){visibleError=error;}
  81 |    finalState=await visibleIdWithMenu(page);save('final-visible',{...stamp(),...finalState});await snap('final');
  82 |    const userB=JSON.parse(fs.readFileSync(path.join(dir,'read-'+String(requestedB.sequence).padStart(2,'0')+'-real-body.json'),'utf8')).data.find(row=>row.role==='user');
  83 |    const userA=JSON.parse(fs.readFileSync(path.join(dir,'read-'+String(restoreA.sequence).padStart(2,'0')+'-real-body.json'),'utf8')).data.find(row=>row.role==='user');
  84 |    save('visible-identity-witness',{A:{conversationId:A,messageId:userA?.id,userContent:userA?.content},B:{conversationId:B,messageId:userB?.id,userContent:userB?.content},actualUserTexts:finalState.userTexts,menuActiveIds:finalState.menuActiveIds,actualVisibleConversationId:finalState.visibleConversationId,naturalPointer:finalState.naturalPointer});
  85 |    outcome=finalState.visibleConversationId===B&&finalState.naturalPointer===B&&JSON.stringify(finalState.menuActiveIds)===JSON.stringify([B])?'PASS':'FAIL';
  86 |    save('case-result',{case:name,order,status:outcome,expectedFinalConversationId:B,actual:finalState,allTargetReal200:true,originalBodiesUnchanged:[restoreA,requestedB].every(x=>x.serverBodySha256===x.browserBodySha256),note:'诊断观察；FAIL为用户选择未落实，不称复现成功即产品PASS'});
  87 |    expect(visibleError,'明确选择B后应显示B；先落实际原件，再保自然FAIL').toBeUndefined();expect(finalState.menuActiveIds).toEqual([B]);expect(finalState.visibleConversationId).toBe(B);
> 88 |   }catch(error){safeFailure={name:safeCode(error?.name),message:String(error?.message??'DIAGNOSIS_ERROR').split(session.handshake).join('[REDACTED]')};save('safe-failure',safeFailure);if(outcome==='INCONCLUSIVE')save('case-result',{case:name,order,status:outcome,reason:safeFailure,actual:await visibleState(page).catch(()=>null)});await snap('failure').catch(()=>{});throw new Error(safeFailure.message);}
     |                                                                                                                                                                                                                                                                                                                                                                                       ^ Error: 明确选择B后应显示B；先落实际原件，再保自然FAIL
  89 |   finally{
  90 |    for(const entry of reads)entry.release();await page.unroute('**/api/v1/dispatch',handler);if(before){const after=await business(page);save('business-after',after);save('isolation-result',{completeDTOAndScriptEqual:JSON.stringify(after)===JSON.stringify(before),attemptedWrites});expect(after).toEqual(before);}expect(attemptedWrites).toEqual([]);record();
  91 |   }
  92 |  });
  93 | }
  94 | 
```