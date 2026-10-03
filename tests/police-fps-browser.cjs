const assert=require('node:assert/strict');
const {chromium}=require('C:/Users/Usuário/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
(async()=>{
  const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,args:['--enable-webgl','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  const results=[];
  try{for(const optimized of [false,true]){
    const context=await browser.newContext({viewport:{width:640,height:400}}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.route('**/police-client.js*',async route=>{const response=await route.fetch();let body=await response.text();if(!optimized)body=body.replace('batchOfficer(rig);','');await route.fulfill({response,body});});
    await page.route('http://localhost:4212/',async route=>{const response=await route.fetch();let body=await response.text();if(!optimized)body=body.replace('makeNetworkAvatar(appearance,name,true)','makeNetworkAvatar(appearance,name,false)');body=body.replace('const vehicleObstacles=[];','window.__policeBench={renderer,scene,camera,policeController};const vehicleObstacles=[];').replace('updatePlayerCamera(dt);','if(window.__policeBench?.freeze)distance=6;updatePlayerCamera(dt);if(window.__policeBench?.freeze){camera.position.set(0,4,16);camera.lookAt(0,1,6);}');await route.fulfill({response,body});});
    const registration=await context.request.post('http://localhost:4212/api/auth/register',{data:{username:'perf_'+Date.now().toString(36),password:'Synthetic-performance-123'}});assert.equal(registration.status(),201);
    await page.goto('http://localhost:4212/');await page.locator('#startButton').click();await page.evaluate(()=>document.exitPointerLock?.());await page.waitForFunction(()=>window.__policeBench?.policeController.rigs.size>0);
    await page.evaluate(()=>{
      const b=window.__policeBench,receive=b.policeController.receive,appearance={skin:'#d3ac87',hair:'#292725',hairStyle:'fade',shirt:'#263f64',pants:'#172a42',shoe:'#121821'};
      const officers=Array.from({length:18},(_,i)=>({id:'load-'+i,appearance,position:{x:(i%6-2.5)*1.1,y:0,z:5+Math.floor(i/6)*1.7},rotation:Math.PI,health:100,seated:false,walking:true}));
      receive({type:'police-state',reset:true,serverTime:Date.now(),cars:[],officers,wanted:[]});b.freeze=true;
      b.policeController.receive=message=>['police-state','police-motion'].includes(message.type)?true:receive(message);
    });
    await page.waitForTimeout(700);
    const result=await page.evaluate(()=>{const b=window.__policeBench;let visibleMeshes=0,policeTriangles=0,allMeshes=0;
      for(const rig of b.policeController.rigs.values()){rig.group.traverse(o=>{if(o.isMesh)allMeshes++;});rig.group.traverseVisible(o=>{if(o.isMesh){visibleMeshes++;policeTriangles+=(o.geometry.index?.count??o.geometry.attributes.position.count)/3;}});}
      return{visibleMeshes,policeTriangles,allMeshes,sceneDrawCalls:b.renderer.info.render.calls,rigs:b.policeController.rigs.size};});
    assert.equal(result.rigs,18);assert.deepEqual(errors,[]);results.push({...result,optimized});await context.close();
  }
  console.log(JSON.stringify(results));
  assert.ok(results[1].visibleMeshes<results[0].visibleMeshes*.8,'same visible police surfaces need fewer draw calls');
  assert.equal(results[1].policeTriangles,results[0].policeTriangles,'batching preserves visual geometry');
  assert.ok(results[1].sceneDrawCalls<results[0].sceneDrawCalls,'police optimization reduces real renderer draw calls');
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
