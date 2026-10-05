import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,copyFile,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {createServer} from 'node:net';
import {setTimeout as delay} from 'node:timers/promises';
test('mission HTTP requires session ownership and actual player position; death cancels package',{timeout:25000},async()=>{
 const root=await mkdtemp(join(tmpdir(),'lowkey-mission-network-')),reservation=createServer();reservation.listen(0,'127.0.0.1');await once(reservation,'listening');const port=reservation.address().port;await new Promise(r=>reservation.close(r));
 for(const file of ['server.mjs','city-layout.js','world-systems.js','zombies-server.mjs','game-security.mjs','weapons.js','weapons-server.mjs','social-server.mjs','missions-server.mjs','police-server.mjs'])await copyFile(new URL('../'+file,import.meta.url),join(root,file));
 let code=await readFile(join(root,'server.mjs'),'utf8');code=code.replace('const ROOT =','let fakeTime=Date.now();Date.now=()=>fakeTime;\nconst ROOT =').replace('  const publicApiPaths',`  if(url.pathname==='/test-mission'){fakeTime+=5000;const p=players.get(url.searchParams.get('id'));if(p){p.position={x:Number(url.searchParams.get('x')),y:Number(url.searchParams.get('y')),z:Number(url.searchParams.get('z'))};if(url.searchParams.get('dead')){p.health=0;leaveCorpse(p,Date.now());}}return json(response,200,{});}\n  const publicApiPaths`);await writeFile(join(root,'server.mjs'),code);
 const child=spawn(process.execPath,[join(root,'server.mjs')],{env:{...process.env,PORT:String(port),DATABASE_URL:'',RENDER:'',CF_SFU_APP_ID:'',CF_SFU_APP_SECRET:''},stdio:['ignore','pipe','pipe']});let ready=false,errors='';child.stdout.on('data',b=>{if(String(b).includes('multiplayer pronta'))ready=true});child.stderr.on('data',b=>errors+=b);const base=`http://127.0.0.1:${port}`,aborts=[];
 async function wait(fn){for(let i=0;i<600;i++){const r=fn();if(r)return r;await delay(10)}throw Error(errors||'Timeout')}
 async function account(username){const r=await fetch(base+'/api/auth/register',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({username,password:'Synthetic-test-123'})});assert.equal(r.status,201);const cookie=r.headers.get('set-cookie').split(';')[0],abort=new AbortController();aborts.push(abort);const s=await fetch(base+'/api/events',{headers:{cookie},signal:abort.signal}),reader=s.body.getReader();let id;void(async()=>{let buffer='';try{while(true){const b=await reader.read();if(b.done)return;buffer+=new TextDecoder().decode(b.value);let n;while((n=buffer.indexOf('\n\n'))>=0){const packet=buffer.slice(0,n);buffer=buffer.slice(n+2);if(packet.startsWith('data: ')){const m=JSON.parse(packet.slice(6));if(m.type==='hello')id=m.id}}}}catch{}})();await wait(()=>id);return {cookie,id};}
 const post=(p,data)=>fetch(base+'/api/missions',{method:'POST',headers:{cookie:p.cookie,'content-type':'application/json'},body:JSON.stringify({id:p.id,...data})});
 const move=(p,position,dead=false)=>fetch(base+'/test-mission?'+new URLSearchParams({id:p.id,...position,...(dead?{dead:'1'}:{})}));
 try{
  await wait(()=>ready);assert.equal((await fetch(base+'/api/missions')).status,401);const a=await account('delivery_a'),b=await account('delivery_b');
  assert.equal((await post(b,{id:a.id,action:'start'})).status,401);let r=await post(a,{action:'start'}),state=await r.json();assert.equal(r.status,200);const id=state.active.id,reward=state.active.reward;
  await move(a,{x:80,y:0,z:0});assert.equal((await post(a,{action:'interact',missionId:id,position:state.pickup})).status,409,'request cannot spoof proximity');
  await move(a,state.pickup);r=await post(a,{action:'interact',missionId:id});state=await r.json();assert.equal(r.status,200);assert.equal(state.active.stage,'deliver');
  await move(a,state.active.destination);r=await post(a,{action:'interact',missionId:id,reward:999999});state=await r.json();assert.equal(r.status,200);assert.equal(state.balance,reward);assert.equal((await post(a,{action:'interact',missionId:id})).status,429,'rapid duplicate throttled');
  for(let i=0;i<6;i++)await move(a,{x:0,y:0,z:0});r=await post(a,{action:'start'});assert.equal(r.status,200);await move(a,{x:0,y:0,z:0},true);await delay(30);const current=await fetch(base+'/api/missions?id='+a.id,{headers:{cookie:a.cookie}});state=await current.json();assert.equal(state.active,null);assert.equal(state.balance,reward);
  state=await (await fetch(base+'/api/missions?id='+b.id,{headers:{cookie:b.cookie}})).json();const broker=state.broker;assert.equal((await post(b,{action:'start',career:'illicit'})).status,409);await move(b,broker);r=await post(b,{action:'start',career:'illicit',level:99});assert.equal(r.status,200);state=await r.json();assert.equal(state.active.career,'illicit');assert.equal(state.active.level,1);await move(b,broker);await post(b,{action:'interact',missionId:state.active.id});await move(b,state.active.destination);r=await post(b,{action:'interact',missionId:state.active.id,reward:999999});assert.equal(r.status,200);const completed=await r.json();assert.equal(completed.balance,state.active.reward);assert.equal(completed.careers.illicit.completed,1);assert.equal(completed.careers.legal.completed,0);
 }finally{for(const a of aborts)a.abort();const stopped=once(child,'exit');child.kill();await stopped;await rm(root,{recursive:true,force:true});}
});
