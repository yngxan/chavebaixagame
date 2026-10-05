const {chromium}=require('C:/Users/Usuário/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
(async()=>{
  const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,args:['--enable-webgl','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  try{
    const page=await browser.newPage({viewport:{width:1280,height:800}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto('http://localhost:4210/?preview=city');await page.waitForTimeout(2000);
    console.log(JSON.stringify({preview:'local',errors,canvas:await page.locator('canvas').count()}));
    if(errors.length)throw new Error(errors.join('\n'));
    await page.screenshot({path:'preview-ramp-city.png'});
    await page.goto('https://lowkey-social-mvp-test.onrender.com/?preview=city');await page.waitForTimeout(2000);
    console.log(JSON.stringify({preview:'online',errors,canvas:await page.locator('canvas').count()}));
    if(errors.length)throw new Error(errors.join('\n'));
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
