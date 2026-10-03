import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,copyFile,mkdir,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,dirname,resolve,basename} from 'node:path';
import {createHash} from 'node:crypto';
import {spawn} from 'node:child_process';
import {createServer} from 'node:net';
import {once} from 'node:events';
import {setTimeout as delay} from 'node:timers/promises';
test('real server enforces two riders, ownership, proximity, boarding, motion and cleanup',{timeout:20000},async()=>{
  const fixture=await mkdtemp(join(tmpdir(),'lowkey-rides-test-')),reservation=createServer();reservation.listen(0,'127.0.0.1');await once(reservation,'listening');const port=reservation.address().port;await new Promise(r=>reservation.close(r));
  for(const file of ['server.mjs','city-layout.js','world-systems.js','zombies-server.mjs','game-security.mjs','weapons.js','weapons-server.mjs','social-server.mjs','police-server.mjs'])await copyFile(new URL('../'+file,import.meta.url),join(fixture,file));
  // Time and relocation hooks exist only in this disposable fixture, never production.
  let source=await readFile(join(fixture,'server.mjs'),'utf8');source=source.replace("const ROOT =",'let testTime=Date.now();testTime-=testTime%3840000;Date.now=()=>testTime;\nconst ROOT =').replace("  const publicApiPaths",`  if(url.pathname==='/test-clock'){testTime+=Number(url.searchParams.get('ms')||0);const p=players.get(url.searchParams.get('id'));if(p&&url.searchParams.has('x'))p.position={x:Number(url.searchParams.get('x')),y:Number(url.searchParams.get('y')),z:Number(url.searchParams.get('z'))};return json(response,200,{now:testTime,player:p});}\n  const publicApiPaths`);await writeFile(join(fixture,'server.mjs'),source);
  await mkdir(join(fixture,'data'));const hash=value=>createHash('sha256').update(value).digest('hex'),accounts=['a','b','c','d','e','f','g','h'];await writeFile(join(fixture,'data','accounts.json'),JSON.stringify({accounts:accounts.map(id=>({id,username:id==='a'?'yngxan':id+'test',profile:{}})),sessions:accounts.map(id=>({tokenHash:hash(id+'-token'),accountId:id,expiresAt:new Date(Date.now()+60000).toISOString()}))}));
  const child=spawn(process.execPath,[join(fixture,'server.mjs')],{env:{...process.env,PORT:String(port),DATABASE_URL:'',RENDER:'',CF_SFU_APP_ID:'',CF_SFU_APP_SECRET:''},stdio:['ignore','pipe','pipe']}),base=`http://127.0.0.1:${port}`,streams=[];let ready=false;child.stdout.on('data',s=>{if(String(s).includes('multiplayer pronta'))ready=true;});let errors='';child.stderr.on('data',s=>errors+=s);
  async function waitFor(fn){for(let i=0;i<500;i++){const r=fn();if(r)return r;await delay(10);}throw Error('Timeout '+errors);}
  async function connect(account){const abort=new AbortController();streams.push(abort);const response=await fetch(base+'/api/events',{headers:{cookie:`lowkey_session=${account}-token`},signal:abort.signal});assert.equal(response.status,200);const reader=response.body.getReader(),decoder=new TextDecoder(),events=[];let buffer='';void(async()=>{try{for(;;){const c=await reader.read();if(c.done)return;buffer+=decoder.decode(c.value,{stream:true});let n;while((n=buffer.indexOf('\n\n'))>=0){const s=buffer.slice(0,n);buffer=buffer.slice(n+2);if(s.startsWith('data: '))events.push(JSON.parse(s.slice(6)));}}}catch{}})();const hello=await waitFor(()=>events.find(e=>e.type==='hello'));return{account,id:hello.id,events,abort};}
  const clock=async(ms=400,p=null,position=null)=>(await fetch(base+'/test-clock?'+new URLSearchParams({ms,...(p?{id:p.id}:{}),...(position||{})}))).json();
  const post=(p,path,data)=>fetch(base+'/api/'+path,{method:'POST',headers:{cookie:`lowkey_session=${p.account}-token`,'content-type':'application/json'},body:JSON.stringify({id:p.id,...data})});
  try{
    await waitFor(()=>ready);const all=[];for(const account of accounts)all.push(await connect(account));const [a,b,c,d]=all;
    assert.equal((await post(d,'ride',{action:'enter',kind:'wheel'})).status,409,'distance checked');await clock();
    for(const p of [a,b,c])await clock(0,p,{x:-18,y:1.4,z:226.2});
    const entered=await Promise.all([a,b,c].map(p=>post(p,'ride',{action:'enter',kind:'wheel'})));assert.deepEqual(entered.map(r=>r.status).sort(),[204,204,409]);
    await waitFor(()=>a.events.some(e=>e.type==='world-state'&&e.rides.length===2));const occupied=a.events.filter(e=>e.type==='world-state').at(-1).rides;assert.equal(new Set(occupied.map(s=>s.bench+':'+s.seat)).size,2);const seated=[a,b,c].find(p=>occupied.some(s=>s.id===p.id));
    await clock(10000);const before=(await clock(0,seated)).player.position;await delay(70);await clock(3000);await delay(70);const after=(await clock(0,seated)).player.position;assert.ok(Math.hypot(after.x-before.x,after.y-before.y)>.3,'server actually carries the rider');
    assert.equal((await post(seated,'ride',{action:'exit'})).status,409,'no jumping out midair');assert.equal((await post(seated,'weapon',{weaponId:'glock'})).status,409);assert.equal((await post(seated,'combat',{action:'punch'})).status,409);
    await clock();assert.equal((await post(d,'ride',{id:seated.id,action:'exit'})).status,401,'cannot steal another player seat');
    assert.equal((await post(seated,'state',{position:{x:0,y:0,z:0},sequence:1})).status,204);assert.ok((await clock(0,seated)).player.position.z>200,'client cannot overwrite mounted position');
    await clock(256000-((await clock(0)).now%256000)+2000);assert.equal((await post(seated,'ride',{action:'exit'})).status,204);await waitFor(()=>d.events.some(e=>e.type==='world-state'&&e.rides.length===1));
    const remaining=[a,b,c].find(p=>p.id!==seated.id&&occupied.some(s=>s.id===p.id));remaining.abort.abort();await waitFor(()=>d.events.filter(e=>e.type==='world-state').at(-1).rides.length===0);
    // Full train: three independent benches, two seats each; exiting returns to deck.
    await clock(60000-((await clock(0)).now%60000)+1000);let count=0;for(const p of all.filter(p=>p!==remaining)){await clock(0,p,{x:5,y:3.35,z:207.5});const response=await post(p,'ride',{action:'enter',kind:'coaster'});assert.equal(response.status,count++<6?204:409);}
    await waitFor(()=>d.events.filter(e=>e.type==='world-state').at(-1).rides.length===6);const records=d.events.filter(e=>e.type==='world-state').at(-1).rides;for(let bench=0;bench<3;bench++)assert.equal(records.filter(s=>s.kind==='coaster'&&s.bench===bench).length,2);await clock();assert.equal((await post(seated,'ride',{action:'exit'})).status,204);assert.equal((await clock(0,seated)).player.position.y,3.35);
  }finally{for(const a of streams)a.abort();const stopped=once(child,'exit');child.kill();await stopped;assert.equal(dirname(resolve(fixture)),resolve(tmpdir()));assert.ok(basename(fixture).startsWith('lowkey-rides-test-'));await rm(fixture,{recursive:true,force:true});}
});
