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
test('only owner promotes; promoted admins spawn named/random colors with durable permissions', {timeout:20000},async()=>{
  const fixture=await mkdtemp(join(tmpdir(),'lowkey-admin-test-')),reservation=createServer();reservation.listen(0,'127.0.0.1');await once(reservation,'listening');const port=reservation.address().port;await new Promise(r=>reservation.close(r));
  for(const file of ['server.mjs','city-layout.js','world-systems.js','zombies-server.mjs','game-security.mjs'])await copyFile(new URL('../'+file,import.meta.url),join(fixture,file));
  await mkdir(join(fixture,'data'));const hash=value=>createHash('sha256').update(value).digest('hex');
  await writeFile(join(fixture,'data','accounts.json'),JSON.stringify({accounts:[{id:'owner',username:'yngxan',profile:{}},{id:'guest',username:'guest',profile:{}}],sessions:['owner','guest'].map(id=>({tokenHash:hash(id+'-token'),accountId:id,expiresAt:new Date(Date.now()+60000).toISOString()}))}));
  const child=spawn(process.execPath,[join(fixture,'server.mjs')],{env:{...process.env,PORT:String(port),DATABASE_URL:'',RENDER:'',CF_SFU_APP_ID:'',CF_SFU_APP_SECRET:''},stdio:['ignore','pipe','pipe']}),base=`http://127.0.0.1:${port}`,streams=[];let ready=false;child.stdout.on('data',data=>{if(String(data).includes('multiplayer pronta'))ready=true;});
  async function waitFor(fn){for(let i=0;i<500;i++){const r=fn();if(r)return r;await delay(10);}throw Error('Timeout');}
  async function connect(account){const abort=new AbortController();streams.push(abort);const response=await fetch(base+'/api/events',{headers:{cookie:`lowkey_session=${account}-token`},signal:abort.signal}),reader=response.body.getReader(),decoder=new TextDecoder(),events=[];let buffer='';void(async()=>{try{for(;;){const c=await reader.read();if(c.done)return;buffer+=decoder.decode(c.value,{stream:true});let n;while((n=buffer.indexOf('\n\n'))>=0){const s=buffer.slice(0,n);buffer=buffer.slice(n+2);if(s.startsWith('data: '))events.push(JSON.parse(s.slice(6)));}}}catch{}})();const hello=await waitFor(()=>events.find(e=>e.type==='hello'));return{account,id:hello.id,events};}
  async function command(player,text){await delay(520);return fetch(base+'/api/chat',{method:'POST',headers:{cookie:`lowkey_session=${player.account}-token`,'content-type':'application/json'},body:JSON.stringify({id:player.id,text})});}
  try{
    await waitFor(()=>ready);const owner=await connect('owner'),guest=await connect('guest');
    assert.equal((await command(guest,'/carro vermelho')).status,403);assert.equal((await command(guest,'/adm guest')).status,403);
    assert.equal((await command(owner,'/adm guest')).status,204);await waitFor(()=>guest.events.find(e=>e.type==='account-role'&&e.role==='admin'));
    assert.equal((await command(guest,'/carro vermelho')).status,204);const world=await waitFor(()=>guest.events.filter(e=>e.type==='world-state').find(e=>e.vehicles.some(v=>v.id.startsWith('admin-'))));assert.equal(world.vehicles.find(v=>v.id.startsWith('admin-')).color,'#e84045');
    assert.equal((await command(owner,'/moto')).status,204);assert.equal((await command(owner,'/moto cor-inexistente')).status,400);
    assert.equal((await command(guest,'/adm owner')).status,403,'promoted admins cannot delegate');
    const saved=JSON.parse(await readFile(join(fixture,'data','accounts.json'),'utf8'));assert.ok(saved.administrators.includes('guest'));
    assert.equal((await command(owner,'/zombies')).status,204);assert.equal((await command(owner,'/zombies stop')).status,204);await waitFor(()=>owner.events.find(e=>e.type==='zombies-state'&&!e.state.active));
  }finally{for(const abort of streams)abort.abort();const stopped=once(child,'exit');child.kill();await stopped;assert.equal(dirname(resolve(fixture)),resolve(tmpdir()));assert.ok(basename(fixture).startsWith('lowkey-admin-test-'));await rm(fixture,{recursive:true,force:true});}
});
