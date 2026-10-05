const assert=require('node:assert/strict');
const {chromium}=require('C:/Users/Usuário/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
(async()=>{
  const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,args:['--enable-webgl','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  try{for(const mobile of [false,true]){
    const context=await browser.newContext({viewport:mobile?{width:390,height:844}:{width:1280,height:800},hasTouch:mobile,isMobile:mobile});
    const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
    const response=await context.request.post('http://localhost:4211/api/auth/register',{data:{username:'p_'+(mobile?'m':'pc')+'_'+Date.now().toString(36),password:'Synthetic-browser-test-123'}});assert.equal(response.status(),201);
    await page.goto('http://localhost:4211/');await page.locator('#startButton').click();await page.evaluate(()=>document.exitPointerLock?.());
    await page.locator('.lk-phone-toggle').click();await page.getByRole('button',{name:'Câmera',exact:false}).click();await page.locator('[data-photo=selfie]').click();await page.waitForTimeout(250);await page.locator('[data-photo=capture]').click();
    await page.getByRole('button',{name:'PUBLICAR PARA TODOS'}).click();await page.getByRole('heading',{name:'LowKey Social'}).waitFor();await page.locator('.lk-phone-item img').first().waitFor();
    assert.equal(await page.locator('.lk-phone').evaluate(e=>e.getBoundingClientRect().right<=innerWidth),true);assert.deepEqual(errors,[]);
    console.log(JSON.stringify({mobile,photoPublished:true,errors}));await page.screenshot({path:mobile?'preview-phone-mobile.png':'preview-phone-pc.png'});await context.close();
  }}finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
