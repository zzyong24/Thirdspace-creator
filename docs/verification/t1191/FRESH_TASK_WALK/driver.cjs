const { chromium } = require('/Users/zyongzhu/.codex/worktrees/t1062-client-integration/Thirdspace-creator/frontend/node_modules/@playwright/test');
const fs = require('fs');
const readline = require('readline');
const root = '/Users/zyongzhu/.codex/creatoros-verification/t1117-20261009/t1191-fresh-task-walk';
(async () => {
  const context = await chromium.launchPersistentContext(root+'/profile',{ headless: false, executablePath: '/Users/zyongzhu/.codex/worktrees/t1062-client-integration/Thirdspace-creator/frontend/src-tauri/sidecar/frontend/browsers/chromium-1223/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing', args: ['--no-first-run','--no-default-browser-check'], timeout: 120000, viewport: {width:1280,height:800} });
  const browser = context.browser();
  context.setDefaultTimeout(120000);
  context.setDefaultNavigationTimeout(120000);
  const network = [];
  await context.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.hostname === '127.0.0.1' && url.port === '31591') return route.continue();
    if (['chrome:','data:','about:','blob:'].includes(url.protocol)) return route.continue();
    network.push({ kind:'blocked',url:url.href });
    return route.abort('blockedbyclient');
  });
  context.on('request', request => {
    if (request.method() !== 'GET') network.push({ kind:'request', method:request.method(),url:request.url(),body:request.postData() });
  });
  context.on('response', response => {
    if (response.request().method() !== 'GET') network.push({kind:'response', url:response.url(),status:response.status()});
  });
  let page = await context.newPage();
  const log = fs.existsSync(root+'/receipt.json') ? JSON.parse(fs.readFileSync(root+'/receipt.json','utf8')).log : [];
  function locator(c) { return c.selector ? page.locator(c.selector) : c.role ? page.getByRole(c.role,{name:c.name, exact:c.exact ?? true}) : page.getByPlaceholder(c.placeholder,{exact:true}); }
  async function snapshot() {
    return {url:page.url(),viewport:page.viewportSize(),text:await page.locator('body').innerText(), controls:await page.locator('button,a,input,textarea,select').evaluateAll(elements => elements.map(e=>({tag:e.tagName,role:e.getAttribute('role'),type:e.getAttribute('type'),text:e.innerText,aria:e.getAttribute('aria-label'),title:e.getAttribute('title'),placeholder:e.getAttribute('placeholder'),value:e.value,disabled:e.disabled,href:e.getAttribute('href')}))), focused:await page.evaluate(()=>({tag:document.activeElement?.tagName,text:document.activeElement?.innerText,aria:document.activeElement?.getAttribute('aria-label'),placeholder:document.activeElement?.getAttribute('placeholder')}))};
  }
  console.log(JSON.stringify({ready:true}));
  for await (const line of readline.createInterface({input:process.stdin,crlfDelay:Infinity})) {
    try {
      const c=JSON.parse(line); let result;
      if(c.op==='goto') { await page.goto(c.url,{waitUntil:'domcontentloaded',timeout:120000}); result=await snapshot(); }
      else if(c.op==='snapshot') result=await snapshot();
      else if(c.op==='click') { await locator(c).click({timeout:120000}); result=await snapshot(); }
      else if(c.op==='fill') { await locator(c).fill(c.value,{timeout:120000}); result=await snapshot(); }
      else if(c.op==='press') { await page.keyboard.press(c.key); result=await snapshot(); }
      else if(c.op==='type') { await page.keyboard.type(c.text); result=await snapshot(); }
      else if(c.op==='evidence') result=await page.evaluate(()=>window.__HARNESS_EVIDENCE__);
      else if(c.op==='metrics') result=await page.evaluate(()=>({innerWidth,innerHeight,devicePixelRatio,visualViewport:{width:visualViewport.width,height:visualViewport.height,scale:visualViewport.scale}}));
      else if(c.op==='wheel') { await page.mouse.wheel(c.x??0,c.y??400); result=await snapshot(); }
      else if(c.op==='pointer') { await page.mouse.move(c.x,c.y); result={moved:true}; }
      else if(c.op==='viewport') {await page.setViewportSize({width:c.width,height:c.height});result=await snapshot();}
      else if(c.op==='shot') {await page.screenshot({path:root+'/'+c.name+'.png',fullPage:c.fullPage??false});result={screenshot:root+'/'+c.name+'.png'};}
      else if(c.op==='network') result=network;
      else if(c.op==='select') {await locator(c).selectOption(c.value,{timeout:120000});result=await snapshot();}
      else if(c.op==='zoomSnapshot') result=await page.locator('body').innerText();
      else if(c.op==='close') {fs.writeFileSync(root+'/receipt.json',JSON.stringify({log,network},null,2));await browser.close();console.log(JSON.stringify({closed:true}));break;}
      else throw Error('unknown op');
      log.push({time:new Date().toISOString(),command:c,result});
      fs.writeFileSync(root+'/receipt.json',JSON.stringify({log,network},null,2));
      console.log(JSON.stringify(result));
    } catch(e) {console.log(JSON.stringify({error:e.message}));}
  }
})();
