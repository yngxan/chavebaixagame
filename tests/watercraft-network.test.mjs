import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,copyFile,readFile,writeFile,rm} from 'node:fs/promises';
import {join,dirname,resolve,basename} from 'node:path';
import {tmpdir} from 'node:os';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {createServer} from 'node:net';
import {setTimeout as delay} from 'node:timers/promises';
test('real multiplayer watercraft enforce seats, driver controls, painting, replacement and ocean exits',{timeout:35000},async()=>{
  const root=await mkdtemp(join(tmpdir(),'lowkey-watercraft-test-')),reservation=createServer();reservation.listen(0,'127.0.0.1');await once(reservation,'listening');const port=reservation.address().port;await new Promise(r=>reservation.close(r));
  for(const file of ['server.mjs','city-layout.js','world-systems.js','zombies-server.mjs','game-security.mjs','weapons.js','weapons-server.mjs','social-server.mjs','police-server.mjs'])await copyFile(new URL('../'+file,import.meta.url),join(root,file));
  const file=join(root,'server.mjs');await writeFile(file,(await readFile(file,'utf8')).replace('connectionsFromAddress >= 8','connectionsFromAddress >= 20').replace('{ x: Math.cos(angle) * radius, y: 18, z: 5 + Math.sin(angle) * radius }',"{x:authenticatedAccount.username.startsWith('jet')?-5:5,y:.36,z:281.5}"));
  const child=spawn(process.execPath,[file],{env:{...process.env,PORT:String(port),DATABASE_URL:'',RENDER:'',CF_SFU_APP_ID:'',CF_SFU_APP_SECRET:''},stdio:['ignore','pipe','pipe']}),streams=[],base=`http://127.0.0.1:${port}`;let ready=false,logs='';child.stdout.on('data',c=>ready||=String(c).includes('multiplayer pronta'));child.stderr.on('data',c=>logs+=c);
  async function wait(fn){for(let i=0;i<800;i++){const r=fn();if(r)return r;await delay(10);}throw Error('Timeout '+logs);}
  const post=(p,path,data)=>fetch(base+path,{method:'POST',headers:{cookie:p?.cookie||'','content-type':'application/json'},body:JSON.stringify({...data,...(p?{id:p.id}:{})})});
  async function connect(username){const reg=await post(null,'/api/auth/register',{username,password:'Synthetic-watercraft-123'});assert.equal(reg.status,201);const cookie=reg.headers.get('set-cookie').split(';')[0],abort=new AbortController();streams.push(abort);const response=await fetch(base+'/api/events',{headers:{cookie},signal:abort.signal}),events=[],reader=response.body.getReader(),decoder=new TextDecoder();let buffer='';void(async()=>{try{for(;;){const c=await reader.read();if(c.done)return;buffer+=decoder.decode(c.value,{stream:true});let n;while((n=buffer.indexOf('\n\n'))>=0){const s=buffer.slice(0,n);buffer=buffer.slice(n+2);if(s.startsWith('data: ')){events.push(JSON.parse(s.slice(6)));if(events.length>500)events.shift();}}}}catch{}})();const hello=await wait(()=>events.find(e=>e.type==='hello'));return{id:hello.id,cookie,events,abort};}
  const latest=(p,id)=>p.events.findLast(e=>e.type==='world-state')?.vehicles.find(v=>v.id===id);
  try{await wait(()=>ready);const jetDriver=await connect('jet_driver'),jetRider=await connect('jet_rider'),jetFull=await connect('jet_full');
    for(const p of [jetDriver,jetRider])assert.equal((await post(p,'/api/vehicle',{action:'interact',vehicleId:'marina-jetski'})).status,200);
    assert.equal((await post(jetFull,'/api/vehicle',{action:'interact',vehicleId:'marina-jetski'})).status,409);
    assert.equal((await post(jetRider,'/api/vehicle',{action:'input',sequence:1,throttle:1,steer:0})).status,403);
    for(const p of [jetDriver,jetRider]){
      assert.equal((await post(p,'/api/state',{voiceEnabled:true})).status,204);await wait(()=>jetFull.events.some(e=>e.type==='state'&&e.player.id===p.id&&e.player.voiceEnabled));
      assert.equal((await post(p,'/api/state',{voiceEnabled:false})).status,204);await wait(()=>jetFull.events.findLast(e=>e.type==='state'&&e.player.id===p.id)?.player.voiceEnabled===false);
    }
    const boatDriver=await connect('boat_driver'),riders=[];assert.equal((await post(boatDriver,'/api/vehicle',{action:'paint',vehicleId:'marina-boat',color:'#35a3dd'})).status,204);assert.equal((await post(boatDriver,'/api/vehicle',{action:'interact',vehicleId:'marina-boat'})).status,200);
    for(let i=0;i<9;i++){const p=await connect('boat_rider_'+i);riders.push(p);assert.equal((await post(p,'/api/vehicle',{action:'interact',vehicleId:'marina-boat'})).status,200,'seat '+i);}
    const full=await connect('boat_full');assert.equal((await post(full,'/api/vehicle',{action:'interact',vehicleId:'marina-boat'})).status,409);assert.equal(latest(full,'marina-boat').passengerIds.length,9);
    for(let sequence=1;sequence<=24;sequence++){assert.equal((await post(boatDriver,'/api/vehicle',{action:'input',sequence,throttle:1,steer:0})).status,204);await delay(80);}
    const moving=await wait(()=>{const v=latest(boatDriver,'marina-boat');return v?.z>292&&v;});assert.ok(moving.speed>5);assert.equal(moving.marinaBay,null);assert.ok(boatDriver.events.findLast(e=>e.type==='world-state').vehicles.some(v=>v.marinaBay==='marina-boat'));assert.equal((await post(boatDriver,'/api/vehicle',{action:'paint',vehicleId:moving.id,color:'#ffffff'})).status,409);
    assert.equal((await post(riders[0],'/api/state',{sequence:10000,position:{x:999,y:999,z:999}})).status,204);await delay(100);assert.ok(latest(riders[0],'marina-boat').x<10,'position spoof cannot move boat');
    assert.equal((await post(boatDriver,'/api/vehicle',{action:'input',sequence:25,throttle:0,steer:0,brake:true})).status,204);await delay(1100);
    assert.equal((await post(riders[0],'/api/vehicle',{action:'exit'})).status,200);const exit=await wait(()=>riders[0].events.find(e=>e.type==='vehicle-exit'));assert.ok(exit.position.y<-.8,'leaving at sea starts swimming');
    boatDriver.abort.abort();await wait(()=>!latest(riders[1],'marina-boat')?.driverId);assert.equal(latest(riders[1],'marina-boat').passengerIds.length,8);assert.equal(logs.includes('TypeError'),false);
  }finally{for(const s of streams)s.abort();const end=once(child,'exit');child.kill();await end;assert.equal(dirname(resolve(root)),resolve(tmpdir()));assert.ok(basename(root).startsWith('lowkey-watercraft-test-'));await rm(root,{recursive:true,force:true});}
});
